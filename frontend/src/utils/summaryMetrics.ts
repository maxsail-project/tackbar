import type { TrackSample } from '../types/track'
import { timestampToMilliseconds } from './replay'

const METERS_PER_NAUTICAL_MILE = 1_852
const COG_BIN_SIZE_DEGREES = 10
const COG_BIN_COUNT = 360 / COG_BIN_SIZE_DEGREES

export interface SummaryMetrics {
  distanceMeters: number
  distanceNm: number
  avgSogKnots: number | null
  dominantCogDegrees: number | null
  avgHeelDegrees: number | null
  avgTrimDegrees: number | null
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
  let heelTotal = 0
  let heelCount = 0
  let trimTotal = 0
  let trimCount = 0
  const cogBinCounts = Array<number>(COG_BIN_COUNT).fill(0)

  samples.forEach((sample, index) => {
    if (index > 0 && Number.isFinite(sample.dist)) {
      distanceMeters += sample.dist
    }

    if (isFiniteNumber(sample.cog)) {
      cogBinCounts[cogBinCenter(sample.cog) / COG_BIN_SIZE_DEGREES] += 1
    }

    if (isFiniteNumber(sample.heel)) {
      heelTotal += sample.heel
      heelCount += 1
    }

    if (isFiniteNumber(sample.trim)) {
      trimTotal += sample.trim
      trimCount += 1
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
    dominantCogDegrees,
    avgHeelDegrees: heelCount > 0 ? heelTotal / heelCount : null,
    avgTrimDegrees: trimCount > 0 ? trimTotal / trimCount : null,
  }
}
