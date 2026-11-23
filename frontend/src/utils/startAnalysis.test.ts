import { describe, expect, it } from 'vitest'
import { START_ANALYSIS_CONFIG } from '../config/startAnalysis'
import { inferSessionRaces } from './sessionRaces'
import { inferSessionStartLines } from './sessionStartLines'
import { inferSessionStarts } from './sessionStarts'
import {
  createStartLineFrame,
  deriveStartActivityMetrics,
  deriveStartAnalysisRows,
  measureStartLinePosition,
  nearestStartSampleIndex,
  prepareStartSamples,
  startShortTimingMs,
  type StartActivityMetrics,
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

describe('START ANALYSIS configuration (#38.1)', () => {
  it('keeps every derivation constant in one code configuration object', () => {
    expect(START_ANALYSIS_CONFIG).toEqual({
      courseSide: 'left',
      crossingSearchLimitSeconds: 120,
      offsetSampleToleranceSeconds: 1,
      shortTimingThresholdSeconds: 180,
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
