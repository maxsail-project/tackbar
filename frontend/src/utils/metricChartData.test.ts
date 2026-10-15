import { describe, expect, it } from 'vitest'
import { COG_SIGNAL_TUNING } from '../config/cogSignal'
import { HEEL_SIGNAL_TUNING } from '../config/heelSignal'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import { TRIM_SIGNAL_TUNING } from '../config/trimSignal'
import { SAILING_METRICS } from '../types/session'
import type { TrackSample } from '../types/track'
import {
  buildCogChartPoints,
  buildCanonicalCogChartPoints,
  buildCogSignalPath,
  buildHeelBuckets,
  buildHeelChartPoints,
  buildHeelStepPath,
  buildSmoothedCogChartPoints,
  buildScalarChartPoints,
  buildSogChartPoints,
  buildSogSignalPath,
  buildSogTrendPoints,
  buildTrimChartPoints,
  buildTrimSignalPath,
  reduceRawSogChartPoints,
  reduceRawCogChartPoints,
  reduceRawTrimChartPoints,
  resolveHeelSignalDomain,
  resolveTrimSignalDomain,
  heelSignalXPosition,
  sogSignalXPosition,
  trimSignalXPosition,
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
  return samplesWithCogAt(values.map((cog, index) => [index * 1_000, cog]))
}

function samplesWithCogAt(
  points: Array<[offsetMilliseconds: number, cog: number | null]>,
): TrackSample[] {
  return points.map(([offsetMilliseconds, cog], index) => ({
    utc: new Date(BASE_TIME + offsetMilliseconds).toISOString(),
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

function samplesWithHeelAt(
  points: Array<[offsetMilliseconds: number, heel: number | null]>,
): TrackSample[] {
  return points.map(([offsetMilliseconds, heel], index) => ({
    utc: new Date(BASE_TIME + offsetMilliseconds).toISOString(),
    lat: 0.25,
    lon: -30.75,
    dist: index === 0 ? 0 : 1,
    sog: null,
    cog: null,
    hdg: null,
    heel,
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

describe('native-SVG HEEL presentation data', () => {
  it('uses centralized HEEL-specific bucket and trace tuning', () => {
    expect(HEEL_SIGNAL_TUNING).toEqual({
      bucketSeconds: 2,
      maxGapSeconds: 1.5,
      traceOpacity: 0.6,
      traceStrokeWidth: 3,
    })
  })

  it('preserves signed finite HEEL and missing/non-finite gaps', () => {
    const points = buildHeelChartPoints(samplesWithScalarValues('HEEL', [
      6,
      0,
      -4,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -8,
    ]))

    expect(points.map((point) => point.value)).toEqual([
      6,
      0,
      -4,
      null,
      null,
      null,
      -8,
    ])
  })

  it('aligns two-second buckets to absolute UTC rather than the first sample', () => {
    const buckets = buildHeelBuckets(buildHeelChartPoints(samplesWithHeelAt([
      [500, 4],
      [1_500, 4],
      [2_500, 4],
    ])))

    expect(buckets).toEqual([
      {
        start: BASE_TIME,
        end: BASE_TIME + 2_000,
        value: 4,
        connectsFromPrevious: false,
      },
      {
        start: BASE_TIME + 2_000,
        end: BASE_TIME + 4_000,
        value: 4,
        connectsFromPrevious: true,
      },
    ])
  })

  it('calculates time-weighted means from actual represented intervals', () => {
    const buckets = buildHeelBuckets(buildHeelChartPoints(samplesWithHeelAt([
      [0, 0],
      [1_000, 0],
      [2_000, 10],
    ])))

    expect(buckets).toEqual([{
      start: BASE_TIME,
      end: BASE_TIME + 2_000,
      value: 2.5,
      connectsFromPrevious: false,
    }])
  })

  it('clips irregular represented durations to UTC bucket boundaries', () => {
    const buckets = buildHeelBuckets(buildHeelChartPoints(samplesWithHeelAt([
      [0, 0],
      [500, 2],
      [2_000, 2],
    ])))

    expect(buckets[0].value).toBe(1.75)
  })

  it('produces equivalent buckets for equivalent 1, 2, and 10 Hz telemetry', () => {
    const bucketValues = (frequency: number) => {
      const interval = 1_000 / frequency
      const points = Array.from(
        { length: 4 * frequency + 1 },
        (_, index) => {
          const offset = index * interval
          return [offset, -4 + 2 * offset / 1_000] as [number, number]
        },
      )
      return buildHeelBuckets(buildHeelChartPoints(samplesWithHeelAt(points)))
        .map((bucket) => bucket.value)
    }

    expect(bucketValues(2)).toEqual(bucketValues(1))
    expect(bucketValues(10)).toEqual(bucketValues(1))
  })

  it('allows 1.5-second continuity and rejects longer intervals', () => {
    const allowed = buildHeelBuckets(buildHeelChartPoints(samplesWithHeelAt([
      [0, 3],
      [1_500, 3],
    ])))
    const rejected = buildHeelBuckets(buildHeelChartPoints(samplesWithHeelAt([
      [0, 3],
      [1_501, 3],
    ])))

    expect(allowed[0].value).toBe(3)
    expect(rejected[0].value).toBeNull()
  })

  it('preserves missing and non-finite HEEL as unavailable represented time', () => {
    const canonical = buildHeelChartPoints(samplesWithHeelAt([
      [0, 2],
      [1_000, null],
      [2_000, Number.NaN],
      [3_000, Number.POSITIVE_INFINITY],
      [4_000, 6],
      [5_000, 6],
    ]))
    const buckets = buildHeelBuckets(canonical)

    expect(canonical.map((point) => point.value)).toEqual([2, null, null, null, 6, 6])
    expect(buckets.map((bucket) => bucket.value)).toEqual([null, null, 6])
  })

  it('breaks step continuity when missing data separates adjacent available buckets', () => {
    const buckets = buildHeelBuckets(buildHeelChartPoints(samplesWithHeelAt([
      [0, 2],
      [1_000, 2],
      [2_000, null],
      [3_000, 6],
      [4_000, 6],
    ])))

    expect(buckets.map((bucket) => ({
      value: bucket.value,
      connectsFromPrevious: bucket.connectsFromPrevious,
    }))).toEqual([
      { value: 2, connectsFromPrevious: false },
      { value: 6, connectsFromPrevious: false },
    ])
  })

  it('returns unavailable buckets when no valid duration is represented', () => {
    const buckets = buildHeelBuckets(buildHeelChartPoints(samplesWithHeelAt([
      [0, 2],
      [1_000, 2],
      [5_000, 10],
      [6_000, 10],
    ])))

    expect(buckets.map((bucket) => bucket.value)).toEqual([2, null, 10])
  })

  it('auto-ranges signed HEEL while always retaining zero', () => {
    expect(resolveHeelSignalDomain([[
      { value: -8.2 },
      { value: 6.1 },
    ]])).toEqual({ minimum: -9, maximum: 7 })
    expect(resolveHeelSignalDomain([[
      { value: 2.1 },
      { value: 6.1 },
    ]])).toEqual({ minimum: 0, maximum: 7 })
    expect(resolveHeelSignalDomain([[
      { value: -8.2 },
      { value: -2.1 },
    ]])).toEqual({ minimum: -9, maximum: 0 })
    expect(resolveHeelSignalDomain([[
      { value: 0 },
    ]])).toEqual({ minimum: -1, maximum: 1 })
  })

  it('generates deterministic horizontal steps and breaks unavailable buckets', () => {
    expect(buildHeelStepPath([
      {
        start: BASE_TIME,
        end: BASE_TIME + 2_000,
        value: 5,
        connectsFromPrevious: false,
      },
      {
        start: BASE_TIME + 2_000,
        end: BASE_TIME + 4_000,
        value: 10,
        connectsFromPrevious: true,
      },
      {
        start: BASE_TIME + 4_000,
        end: BASE_TIME + 6_000,
        value: null,
        connectsFromPrevious: false,
      },
      {
        start: BASE_TIME + 6_000,
        end: BASE_TIME + 8_000,
        value: -5,
        connectsFromPrevious: false,
      },
    ], {
      start: BASE_TIME,
      end: BASE_TIME + 8_000,
    }, {
      minimum: -10,
      maximum: 10,
    })).toBe(
      'M0.00,54.00 L250.00,54.00 L250.00,8.00 L500.00,8.00 '
      + 'M750.00,146.00 L1000.00,146.00',
    )
  })

  it('positions and clamps the HEEL playback cursor on shared UTC', () => {
    const range = { start: BASE_TIME, end: BASE_TIME + 2_000 }

    expect(heelSignalXPosition(BASE_TIME - 1_000, range)).toBe(0)
    expect(heelSignalXPosition(BASE_TIME + 1_000, range)).toBe(500)
    expect(heelSignalXPosition(BASE_TIME + 3_000, range)).toBe(1_000)
  })
})

describe('native-SVG TRIM presentation data', () => {
  it('uses centralized TRIM-specific raw trace tuning', () => {
    expect(TRIM_SIGNAL_TUNING).toEqual({
      traceOpacity: 0.6,
      traceStrokeWidth: 3,
      rawPointBudget: 800,
    })
  })

  it('preserves signed finite TRIM and missing/non-finite gaps', () => {
    const points = buildTrimChartPoints(samplesWithScalarValues('TRIM', [
      6,
      0,
      -4,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -8,
    ]))

    expect(points.map((point) => point.value)).toEqual([
      6,
      0,
      -4,
      null,
      null,
      null,
      -8,
    ])
  })

  it('reduces only the raw presentation and preserves endpoints and a gap', () => {
    const samples = samplesWithScalarValues(
      'TRIM',
      Array.from({ length: 900 }, (_, index) => index === 450 ? null : index - 450),
    )
    const canonical = buildTrimChartPoints(samples)
    const originalTrim = samples.map((sample) => sample.trim)
    const reduced = reduceRawTrimChartPoints(canonical)

    expect(reduced).toHaveLength(TRIM_SIGNAL_TUNING.rawPointBudget)
    expect(reduced[0]).toEqual(canonical[0])
    expect(reduced[reduced.length - 1]).toEqual(canonical[canonical.length - 1])
    expect(reduced.some((point) => point.value === null)).toBe(true)
    expect(samples.map((sample) => sample.trim)).toEqual(originalTrim)
  })

  it('auto-ranges signed TRIM while always retaining zero', () => {
    expect(resolveTrimSignalDomain([[
      { time: BASE_TIME, value: -8.2 },
      { time: BASE_TIME + 1_000, value: 6.1 },
    ]])).toEqual({ minimum: -9, maximum: 7 })
    expect(resolveTrimSignalDomain([[
      { time: BASE_TIME, value: 2.1 },
      { time: BASE_TIME + 1_000, value: 6.1 },
    ]])).toEqual({ minimum: 0, maximum: 7 })
    expect(resolveTrimSignalDomain([[
      { time: BASE_TIME, value: -8.2 },
      { time: BASE_TIME + 1_000, value: -2.1 },
    ]])).toEqual({ minimum: -9, maximum: 0 })
    expect(resolveTrimSignalDomain([[
      { time: BASE_TIME, value: 0 },
    ]])).toEqual({ minimum: -1, maximum: 1 })
  })

  it('generates a signed path with explicit missing-data breaks', () => {
    expect(buildTrimSignalPath([
      { time: BASE_TIME, value: -10 },
      { time: BASE_TIME + 1_000, value: null },
      { time: BASE_TIME + 2_000, value: 10 },
    ], {
      start: BASE_TIME,
      end: BASE_TIME + 2_000,
    }, {
      minimum: -10,
      maximum: 10,
    })).toBe('M0.00,192.00 M1000.00,8.00')
  })

  it('positions and clamps the TRIM playback cursor on shared UTC', () => {
    const range = { start: BASE_TIME, end: BASE_TIME + 2_000 }

    expect(trimSignalXPosition(BASE_TIME - 1_000, range)).toBe(0)
    expect(trimSignalXPosition(BASE_TIME + 1_000, range)).toBe(500)
    expect(trimSignalXPosition(BASE_TIME + 3_000, range)).toBe(1_000)
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
  it('uses centralized COG-specific tuning values', () => {
    expect(COG_SIGNAL_TUNING).toEqual({
      rawOpacity: 0.6,
      rawStrokeWidth: 0.8,
      smoothedOpacity: 1,
      smoothedStrokeWidth: 4,
      smoothingWindowSeconds: 10,
      rawPointBudget: 800,
      maxGapSeconds: 1.5,
      circularMeanTolerance: 1e-6,
    })
  })

  it('smooths 359° and 1° around north rather than 180°', () => {
    const smoothed = buildSmoothedCogChartPoints(buildCanonicalCogChartPoints(
      samplesWithCog([359, 1]),
    ))

    smoothed.forEach((point) => {
      expect(point.cog).not.toBeNull()
      expect(Math.min(point.cog ?? 180, 360 - (point.cog ?? 180))).toBeLessThan(0.001)
    })
  })

  it('calculates an ordinary circular mean away from north', () => {
    const smoothed = buildSmoothedCogChartPoints(buildCanonicalCogChartPoints(
      samplesWithCog([90, 110]),
    ))

    expect(smoothed.map((point) => point.cog)).toEqual([100, 100])
  })

  it('uses a centered ten-second time window', () => {
    const smoothed = buildSmoothedCogChartPoints(buildCanonicalCogChartPoints(
      samplesWithCogAt(Array.from(
        { length: 13 },
        (_, index) => [index * 1_000, index === 6 ? 90 : 0] as [number, number],
      )),
    ))
    const centerPoint = smoothed.find((point) => point.time === BASE_TIME + 6_000)

    expect(centerPoint?.cog).toBeCloseTo(6.34, 2)
  })

  it('weights circular contributions by actual irregular timestamps', () => {
    const smoothed = buildSmoothedCogChartPoints(buildCanonicalCogChartPoints(
      samplesWithCogAt([
        [0, 0],
        [1_000, 0],
        [2_500, 90],
      ]),
    ))

    smoothed.forEach((point) => expect(point.cog).toBeCloseTo(23.199, 3))
  })

  it('produces consistent circular trends for equivalent 1, 2, and 10 Hz telemetry', () => {
    const smoothedAtWholeSeconds = (frequency: number) => {
      const interval = 1_000 / frequency
      const points = Array.from(
        { length: 4 * frequency + 1 },
        (_, index) => {
          const offset = index * interval
          return [offset, 100 + 5 * offset / 1_000] as [number, number]
        },
      )
      return buildSmoothedCogChartPoints(buildCanonicalCogChartPoints(
        samplesWithCogAt(points),
      ))
        .filter((point) => (point.time - BASE_TIME) % 1_000 === 0)
        .map((point) => point.cog)
    }

    const oneHertz = smoothedAtWholeSeconds(1)
    smoothedAtWholeSeconds(2).forEach((value, index) => {
      expect(value).toBeCloseTo(oneHertz[index] ?? 0, 8)
    })
    smoothedAtWholeSeconds(10).forEach((value, index) => {
      expect(value).toBeCloseTo(oneHertz[index] ?? 0, 8)
    })
  })

  it('allows a 1.5-second interval and splits smoothing above it', () => {
    const smoothed = buildSmoothedCogChartPoints(buildCanonicalCogChartPoints(
      samplesWithCogAt([
        [0, 30],
        [1_500, 30],
        [3_001, 210],
        [4_501, 210],
      ]),
    ))

    expect(smoothed.filter((point) => point.kind === 'gap')).toEqual([{
      time: BASE_TIME + 2_250.5,
      cog: null,
      kind: 'gap',
    }])
    smoothed.filter((point) => point.kind === 'sample').forEach((point, index) => {
      expect(point.cog).toBeCloseTo(index < 2 ? 30 : 210, 10)
    })
  })

  it('preserves missing and non-finite COG as smoothing breaks', () => {
    const canonical = buildCanonicalCogChartPoints(samplesWithCog([
      45,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      90,
    ]))

    expect(canonical.map((point) => point.cog)).toEqual([45, null, null, null, 90])
    expect(buildSmoothedCogChartPoints(canonical).map((point) => point.cog))
      .toEqual([45, null, null, null, 90])
  })

  it('returns unavailable for cancelled and near-cancelled circular means', () => {
    const cancelled = buildSmoothedCogChartPoints(buildCanonicalCogChartPoints(
      samplesWithCog([0, 180]),
    ))
    const nearCancelled = buildSmoothedCogChartPoints(buildCanonicalCogChartPoints(
      samplesWithCog([0, 180.00001]),
    ))

    expect(cancelled.map((point) => point.cog)).toEqual([null, null])
    expect(nearCancelled.map((point) => point.cog)).toEqual([null, null])
  })

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

  it('adds wrap breaks independently to the smoothed path', () => {
    const canonical = buildCanonicalCogChartPoints(samplesWithCogAt(Array.from(
      { length: 21 },
      (_, index) => [index * 1_000, index < 10 ? 350 : 10] as [number, number],
    )))
    const smoothed = buildSmoothedCogChartPoints(canonical)

    expect(smoothed.some((point) => point.kind === 'wrap-gap')).toBe(true)
  })

  it('reduces only raw presentation and preserves a wrap break', () => {
    const canonical = buildCanonicalCogChartPoints(samplesWithCogAt(Array.from(
      { length: 900 },
      (_, index) => [index * 100, index < 450 ? 359 : 1] as [number, number],
    )))
    const raw = reduceRawCogChartPoints(
      buildCogChartPoints(samplesWithCogAt(Array.from(
        { length: 900 },
        (_, index) => [index * 100, index < 450 ? 359 : 1] as [number, number],
      ))),
      COG_SIGNAL_TUNING.rawPointBudget,
    )
    const smoothed = buildSmoothedCogChartPoints(canonical)

    expect(raw).toHaveLength(COG_SIGNAL_TUNING.rawPointBudget)
    expect(raw.some((point) => point.kind === 'wrap-gap')).toBe(true)
    expect(smoothed.filter((point) => point.kind === 'sample')).toHaveLength(900)
  })

  it('generates fixed 0°–360° paths with explicit wrap breaks', () => {
    const range = { start: BASE_TIME, end: BASE_TIME + 2_000 }
    const path = buildCogSignalPath(buildCogChartPoints(samplesWithCogAt([
      [0, 359],
      [2_000, 1],
    ])), range)

    expect(path).toBe('M0.00,8.51 M1000.00,191.49')
  })
})
