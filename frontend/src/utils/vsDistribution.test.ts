import { describe, expect, it } from 'vitest'
import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import { calculateVsDistributions, cogSectorIndex } from './vsDistribution'

const BASE_TIME = Date.parse('2026-10-12T12:00:00Z')

function sample(
  seconds: number,
  sog: number | null = 4,
  cog: number | null = 1,
): TrackSample {
  return {
    utc: new Date(BASE_TIME + seconds * 1_000).toISOString(),
    lat: 39,
    lon: 2,
    dist: 0,
    sog,
    cog,
    hdg: null,
    heel: null,
    trim: null,
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
    expect(tenHz.sog.reduce<number>(
      (total, percentage) => total + (percentage ?? 0),
      0,
    )).toBeCloseTo(100)
    expect(tenHz.cog.reduce((total, percentage) => total + percentage, 0)).toBeCloseTo(100)
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
