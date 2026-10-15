import type { TrackSample } from '../types/track'
import {
  filterSamplesByAnalysisWindow,
  type AnalysisWindowRange,
} from './analysisWindow'
import { timestampToMilliseconds } from './replay'

const METERS_PER_NAUTICAL_MILE = 1_852
const COG_BIN_SIZE_DEGREES = 10
const COG_BIN_COUNT = 360 / COG_BIN_SIZE_DEGREES
const MAX_REPRESENTED_GAP_MILLISECONDS = 1_500

export interface SummaryMetrics {
  distanceMeters: number
  distanceNm: number
  avgSogKnots: number | null
  maxSogKnots: number | null
  dominantCogDegrees: number | null
  medianPositiveHeelDegrees: number | null
  medianNegativeHeelDegrees: number | null
  medianPositiveTrimDegrees: number | null
  medianNegativeTrimDegrees: number | null
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

function normalizeCog(cog: number) {
  return ((cog % 360) + 360) % 360
}

function cogBinCenter(cog: number) {
  const normalized = normalizeCog(cog)
  return Math.floor(
    ((normalized + COG_BIN_SIZE_DEGREES / 2) % 360)
      / COG_BIN_SIZE_DEGREES,
  ) * COG_BIN_SIZE_DEGREES
}

function addRepresentedDuration(
  durations: Map<number, number>,
  value: number | null,
  durationMilliseconds: number,
) {
  if (!isFiniteNumber(value) || value === 0) return
  durations.set(value, (durations.get(value) ?? 0) + durationMilliseconds)
}

function weightedMedian(durations: ReadonlyMap<number, number>) {
  const entries = Array.from(durations.entries()).sort(
    ([firstValue], [secondValue]) => firstValue - secondValue,
  )
  const totalDuration = entries.reduce(
    (total, [, duration]) => total + duration,
    0,
  )
  const targetDuration = totalDuration * 0.5
  let cumulativeDuration = 0

  for (const [value, duration] of entries) {
    cumulativeDuration += duration
    if (cumulativeDuration >= targetDuration) return value
  }

  return null
}

function calculateSignedMedians(
  samples: TrackSample[],
  analysisWindow: AnalysisWindowRange,
) {
  const positiveHeelDurations = new Map<number, number>()
  const negativeHeelDurations = new Map<number, number>()
  const positiveTrimDurations = new Map<number, number>()
  const negativeTrimDurations = new Map<number, number>()

  for (let index = 0; index + 1 < samples.length; index += 1) {
    const sample = samples[index]
    const nextSample = samples[index + 1]
    const intervalStart = timestampToMilliseconds(sample.utc)
    const intervalEnd = timestampToMilliseconds(nextSample.utc)
    const intervalDuration = intervalEnd - intervalStart

    if (
      intervalDuration <= 0
      || intervalDuration > MAX_REPRESENTED_GAP_MILLISECONDS
    ) continue

    const representedStart = Math.max(intervalStart, analysisWindow.start)
    const representedEnd = Math.min(intervalEnd, analysisWindow.end)
    const representedDuration = representedEnd - representedStart
    if (representedDuration <= 0) continue

    if (isFiniteNumber(sample.heel) && sample.heel > 0) {
      addRepresentedDuration(
        positiveHeelDurations,
        sample.heel,
        representedDuration,
      )
    } else if (isFiniteNumber(sample.heel) && sample.heel < 0) {
      addRepresentedDuration(
        negativeHeelDurations,
        sample.heel,
        representedDuration,
      )
    }

    if (isFiniteNumber(sample.trim) && sample.trim > 0) {
      addRepresentedDuration(
        positiveTrimDurations,
        sample.trim,
        representedDuration,
      )
    } else if (isFiniteNumber(sample.trim) && sample.trim < 0) {
      addRepresentedDuration(
        negativeTrimDurations,
        sample.trim,
        representedDuration,
      )
    }
  }

  return {
    medianPositiveHeelDegrees: weightedMedian(positiveHeelDurations),
    medianNegativeHeelDegrees: weightedMedian(negativeHeelDurations),
    medianPositiveTrimDegrees: weightedMedian(positiveTrimDurations),
    medianNegativeTrimDegrees: weightedMedian(negativeTrimDurations),
  }
}

export function calculateSummaryMetrics(
  samples: TrackSample[],
  analysisWindow: AnalysisWindowRange,
): SummaryMetrics {
  const selectedSamples = filterSamplesByAnalysisWindow(
    samples,
    analysisWindow.start,
    analysisWindow.end,
  )
  let distanceMeters = 0
  let maxSogKnots: number | null = null
  const cogBinCounts = Array<number>(COG_BIN_COUNT).fill(0)

  selectedSamples.forEach((sample, index) => {
    if (index > 0 && Number.isFinite(sample.dist)) {
      distanceMeters += sample.dist
    }

    if (
      isFiniteNumber(sample.sog)
      && (maxSogKnots === null || sample.sog > maxSogKnots)
    ) {
      maxSogKnots = sample.sog
    }

    if (isFiniteNumber(sample.cog)) {
      cogBinCounts[cogBinCenter(sample.cog) / COG_BIN_SIZE_DEGREES] += 1
    }
  })

  const distanceNm = distanceMeters / METERS_PER_NAUTICAL_MILE
  let avgSogKnots: number | null = null
  if (selectedSamples.length >= 2) {
    const elapsedSeconds = (
      timestampToMilliseconds(selectedSamples[selectedSamples.length - 1].utc)
      - timestampToMilliseconds(selectedSamples[0].utc)
    ) / 1_000

    if (elapsedSeconds > 0) {
      avgSogKnots = distanceNm / (elapsedSeconds / 3_600)
    }
  }

  let dominantCogDegrees: number | null = null
  let dominantCogCount = 0
  cogBinCounts.forEach((count, index) => {
    if (count > dominantCogCount) {
      dominantCogCount = count
      dominantCogDegrees = index * COG_BIN_SIZE_DEGREES
    }
  })

  const signedMedians = calculateSignedMedians(samples, analysisWindow)

  return {
    distanceMeters,
    distanceNm,
    avgSogKnots,
    maxSogKnots,
    dominantCogDegrees,
    ...signedMedians,
  }
}
