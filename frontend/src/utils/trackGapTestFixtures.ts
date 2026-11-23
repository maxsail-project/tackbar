import type { TrackSample } from '../types/track'

/** Shared synthetic tracks with temporal gaps (Issue #218) for tests; not used by production code. */
export const GAP_FIXTURE_START_MS = Date.parse('2031-06-15T12:00:00Z')
/** Within-run `dist` of every 1 s step: 2 m/s. */
export const GAP_FIXTURE_STEP_METERS = 2
/** Stored `dist` of the first sample after any longer interval: the endpoint chord. */
export const GAP_FIXTURE_CHORD_METERS = 190
export const GAP_FIXTURE_SOG_KNOTS = 4
export const GAP_FIXTURE_COG_DEGREES = 90
const LATITUDE = 0.25
const LONGITUDE_PER_SECOND = 0.000_018

/** Within-run speed of the fixture in knots (2 m/s). */
export const GAP_FIXTURE_RUN_SPEED_KNOTS = GAP_FIXTURE_STEP_METERS * 3_600 / 1_852

/** Fixture UTC milliseconds at a whole-second offset from its start. */
export function gapFixtureTime(seconds: number) {
  return GAP_FIXTURE_START_MS + seconds * 1_000
}

/**
 * 1 Hz canonical samples at every whole second of each inclusive `[startSeconds, endSeconds]`
 * run, moving east. Runs are separated by the intervals between them; the first sample after
 * such an interval stores the chord as `dist`, as the backend does after a gap.
 */
export function gapFixtureTrack(
  runs: ReadonlyArray<readonly [startSeconds: number, endSeconds: number]>,
): TrackSample[] {
  const samples: TrackSample[] = []
  runs.forEach(([startSeconds, endSeconds], runIndex) => {
    for (let seconds = startSeconds; seconds <= endSeconds; seconds += 1) {
      let dist = GAP_FIXTURE_STEP_METERS
      if (samples.length === 0) dist = 0
      else if (seconds === startSeconds && runIndex > 0) dist = GAP_FIXTURE_CHORD_METERS
      samples.push({
        utc: new Date(gapFixtureTime(seconds)).toISOString(),
        lat: LATITUDE,
        lon: seconds * LONGITUDE_PER_SECOND,
        dist,
        sog: GAP_FIXTURE_SOG_KNOTS,
        cog: GAP_FIXTURE_COG_DEGREES,
        hdg: null,
        heel: 5,
        trim: -1,
      })
    }
  })
  return samples
}

/** Analysis Window between two whole-second fixture offsets. */
export function gapFixtureWindow(startSeconds: number, endSeconds: number) {
  return { start: gapFixtureTime(startSeconds), end: gapFixtureTime(endSeconds) }
}

/** One 64 s gap between runs [0, 60] and [124, 184]. */
export const ONE_GAP_RUNS = [[0, 60], [124, 184]] as const
/** A 64 s gap (60→124) and a 30 s gap (184→214). */
export const TWO_GAP_RUNS = [[0, 60], [124, 184], [214, 274]] as const
