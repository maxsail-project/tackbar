import { describe, expect, it } from 'vitest'
import { courseStarts, mergeSessionStarts, type StartCourse } from './courseStarts'
import { inferSessionRaces } from './sessionRaces'
import { inferSessionStartLines } from './sessionStartLines'
import { inferSessionStarts } from './sessionStarts'
import { deriveStartAnalysisRows } from './startAnalysis'
import {
  START_FIXTURE_BOAT,
  START_FIXTURE_GUN,
  START_FIXTURE_PIN,
  startApproachSamples,
  startTimerActivity,
} from './startAnalysisTestFixtures'

const gun = START_FIXTURE_GUN
const minute = 60_000
const iso = (time: number) => new Date(time).toISOString()

/** A course whose start line is the shared #38 fixture line, valid over the whole range. */
function course({
  at = gun, end = null as number | null, from = undefined as number | undefined, to = undefined as number | undefined,
  pinUntil = undefined as number | undefined, withGun = true,
} = {}): StartCourse {
  const rangeFrom = from ?? at - 5 * minute
  const rangeTo = to ?? at + 30 * minute
  const element = (id: string, role: 'committee_boat' | 'start_pin', point: typeof START_FIXTURE_PIN, until: number) => ({
    id, role, gate: null, label: id,
    positions: [{ from: iso(rangeFrom), to: iso(until), lat: point.latitude, lon: point.longitude }],
  })
  return {
    race: {
      label: 'Race', gun_utc: withGun ? iso(at) : null, gun_source: withGun ? 'admin_entered' : null,
      end_utc: end === null ? null : iso(end),
    },
    time_range: { from: iso(rangeFrom), to: iso(rangeTo) },
    start_line: { boat: 'rc', pin: 'pin' },
    elements: [element('rc', 'committee_boat', START_FIXTURE_BOAT, rangeTo), element('pin', 'start_pin', START_FIXTURE_PIN, pinUntil ?? rangeTo)],
  }
}

const merge = (activities: ReturnType<typeof startTimerActivity>[], courses: StartCourse[]) =>
  mergeSessionStarts(inferSessionStarts(activities), activities, courses)

describe('course Starts (#242 D2)', () => {
  it('yields one Start at the gun with PIN = start pin and BOAT = committee boat', () => {
    expect(courseStarts([course({ end: gun + 20 * minute })])).toEqual([expect.objectContaining({
      time: gun, endTime: gun + 20 * minute, pin: START_FIXTURE_PIN, boat: START_FIXTURE_BOAT,
    })])
    const { starts, lines } = merge([], [course()])
    expect(starts).toEqual([{ label: 'S1', time: gun, activityIds: [], source: 'course', courseEndTime: null }])
    expect(lines).toEqual([{ label: 'S1', time: gun, pin: START_FIXTURE_PIN, boat: START_FIXTURE_BOAT, source: 'course' }])
  })

  it('yields nothing and changes nothing without a gun', () => {
    const activities = [startTimerActivity('a'), startTimerActivity('b')]
    const inferred = inferSessionStarts(activities)
    const { starts, lines } = mergeSessionStarts(inferred, activities, [course({ withGun: false })])
    expect(starts).toEqual(inferred.map((start) => ({ ...start, source: 'vkx', courseEndTime: null })))
    expect(lines).toEqual(inferSessionStartLines(inferred, activities).map((line) => ({ ...line, source: 'vkx' })))
  })

  it('keeps the Start with a null endpoint that has no position at the gun, so it has no line', () => {
    const { starts, lines } = merge([], [course({ pinUntil: gun - 1_000 })])
    expect(starts).toHaveLength(1)
    expect(lines[0]).toMatchObject({ pin: null, boat: START_FIXTURE_BOAT })
    expect(deriveStartAnalysisRows(starts, lines, [], startApproachSamples({ behindAtGun: 5 }))[0]).toMatchObject({
      line: null, primary: { crossSeconds: null, distanceAtGunMeters: null, linePercent: null },
    })
    // A position interval includes its bounds.
    expect(merge([], [course({ pinUntil: gun })]).lines[0].pin).toEqual(START_FIXTURE_PIN)
    expect(merge([], [{ ...course(), start_line: null }]).lines[0]).toMatchObject({ pin: null, boat: null })
  })
})

describe('precedence and relabelling (#242 D3)', () => {
  const courseGun = gun + 30 * minute
  const courseAt = () => course({ at: courseGun, from: courseGun - 5 * minute, to: courseGun + 20 * minute })
  const at = (offsetMinutes: number) => startTimerActivity('a', gun + offsetMinutes * minute)

  it('drops inferred Starts inside the course range, bounds included, and keeps those outside', () => {
    for (const [offset, kept] of [[24.9, true], [25, false], [30, false], [40, false], [50, false], [50.1, true]] as const) {
      const times = merge([at(offset)], [courseAt()]).starts.filter((start) => start.source === 'vkx').map((start) => start.time)
      expect(times, `offset ${offset}`).toEqual(kept ? [gun + offset * minute] : [])
    }
  })

  it('merges chronologically and relabels S1, S2… over the merged list with their lines', () => {
    const activity = {
      ...at(0),
      race_timer_events: [0, 33, 70].flatMap((offset) => at(offset).race_timer_events),
    }
    const { starts, lines } = merge([activity], [courseAt()])
    expect(starts.map((start) => [start.label, (start.time - gun) / minute, start.source])).toEqual([
      ['S1', 0, 'vkx'], ['S2', 30, 'course'], ['S3', 70, 'vkx'],
    ])
    expect(starts[1].activityIds).toEqual([])
    expect(lines.map((line) => [line.label, line.time, line.source]))
      .toEqual(starts.map((start) => [start.label, start.time, start.source]))
    // VKX line values are those of the unchanged #153 inference.
    expect(lines[2]).toMatchObject(inferSessionStartLines([{ label: 'S3', time: gun + 70 * minute, activityIds: ['a'] }], [activity])[0])
  })

  it('orders several course Starts regardless of input order', () => {
    const { starts } = merge([], [course({ at: gun + 60 * minute }), course()])
    expect(starts.map((start) => [start.label, start.time])).toEqual([['S1', gun], ['S2', gun + 60 * minute]])
  })
})

describe('race shortcuts with course Starts (#220, #242 D10)', () => {
  const ends = (...offsets: number[]) => ({
    activity_id: 'a', line_positions: [],
    race_timer_events: offsets.map((offset) => ({ timestamp: iso(gun + offset * minute), event_type: 4 as const })),
  })

  it('uses the course end when set, ahead of an observed RACE_END', () => {
    const { starts } = merge([], [course({ end: gun + 20 * minute })])
    expect(inferSessionRaces(starts, [ends(25)])).toEqual([{
      label: 'R1', startTime: gun, endTime: gun + 20 * minute,
      window: { start: gun - 5 * minute, end: gun + 20 * minute },
    }])
  })

  it('falls back to the latest RACE_END before the next merged Start', () => {
    const { starts } = merge([], [course(), course({ at: gun + 60 * minute })])
    expect(inferSessionRaces(starts, [ends(18, 22, 61, 80)]).map((race) => [race.label, (race.endTime - gun) / minute]))
      .toEqual([['R1', 22], ['R2', 80]])
  })

  it('yields no race without any end', () => {
    expect(inferSessionRaces(merge([], [course()]).starts, [])).toEqual([])
  })

  it('bounds a VKX race by the next merged course Start and reuses the new S number', () => {
    const activity = {
      ...startTimerActivity('a', gun),
      race_timer_events: [
        ...startTimerActivity('a', gun, 600).race_timer_events,
        { timestamp: iso(gun + 45 * minute), event_type: 4 as const },
      ],
    }
    const { starts } = merge([activity], [course({ at: gun + 30 * minute })])
    expect(inferSessionRaces(starts, [activity]).map((race) => [race.label, (race.endTime - gun) / minute]))
      .toEqual([['R1', 10], ['R2', 45]])
  })
})

describe('Start Analysis from a course Start (#38, #242)', () => {
  it('computes a GPX-only Session start from the course gun and line and marks its source', () => {
    const { starts, lines } = merge([], [course()])
    const [row] = deriveStartAnalysisRows(starts, lines, inferSessionRaces(starts, []), startApproachSamples({ behindAtGun: 5 }))
    expect(row).toMatchObject({ label: 'S1', time: gun, source: 'course', shortTimingMs: null })
    expect(row.primary.crossSeconds).toBeCloseTo(2.5, 6)
    expect(row.primary.distanceAtGunMeters).toBeCloseTo(5, 6)
    expect(row.primary.linePercent).toBeCloseTo(50, 6)
    expect(row.primary.sogCrossKnots).toBe(5.3)
    expect(row.line?.lengthMeters).toBeCloseTo(200, 6)
  })

  it('reads the same values as the equal VKX line, which carries no source', () => {
    const activities = [startTimerActivity('a'), startTimerActivity('b')]
    const samples = startApproachSamples({ behindAtGun: 5 })
    const vkx = merge(activities, [])
    const fromCourse = merge([], [course()])
    const [vkxRow] = deriveStartAnalysisRows(vkx.starts, vkx.lines, [], samples)
    const [courseRow] = deriveStartAnalysisRows(fromCourse.starts, fromCourse.lines, [], samples)
    expect(vkxRow).not.toHaveProperty('source')
    expect({ ...courseRow, source: undefined }).toEqual({ ...vkxRow, source: undefined })
  })
})
