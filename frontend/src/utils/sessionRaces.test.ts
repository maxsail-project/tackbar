import { describe, expect, it } from 'vitest'
import { inferSessionRaces, SESSION_RACE_SETTINGS } from './sessionRaces'
import {
  MINUTE_MS,
  PAIRED_RACE_ACTIVITIES,
  raceFixtureTime,
  raceTimerActivity,
} from './sessionRaceTestFixtures'
import { inferSessionStarts, type SessionTimerActivity } from './sessionStarts'

/** `[label, window start, window end]` in fixture minutes. */
function races(activities: SessionTimerActivity[], settings?: Parameters<typeof inferSessionRaces>[2]) {
  return inferSessionRaces(inferSessionStarts(activities), activities, settings).map(({ label, window }) => [
    label,
    (window.start - raceFixtureTime(0)) / MINUTE_MS,
    (window.end - raceFixtureTime(0)) / MINUTE_MS,
  ])
}

describe('Session race shortcuts (#220)', () => {
  it('pairs each Start with the latest RACE_END of any visible Activity before the next Start', () => {
    expect(SESSION_RACE_SETTINGS.preStartMarginSeconds).toBe(300)
    expect(races(PAIRED_RACE_ACTIVITIES)).toEqual([['R1', -5, 41], ['R2', 50, 82]])
    const [first] = inferSessionRaces(inferSessionStarts(PAIRED_RACE_ACTIVITIES), PAIRED_RACE_ACTIVITIES)
    expect([first.startTime, first.endTime]).toEqual([raceFixtureTime(0), raceFixtureTime(41)])
  })

  it('never makes a race from countdowns without RACE_START or from ends before the first Start', () => {
    expect(races([raceTimerActivity('a', [[-10, 1], [-8, 2], [-6, 0], [-4, 4], [-2, 1]])])).toEqual([])
    expect(races([raceTimerActivity('a', [[-10, 1], [-7, 4], [-5, 1], [0, 3], [30, 4]])])).toEqual([['R1', -5, 30]])
  })

  it('gives no race to a Start without RACE_END and keeps the Start number', () => {
    expect(races([
      raceTimerActivity('a', [[0, 3], [30, 3], [50, 4]]),
      raceTimerActivity('b', [[0, 3], [30, 3]]),
    ])).toEqual([['R2', 25, 50]])
  })

  it('ignores an end after the next Start or exactly at a Start for the earlier race', () => {
    expect(races([raceTimerActivity('a', [[0, 3], [10, 4], [30, 3], [35, 4]]), raceTimerActivity('b', [[0, 3], [30, 3], [31, 4]])]))
      .toEqual([['R1', -5, 10], ['R2', 25, 35]])
    expect(races([raceTimerActivity('a', [[0, 3], [0, 4], [30, 4], [30, 3]])])).toEqual([])
  })

  it('takes the latest end without an upper bound for the last Start', () => {
    expect(races([raceTimerActivity('a', [[0, 3], [20, 4], [400, 4]]), raceTimerActivity('b', [[0, 3], [21, 4]])]))
      .toEqual([['R1', -5, 400]])
  })

  it('uses the code-configurable pre-start margin and skips invalid end timestamps', () => {
    expect(races(PAIRED_RACE_ACTIVITIES, { preStartMarginSeconds: 60 })).toEqual([['R1', -1, 41], ['R2', 54, 82]])
    const invalidEnd = raceTimerActivity('a', [[0, 3], [20, 4]])
    invalidEnd.race_timer_events.push({ timestamp: 'invalid', event_type: 4 })
    expect(races([invalidEnd])).toEqual([['R1', -5, 20]])
  })

  it('leaves Session Start inference unchanged when RACE_END observations are present', () => {
    const withoutEnds = PAIRED_RACE_ACTIVITIES.map((activity) => ({
      ...activity,
      race_timer_events: activity.race_timer_events.filter((event) => event.event_type !== 4),
    }))
    expect(inferSessionStarts(PAIRED_RACE_ACTIVITIES)).toEqual(inferSessionStarts(withoutEnds))
    expect(inferSessionStarts(PAIRED_RACE_ACTIVITIES).map(({ label, time }) => [label, time]))
      .toEqual([['S1', raceFixtureTime(0)], ['S2', raceFixtureTime(55)]])
    expect(inferSessionRaces([], PAIRED_RACE_ACTIVITIES)).toEqual([])
  })
})
