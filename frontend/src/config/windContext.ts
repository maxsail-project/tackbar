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
  /** Each tack needs at least this much upwind moving time for an Axis and Tack angle (#192.1.1). */
  tackAxisMinTackSeconds: 60,
  /** P and C axes agree for the combined hint when within this circular difference. */
  tackAxisHintAgreementDegrees: 5,
  /** The hinted axis must differ from effective TWD by at least this circular difference. */
  tackAxisHintMinOffsetDegrees: 3,
  /** Net window bearing must be within this circular difference of the wind axis for progress (#192.2). */
  progressMaxAxisOffsetDegrees: 30,
  /** Automatic modelled TWD sample must be within this time of the window midpoint for progress. */
  progressMaxModelledTwdAgeMinutes: 60,
  /** P−C equivalent-time difference at or below this is `Similar`. */
  progressSimilarSeconds: 5,
  /** Downwind Gybe angle needs each COG group at least `tackAxisMinTackSeconds` and this minimum angle. */
  gybeAngleMinDegrees: 20,
  /** Same-sector runs separated by less than this other-sector or non-moving time merge (#192.3). */
  segmentAbsorbSeconds: 60,
  /** Merged same-sector runs need at least this span to become an Upwind/Reaching/Downwind segment. */
  segmentMinSeconds: 90,
} as const
