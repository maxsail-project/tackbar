/** Side of the PIN→BOAT direction that is the course side (#38 D7). */
export type StartCourseSide = 'left' | 'right'

/**
 * START ANALYSIS derivation constants (Issue #38, increment #38.1). Configurable presentation
 * constants of the Viewer, not validated sailing standards.
 */
export const START_ANALYSIS_CONFIG = {
  /**
   * Standard start-line convention (#38 D7): looking up the course PIN is the left (port) end and
   * BOAT the right (starboard) end, so the course side is to the left of PIN→BOAT. A line laid with
   * the committee boat at the port end would invert the sign; it is documented, not detected.
   */
  courseSide: 'left' as StartCourseSide,
  /** Cross (s) searches a line crossing at most this far from the gun (#38 D7). */
  crossingSearchLimitSeconds: 120,
  /**
   * A value at the gun (or, in #38.2, at an offset) uses the nearest recorded sample within this
   * tolerance, otherwise it is unavailable (#38 D10).
   */
  offsetSampleToleranceSeconds: 1,
  /** The Note shows `⚠ Ends +<duration>` when the paired RACE_END is at most this long after the gun (#38 D8). */
  shortTimingThresholdSeconds: 180,
}

export type StartAnalysisConfig = typeof START_ANALYSIS_CONFIG
