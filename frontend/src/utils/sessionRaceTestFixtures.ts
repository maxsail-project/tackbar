import type { SessionTimerActivity } from './sessionStarts'

/** Shared synthetic VKX race-timer fixtures for #220 race shortcuts. */
export const RACE_FIXTURE_BASE = Date.UTC(2031, 5, 1, 10)
export const MINUTE_MS = 60_000

export const raceFixtureTime = (minutes: number) => RACE_FIXTURE_BASE + minutes * MINUTE_MS

/** `[minutes from base, VKX timer event type]` observations of one visible Activity. */
export function raceTimerActivity(activityId: string, events: [number, number][]): SessionTimerActivity {
  return {
    activity_id: activityId,
    race_timer_events: events.map(([minutes, event_type]) => ({
      timestamp: new Date(raceFixtureTime(minutes)).toISOString(),
      event_type,
    })),
    line_positions: [],
  }
}

/**
 * Two boats, two paired races: S1 at 0 min (ends 40 and 41 min), an abandoned countdown
 * (types 1/2/0, no RACE_START) at 45–48 min, S2 at 55 min (ends 80 and 82 min).
 */
export const PAIRED_RACE_ACTIVITIES: SessionTimerActivity[] = [
  raceTimerActivity('a', [[-5, 1], [-3, 2], [0, 3], [40, 4], [45, 1], [47, 2], [48, 0], [50, 1], [55, 3], [80, 4]]),
  raceTimerActivity('b', [[0, 3], [41, 4], [45, 1], [55, 3], [82, 4]]),
]
