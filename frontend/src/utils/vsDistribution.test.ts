import { describe, expect, it } from 'vitest'
import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import {
  calculateVsDistributions,
  calculateWeightedTrimStatistics,
  cogSectorIndex,
} from './vsDistribution'

const BASE_TIME = Date.parse('2026-10-12T12:00:00Z')

function sample(
  seconds: number,
  sog: number | null = 4,
  cog: number | null = 1,
  heel: number | null = null,
  trim: number | null = null,
): TrackSample {
  return {
    utc: new Date(BASE_TIME + seconds * 1_000).toISOString(),
    lat: 39,
    lon: 2,
    dist: 0,
    sog,
    cog,
    hdg: null,
    heel,
    trim,
  }
}

function regularlySampled(frequencyHz: number) {
  const samples: TrackSample[] = []
  const sampleCount = 10 * frequencyHz
  for (let index = 0; index <= sampleCount; index += 1) {
    const seconds = index / frequencyHz
    samples.push(sample(
      seconds,
      seconds < 5 ? 4 : 6,
      seconds < 5 ? 359 : 91,
      seconds < 5 ? -4 : 6,
      seconds < 5 ? -3 : 3,
    ))
  }
  return samples
}

function window(startSeconds: number, endSeconds: number) {
  return {
    start: BASE_TIME + startSeconds * 1_000,
    end: BASE_TIME + endSeconds * 1_000,
  }
}

function percentages(samples: TrackSample[]) {
  const result = calculateVsDistributions(samples, null, window(0, 10))
  return {
    sog: result.sogBins.map((bin) => bin.primaryPercentage),
    cog: result.primary.cog.sectorPercentages,
    heel: result.heelBins.map((bin) => bin.primaryPercentage),
    trim: result.primary.trim.statistics,
  }
}

describe('time-weighted VS distributions', () => {
  it('produces equivalent distributions at 10 Hz, 2 Hz, and 1 Hz', () => {
    const tenHz = percentages(regularlySampled(10))
    const twoHz = percentages(regularlySampled(2))
    const oneHz = percentages(regularlySampled(1))

    expect(twoHz.sog).toEqual(tenHz.sog)
    expect(oneHz.sog).toEqual(tenHz.sog)
    expect(twoHz.cog).toEqual(tenHz.cog)
    expect(oneHz.cog).toEqual(tenHz.cog)
    expect(twoHz.heel).toEqual(tenHz.heel)
    expect(oneHz.heel).toEqual(tenHz.heel)
    expect(twoHz.trim).toEqual(tenHz.trim)
    expect(oneHz.trim).toEqual(tenHz.trim)
    expect(tenHz.sog.reduce<number>(
      (total, percentage) => total + (percentage ?? 0),
      0,
    )).toBeCloseTo(100)
    expect(tenHz.cog.reduce((total, percentage) => total + percentage, 0)).toBeCloseTo(100)
    expect(tenHz.heel.reduce<number>(
      (total, percentage) => total + (percentage ?? 0),
      0,
    )).toBeCloseTo(100)
  })

  it('uses actual irregular interval durations', () => {
    const result = calculateVsDistributions([
      sample(0, 2, 90),
      sample(0.5, 4, 90),
      sample(1.5, 2, 90),
      sample(3, 8, 90),
    ], null, window(0, 3))

    expect(result.primary.sog.coverage).toBe(1)
    expect(result.sogBins.find((bin) => bin.start === 2)?.primaryPercentage).toBeCloseTo(2 / 3 * 100)
    expect(result.sogBins.find((bin) => bin.start === 4)?.primaryPercentage).toBeCloseTo(1 / 3 * 100)
  })

  it('clips source-adjacent intervals at both Analysis Window boundaries', () => {
    const result = calculateVsDistributions([
      sample(0, 4, 0),
      sample(1, 6, 90),
      sample(2, 8, 180),
    ], null, window(0.5, 1.5))

    expect(result.primary.sog.coverage).toBe(1)
    expect(result.primary.sog.validTimeSeconds).toBe(1)
    expect(result.sogBins.find((bin) => bin.start === 4)?.primaryPercentage).toBe(50)
    expect(result.sogBins.find((bin) => bin.start === 6)?.primaryPercentage).toBe(50)
    expect(result.primary.cog.sectorPercentages[cogSectorIndex(0, 10)]).toBe(50)
    expect(result.primary.cog.sectorPercentages[cogSectorIndex(90, 10)]).toBe(50)
  })

  it('counts gaps at or below the threshold and excludes gaps above it', () => {
    const exactly = calculateVsDistributions([
      sample(0),
      sample(VS_CONFIG.maxGapSeconds),
    ], null, window(0, VS_CONFIG.maxGapSeconds))
    expect(exactly.primary.sog.coverage).toBe(1)

    const over = calculateVsDistributions([
      sample(0),
      sample(1.5),
      sample(3.01),
    ], null, window(0, 3.01))
    expect(over.primary.sog.validTimeSeconds).toBe(1.5)
    expect(over.primary.sog.coverage).toBeCloseTo(1.5 / 3.01)
    expect(over.primary.cog.coverage).toBeCloseTo(1.5 / 3.01)
  })

  it('qualifies exactly at minimum coverage and rejects values below it', () => {
    const samples = Array.from({ length: 11 }, (_unused, seconds) => (
      sample(seconds, seconds < 8 ? 4 : null, 90)
    ))
    const exact = calculateVsDistributions(samples, null, window(0, 10))
    expect(exact.primary.sog.coverage).toBe(VS_CONFIG.minCoverage)
    expect(exact.primary.sog.eligible).toBe(true)

    samples[7] = sample(7, null, 90)
    const below = calculateVsDistributions(samples, null, window(0, 10))
    expect(below.primary.sog.coverage).toBe(0.7)
    expect(below.primary.sog.eligible).toBe(false)
    expect(below.primary.cog.eligible).toBe(true)
  })

  it('excludes missing, non-finite, and negative SOG independently from COG', () => {
    const result = calculateVsDistributions([
      sample(0, null, 0),
      sample(1, Number.NaN, 10),
      sample(2, Number.POSITIVE_INFINITY, 20),
      sample(3, -1, 30),
      sample(4, 5, 40),
    ], null, window(0, 4))

    expect(result.primary.sog.coverage).toBe(0)
    expect(result.primary.sog.validTimeSeconds).toBe(0)
    expect(result.primary.cog.coverage).toBe(1)
  })

  it('excludes missing and non-finite COG independently from SOG', () => {
    const result = calculateVsDistributions([
      sample(0, 4, null),
      sample(1, 4, Number.NaN),
      sample(2, 4, Number.NEGATIVE_INFINITY),
      sample(3, 4, 90),
    ], null, window(0, 3))

    expect(result.primary.cog.coverage).toBe(0)
    expect(result.primary.sog.coverage).toBe(1)
  })

  it('builds one aligned SOG bin range for eligible Primary and Comparison', () => {
    const result = calculateVsDistributions(
      [sample(0, 4), sample(1, 4)],
      [sample(0, 5), sample(1, 5)],
      window(0, 1),
    )

    expect(result.sogBins.map((bin) => bin.start)).toEqual([4, 4.5, 5])
    expect(result.sogBins.map((bin) => bin.primaryPercentage)).toEqual([100, 0, 0])
    expect(result.sogBins.map((bin) => bin.comparisonPercentage)).toEqual([0, 0, 100])
  })

  it('returns Primary-only distributions without inventing Comparison', () => {
    const result = calculateVsDistributions(
      [sample(0), sample(1)],
      null,
      window(0, 1),
    )

    expect(result.comparison).toBeNull()
    expect(result.sogBins[0].comparisonPercentage).toBeNull()
    expect(result.primary.sog.eligible).toBe(true)
  })
})

describe('time-weighted signed TRIM statistics', () => {
  it('uses deterministic weighted empirical quantiles at exact cumulative boundaries', () => {
    const statistics = calculateWeightedTrimStatistics(new Map([
      [-2, 1],
      [0, 2],
      [4, 1],
    ]))

    expect(statistics).toEqual({
      minimum: -2,
      q1: -2,
      median: 0,
      q3: 0,
      maximum: 4,
      iqr: 2,
      lowerWhisker: -2,
      upperWhisker: 0,
      lowOutlierPercentage: 0,
      highOutlierPercentage: 25,
    })
  })

  it('uses observed in-fence values for Tukey whiskers and weighted outlier percentages', () => {
    const statistics = calculateWeightedTrimStatistics(new Map([
      [-10, 1],
      [-2, 2],
      [0, 4],
      [2, 2],
      [10, 1],
    ]))

    expect(statistics).toMatchObject({
      q1: -2,
      median: 0,
      q3: 2,
      iqr: 4,
      lowerWhisker: -2,
      upperWhisker: 2,
      lowOutlierPercentage: 10,
      highOutlierPercentage: 10,
    })
  })

  it('keeps zero-IQR results deterministic without inventing spread', () => {
    const statistics = calculateWeightedTrimStatistics(new Map([
      [-10, 1],
      [2, 8],
      [10, 1],
    ]))

    expect(statistics).toMatchObject({
      q1: 2,
      median: 2,
      q3: 2,
      iqr: 0,
      lowerWhisker: 2,
      upperWhisker: 2,
      lowOutlierPercentage: 10,
      highOutlierPercentage: 10,
    })
  })

  it('aggregates repeated values using clipped irregular interval durations', () => {
    const result = calculateVsDistributions([
      sample(0, 4, 90, 0, -2),
      sample(0.5, 4, 90, 0, 0),
      sample(1.5, 4, 90, 0, 2),
      sample(3, 4, 90, 0, 20),
    ], null, window(0.25, 2.5))

    expect(result.primary.trim.coverage).toBe(1)
    expect(result.primary.trim.validTimeSeconds).toBe(2.25)
    expect(result.primary.trim.valueTimeSeconds.get(-2)).toBe(0.25)
    expect(result.primary.trim.valueTimeSeconds.get(0)).toBe(1)
    expect(result.primary.trim.valueTimeSeconds.get(2)).toBe(1)
    expect(result.primary.trim.statistics).toMatchObject({
      q1: 0,
      median: 0,
      q3: 2,
    })
  })

  it('excludes missing, non-finite, and over-gap TRIM intervals', () => {
    const missing = calculateVsDistributions([
      sample(0, 4, 90, 0, null),
      sample(1, 4, 90, 0, Number.NaN),
      sample(2, 4, 90, 0, Number.POSITIVE_INFINITY),
      sample(3, 4, 90, 0, -2),
      sample(4, 4, 90, 0, 0),
    ], null, window(0, 4))
    expect(missing.primary.trim.validTimeSeconds).toBe(1)
    expect(missing.primary.trim.coverage).toBe(0.25)
    expect(missing.primary.trim.eligible).toBe(false)

    const gapped = calculateVsDistributions([
      sample(0, 4, 90, 0, -2),
      sample(1.5, 4, 90, 0, 0),
      sample(3.01, 4, 90, 0, 2),
    ], null, window(0, 3.01))
    expect(gapped.primary.trim.validTimeSeconds).toBe(1.5)
    expect(gapped.primary.trim.coverage).toBeCloseTo(1.5 / 3.01)
  })

  it('applies coverage independently to partially available P/C TRIM', () => {
    const primarySamples = Array.from({ length: 11 }, (_unused, seconds) => (
      sample(seconds, 4, 90, 0, seconds < 8 ? -2 : null)
    ))
    const comparisonSamples = Array.from({ length: 11 }, (_unused, seconds) => (
      sample(seconds, 4, 90, 0, seconds < 7 ? 2 : null)
    ))
    const result = calculateVsDistributions(
      primarySamples,
      comparisonSamples,
      window(0, 10),
    )

    expect(result.primary.trim.coverage).toBe(VS_CONFIG.minCoverage)
    expect(result.primary.trim.eligible).toBe(true)
    expect(result.comparison?.trim.coverage).toBe(0.7)
    expect(result.comparison?.trim.eligible).toBe(false)
    expect(result.primary.sog.coverage).toBe(1)
    expect(result.primary.cog.coverage).toBe(1)
    expect(result.primary.heel.coverage).toBe(1)
  })
})

describe('signed linear HEEL bins', () => {
  it('preserves sign and places exact boundaries, including zero, in deterministic bins', () => {
    const result = calculateVsDistributions([
      sample(0, 4, 90, -4),
      sample(1, 4, 90, -2),
      sample(2, 4, 90, 0),
      sample(3, 4, 90, 2),
      sample(4, 4, 90, 20),
    ], null, window(0, 4))

    expect(result.heelBins.find((bin) => bin.start === -4)?.primaryPercentage).toBe(25)
    expect(result.heelBins.find((bin) => bin.start === -2)?.primaryPercentage).toBe(25)
    expect(result.heelBins.find((bin) => bin.start === 0)?.primaryPercentage).toBe(25)
    expect(result.heelBins.find((bin) => bin.start === 2)?.primaryPercentage).toBe(25)
    expect(result.primary.heel.binTimeSeconds.has(-1)).toBe(true)
    expect(result.primary.heel.binTimeSeconds.has(0)).toBe(true)
  })

  it('keeps one fixed symmetric domain aligned to 2° bins', () => {
    const result = calculateVsDistributions([
      sample(0, 4, 90, -20),
      sample(1, 4, 90, 19.9),
    ], null, window(0, 1))

    expect(result.heelDomainMaximum).toBe(VS_CONFIG.heelDomainDeg)
    expect(result.heelBins).toHaveLength(20)
    expect(result.heelBins[0].start).toBe(-20)
    expect(result.heelBins.at(-1)?.end).toBe(20)
  })

  it('excludes out-of-domain time from coverage and normalizes over in-domain time', () => {
    const heels = [-20, -18, 0, 2, -20, -18, 0, 2, 20, -20.001, 0]
    const result = calculateVsDistributions(
      heels.map((heel, seconds) => sample(seconds, 4, 90, heel)),
      null,
      window(0, 10),
    )

    expect(result.primary.heel.validTimeSeconds).toBe(8)
    expect(result.primary.heel.coverage).toBe(VS_CONFIG.minCoverage)
    expect(result.primary.heel.eligible).toBe(true)
    expect(result.primary.sog.coverage).toBe(1)
    expect(result.primary.cog.coverage).toBe(1)
    expect(result.primary.heel.binTimeSeconds.has(10)).toBe(false)
    expect(result.primary.heel.binTimeSeconds.has(-11)).toBe(false)
    expect(result.heelBins.find((bin) => bin.start === -20)?.primaryPercentage).toBe(25)
    expect(result.heelBins.find((bin) => bin.start === -18)?.primaryPercentage).toBe(25)
    expect(result.heelBins.find((bin) => bin.start === 0)?.primaryPercentage).toBe(25)
    expect(result.heelBins.find((bin) => bin.start === 2)?.primaryPercentage).toBe(25)
  })

  it('uses clipped real irregular intervals and excludes gaps above the VS maximum', () => {
    const clipped = calculateVsDistributions([
      sample(0, 4, 90, -2),
      sample(0.5, 4, 90, 0),
      sample(1.5, 4, 90, 2),
      sample(3, 4, 90, 20),
    ], null, window(0.25, 2.5))

    expect(clipped.primary.heel.coverage).toBe(1)
    expect(clipped.primary.heel.validTimeSeconds).toBe(2.25)
    expect(clipped.heelBins.find((bin) => bin.start === -2)?.primaryPercentage)
      .toBeCloseTo(0.25 / 2.25 * 100)
    expect(clipped.heelBins.find((bin) => bin.start === 0)?.primaryPercentage)
      .toBeCloseTo(1 / 2.25 * 100)
    expect(clipped.heelBins.find((bin) => bin.start === 2)?.primaryPercentage)
      .toBeCloseTo(1 / 2.25 * 100)

    const gapped = calculateVsDistributions([
      sample(0, 4, 90, -2),
      sample(1.5, 4, 90, 0),
      sample(3.01, 4, 90, 2),
    ], null, window(0, 3.01))
    expect(gapped.primary.heel.validTimeSeconds).toBe(1.5)
    expect(gapped.primary.heel.coverage).toBeCloseTo(1.5 / 3.01)
  })

  it('treats missing and non-finite HEEL as unavailable without affecting SOG/COG', () => {
    const result = calculateVsDistributions([
      sample(0, 4, 90, null),
      sample(1, 4, 90, Number.NaN),
      sample(2, 4, 90, Number.POSITIVE_INFINITY),
      sample(3, 4, 90, -2),
      sample(4, 4, 90, 0),
    ], null, window(0, 4))

    expect(result.primary.heel.coverage).toBe(0.25)
    expect(result.primary.heel.eligible).toBe(false)
    expect(result.primary.sog.coverage).toBe(1)
    expect(result.primary.cog.coverage).toBe(1)
  })

  it('applies coverage eligibility independently and preserves partial P/C availability', () => {
    const primarySamples = Array.from({ length: 11 }, (_unused, seconds) => (
      sample(seconds, 4, 90, seconds < 8 ? -2 : null)
    ))
    const comparisonSamples = Array.from({ length: 11 }, (_unused, seconds) => (
      sample(seconds, 4, 90, seconds < 7 ? 2 : null)
    ))
    const result = calculateVsDistributions(
      primarySamples,
      comparisonSamples,
      window(0, 10),
    )

    expect(result.primary.heel.coverage).toBe(VS_CONFIG.minCoverage)
    expect(result.primary.heel.eligible).toBe(true)
    expect(result.comparison?.heel.coverage).toBe(0.7)
    expect(result.comparison?.heel.eligible).toBe(false)
    expect(result.heelBins.find((bin) => bin.start === -2)?.primaryPercentage).toBe(100)
    expect(result.heelBins.every((bin) => bin.comparisonPercentage === null)).toBe(true)
  })

  it('returns Primary-only HEEL without changing existing SOG/COG results', () => {
    const result = calculateVsDistributions([
      sample(0, 4, 359, -2),
      sample(1, 6, 91, 2),
      sample(2, 8, 180, 4),
    ], null, window(0, 2))

    expect(result.comparison).toBeNull()
    expect(result.heelBins.every((bin) => bin.comparisonPercentage === null)).toBe(true)
    expect(result.sogBins.find((bin) => bin.start === 4)?.primaryPercentage).toBe(50)
    expect(result.sogBins.find((bin) => bin.start === 6)?.primaryPercentage).toBe(50)
    expect(result.primary.cog.sectorPercentages[cogSectorIndex(359, 10)]).toBe(50)
    expect(result.primary.cog.sectorPercentages[cogSectorIndex(91, 10)]).toBe(50)
  })
})

describe('circular COG sectors', () => {
  it('places 359° and 001° in the same north-centered sector', () => {
    expect(cogSectorIndex(359, 10)).toBe(0)
    expect(cogSectorIndex(1, 10)).toBe(0)
  })

  it('normalizes finite values outside [0, 360)', () => {
    expect(cogSectorIndex(-1, 10)).toBe(0)
    expect(cogSectorIndex(361, 10)).toBe(0)
    expect(cogSectorIndex(450, 10)).toBe(9)
  })

  it('places ordinary eastward values in the 90° sector', () => {
    expect(cogSectorIndex(86, 10)).toBe(9)
    expect(cogSectorIndex(94, 10)).toBe(9)
  })

  it('guards sector sizes that do not divide 360 evenly', () => {
    expect(() => cogSectorIndex(0, 7)).toThrow('divide 360 evenly')
  })
})
