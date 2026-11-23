import { describe, expect, it } from 'vitest'
import { START_ANALYSIS_CONFIG } from '../config/startAnalysis'
import { inferSessionRaces } from './sessionRaces'
import { inferSessionStartLines } from './sessionStartLines'
import { inferSessionStarts } from './sessionStarts'
import {
  createStartLineFrame,
  deriveStartActivityMetrics,
  deriveStartAnalysisRows,
  deriveStartDetailTable,
  deriveStartLineBias,
  measureStartLinePosition,
  nearestStartSampleIndex,
  prepareStartSamples,
  startShortTimingMs,
  type StartActivityMetrics,
  type StartDetailTable,
} from './startAnalysis'
import {
  START_FIXTURE_BOAT,
  START_FIXTURE_GUN,
  START_FIXTURE_LINE,
  START_FIXTURE_PIN,
  startApproachSamples,
  startFixtureSamples,
  startTimerActivity,
  type StartFixturePoint,
} from './startAnalysisTestFixtures'

const gun = START_FIXTURE_GUN
const frame = createStartLineFrame(START_FIXTURE_LINE)

function metrics(samples: ReturnType<typeof startFixtureSamples>, line = frame) {
  return deriveStartActivityMetrics(prepareStartSamples(samples), line, gun)
}

function expectMetrics(actual: StartActivityMetrics, expected: StartActivityMetrics) {
  for (const key of Object.keys(expected) as (keyof StartActivityMetrics)[]) {
    const value = expected[key]
    if (value === null) expect(actual[key], key).toBeNull()
    else expect(actual[key], key).toBeCloseTo(value, 6)
  }
}

const unavailable: StartActivityMetrics = { crossSeconds: null, distanceAtGunMeters: null, linePercent: null, sogCrossKnots: null }

describe('START ANALYSIS configuration (#38.1, #38.2)', () => {
  it('keeps every derivation constant, offset and indicator in one code configuration object', () => {
    expect(START_ANALYSIS_CONFIG).toEqual({
      courseSide: 'left',
      crossingSearchLimitSeconds: 120,
      offsetSampleToleranceSeconds: 1,
      shortTimingThresholdSeconds: 180,
      lineBiasSquareBelowDegrees: 0.5,
      upwindLeadLevelBelowMeters: 1,
      detailOffsetsSeconds: [-15, -5, 0, 5, 15],
      detailIndicators: [
        { id: 'sog', label: 'SOG', unit: 'kt', format: 'fixed1' },
        { id: 'distance', label: 'Dist', unit: 'm', format: 'signed1' },
        { id: 'hdg', label: 'HDG', unit: '°', format: 'direction', onlyWhenRecorded: true },
        { id: 'cog', label: 'COG', unit: '°', format: 'direction' },
        { id: 'heel', label: 'Heel', unit: '°', format: 'integer' },
        { id: 'windwardGap', label: 'Upwind lead', unit: 'm', format: 'upwindLead' },
      ],
    })
  })
})

describe('start line geometry (#38 D6, D7)', () => {
  it('measures signed perpendicular distance (positive behind) and PIN 0 % → BOAT 100 % position', () => {
    const [behind, beyond] = prepareStartSamples(startFixtureSamples([[0, 12, 50], [0, -3, 250]]))
    const behindPosition = measureStartLinePosition(frame!, behind.latitude, behind.longitude)
    expect(behindPosition.distanceMeters).toBeCloseTo(12, 6)
    expect(behindPosition.lineFraction).toBeCloseTo(0.25, 9)
    const beyondPosition = measureStartLinePosition(frame!, beyond.latitude, beyond.longitude)
    expect(beyondPosition.distanceMeters).toBeCloseTo(-3, 6)
    expect(beyondPosition.lineFraction).toBeCloseTo(1.25, 9)
  })

  it('takes the course side to the left of PIN→BOAT, so swapping the ends inverts the sign', () => {
    const [sample] = prepareStartSamples(startFixtureSamples([[0, 5, 50]]))
    const swapped = createStartLineFrame({ pin: START_FIXTURE_BOAT, boat: START_FIXTURE_PIN })!
    const position = measureStartLinePosition(swapped, sample.latitude, sample.longitude)
    expect(position.distanceMeters).toBeCloseTo(-5, 6)
    expect(position.lineFraction).toBeCloseTo(0.75, 9)
    expect(measureStartLinePosition(swapped, sample.latitude, sample.longitude, 'right').distanceMeters).toBeCloseTo(5, 6)
  })

  it('has no frame without both endpoints or with a zero-length line', () => {
    expect(createStartLineFrame(undefined)).toBeNull()
    expect(createStartLineFrame({ pin: START_FIXTURE_PIN, boat: null })).toBeNull()
    expect(createStartLineFrame({ pin: null, boat: START_FIXTURE_BOAT })).toBeNull()
    expect(createStartLineFrame({ pin: START_FIXTURE_PIN, boat: START_FIXTURE_PIN })).toBeNull()
  })
})

describe('gun sample (#38 D10 tolerance)', () => {
  it('uses the nearest valid sample within the tolerance, the earlier one on a tie', () => {
    const samples = prepareStartSamples(startFixtureSamples([[-0.5, 2, 50], [0.5, 1, 50], [3, 0, 50]]))
    expect(nearestStartSampleIndex(samples, gun, 1_000)).toBe(0)
    expect(nearestStartSampleIndex(samples, gun + 1_500, 1_000)).toBe(1)
    expect(nearestStartSampleIndex(samples, gun + 2_000, 1_000)).toBe(2)
    expect(nearestStartSampleIndex(samples, gun + 1_750, 0)).toBe(-1)
    samples[0].valid = false
    expect(nearestStartSampleIndex(samples, gun, 1_000)).toBe(1)
  })
})

describe('start summary metrics (#38 D2, D6, D7)', () => {
  it('reads a clean start: behind at the gun, crossing after it with the first course-side SOG', () => {
    expectMetrics(metrics(startApproachSamples({ behindAtGun: 5 })), {
      crossSeconds: 2.5, distanceAtGunMeters: 5, linePercent: 50, sogCrossKnots: 5.3,
    })
  })

  it('reads a late start well behind the line', () => {
    expectMetrics(metrics(startApproachSamples({ behindAtGun: 60.5, metersPerSecond: 1 })), {
      crossSeconds: 60.5, distanceAtGunMeters: 60.5, linePercent: 50, sogCrossKnots: 11.1,
    })
  })

  it('reads beyond the line at the gun as a negative distance and the latest crossing before the gun', () => {
    expectMetrics(metrics(startApproachSamples({ behindAtGun: -4.5, metersPerSecond: 3, alongMeters: 20 })), {
      crossSeconds: -1.5, distanceAtGunMeters: -4.5, linePercent: 10, sogCrossKnots: 4.9,
    })
  })

  it('has no crossing outside the line ends and reports the position below 0 % or above 100 %', () => {
    expectMetrics(metrics(startApproachSamples({ behindAtGun: 5, alongMeters: -30 })), {
      ...unavailable, distanceAtGunMeters: 5, linePercent: -15,
    })
    expectMetrics(metrics(startApproachSamples({ behindAtGun: 5, alongMeters: 260 })), {
      ...unavailable, distanceAtGunMeters: 5, linePercent: 130,
    })
  })

  it('skips a crossing outside the ends and keeps searching inside the segment', () => {
    const points: StartFixturePoint[] = [[0, 5, -30], [1, 3, -30], [2, 1, -30], [3, -1, -30], [4, 1, 50], [5, -1, 50, 6.4]]
    expectMetrics(metrics(startFixtureSamples(points)), {
      crossSeconds: 4.5, distanceAtGunMeters: 5, linePercent: -15, sogCrossKnots: 6.4,
    })
  })

  it('has no crossing beyond the 120 s search limit on either side of the gun', () => {
    expectMetrics(metrics(startApproachSamples({ behindAtGun: 250.5 })), {
      ...unavailable, distanceAtGunMeters: 250.5, linePercent: 50,
    })
    expectMetrics(metrics(startApproachSamples({ behindAtGun: -300, fromSeconds: -200, toSeconds: 10 })), {
      ...unavailable, distanceAtGunMeters: -300, linePercent: 50,
    })
  })

  it('reads every value as unavailable without a start line', () => {
    const samples = startApproachSamples({ behindAtGun: 5 })
    expectMetrics(metrics(samples, null), unavailable)
    expectMetrics(metrics(samples, createStartLineFrame({ pin: START_FIXTURE_PIN, boat: null })), unavailable)
  })

  it('reads every value as unavailable when a sample gap covers the gun', () => {
    expectMetrics(metrics(startFixtureSamples([[-3, 9, 100], [-2, 7, 100], [11, -20, 100], [12, -22, 100]])), unavailable)
  })

  it('never takes a crossing across a gap longer than 10 s, but accepts a 10 s interval', () => {
    expectMetrics(metrics(startFixtureSamples([[-1, 4, 100], [0, 2, 100], [1, 1, 100], [12, -5, 100], [13, -7, 100]])), {
      ...unavailable, distanceAtGunMeters: 2, linePercent: 50,
    })
    expectMetrics(metrics(startFixtureSamples([[0, 2, 100], [1, 1, 100], [11, -1, 100, 7]])), {
      crossSeconds: 6, distanceAtGunMeters: 2, linePercent: 50, sogCrossKnots: 7,
    })
  })

  it('reads SOG cross as unavailable when the first course-side sample has no recorded SOG', () => {
    const samples = startApproachSamples({ behindAtGun: 5 }).map((sample) => ({ ...sample, sog: null }))
    expectMetrics(metrics(samples), { crossSeconds: 2.5, distanceAtGunMeters: 5, linePercent: 50, sogCrossKnots: null })
  })
})

describe('short-timing note (#38 D8)', () => {
  const race = (seconds: number) => [{ startTime: gun, endTime: gun + seconds * 1_000 }]

  it('reports the paired RACE_END only when it is at most 180 s after the gun', () => {
    expect(startShortTimingMs({ time: gun }, race(84))).toBe(84_000)
    expect(startShortTimingMs({ time: gun }, race(180))).toBe(180_000)
    expect(startShortTimingMs({ time: gun }, race(181))).toBeNull()
    expect(startShortTimingMs({ time: gun }, [])).toBeNull()
    expect(startShortTimingMs({ time: gun + 1 }, race(84))).toBeNull()
  })
})

describe('start summary rows (#38.1)', () => {
  const activities = [startTimerActivity('a', gun, 84), startTimerActivity('b', gun, 84)]
  const starts = inferSessionStarts(activities)
  const lines = inferSessionStartLines(starts, activities)
  const races = inferSessionRaces(starts, activities)
  const primary = startApproachSamples({ behindAtGun: 5 })
  const comparison = startApproachSamples({ behindAtGun: -4.5, metersPerSecond: 3, alongMeters: 20 })

  it('derives P and C values per inferred Start with the #153 line and the #220 paired RACE_END', () => {
    const [row, ...others] = deriveStartAnalysisRows(starts, lines, races, primary, comparison)
    expect(others).toEqual([])
    expect([row.label, row.time, row.shortTimingMs]).toEqual(['S1', gun, 84_000])
    expectMetrics(row.primary, { crossSeconds: 2.5, distanceAtGunMeters: 5, linePercent: 50, sogCrossKnots: 5.3 })
    expectMetrics(row.comparison!, { crossSeconds: -1.5, distanceAtGunMeters: -4.5, linePercent: 10, sogCrossKnots: 4.9 })
  })

  it('has no C values without a Comparison and unavailable values for a track not loaded', () => {
    expect(deriveStartAnalysisRows(starts, lines, races, primary)[0].comparison).toBeNull()
    const [pending] = deriveStartAnalysisRows(starts, lines, races, null, null)
    expect([pending.primary, pending.comparison]).toEqual([unavailable, unavailable])
  })

  it('reads line-based values as unavailable when the Start has no inferred line', () => {
    const lineless = [startTimerActivity('a', gun, null, false), startTimerActivity('b', gun, null, false)]
    const linelessStarts = inferSessionStarts(lineless)
    const [row] = deriveStartAnalysisRows(linelessStarts, inferSessionStartLines(linelessStarts, lineless), [], primary, comparison)
    expect([row.primary, row.comparison, row.shortTimingMs]).toEqual([unavailable, unavailable, null])
  })
})

describe('start line bias (#38 D20)', () => {
  const bias = (degrees: number, source: 'modelled' | 'manual' = 'modelled') => deriveStartLineBias(frame, { degrees, source })!.wind!
  const expectWind = (degrees: number, favouredEnd: string, biasDegrees: number, advantageMeters: number) => {
    const wind = bias(degrees)
    expect(wind.favouredEnd, `TWD ${degrees}`).toBe(favouredEnd)
    expect(wind.biasDegrees, `TWD ${degrees}`).toBeCloseTo(biasDegrees, 6)
    expect(wind.advantageMeters, `TWD ${degrees}`).toBeCloseTo(advantageMeters, 6)
  }
  // Fixture line: PIN → BOAT 200 m due east, course side north, so TWD 0° is square to it.
  const tenDegreeAdvantage = 200 * Math.sin(10 * Math.PI / 180)

  it('reads a wind perpendicular to the line as square, also when the bias rounds to 0°', () => {
    expectWind(0, 'square', 0, 0)
    expectWind(180, 'square', 0, 0)
    expect(bias(0.4).favouredEnd).toBe('square')
    expect(bias(0.6).favouredEnd).toBe('boat')
  })

  it('favours BOAT in a veered wind and PIN in a backed wind, with advantage = length × sin(|bias|)', () => {
    expectWind(10, 'boat', 10, tenDegreeAdvantage)
    expectWind(350, 'pin', -10, tenDegreeAdvantage)
    expectWind(90, 'boat', 90, 200)
  })

  it('is safe across the 0°/360° boundary', () => {
    expectWind(370, 'boat', 10, tenDegreeAdvantage)
    expectWind(-10, 'pin', -10, tenDegreeAdvantage)
    expectWind(359.6, 'square', -0.4, 200 * Math.sin(0.4 * Math.PI / 180))
  })

  it('keeps the wind source, reads only the length without a TWD and nothing without a line', () => {
    expect(bias(10, 'manual').source).toBe('manual')
    expect(bias(10).source).toBe('modelled')
    const lengthOnly = deriveStartLineBias(frame, null)!
    expect(lengthOnly.wind).toBeNull()
    expect(lengthOnly.lengthMeters).toBeCloseTo(200, 6)
    expect(deriveStartLineBias(null, { degrees: 10, source: 'modelled' })).toBeNull()
  })

  it('is derived per Start row from its inferred line and the effective TWD', () => {
    const activities = [startTimerActivity('a', gun), startTimerActivity('b', gun)]
    const starts = inferSessionStarts(activities)
    const lines = inferSessionStartLines(starts, activities)
    const [row] = deriveStartAnalysisRows(starts, lines, [], null, undefined, { degrees: 350, source: 'manual' })
    expect([row.line!.wind!.favouredEnd, row.line!.wind!.source]).toEqual(['pin', 'manual'])
    expect(deriveStartAnalysisRows(starts, lines, [], null)[0].line!.wind).toBeNull()
    expect(deriveStartAnalysisRows(starts, [], [], null, undefined, { degrees: 0, source: 'manual' })[0].line).toBeNull()
  })
})

describe('start detailed table (#38.2, D3, D10, D17–D19)', () => {
  type Samples = ReturnType<typeof startFixtureSamples>
  const secondsOf = (sample: Samples[number]) => (Date.parse(sample.utc) - gun) / 1_000
  /** COG 355° at the gun turning 1°/s across north, HDG 3° to its right, Heel −seconds/4 as stored. */
  const withAttitude = (samples: Samples) => samples.map((sample) => {
    const seconds = secondsOf(sample)
    return { ...sample, cog: (355 + seconds + 360) % 360, hdg: (358 + seconds + 360) % 360, heel: -seconds / 4 }
  })
  // The fixture line runs east from PIN with the course side north: P is 5 − 2t m south of it at
  // 100 m east, C is −4.5 − 3t m south at 20 m east (no recorded HDG).
  const primary = withAttitude(startApproachSamples({ behindAtGun: 5 }))
  const comparison = startApproachSamples({ behindAtGun: -4.5, metersPerSecond: 3, alongMeters: 20 })
  const detail = (
    p: Samples | null,
    c?: Samples | null,
    { line = frame, twd = null as number | null, config = START_ANALYSIS_CONFIG } = {},
  ) => deriveStartDetailTable(p && prepareStartSamples(p), c === undefined ? undefined : c && prepareStartSamples(c), line, gun, twd, config)
  const values = (table: StartDetailTable, indicator: string, role: string) => table.rows
    .find((row) => row.indicator.id === indicator && row.role === role)!.values
  const rowIds = (table: StartDetailTable) => table.rows.map((row) => `${row.indicator.id}:${row.role}`)
  const expectValues = (actual: (number | null)[], expected: (number | null)[], digits = 6) => {
    expect(actual).toHaveLength(expected.length)
    expected.forEach((value, index) => {
      if (value === null) expect(actual[index], `offset ${index}`).toBeNull()
      else expect(actual[index], `offset ${index}`).toBeCloseTo(value, digits)
    })
  }
  const none = Array(5).fill(null)

  it('reads each indicator at each configured offset, P rows only without a Comparison', () => {
    const table = detail(primary)
    expect(table.offsetsSeconds).toEqual([-15, -5, 0, 5, 15])
    expect(rowIds(table)).toEqual(['sog:primary', 'distance:primary', 'hdg:primary', 'cog:primary', 'heel:primary'])
    expectValues(values(table, 'sog', 'primary'), [3.5, 4.5, 5, 5.5, 6.5])
    expectValues(values(table, 'distance', 'primary'), [35, 15, 5, -5, -25])
    expectValues(values(table, 'cog', 'primary'), [340, 350, 355, 0, 10])
    expectValues(values(table, 'hdg', 'primary'), [343, 353, 358, 3, 13])
    expectValues(values(table, 'heel', 'primary'), [3.75, 1.25, 0, -1.25, -3.75])
  })

  it('adds C rows below P rows and one Upwind lead row with a Comparison', () => {
    const table = detail(primary, comparison, { twd: 0 })
    expect(rowIds(table)).toEqual([
      'sog:primary', 'sog:comparison', 'distance:primary', 'distance:comparison', 'hdg:primary', 'hdg:comparison',
      'cog:primary', 'cog:comparison', 'heel:primary', 'heel:comparison', 'windwardGap:pair',
    ])
    expectValues(values(table, 'distance', 'comparison'), [40.5, 10.5, -4.5, -19.5, -49.5])
    expectValues(values(table, 'hdg', 'comparison'), none)
  })

  it('shows the HDG row only when a selected Activity records HDG somewhere in its track, never derived from COG', () => {
    const table = detail(comparison)
    expect(rowIds(table)).toEqual(['sog:primary', 'distance:primary', 'cog:primary', 'heel:primary'])
    expectValues(values(table, 'cog', 'primary'), Array(5).fill(0))
    expectValues(values(table, 'heel', 'primary'), none)
    expect(rowIds(detail(comparison, comparison))).not.toContain('hdg:primary')
    // One recorded HDG far from the gun is enough; the offsets without it read unavailable.
    const sparse = comparison.map((sample) => secondsOf(sample) === 100 ? { ...sample, hdg: 12 } : sample)
    expectValues(values(detail(comparison, sparse), 'hdg', 'comparison'), none)
    expect(rowIds(detail(primary, comparison))).toContain('hdg:comparison')
  })

  it('reads Windward P–C along the effective TWD axis, positive when P is further to windward', () => {
    // Wind from the north: P is 2t − 5 m and C 4.5 + 3t m north of the line, so P − C = −9.5 − t.
    expectValues(values(detail(primary, comparison, { twd: 0 }), 'windwardGap', 'pair'), [5.5, -4.5, -9.5, -14.5, -24.5], 1)
    expectValues(values(detail(primary, comparison, { twd: 180 }), 'windwardGap', 'pair'), [-5.5, 4.5, 9.5, 14.5, 24.5], 1)
    expectValues(values(detail(primary, comparison, { twd: 90 }), 'windwardGap', 'pair'), Array(5).fill(80), 1)
    expectValues(values(detail(primary, comparison), 'windwardGap', 'pair'), none)
  })

  it('takes the nearest sample within ±1 s inclusive (earlier on a tie) and nothing beyond it', () => {
    const points: StartFixturePoint[] = [
      [-16, 0, 100, 1], [-3.9, 0, 100, 2], [-0.5, 0, 100, 4], [0.5, 0, 100, 5], [4, 0, 100, 3], [16.01, 0, 100, 6],
    ]
    expectValues(values(detail(startFixtureSamples(points)), 'sog', 'primary'), [1, null, 4, 3, null])
  })

  it('reads every indicator as unavailable at an offset inside a gap, and never across a gap with a wider tolerance', () => {
    const gapped = (from: number, to: number) => primary.filter((sample) => secondsOf(sample) <= from || secondsOf(sample) >= to)
    const table = detail(gapped(-12, 3), comparison, { twd: 0 })
    table.rows.filter((row) => row.role !== 'comparison')
      .forEach((row) => expect(row.values.slice(1, 3), row.indicator.id).toEqual([null, null]))
    expectValues(values(table, 'sog', 'comparison'), [3.5, 4.5, 5, 5.5, 6.5])
    expectValues(values(table, 'sog', 'primary'), [3.5, null, null, 5.5, 6.5])
    const wide = { ...START_ANALYSIS_CONFIG, offsetSampleToleranceSeconds: 15 }
    expectValues(values(detail(gapped(-25, 15), undefined, { config: wide }), 'sog', 'primary'), [2.5, null, null, 6.5, 6.5])
  })

  it('needs both boats\' samples for Upwind lead and reads Dist as unavailable without a start line', () => {
    const partial = comparison.filter((sample) => secondsOf(sample) < 4)
    const pair = values(detail(primary, partial, { twd: 0 }), 'windwardGap', 'pair')
    expect(pair.slice(0, 3).every((value) => value !== null)).toBe(true)
    expect(pair.slice(3)).toEqual([null, null])
    const pending = detail(primary, null, { twd: 0 })
    expect([values(pending, 'sog', 'comparison'), values(pending, 'windwardGap', 'pair')]).toEqual([none, none])
    const lineless = detail(primary, comparison, { line: null })
    expect([values(lineless, 'distance', 'primary'), values(lineless, 'distance', 'comparison')]).toEqual([none, none])
    expectValues(values(lineless, 'sog', 'primary'), [3.5, 4.5, 5, 5.5, 6.5])
  })

  it('follows the configured indicator and offset order without structural change', () => {
    const [sog, , , , heel, windwardGap] = START_ANALYSIS_CONFIG.detailIndicators
    const config = { ...START_ANALYSIS_CONFIG, detailOffsetsSeconds: [30, 0], detailIndicators: [windwardGap, heel, sog] }
    const table = detail(primary, comparison, { config })
    expect(table.offsetsSeconds).toEqual([30, 0])
    expect(rowIds(table)).toEqual(['windwardGap:pair', 'heel:primary', 'heel:comparison', 'sog:primary', 'sog:comparison'])
    expectValues(values(table, 'sog', 'primary'), [8, 5])
  })

  it('reads Dist at offset 0 like Dist at gun in the summary rows and passes the effective TWD through', () => {
    const activities = [startTimerActivity('a', gun), startTimerActivity('b', gun)]
    const starts = inferSessionStarts(activities)
    const [row] = deriveStartAnalysisRows(starts, inferSessionStartLines(starts, activities), [], primary, comparison, { degrees: 0, source: 'manual' })
    const atGun = row.detail.offsetsSeconds.indexOf(0)
    expect(values(row.detail, 'distance', 'primary')[atGun]).toBeCloseTo(row.primary.distanceAtGunMeters!, 9)
    expect(values(row.detail, 'distance', 'comparison')[atGun]).toBeCloseTo(row.comparison!.distanceAtGunMeters!, 9)
    expect([row.primary.distanceAtGunMeters! > 0, row.comparison!.distanceAtGunMeters! < 0]).toEqual([true, true])
    expect(values(row.detail, 'windwardGap', 'pair')[atGun]).toBeCloseTo(-9.5, 1)
    expect(deriveStartAnalysisRows(starts, [], [], primary)[0].detail.rows.some((detailRow) => detailRow.role !== 'primary')).toBe(false)
  })
})
