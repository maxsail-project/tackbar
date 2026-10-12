import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { timestampToMilliseconds } from './replay'

export interface MetricDistribution {
  coverage: number
  eligible: boolean
  validTimeSeconds: number
}

export interface SogDistribution extends MetricDistribution {
  binTimeSeconds: ReadonlyMap<number, number>
}

export interface CogDistribution extends MetricDistribution {
  sectorPercentages: number[]
}

export interface ActivityVsDistribution {
  sog: SogDistribution
  cog: CogDistribution
}

export interface SogDistributionBin {
  start: number
  end: number
  center: number
  primaryPercentage: number | null
  comparisonPercentage: number | null
}

export interface VsDistributions {
  primary: ActivityVsDistribution
  comparison: ActivityVsDistribution | null
  sogBins: SogDistributionBin[]
}

interface VsCalculationConfig {
  minCoverage: number
  maxGapSeconds: number
  sogBinKt: number
  cogBinDeg: number
}

interface MutableActivityDistribution {
  sogBinTimeMs: Map<number, number>
  sogValidTimeMs: number
  cogSectorTimeMs: number[]
  cogValidTimeMs: number
}

function normalizeCog(cog: number) {
  return ((cog % 360) + 360) % 360
}

export function cogSectorIndex(cog: number, binSize: number) {
  validateCogBinSize(binSize)
  return Math.floor(((normalizeCog(cog) + binSize / 2) % 360) / binSize)
}

function validateCogBinSize(binSize: number) {
  if (
    !Number.isFinite(binSize)
    || binSize <= 0
    || !Number.isInteger(360 / binSize)
  ) {
    throw new Error('COG bin size must divide 360 evenly')
  }
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

function emptyMutableDistribution(cogBinCount: number): MutableActivityDistribution {
  return {
    sogBinTimeMs: new Map(),
    sogValidTimeMs: 0,
    cogSectorTimeMs: Array<number>(cogBinCount).fill(0),
    cogValidTimeMs: 0,
  }
}

function accumulateActivity(
  samples: TrackSample[],
  window: AnalysisWindowRange,
  config: VsCalculationConfig,
) {
  const cogBinCount = 360 / config.cogBinDeg
  const result = emptyMutableDistribution(cogBinCount)
  const maxGapMs = config.maxGapSeconds * 1_000

  for (let index = 0; index + 1 < samples.length; index += 1) {
    const sample = samples[index]
    const nextSample = samples[index + 1]
    const t0 = timestampToMilliseconds(sample.utc)
    const t1 = timestampToMilliseconds(nextSample.utc)
    const sourceDt = t1 - t0

    if (!Number.isFinite(sourceDt) || sourceDt <= 0 || sourceDt > maxGapMs) continue

    const representedStart = Math.max(t0, window.start)
    const representedEnd = Math.min(t1, window.end)
    const representedDt = representedEnd - representedStart
    if (representedDt <= 0) continue

    if (sample.sog !== null && Number.isFinite(sample.sog) && sample.sog >= 0) {
      const binIndex = Math.floor(sample.sog / config.sogBinKt)
      result.sogBinTimeMs.set(
        binIndex,
        (result.sogBinTimeMs.get(binIndex) ?? 0) + representedDt,
      )
      result.sogValidTimeMs += representedDt
    }

    if (sample.cog !== null && Number.isFinite(sample.cog)) {
      const binIndex = cogSectorIndex(sample.cog, config.cogBinDeg)
      result.cogSectorTimeMs[binIndex] += representedDt
      result.cogValidTimeMs += representedDt
    }
  }

  return result
}

function coverage(validTimeMs: number, windowDurationMs: number) {
  return Math.min(1, Math.max(0, validTimeMs / windowDurationMs))
}

function finalizeActivity(
  distribution: MutableActivityDistribution,
  windowDurationMs: number,
  config: VsCalculationConfig,
): ActivityVsDistribution {
  const sogCoverage = coverage(distribution.sogValidTimeMs, windowDurationMs)
  const cogCoverage = coverage(distribution.cogValidTimeMs, windowDurationMs)

  return {
    sog: {
      coverage: sogCoverage,
      eligible: sogCoverage >= config.minCoverage,
      validTimeSeconds: distribution.sogValidTimeMs / 1_000,
      binTimeSeconds: new Map(
        Array.from(distribution.sogBinTimeMs, ([bin, timeMs]) => [bin, timeMs / 1_000]),
      ),
    },
    cog: {
      coverage: cogCoverage,
      eligible: cogCoverage >= config.minCoverage,
      validTimeSeconds: distribution.cogValidTimeMs / 1_000,
      sectorPercentages: distribution.cogSectorTimeMs.map((timeMs) => (
        distribution.cogValidTimeMs > 0
          ? timeMs / distribution.cogValidTimeMs * 100
          : 0
      )),
    },
  }
}

function eligibleSogBounds(
  distribution: ActivityVsDistribution,
): { min: number, max: number } | null {
  if (!distribution.sog.eligible || distribution.sog.binTimeSeconds.size === 0) return null

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  distribution.sog.binTimeSeconds.forEach((_time, bin) => {
    min = Math.min(min, bin)
    max = Math.max(max, bin)
  })
  return { min, max }
}

function buildSharedSogBins(
  primary: ActivityVsDistribution,
  comparison: ActivityVsDistribution | null,
  binSize: number,
) {
  const primaryBounds = eligibleSogBounds(primary)
  const comparisonBounds = comparison && eligibleSogBounds(comparison)
  if (primaryBounds === null && comparisonBounds === null) return []

  const firstBin = Math.min(
    primaryBounds?.min ?? Number.POSITIVE_INFINITY,
    comparisonBounds?.min ?? Number.POSITIVE_INFINITY,
  )
  const lastBin = Math.max(
    primaryBounds?.max ?? Number.NEGATIVE_INFINITY,
    comparisonBounds?.max ?? Number.NEGATIVE_INFINITY,
  )
  const bins: SogDistributionBin[] = []

  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    bins.push({
      start: bin * binSize,
      end: (bin + 1) * binSize,
      center: (bin + 0.5) * binSize,
      primaryPercentage: primary.sog.eligible && primary.sog.validTimeSeconds > 0
        ? (primary.sog.binTimeSeconds.get(bin) ?? 0) / primary.sog.validTimeSeconds * 100
        : null,
      comparisonPercentage: comparison?.sog.eligible && comparison.sog.validTimeSeconds > 0
        ? (comparison.sog.binTimeSeconds.get(bin) ?? 0) / comparison.sog.validTimeSeconds * 100
        : null,
    })
  }

  return bins
}

export function calculateVsDistributions(
  primarySamples: TrackSample[],
  comparisonSamples: TrackSample[] | null,
  window: AnalysisWindowRange,
  config: VsCalculationConfig = VS_CONFIG,
): VsDistributions {
  validateWindow(window)
  validateCogBinSize(config.cogBinDeg)
  if (!Number.isFinite(config.sogBinKt) || config.sogBinKt <= 0) {
    throw new Error('SOG bin size must be positive')
  }

  const windowDurationMs = window.end - window.start
  const primary = finalizeActivity(
    accumulateActivity(primarySamples, window, config),
    windowDurationMs,
    config,
  )
  const comparison = comparisonSamples === null
    ? null
    : finalizeActivity(
        accumulateActivity(comparisonSamples, window, config),
        windowDurationMs,
        config,
      )

  return {
    primary,
    comparison,
    sogBins: buildSharedSogBins(primary, comparison, config.sogBinKt),
  }
}
