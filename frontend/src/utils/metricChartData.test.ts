import { describe, expect, it } from 'vitest'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import { SAILING_METRICS } from '../types/session'
import type { TrackSample } from '../types/track'
import {
  buildCogChartPoints,
  buildScalarChartPoints,
  buildSogChartPoints,
  buildSogSignalPath,
  buildSogTrendPoints,
  reduceRawSogChartPoints,
  sogSignalXPosition,
  type ScalarChartMetric,
} from './metricChartData'

const BASE_TIME = Date.parse('2026-08-15T13:00:00Z')

function samplesWithSog(
  points: Array<[offsetMilliseconds: number, sog: number | null]>,
): TrackSample[] {
  return points.map(([offsetMilliseconds, sog], index) => ({
    utc: new Date(BASE_TIME + offsetMilliseconds).toISOString(),
    lat: 0.25,
    lon: -30.75,
    dist: index === 0 ? 0 : 1,
    sog,
    cog: null,
    hdg: null,
    heel: null,
    trim: null,
  }))
}

function samplesWithCog(values: Array<number | null>): TrackSample[] {
  return values.map((cog, index) => ({
    utc: new Date(Date.UTC(2026, 7, 15, 13, 0, index)).toISOString(),
    lat: 0.25,
    lon: -30.75,
    dist: index === 0 ? 0 : 1,
    sog: 5,
    cog,
    hdg: null,
    heel: null,
    trim: null,
  }))
}

function renderedValues(values: Array<number | null>) {
  return buildCogChartPoints(samplesWithCog(values)).map((point) => point.cog)
}

function samplesWithScalarValues(
  metric: ScalarChartMetric,
  values: Array<number | null>,
): TrackSample[] {
  const sampleField = metric.toLowerCase() as 'heel' | 'trim'
  return values.map((value, index) => ({
    utc: new Date(Date.UTC(2026, 7, 15, 13, 0, index)).toISOString(),
    lat: 0.25,
    lon: -30.75,
    dist: index === 0 ? 0 : 1,
    sog: null,
    cog: null,
    hdg: null,
    heel: null,
    trim: null,
    [sampleField]: value,
  }))
}

describe('Viewer metric selection', () => {
  it('enables exactly SOG, COG, HEEL, and TRIM', () => {
    expect(SAILING_METRICS).toEqual(['SOG', 'COG', 'HEEL', 'TRIM'])
  })
})

describe('scalar chart data', () => {
  it('preserves signed HEEL values, zero, and null gaps', () => {
    const values = [6, 3, 0, -4, null, -8]
    const points = buildScalarChartPoints(
      samplesWithScalarValues('HEEL', values),
      'HEEL',
    )

    expect(points.map((point) => point.value)).toEqual(values)
  })

  it('preserves signed TRIM values, zero, and null gaps', () => {
    const values = [3, 0, -2, null, -5]
    const points = buildScalarChartPoints(
      samplesWithScalarValues('TRIM', values),
      'TRIM',
    )

    expect(points.map((point) => point.value)).toEqual(values)
  })

  it('turns non-finite scalar values into null without inventing zero', () => {
    const points = buildScalarChartPoints(
      samplesWithScalarValues('HEEL', [Number.NaN, Number.POSITIVE_INFINITY]),
      'HEEL',
    )

    expect(points.map((point) => point.value)).toEqual([null, null])
  })

  it('preserves every source timestamp in chronological order', () => {
    const samples = samplesWithScalarValues('TRIM', [1, 2, 3])
    const points = buildScalarChartPoints(samples, 'TRIM')

    expect(points.map((point) => point.time)).toEqual(
      samples.map((sample) => Date.parse(sample.utc)),
    )
  })
})

describe('native-SVG SOG presentation data', () => {
  it('uses the centralized ten-second smoothing window and raw point budget', () => {
    expect(SOG_SIGNAL_TUNING.smoothingWindowSeconds).toBe(10)
    expect(SOG_SIGNAL_TUNING.rawPointBudget).toBe(800)
  })

  it('calculates a centered ten-second time-weighted trend', () => {
    const trend = buildSogTrendPoints(buildSogChartPoints(samplesWithSog([
      [0, 0],
      [1_000, 0],
      [2_000, 0],
      [3_000, 0],
      [4_000, 0],
      [5_000, 10],
      [6_000, 0],
      [7_000, 0],
      [8_000, 0],
      [9_000, 0],
      [10_000, 0],
    ])))

    expect(trend[5].sog).toBe(1)
  })

  it('weights irregular timestamps by represented time', () => {
    const trend = buildSogTrendPoints(buildSogChartPoints(samplesWithSog([
      [0, 0],
      [500, 2],
      [2_000, 2],
    ])))

    expect(trend.map((point) => point.sog)).toEqual([1.75, 1.75, 1.75])
  })

  it('produces equivalent trends for equivalent 1, 2, and 10 Hz telemetry', () => {
    const trendAtWholeSeconds = (frequency: number) => {
      const interval = 1_000 / frequency
      const samples = Array.from(
        { length: 4 * frequency + 1 },
        (_, index) => {
          const offset = index * interval
          return [offset, 4 + 2 * offset / 1_000] as [number, number]
        },
      )
      return buildSogTrendPoints(buildSogChartPoints(samplesWithSog(samples)))
        .filter((point) => (point.time - BASE_TIME) % 1_000 === 0)
        .map((point) => point.sog)
    }

    expect(trendAtWholeSeconds(2)).toEqual(trendAtWholeSeconds(1))
    expect(trendAtWholeSeconds(10)).toEqual(trendAtWholeSeconds(1))
  })

  it('allows a 1.5-second interval and splits trend continuity above it', () => {
    const trend = buildSogTrendPoints(buildSogChartPoints(samplesWithSog([
      [0, 2],
      [1_500, 2],
      [3_001, 10],
      [4_501, 10],
    ])))

    expect(trend.filter((point) => point.kind === 'gap')).toEqual([{
      time: BASE_TIME + 2_250.5,
      sog: null,
      kind: 'gap',
    }])
    expect(trend
      .filter((point) => point.kind === 'sample')
      .map((point) => point.sog)).toEqual([2, 2, 10, 10])
  })

  it('preserves missing and non-finite SOG as breaks without inventing values', () => {
    const points = buildSogChartPoints(samplesWithSog([
      [0, 2],
      [500, null],
      [1_000, Number.NaN],
      [1_500, Number.POSITIVE_INFINITY],
      [2_000, 6],
    ]))
    const trend = buildSogTrendPoints(points)

    expect(points.map((point) => point.sog)).toEqual([2, null, null, null, 6])
    expect(trend.map((point) => point.sog)).toEqual([2, null, null, null, 6])
  })

  it('reduces only raw presentation while the trend retains every canonical sample', () => {
    const samples = samplesWithSog(Array.from(
      { length: 900 },
      (_, index) => [index * 100, 4 + (index % 7)] as [number, number],
    ))
    const canonicalPoints = buildSogChartPoints(samples)
    const originalSog = samples.map((sample) => sample.sog)

    const rawPoints = reduceRawSogChartPoints(
      canonicalPoints,
      SOG_SIGNAL_TUNING.rawPointBudget,
    )
    const trendPoints = buildSogTrendPoints(canonicalPoints)

    expect(rawPoints).toHaveLength(SOG_SIGNAL_TUNING.rawPointBudget)
    expect(trendPoints.filter((point) => point.kind === 'sample'))
      .toHaveLength(samples.length)
    expect(samples.map((sample) => sample.sog)).toEqual(originalSog)
  })

  it('uses deterministic raw buckets that preserve endpoints and a missing-data gap', () => {
    const canonicalPoints = buildSogChartPoints(samplesWithSog(Array.from(
      { length: 12 },
      (_, index) => [index * 100, index === 5 ? null : index] as [number, number | null],
    )))
    const reduced = reduceRawSogChartPoints(canonicalPoints, 6)

    expect(reduced).toHaveLength(6)
    expect(reduced[0]).toEqual(canonicalPoints[0])
    expect(reduced[reduced.length - 1]).toEqual(canonicalPoints[canonicalPoints.length - 1])
    expect(reduced.some((point) => point.sog === null)).toBe(true)
  })

  it('generates native-SVG paths with scaled knots and explicit gaps', () => {
    const range = { start: BASE_TIME, end: BASE_TIME + 2_000 }

    expect(buildSogSignalPath([
      { time: BASE_TIME, sog: 0 },
      { time: BASE_TIME + 1_000, sog: null },
      { time: BASE_TIME + 2_000, sog: 10 },
    ], range, 10)).toBe('M0.00,192.00 M1000.00,8.00')
  })

  it('positions and clamps the playback cursor on the shared UTC range', () => {
    const range = { start: BASE_TIME, end: BASE_TIME + 2_000 }

    expect(sogSignalXPosition(BASE_TIME - 1_000, range)).toBe(0)
    expect(sogSignalXPosition(BASE_TIME + 1_000, range)).toBe(500)
    expect(sogSignalXPosition(BASE_TIME + 3_000, range)).toBe(1_000)
  })
})

describe('COG chart data', () => {
  it('keeps an ordinary sequence continuous', () => {
    expect(renderedValues([100, 110, 120])).toEqual([100, 110, 120])
  })

  it('breaks an ascending crossing through north', () => {
    expect(renderedValues([358, 359, 1, 2])).toEqual([358, 359, null, 1, 2])
  })

  it('breaks a descending crossing through north', () => {
    expect(renderedValues([2, 1, 359, 358])).toEqual([2, 1, null, 359, 358])
  })

  it('breaks a wider north crossing', () => {
    expect(renderedValues([350, 10])).toEqual([350, null, 10])
  })

  it('uses a strict greater-than 180 degree threshold', () => {
    expect(renderedValues([0, 180])).toEqual([0, 180])
    expect(renderedValues([0, 180.1])).toEqual([0, null, 180.1])
  })

  it('turns missing and non-finite values into gaps without inventing zero', () => {
    const points = buildCogChartPoints(samplesWithCog([
      100,
      null,
      120,
      Number.NaN,
      130,
    ]))

    expect(points.map((point) => point.cog)).toEqual([100, null, 120, null, 130])
    expect(points.filter((point) => point.kind === 'wrap-gap')).toHaveLength(0)
  })

  it('preserves every real COG sample while adding rendering-only gaps', () => {
    const values = [358, 359, 1, 2]
    const points = buildCogChartPoints(samplesWithCog(values))
    const sourcePoints = points.filter((point) => point.kind === 'sample')

    expect(sourcePoints).toHaveLength(values.length)
    expect(sourcePoints.map((point) => point.cog)).toEqual(values)
    expect(points.filter((point) => point.kind === 'wrap-gap')).toHaveLength(1)
  })
})
