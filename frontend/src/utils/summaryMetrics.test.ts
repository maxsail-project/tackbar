import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import { calculateSummaryMetrics } from './summaryMetrics'

function sample(
  utc: string,
  values: Partial<Omit<TrackSample, 'utc'>> = {},
): TrackSample {
  return {
    utc,
    lat: 0.25,
    lon: -30.75,
    dist: 0,
    sog: null,
    cog: null,
    hdg: null,
    heel: null,
    trim: null,
    ...values,
  }
}

describe('summary metrics', () => {
  it('excludes the first selected sample distance', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { dist: 100 }),
      sample('2031-06-15T10:00:10Z', { dist: 20 }),
      sample('2031-06-15T10:00:20Z', { dist: 30 }),
    ])

    expect(metrics.distanceMeters).toBe(50)
    expect(metrics.distanceNm).toBeCloseTo(50 / 1_852)
  })

  it('returns zero distance for zero or one sample', () => {
    expect(calculateSummaryMetrics([]).distanceMeters).toBe(0)
    expect(calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { dist: 100 }),
    ]).distanceMeters).toBe(0)
  })

  it('calculates Avg SOG from distance and elapsed time, not sample SOG', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { dist: 500, sog: 40 }),
      sample('2031-06-15T10:30:00Z', { dist: 926, sog: 0 }),
      sample('2031-06-15T11:00:00Z', { dist: 926, sog: 20 }),
    ])

    expect(metrics.distanceMeters).toBe(1_852)
    expect(metrics.avgSogKnots).toBeCloseTo(1)
    expect(metrics.maxSogKnots).toBe(40)
  })

  it('calculates Max SOG from finite canonical samples', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { sog: null }),
      sample('2031-06-15T10:00:01Z', { sog: Number.NaN }),
      sample('2031-06-15T10:00:02Z', { sog: 4.2 }),
      sample('2031-06-15T10:00:03Z', { sog: 5.1 }),
      sample('2031-06-15T10:00:04Z', { sog: 4.8 }),
      sample('2031-06-15T10:00:05Z', { sog: Number.POSITIVE_INFINITY }),
    ])

    expect(metrics.maxSogKnots).toBe(5.1)
  })

  it('treats zero as valid Max SOG and returns null without valid values', () => {
    expect(calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { sog: 0 }),
    ]).maxSogKnots).toBe(0)

    expect(calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { sog: null }),
      sample('2031-06-15T10:00:01Z', { sog: Number.NEGATIVE_INFINITY }),
    ]).maxSogKnots).toBeNull()
  })

  it('returns unavailable Avg SOG without a positive elapsed interval', () => {
    expect(calculateSummaryMetrics([]).avgSogKnots).toBeNull()
    expect(calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z'),
    ]).avgSogKnots).toBeNull()
    expect(calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z'),
      sample('2031-06-15T10:00:00Z', { dist: 10 }),
    ]).avgSogKnots).toBeNull()
  })

  it('groups 359° and 1° in the same north bin', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { cog: 359 }),
      sample('2031-06-15T10:00:01Z', { cog: 1 }),
    ])

    expect(metrics.dominantCogDegrees).toBe(0)
    expect(metrics.dominantCogDegrees).not.toBe(180)
  })

  it('selects the wrapped north bin for values from 356° through 4°', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { cog: 356 }),
      sample('2031-06-15T10:00:01Z', { cog: 359 }),
      sample('2031-06-15T10:00:02Z', { cog: 1 }),
      sample('2031-06-15T10:00:03Z', { cog: 4 }),
      sample('2031-06-15T10:00:04Z', { cog: 92 }),
    ])

    expect(metrics.dominantCogDegrees).toBe(0)
  })

  it('bins ordinary and normalized COG values deterministically', () => {
    const ordinary = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { cog: 86 }),
      sample('2031-06-15T10:00:01Z', { cog: 89 }),
      sample('2031-06-15T10:00:02Z', { cog: 94 }),
    ])
    const normalized = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { cog: -1 }),
      sample('2031-06-15T10:00:01Z', { cog: 361 }),
    ])
    const tied = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { cog: 11 }),
      sample('2031-06-15T10:00:01Z', { cog: 21 }),
    ])

    expect(ordinary.dominantCogDegrees).toBe(90)
    expect(normalized.dominantCogDegrees).toBe(0)
    expect(tied.dominantCogDegrees).toBe(10)
  })

  it('averages positive and negative HEEL independently', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { heel: -6 }),
      sample('2031-06-15T10:00:01Z', { heel: 2 }),
      sample('2031-06-15T10:00:02Z', { heel: 4 }),
      sample('2031-06-15T10:00:03Z', { heel: -10 }),
      sample('2031-06-15T10:00:04Z', { heel: 0 }),
      sample('2031-06-15T10:00:05Z', { heel: null }),
    ])

    expect(metrics.avgPositiveHeelDegrees).toBe(3)
    expect(metrics.avgNegativeHeelDegrees).toBe(-8)
  })

  it('keeps absent HEEL sign groups independently unavailable', () => {
    const positiveOnly = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { heel: 2 }),
      sample('2031-06-15T10:00:01Z', { heel: 4 }),
    ])
    const negativeOnly = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { heel: -6 }),
      sample('2031-06-15T10:00:01Z', { heel: -10 }),
    ])

    expect(positiveOnly.avgPositiveHeelDegrees).toBe(3)
    expect(positiveOnly.avgNegativeHeelDegrees).toBeNull()
    expect(negativeOnly.avgPositiveHeelDegrees).toBeNull()
    expect(negativeOnly.avgNegativeHeelDegrees).toBe(-8)
  })

  it('averages positive and negative TRIM independently', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { trim: 3 }),
      sample('2031-06-15T10:00:01Z', { trim: -1 }),
      sample('2031-06-15T10:00:02Z', { trim: 5 }),
      sample('2031-06-15T10:00:03Z', { trim: -3 }),
      sample('2031-06-15T10:00:04Z', { trim: 0 }),
      sample('2031-06-15T10:00:05Z', { trim: null }),
    ])

    expect(metrics.avgPositiveTrimDegrees).toBe(4)
    expect(metrics.avgNegativeTrimDegrees).toBe(-2)
  })

  it('keeps absent TRIM sign groups independently unavailable', () => {
    const positiveOnly = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { trim: 3 }),
      sample('2031-06-15T10:00:01Z', { trim: 5 }),
    ])
    const negativeOnly = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { trim: -1 }),
      sample('2031-06-15T10:00:01Z', { trim: -3 }),
    ])

    expect(positiveOnly.avgPositiveTrimDegrees).toBe(4)
    expect(positiveOnly.avgNegativeTrimDegrees).toBeNull()
    expect(negativeOnly.avgPositiveTrimDegrees).toBeNull()
    expect(negativeOnly.avgNegativeTrimDegrees).toBe(-2)
  })

  it('excludes zero from HEEL and TRIM sign groups', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { heel: 0, trim: 0 }),
    ])

    expect(metrics.avgPositiveHeelDegrees).toBeNull()
    expect(metrics.avgNegativeHeelDegrees).toBeNull()
    expect(metrics.avgPositiveTrimDegrees).toBeNull()
    expect(metrics.avgNegativeTrimDegrees).toBeNull()
  })

  it('ignores missing and non-finite HEEL and TRIM values', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z'),
      sample('2031-06-15T10:00:01Z', {
        heel: Number.POSITIVE_INFINITY,
        trim: Number.NEGATIVE_INFINITY,
      }),
      sample('2031-06-15T10:00:02Z', {
        heel: Number.NaN,
        trim: Number.NaN,
      }),
    ])

    expect(metrics.avgPositiveHeelDegrees).toBeNull()
    expect(metrics.avgNegativeHeelDegrees).toBeNull()
    expect(metrics.avgPositiveTrimDegrees).toBeNull()
    expect(metrics.avgNegativeTrimDegrees).toBeNull()
  })

  it('returns unavailable COG without valid values', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z'),
      sample('2031-06-15T10:00:01Z', { cog: Number.NaN }),
    ])

    expect(metrics.dominantCogDegrees).toBeNull()
  })
})
