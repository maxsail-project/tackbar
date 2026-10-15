import { HEEL_SOG_DENSITY_CONFIG } from '../config/heelSogDensity'
import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { timestampToMilliseconds } from './replay'

export interface HeelSogDensityGeometry {
  heelMinimumDegrees: number
  heelMaximumDegrees: number
  heelBinDegrees: number
  heelBinCount: number
  sogMinimumKnots: number
  sogMaximumKnots: number
  sogBinKnots: number
  sogBinCount: number
}

export interface HeelSogDensityCell {
  heelBinIndex: number
  sogBinIndex: number
  representedTimeSeconds: number
  percentage: number
}

export interface ActivityHeelSogDensity {
  cells: HeelSogDensityCell[]
  validRepresentedTimeSeconds: number
  coverage: number
  lowCoverage: boolean
  maximumCellPercentage: number
}

export interface HeelSogDensityPresentation {
  geometry: HeelSogDensityGeometry
  activities: ActivityHeelSogDensity[]
  sharedMaximumCellPercentage: number
}

function validateWindow(window: AnalysisWindowRange) {
  if (
    !Number.isFinite(window.start)
    || !Number.isFinite(window.end)
    || window.start >= window.end
  ) {
    throw new Error('Analysis Window start must be before end')
  }
}

function forEachRepresentedInterval(
  samples: TrackSample[],
  window: AnalysisWindowRange,
  visit: (sample: TrackSample, representedMilliseconds: number) => void,
) {
  const maximumGapMilliseconds = HEEL_SOG_DENSITY_CONFIG.maxGapSeconds * 1_000

  for (let index = 0; index + 1 < samples.length; index += 1) {
    const sample = samples[index]
    const nextSample = samples[index + 1]
    const start = timestampToMilliseconds(sample.utc)
    const end = timestampToMilliseconds(nextSample.utc)
    const sourceDuration = end - start

    if (
      !Number.isFinite(sourceDuration)
      || sourceDuration <= 0
      || sourceDuration > maximumGapMilliseconds
    ) {
      continue
    }

    const representedStart = Math.max(start, window.start)
    const representedEnd = Math.min(end, window.end)
    const representedMilliseconds = representedEnd - representedStart
    if (representedMilliseconds <= 0) continue

    visit(sample, representedMilliseconds)
  }
}

function hasFiniteInDomainTelemetry(sample: TrackSample) {
  return sample.heel !== null
    && Number.isFinite(sample.heel)
    && sample.heel >= HEEL_SOG_DENSITY_CONFIG.heelMinimumDegrees
    && sample.heel <= HEEL_SOG_DENSITY_CONFIG.heelMaximumDegrees
    && sample.sog !== null
    && Number.isFinite(sample.sog)
    && sample.sog >= HEEL_SOG_DENSITY_CONFIG.sogMinimumKnots
}

export function resolveHeelSogDensityGeometry(
  activitySamples: TrackSample[][],
  window: AnalysisWindowRange,
): HeelSogDensityGeometry {
  validateWindow(window)
  let maximumSog: number = HEEL_SOG_DENSITY_CONFIG.sogMinimumKnots

  activitySamples.forEach((samples) => {
    forEachRepresentedInterval(samples, window, (sample) => {
      if (hasFiniteInDomainTelemetry(sample)) {
        maximumSog = Math.max(maximumSog, sample.sog!)
      }
    })
  })

  const sogBinCount = Math.max(
    1,
    Math.ceil(
      (maximumSog - HEEL_SOG_DENSITY_CONFIG.sogMinimumKnots)
        / HEEL_SOG_DENSITY_CONFIG.sogBinKnots,
    ),
  )

  return {
    heelMinimumDegrees: HEEL_SOG_DENSITY_CONFIG.heelMinimumDegrees,
    heelMaximumDegrees: HEEL_SOG_DENSITY_CONFIG.heelMaximumDegrees,
    heelBinDegrees: HEEL_SOG_DENSITY_CONFIG.heelBinDegrees,
    heelBinCount: (
      HEEL_SOG_DENSITY_CONFIG.heelMaximumDegrees
      - HEEL_SOG_DENSITY_CONFIG.heelMinimumDegrees
    ) / HEEL_SOG_DENSITY_CONFIG.heelBinDegrees,
    sogMinimumKnots: HEEL_SOG_DENSITY_CONFIG.sogMinimumKnots,
    sogMaximumKnots: (
      HEEL_SOG_DENSITY_CONFIG.sogMinimumKnots
      + sogBinCount * HEEL_SOG_DENSITY_CONFIG.sogBinKnots
    ),
    sogBinKnots: HEEL_SOG_DENSITY_CONFIG.sogBinKnots,
    sogBinCount,
  }
}

export function calculateHeelSogDensity(
  samples: TrackSample[],
  window: AnalysisWindowRange,
  geometry: HeelSogDensityGeometry,
): ActivityHeelSogDensity {
  validateWindow(window)
  const cellMilliseconds = new Map<string, number>()
  let validMilliseconds = 0

  forEachRepresentedInterval(samples, window, (sample, representedMilliseconds) => {
    if (!hasFiniteInDomainTelemetry(sample)) return
    if (sample.sog! > geometry.sogMaximumKnots) return

    const heelBinIndex = Math.min(
      geometry.heelBinCount - 1,
      Math.floor(
        (sample.heel! - geometry.heelMinimumDegrees) / geometry.heelBinDegrees,
      ),
    )
    const sogBinIndex = Math.min(
      geometry.sogBinCount - 1,
      Math.floor(
        (sample.sog! - geometry.sogMinimumKnots) / geometry.sogBinKnots,
      ),
    )
    const key = `${heelBinIndex}:${sogBinIndex}`
    cellMilliseconds.set(
      key,
      (cellMilliseconds.get(key) ?? 0) + representedMilliseconds,
    )
    validMilliseconds += representedMilliseconds
  })

  const cells = [...cellMilliseconds.entries()]
    .map(([key, representedMilliseconds]): HeelSogDensityCell => {
      const [heelBinIndex, sogBinIndex] = key.split(':').map(Number)
      return {
        heelBinIndex,
        sogBinIndex,
        representedTimeSeconds: representedMilliseconds / 1_000,
        percentage: validMilliseconds > 0
          ? representedMilliseconds / validMilliseconds * 100
          : 0,
      }
    })
    .sort((first, second) =>
      first.heelBinIndex - second.heelBinIndex
      || first.sogBinIndex - second.sogBinIndex,
    )
  const coverage = Math.min(
    1,
    Math.max(0, validMilliseconds / (window.end - window.start)),
  )

  return {
    cells,
    validRepresentedTimeSeconds: validMilliseconds / 1_000,
    coverage,
    lowCoverage: coverage < VS_CONFIG.minCoverage,
    maximumCellPercentage: cells.reduce(
      (maximum, cell) => Math.max(maximum, cell.percentage),
      0,
    ),
  }
}

export function buildHeelSogDensityPresentation(
  activitySamples: TrackSample[][],
  window: AnalysisWindowRange,
): HeelSogDensityPresentation {
  const geometry = resolveHeelSogDensityGeometry(activitySamples, window)
  const activities = activitySamples.map((samples) =>
    calculateHeelSogDensity(samples, window, geometry),
  )

  return {
    geometry,
    activities,
    sharedMaximumCellPercentage: activities.reduce(
      (maximum, activity) => Math.max(maximum, activity.maximumCellPercentage),
      0,
    ),
  }
}
