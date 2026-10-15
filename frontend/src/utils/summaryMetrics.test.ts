import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import {
  calculateSummaryMetrics as calculateSummaryMetricsForWindow,
} from './summaryMetrics'

const TEST_START = Date.parse('2031-06-15T10:00:00Z')

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

function timedSample(
  offsetMilliseconds: number,
  values: Partial<Omit<TrackSample, 'utc'>> = {},
) {
  return sample(new Date(TEST_START + offsetMilliseconds).toISOString(), values)
}

function calculateSummaryMetrics(samples: TrackSample[]) {
  const timestamps = samples.map((item) => Date.parse(item.utc))
  const start = timestamps.length > 0 ? Math.min(...timestamps) : TEST_START
  const latest = timestamps.length > 0 ? Math.max(...timestamps) : start
  return calculateSummaryMetricsForWindow(samples, {
    start,
    end: Math.max(start + 1, latest),
  })
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

  it('calculates positive and negative HEEL/TRIM medians from irregular represented time', () => {
    const metrics = calculateSummaryMetrics([
      timedSample(0, { heel: 2, trim: -8 }),
      timedSample(1_000, { heel: 4, trim: 1 }),
      timedSample(1_500, { heel: 8, trim: 3 }),
      timedSample(3_000, { heel: -10, trim: -4 }),
      timedSample(3_500, { heel: -6, trim: 5 }),
      timedSample(4_500, { heel: -6, trim: -2 }),
      timedSample(5_000),
    ])

    expect(metrics.medianPositiveHeelDegrees).toBe(4)
    expect(metrics.medianNegativeHeelDegrees).toBe(-6)
    expect(metrics.medianPositiveTrimDegrees).toBe(3)
    expect(metrics.medianNegativeTrimDegrees).toBe(-8)
  })

  it('selects the smaller value at an exact cumulative 50% boundary', () => {
    const metrics = calculateSummaryMetrics([
      timedSample(0, { heel: 1 }),
      timedSample(1_000, { heel: 9 }),
      timedSample(2_000),
    ])

    expect(metrics.medianPositiveHeelDegrees).toBe(1)
  })

  it('combines repeated values before selecting the weighted median', () => {
    const metrics = calculateSummaryMetrics([
      timedSample(0, { trim: 5 }),
      timedSample(500, { trim: 9 }),
      timedSample(1_000, { trim: 5 }),
      timedSample(1_500),
    ])

    expect(metrics.medianPositiveTrimDegrees).toBe(5)
  })

  it('clips adjacent intervals to the Analysis Window', () => {
    const metrics = calculateSummaryMetricsForWindow([
      timedSample(0, { heel: 2 }),
      timedSample(1_000, { heel: 8 }),
      timedSample(2_000),
    ], {
      start: TEST_START + 500,
      end: TEST_START + 1_500,
    })

    expect(metrics.medianPositiveHeelDegrees).toBe(2)
  })

  it('excludes nonpositive, out-of-order and over-1.5-second intervals', () => {
    const metrics = calculateSummaryMetricsForWindow([
      timedSample(0, { heel: 1 }),
      timedSample(0, { heel: 2 }),
      timedSample(-1_000, { heel: 3 }),
      timedSample(1_000, { heel: 9 }),
      timedSample(2_000),
    ], {
      start: TEST_START - 1_000,
      end: TEST_START + 2_000,
    })

    expect(metrics.medianPositiveHeelDegrees).toBe(9)
  })

  it('excludes zero, missing and non-finite values from every sign group', () => {
    const metrics = calculateSummaryMetrics([
      timedSample(0, { heel: 0, trim: 0 }),
      timedSample(500),
      timedSample(1_000, {
        heel: Number.POSITIVE_INFINITY,
        trim: Number.NEGATIVE_INFINITY,
      }),
      timedSample(1_500, {
        heel: Number.NaN,
        trim: Number.NaN,
      }),
      timedSample(2_000),
    ])

    expect(metrics.medianPositiveHeelDegrees).toBeNull()
    expect(metrics.medianNegativeHeelDegrees).toBeNull()
    expect(metrics.medianPositiveTrimDegrees).toBeNull()
    expect(metrics.medianNegativeTrimDegrees).toBeNull()
  })

  it('keeps missing sign groups independently unavailable', () => {
    const metrics = calculateSummaryMetrics([
      timedSample(0, { heel: 4, trim: -3 }),
      timedSample(1_000),
    ])

    expect(metrics.medianPositiveHeelDegrees).toBe(4)
    expect(metrics.medianNegativeHeelDegrees).toBeNull()
    expect(metrics.medianPositiveTrimDegrees).toBeNull()
    expect(metrics.medianNegativeTrimDegrees).toBe(-3)
  })

  it('produces equivalent medians for equivalent 1/2/10 Hz telemetry', () => {
    function piecewiseSamples(hertz: number) {
      const stepMilliseconds = 1_000 / hertz
      const samples: TrackSample[] = []
      for (let offset = 0; offset <= 10_000; offset += stepMilliseconds) {
        samples.push(timedSample(offset, {
          heel: offset < 4_000 ? 2 : 8,
          trim: offset < 4_000 ? -8 : -2,
        }))
      }
      return samples
    }

    for (const hertz of [1, 2, 10]) {
      const metrics = calculateSummaryMetrics(piecewiseSamples(hertz))
      expect(metrics.medianPositiveHeelDegrees).toBe(8)
      expect(metrics.medianNegativeTrimDegrees).toBe(-2)
    }
  })

  it('returns unavailable COG without valid values', () => {
    const metrics = calculateSummaryMetrics([
      sample('2031-06-15T10:00:00Z'),
      sample('2031-06-15T10:00:01Z', { cog: Number.NaN }),
    ])

    expect(metrics.dominantCogDegrees).toBeNull()
  })
})
