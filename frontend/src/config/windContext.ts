/**
 * Provisional Viewer wind-relative context thresholds (Issue #192.1).
 * These are configurable presentation constants, not validated sailing standards.
 */
export const WIND_CONTEXT_CONFIG = {
  /** |TWA| strictly below this is upwind. */
  upwindMaxTwaDegrees: 70,
  /** |TWA| strictly above this is downwind; the inclusive range between is reaching. */
  downwindMinTwaDegrees: 120,
  /** Minimum share of moving time for a dominant window sector. */
  dominantShare: 0.7,
  /** Samples at or above this SOG count as moving time. */
  movingMinSogKnots: 1.5,
  /** Upwind samples with |TWA| strictly below this have an indeterminate tack. */
  tackIndeterminateTwaDegrees: 15,
  /** Both tack-group HEEL medians must reach this magnitude for a conclusive HEEL check. */
  heelCheckMinMagnitudeDegrees: 3,
  /** Adjacent canonical sample intervals longer than this add no represented time. */
  maxGapSeconds: 10,
} as const
