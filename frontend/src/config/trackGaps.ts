/**
 * Shared Viewer temporal-gap threshold (Issue #218 D5). A positive adjacent canonical UTC
 * interval strictly longer than this is a gap, in Activities of any source: the Viewer does
 * not infer distance, time, position or telemetry inside it. Wind analysis reuses the same
 * value for its uncovered data gaps.
 */
export const TRACK_GAP_CONFIG = {
  /** Adjacent canonical sample intervals strictly longer than this are gaps. */
  gapThresholdSeconds: 10,
} as const
