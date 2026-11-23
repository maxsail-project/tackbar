/** Side of the PIN→BOAT direction that is the course side (#38 D7). */
export type StartCourseSide = 'left' | 'right'

/** Indicators the Start detailed table can show (#38 D3); each has a derivation in `utils/startAnalysis.ts`. */
export type StartDetailIndicatorId = 'sog' | 'distance' | 'hdg' | 'cog' | 'heel' | 'windwardGap'

/**
 * Display format of a detailed-table value: `fixed1` one decimal, `signed1` one decimal with an
 * explicit `+`, `direction` integer degrees in 0–359, `integer` rounded and signed as stored,
 * `signedInteger` rounded with an explicit `+`.
 */
export type StartDetailFormat = 'fixed1' | 'signed1' | 'direction' | 'integer' | 'signedInteger'

/** One row (P, C or the single P–C row) of the Start detailed table (#38 D3). */
export interface StartDetailIndicator {
  id: StartDetailIndicatorId
  label: string
  unit: string
  format: StartDetailFormat
  /**
   * Row shown only when at least one selected Activity records this field somewhere in its
   * canonical track (#38 D18); an Activity without it still reads `—` in a shown row.
   */
  onlyWhenRecorded?: boolean
}

/**
 * START ANALYSIS derivation constants (Issue #38, increments #38.1 and #38.2, D17–D19). Configurable
 * presentation constants of the Viewer, not validated sailing standards.
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
   * A value at the gun or at a detailed-table offset uses the nearest recorded sample within this
   * tolerance, otherwise it is unavailable (#38 D10).
   */
  offsetSampleToleranceSeconds: 1,
  /** The Note shows `⚠ Ends +<duration>` when the paired RACE_END is at most this long after the gun (#38 D8). */
  shortTimingThresholdSeconds: 180,
  /** Detailed-table columns: seconds from the gun, in display order (#38 D17). */
  detailOffsetsSeconds: [-15, -5, 0, 5, 15] as readonly number[],
  /**
   * Detailed-table rows in display order (#38 D3, D18, D19). `windwardGap` (P–C along the effective
   * TWD axis) is a single row shown only with a Comparison; every other indicator has a P row and,
   * with a Comparison, a C row.
   */
  detailIndicators: [
    { id: 'sog', label: 'SOG', unit: 'kt', format: 'fixed1' },
    { id: 'distance', label: 'Dist', unit: 'm', format: 'signed1' },
    { id: 'hdg', label: 'HDG', unit: '°', format: 'direction', onlyWhenRecorded: true },
    { id: 'cog', label: 'COG', unit: '°', format: 'direction' },
    { id: 'heel', label: 'Heel', unit: '°', format: 'integer' },
    { id: 'windwardGap', label: 'Windward P–C', unit: 'm', format: 'signedInteger' },
  ] as readonly StartDetailIndicator[],
}

export type StartAnalysisConfig = typeof START_ANALYSIS_CONFIG
