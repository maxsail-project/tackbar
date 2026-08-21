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

  it('averages signed HEEL and TRIM while ignoring missing/non-finite values', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z', { heel: -6, trim: 3 }),
      sample('2031-06-15T10:00:01Z', { heel: 2, trim: -1 }),
      sample('2031-06-15T10:00:02Z', { heel: null, trim: Number.NaN }),
    ])

    expect(metrics.avgHeelDegrees).toBe(-2)
    expect(metrics.avgTrimDegrees).toBe(1)
  })

  it('returns unavailable averages and COG when no valid values exist', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z'),
      sample('2031-06-15T10:00:01Z', {
        cog: Number.NaN,
        heel: Number.POSITIVE_INFINITY,
        trim: null,
      }),
    ])

    expect(metrics.dominantCogDegrees).toBeNull()
    expect(metrics.avgHeelDegrees).toBeNull()
    expect(metrics.avgTrimDegrees).toBeNull()
  })
})
