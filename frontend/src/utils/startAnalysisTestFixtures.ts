import type { TrackSample } from '../types/track'
import type { SessionRaceTimerEvents } from '../types/session'

/** Shared synthetic START ANALYSIS fixtures (#38.1). */
export const START_FIXTURE_GUN = Date.UTC(2031, 5, 1, 10)

const METERS_PER_DEGREE = 6_371_000 * Math.PI / 180

/** PIN at the equator/prime meridian, BOAT 200 m due east: the course side (left of PIN→BOAT) is north. */
export const START_FIXTURE_LINE_LENGTH_METERS = 200
export const START_FIXTURE_PIN = { latitude: 0, longitude: 0 }
export const START_FIXTURE_BOAT = { latitude: 0, longitude: START_FIXTURE_LINE_LENGTH_METERS / METERS_PER_DEGREE }
export const START_FIXTURE_LINE = { pin: START_FIXTURE_PIN, boat: START_FIXTURE_BOAT }

/** `[seconds from the gun, metres behind the line (negative beyond), metres along from PIN, SOG kt]`. */
export type StartFixturePoint = [number, number, number, number?]

export function startFixtureSamples(points: StartFixturePoint[], gun = START_FIXTURE_GUN): TrackSample[] {
  return points.map(([seconds, behindMeters, alongMeters, sog = 5]) => ({
    utc: new Date(gun + seconds * 1_000).toISOString(),
    lat: -behindMeters / METERS_PER_DEGREE,
    lon: alongMeters / METERS_PER_DEGREE,
    dist: 0,
    sog,
    cog: 0,
    hdg: null,
    heel: null,
    trim: null,
  }))
}

/**
 * One sample per second from `fromSeconds` to `toSeconds` sailing straight towards the course
 * side at `metersPerSecond`, `behindAtGun` metres behind the line at the gun; SOG rises 0.1 kt/s
 * from 5 kt at the gun so the first course-side sample is identifiable.
 */
export function startApproachSamples({
  behindAtGun,
  alongMeters = 100,
  metersPerSecond = 2,
  fromSeconds = -30,
  toSeconds = 130,
  gun = START_FIXTURE_GUN,
}: {
  behindAtGun: number
  alongMeters?: number
  metersPerSecond?: number
  fromSeconds?: number
  toSeconds?: number
  gun?: number
}): TrackSample[] {
  const points: StartFixturePoint[] = []
  for (let seconds = fromSeconds; seconds <= toSeconds; seconds += 1) {
    points.push([seconds, behindAtGun - metersPerSecond * seconds, alongMeters, Math.round((5 + seconds / 10) * 10) / 10])
  }
  return startFixtureSamples(points, gun)
}

/** One visible Activity's timer-zero (and optional RACE_END) events with the fixture PIN/BOAT observations. */
export function startTimerActivity(
  activityId: string,
  gun = START_FIXTURE_GUN,
  raceEndAfterSeconds: number | null = null,
  withLine = true,
): SessionRaceTimerEvents['activities'][number] {
  const timestamp = (offsetMs: number) => new Date(gun + offsetMs).toISOString()
  return {
    activity_id: activityId,
    race_timer_events: [
      { timestamp: timestamp(0), event_type: 3 as const },
      ...(raceEndAfterSeconds === null ? [] : [{ timestamp: timestamp(raceEndAfterSeconds * 1_000), event_type: 4 as const }]),
    ],
    line_positions: withLine
      ? ([[0, START_FIXTURE_PIN], [1, START_FIXTURE_BOAT]] as const).map(([endpoint_type, point]) => ({
          timestamp: timestamp(-60_000), endpoint_type, ...point,
        }))
      : [],
  }
}
