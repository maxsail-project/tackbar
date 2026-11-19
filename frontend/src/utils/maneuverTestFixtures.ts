import type { Maneuver } from '../types/maneuver'
import type { DisplayManeuver } from './maneuverEvents'

/** Shared test fixtures for DisplayManeuver-based tests; not used by production code. */
export const MANEUVER_FIXTURE_BASE_MS = Date.parse('2031-06-15T08:00:00Z')

/**
 * A neutral HIGH-style maneuver centred at `centerTimeMs` (start 2 s before, end 3 s after,
 * ΔHDG 80°, 5 s duration, no peak or SOG metrics); `overrides` replaces any Maneuver field.
 */
export function displayManeuverAt(
  centerTimeMs: number,
  activityRole: DisplayManeuver['activityRole'],
  overrides: Partial<Maneuver>,
): DisplayManeuver {
  return {
    activityRole,
    centerTimeMs,
    maneuver: {
      start_time: new Date(centerTimeMs - 2_000).toISOString(),
      center_time: new Date(centerTimeMs).toISOString(),
      end_time: new Date(centerTimeMs + 3_000).toISOString(),
      heading_change_deg: 80,
      course_change_deg: null,
      peak_turn_rate_deg_s: null,
      peak_turn_rate_time: null,
      duration_s: 5,
      ...overrides,
    },
  }
}

/** `displayManeuverAt` centred `minute` minutes after `MANEUVER_FIXTURE_BASE_MS`. */
export function maneuverAtMinute(
  minute: number,
  activityRole: DisplayManeuver['activityRole'],
  overrides: Partial<Maneuver> = {},
): DisplayManeuver {
  return displayManeuverAt(MANEUVER_FIXTURE_BASE_MS + minute * 60_000, activityRole, overrides)
}
