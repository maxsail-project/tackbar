import type { TrackSample } from '../types/track'
import { timestampToMilliseconds } from './replay'

const METERS_PER_NAUTICAL_MILE = 1_852
const COG_BIN_SIZE_DEGREES = 10
const COG_BIN_COUNT = 360 / COG_BIN_SIZE_DEGREES

export interface SummaryMetrics {
  distanceMeters: number
  distanceNm: number
  avgSogKnots: number | null
  maxSogKnots: number | null
  dominantCogDegrees: number | null
  avgPositiveHeelDegrees: number | null
  avgNegativeHeelDegrees: number | null
  avgPositiveTrimDegrees: number | null
  avgNegativeTrimDegrees: number | null
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

export function calculateSummaryMetrics(samples: TrackSample[]): SummaryMetrics {
  let distanceMeters = 0
  let maxSogKnots: number | null = null
  let positiveHeelTotal = 0
  let positiveHeelCount = 0
  let negativeHeelTotal = 0
  let negativeHeelCount = 0
  let positiveTrimTotal = 0
  let positiveTrimCount = 0
  let negativeTrimTotal = 0
  let negativeTrimCount = 0
  const cogBinCounts = Array<number>(COG_BIN_COUNT).fill(0)

  samples.forEach((sample, index) => {
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

    if (isFiniteNumber(sample.heel) && sample.heel > 0) {
      positiveHeelTotal += sample.heel
      positiveHeelCount += 1
    } else if (isFiniteNumber(sample.heel) && sample.heel < 0) {
      negativeHeelTotal += sample.heel
      negativeHeelCount += 1
    }

    if (isFiniteNumber(sample.trim) && sample.trim > 0) {
      positiveTrimTotal += sample.trim
      positiveTrimCount += 1
    } else if (isFiniteNumber(sample.trim) && sample.trim < 0) {
      negativeTrimTotal += sample.trim
      negativeTrimCount += 1
    }
  })

  const distanceNm = distanceMeters / METERS_PER_NAUTICAL_MILE
  let avgSogKnots: number | null = null
  if (samples.length >= 2) {
    const elapsedSeconds = (
      timestampToMilliseconds(samples[samples.length - 1].utc)
      - timestampToMilliseconds(samples[0].utc)
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

  return {
    distanceMeters,
    distanceNm,
    avgSogKnots,
    maxSogKnots,
    dominantCogDegrees,
    avgPositiveHeelDegrees: positiveHeelCount > 0
      ? positiveHeelTotal / positiveHeelCount
      : null,
    avgNegativeHeelDegrees: negativeHeelCount > 0
      ? negativeHeelTotal / negativeHeelCount
      : null,
    avgPositiveTrimDegrees: positiveTrimCount > 0
      ? positiveTrimTotal / positiveTrimCount
      : null,
    avgNegativeTrimDegrees: negativeTrimCount > 0
      ? negativeTrimTotal / negativeTrimCount
      : null,
  }
}
