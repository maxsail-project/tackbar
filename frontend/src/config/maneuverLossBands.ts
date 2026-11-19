/**
 * Descriptive Maneuver Analysis loss bands (Issue #211.2).
 * Configurable presentation constants over each Activity's currently listed maneuvers; bands are
 * a within-Activity distribution reading of equivalent Loss time, not a score, a ranking between
 * sailors or a validated sailing standard.
 */
export interface ManeuverLossBandConfig {
  /** Linearly interpolated quantile cut point; Loss time at or below it is Low loss. */
  readonly lowQuantile: number
  /** Linearly interpolated quantile cut point; Loss time at or above it is High loss. */
  readonly highQuantile: number
  /** An Activity needs at least this many listed maneuvers with a finite Loss time for bands. */
  readonly minPopulation: number
}

export const MANEUVER_LOSS_BAND_CONFIG = {
  /** Lowest quartile: Loss time at or below this interpolated quantile is Low loss. */
  lowQuantile: 0.25,
  /** Highest quartile: Loss time at or above this interpolated quantile is High loss. */
  highQuantile: 0.75,
  /** Minimum per-Activity population of listed maneuvers with a finite Loss time. */
  minPopulation: 8,
} as const satisfies ManeuverLossBandConfig
