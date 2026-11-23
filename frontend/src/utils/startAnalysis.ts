import {
  START_ANALYSIS_CONFIG,
  type StartAnalysisConfig,
  type StartDetailIndicator,
  type StartDetailIndicatorId,
} from '../config/startAnalysis'
import type { TrackSample } from '../types/track'
import { isTrackGapInterval } from './trackGaps'
import type { InferredSessionRace } from './sessionRaces'
import type { SessionStartLine } from './sessionStartLines'
import type { InferredSessionStart } from './sessionStarts'
import type { EffectiveTwd } from './windContext'
import { gapAt } from './windProgress'

/** Same spherical radius as the start-line inference helpers. */
const METERS_PER_DEGREE = 6_371_000 * Math.PI / 180

/** Summary values of one Activity at one inferred Start (#38 D2, D6, D7); `null` is unavailable. */
export interface StartActivityMetrics {
  /** Seconds from the gun to the line crossing, negative before the gun. */
  crossSeconds: number | null
  /** Perpendicular distance to the infinite PIN–BOAT line at the gun, positive behind, negative beyond. */
  distanceAtGunMeters: number | null
  /** Position at the gun projected on the line, PIN 0 % → BOAT 100 % (may be below 0 or above 100). */
  linePercent: number | null
  /** Recorded SOG of the first sample on the course side after the crossing. */
  sogCrossKnots: number | null
}

/** One summary row group per inferred Start: P values and, when a Comparison is selected, C values. */
export interface StartAnalysisRow {
  label: string
  /** Gun: the inferred timer zero of the Session Start (#38 D9). */
  time: number
  /** Time from the gun to the paired RACE_END when it is within the short-timing threshold (#38 D8). */
  shortTimingMs: number | null
  primary: StartActivityMetrics
  comparison: StartActivityMetrics | null
  /** Detailed table around the gun (#38.2, D3/D4/D10). */
  detail: StartDetailTable
  /** Inferred line length and, with an effective TWD, its bias (#38 D20); `null` without a line. */
  line: StartLineBias | null
}

/** End of the inferred line further to windward, or `square` when the bias rounds to 0° (#38 D20). */
export type StartFavouredEnd = 'pin' | 'boat' | 'square'

/** #38 D20 line reading of one Start. */
export interface StartLineBias {
  lengthMeters: number
  /** Unavailable (`null`) without an effective TWD; no fallback wind. */
  wind: {
    source: EffectiveTwd['source']
    /**
     * Signed angle between the PIN–BOAT line and the perpendicular to the TWD, −90°…+90°:
     * positive when BOAT is further to windward, negative when PIN is.
     */
    biasDegrees: number
    favouredEnd: StartFavouredEnd
    /** Windward offset of the favoured end: line length × sin(|bias|). */
    advantageMeters: number
  } | null
}

/** Role of one detailed-table row: an Activity (P or C) or the single Windward P–C row. */
export type StartDetailRole = 'primary' | 'comparison' | 'pair'

/** One detailed-table row; `values` follow the configured offsets, `null` is unavailable. */
export interface StartDetailRow {
  /** The configured indicator (label, unit and display format). */
  indicator: StartDetailIndicator
  role: StartDetailRole
  values: (number | null)[]
}

/** Detailed table of one Start: configured offsets (s from the gun) and rows in configured indicator order. */
export interface StartDetailTable {
  offsetsSeconds: readonly number[]
  rows: StartDetailRow[]
}

/** Canonical sample reduced to the fields the start derivation reads, keeping canonical order. */
export interface StartSample {
  time: number
  latitude: number
  longitude: number
  sog: number | null
  cog: number | null
  /** Recorded HDG only; never derived from COG. */
  hdg: number | null
  heel: number | null
  valid: boolean
}

/** Local east/north metre frame anchored at PIN, with the PIN→BOAT vector. */
export interface StartLineFrame {
  pin: { latitude: number, longitude: number }
  cosLatitude: number
  lineX: number
  lineY: number
  length: number
}

export interface StartLinePosition {
  distanceMeters: number
  lineFraction: number
}

export const UNAVAILABLE_START_METRICS: Readonly<StartActivityMetrics> = {
  crossSeconds: null,
  distanceAtGunMeters: null,
  linePercent: null,
  sogCrossKnots: null,
}

function validPosition(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}

function recordedValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function prepareStartSamples(samples: readonly TrackSample[]): StartSample[] {
  return samples.map((sample) => {
    const time = Date.parse(sample.utc)
    return {
      time,
      latitude: sample.lat,
      longitude: sample.lon,
      sog: recordedValue(sample.sog),
      cog: recordedValue(sample.cog),
      hdg: recordedValue(sample.hdg),
      heel: recordedValue(sample.heel),
      valid: Number.isFinite(time) && validPosition(sample.lat, sample.lon),
    }
  })
}

function longitudeDifference(longitude: number, origin: number) {
  return ((((longitude - origin) % 360) + 540) % 360) - 180
}

function toLocal(frame: Pick<StartLineFrame, 'pin' | 'cosLatitude'>, latitude: number, longitude: number) {
  return {
    x: longitudeDifference(longitude, frame.pin.longitude) * frame.cosLatitude * METERS_PER_DEGREE,
    y: (latitude - frame.pin.latitude) * METERS_PER_DEGREE,
  }
}

/** PIN→BOAT frame of a Start's inferred line; `null` without both endpoints or with a zero-length line. */
export function createStartLineFrame(line: Pick<SessionStartLine, 'pin' | 'boat'> | undefined): StartLineFrame | null {
  if (!line?.pin || !line.boat) return null
  if (!validPosition(line.pin.latitude, line.pin.longitude) || !validPosition(line.boat.latitude, line.boat.longitude)) return null
  const anchor = { pin: line.pin, cosLatitude: Math.cos(line.pin.latitude * Math.PI / 180) }
  const { x, y } = toLocal(anchor, line.boat.latitude, line.boat.longitude)
  const length = Math.hypot(x, y)
  return length > 0 ? { ...anchor, lineX: x, lineY: y, length } : null
}

/**
 * Signed perpendicular distance to the infinite PIN–BOAT line (positive behind, negative on the
 * course side) and projected line fraction (PIN 0 → BOAT 1), #38 D6/D7.
 */
export function measureStartLinePosition(
  frame: StartLineFrame,
  latitude: number,
  longitude: number,
  courseSide: StartAnalysisConfig['courseSide'] = START_ANALYSIS_CONFIG.courseSide,
): StartLinePosition {
  const { x, y } = toLocal(frame, latitude, longitude)
  // Positive cross product: left of PIN→BOAT in the east/north frame.
  const leftMeters = (frame.lineX * y - frame.lineY * x) / frame.length
  return {
    distanceMeters: courseSide === 'left' ? -leftMeters : leftMeters,
    lineFraction: (x * frame.lineX + y * frame.lineY) / (frame.length * frame.length),
  }
}

/** Nearest valid sample to `time` within the tolerance (earlier sample on a tie), or -1. */
export function nearestStartSampleIndex(samples: readonly StartSample[], time: number, toleranceMs: number) {
  let best = -1
  let bestOffset = Number.POSITIVE_INFINITY
  samples.forEach((sample, index) => {
    const offset = Math.abs(sample.time - time)
    if (sample.valid && offset <= toleranceMs && offset < bestOffset) {
      best = index
      bestOffset = offset
    }
  })
  return best
}

interface LineCrossing {
  time: number
  /** First sample on the course side. */
  courseSideIndex: number
}

/**
 * Pre-start → course-side transition between two adjacent canonical samples, inside the PIN–BOAT
 * segment. Never across a gap (#218) or an invalid sample; the crossing instant is placed by linear
 * position between the two straddling samples only.
 */
function lineCrossingBetween(
  samples: readonly StartSample[],
  beforeIndex: number,
  measure: (sample: StartSample) => StartLinePosition,
): LineCrossing | null {
  const before = samples[beforeIndex]
  const after = samples[beforeIndex + 1]
  if (!before?.valid || !after?.valid || !(after.time > before.time) || isTrackGapInterval(before.time, after.time)) return null
  const from = measure(before)
  const to = measure(after)
  if (!(from.distanceMeters >= 0 && to.distanceMeters < 0)) return null
  const fraction = from.distanceMeters / (from.distanceMeters - to.distanceMeters)
  const lineFraction = from.lineFraction + fraction * (to.lineFraction - from.lineFraction)
  if (lineFraction < 0 || lineFraction > 1) return null
  return { time: before.time + fraction * (after.time - before.time), courseSideIndex: beforeIndex + 1 }
}

/**
 * #38 D7: behind the line at the gun → the first crossing after it; beyond → the latest crossing
 * before it; both within the search limit of the gun.
 */
function findStartLineCrossing(
  samples: readonly StartSample[],
  gunIndex: number,
  behindAtGun: boolean,
  gun: number,
  limitMs: number,
  measure: (sample: StartSample) => StartLinePosition,
): LineCrossing | null {
  if (behindAtGun) {
    for (let index = gunIndex; index < samples.length - 1 && !(samples[index].time > gun + limitMs); index += 1) {
      const crossing = lineCrossingBetween(samples, index, measure)
      if (crossing) return crossing.time <= gun + limitMs ? crossing : null
    }
    return null
  }
  for (let index = gunIndex - 1; index >= 0 && !(samples[index + 1].time < gun - limitMs); index -= 1) {
    const crossing = lineCrossingBetween(samples, index, measure)
    if (crossing) return crossing.time >= gun - limitMs ? crossing : null
  }
  return null
}

/** Summary values of one Activity's canonical samples at one Start (#38 D2, D6, D7). */
export function deriveStartActivityMetrics(
  samples: readonly StartSample[],
  frame: StartLineFrame | null,
  gun: number,
  config: StartAnalysisConfig = START_ANALYSIS_CONFIG,
): StartActivityMetrics {
  if (frame === null) return { ...UNAVAILABLE_START_METRICS }
  const gunIndex = nearestStartSampleIndex(samples, gun, config.offsetSampleToleranceSeconds * 1_000)
  if (gunIndex < 0) return { ...UNAVAILABLE_START_METRICS }
  const measure = (sample: StartSample) => measureStartLinePosition(frame, sample.latitude, sample.longitude, config.courseSide)
  const atGun = measure(samples[gunIndex])
  const crossing = findStartLineCrossing(
    samples, gunIndex, atGun.distanceMeters >= 0, gun, config.crossingSearchLimitSeconds * 1_000, measure,
  )
  return {
    crossSeconds: crossing ? (crossing.time - gun) / 1_000 : null,
    distanceAtGunMeters: atGun.distanceMeters,
    linePercent: atGun.lineFraction * 100,
    sogCrossKnots: crossing ? samples[crossing.courseSideIndex].sog : null,
  }
}

/**
 * #38 D20: line length and, with an effective TWD, the signed bias, favoured end and advantage.
 * The windward offset of BOAT from PIN is the PIN→BOAT vector projected on the TWD direction
 * (sine/cosine only, so 0°/360°-safe); bias = asin(offset / length), advantage = |offset|.
 */
export function deriveStartLineBias(
  frame: StartLineFrame | null,
  twd: Pick<EffectiveTwd, 'degrees' | 'source'> | null,
  config: StartAnalysisConfig = START_ANALYSIS_CONFIG,
): StartLineBias | null {
  if (frame === null) return null
  if (twd === null || !Number.isFinite(twd.degrees)) return { lengthMeters: frame.length, wind: null }
  const radians = twd.degrees * Math.PI / 180
  const windwardOffset = frame.lineX * Math.sin(radians) + frame.lineY * Math.cos(radians)
  const biasDegrees = Math.asin(Math.max(-1, Math.min(1, windwardOffset / frame.length))) * 180 / Math.PI
  const favouredEnd: StartFavouredEnd = Math.abs(biasDegrees) < config.lineBiasSquareBelowDegrees
    ? 'square'
    : biasDegrees > 0 ? 'boat' : 'pin'
  return {
    lengthMeters: frame.length,
    wind: { source: twd.source, biasDegrees, favouredEnd, advantageMeters: Math.abs(windwardOffset) },
  }
}

/** #38 D8: time from the gun to the #220 paired RACE_END when within the short-timing threshold. */
export function startShortTimingMs(
  start: Pick<InferredSessionStart, 'time'>,
  races: readonly Pick<InferredSessionRace, 'startTime' | 'endTime'>[],
  config: StartAnalysisConfig = START_ANALYSIS_CONFIG,
) {
  const race = races.find((candidate) => candidate.startTime === start.time)
  if (!race) return null
  const elapsed = race.endTime - start.time
  return elapsed > 0 && elapsed <= config.shortTimingThresholdSeconds * 1_000 ? elapsed : null
}

/**
 * #38 D10: index of the value at `time` — the nearest valid recorded sample within the tolerance
 * (earlier sample on a tie), as for the summary's position at the gun; never across a gap (#218),
 * never interpolated; -1 when unavailable. With the ±1 s default tolerance the gap check cannot
 * apply; it keeps D10 if the tolerance is reconfigured beyond the gap threshold.
 */
export function startOffsetSampleIndex(
  samples: readonly StartSample[],
  time: number,
  config: StartAnalysisConfig = START_ANALYSIS_CONFIG,
) {
  const index = nearestStartSampleIndex(samples, time, config.offsetSampleToleranceSeconds * 1_000)
  if (index < 0) return -1
  const sampleTime = samples[index].time
  return isTrackGapInterval(Math.min(sampleTime, time), Math.max(sampleTime, time)) ? -1 : index
}

type StartDetailReader =
  | { kind: 'activity', read: (sample: StartSample, frame: StartLineFrame | null, config: StartAnalysisConfig) => number | null }
  | { kind: 'pair', read: (primary: StartSample, comparison: StartSample, twdDegrees: number | null, time: number) => number | null }

/** Derivation of each configured indicator from the recorded sample(s) at one offset (#38 D3). */
const START_DETAIL_READERS: Record<StartDetailIndicatorId, StartDetailReader> = {
  sog: { kind: 'activity', read: (sample) => sample.sog },
  // Same definition and sign as Dist at gun; unavailable without a start line.
  distance: {
    kind: 'activity',
    read: (sample, frame, config) => frame
      ? measureStartLinePosition(frame, sample.latitude, sample.longitude, config.courseSide).distanceMeters
      : null,
  },
  // Recorded HDG only, never derived from COG.
  hdg: { kind: 'activity', read: (sample) => sample.hdg },
  cog: { kind: 'activity', read: (sample) => sample.cog },
  heel: { kind: 'activity', read: (sample) => sample.heel },
  // #38 D19: P minus C along the effective TWD axis with the #192 gap definition and sign (positive
  // when P is further to windward), each boat at its own sample for that offset; no fallback axis.
  windwardGap: {
    kind: 'pair',
    read: (primary, comparison, twdDegrees, time) => twdDegrees === null
      ? null
      : gapAt(time, primary, comparison, twdDegrees).alongMeters,
  },
}

/**
 * #38.2 detailed table of one Start: per configured indicator a P row and, when a Comparison is
 * selected (`comparison` not `undefined`), a C row; pair indicators (Windward P–C) give one row only
 * with a Comparison and need both samples and the effective TWD (`twdDegrees`). An indicator marked
 * `onlyWhenRecorded` is omitted unless a selected Activity records it somewhere in its canonical
 * track (#38 D18). A track not loaded (`null`) reads unavailable.
 */
export function deriveStartDetailTable(
  primary: readonly StartSample[] | null,
  comparison: readonly StartSample[] | null | undefined,
  frame: StartLineFrame | null,
  gun: number,
  twdDegrees: number | null = null,
  config: StartAnalysisConfig = START_ANALYSIS_CONFIG,
): StartDetailTable {
  const offsetsSeconds = config.detailOffsetsSeconds
  const samplesAtOffsets = (samples: readonly StartSample[] | null) => offsetsSeconds.map((offset) => {
    const index = samples ? startOffsetSampleIndex(samples, gun + offset * 1_000, config) : -1
    return index < 0 ? null : samples![index]
  })
  const primaryAt = samplesAtOffsets(primary)
  const comparisonAt = comparison === undefined ? null : samplesAtOffsets(comparison)
  const rows = config.detailIndicators.flatMap((indicator): StartDetailRow[] => {
    const reader = START_DETAIL_READERS[indicator.id]
    if (reader.kind === 'pair') {
      if (comparisonAt === null) return []
      const values = primaryAt.map((sample, index) => {
        const other = comparisonAt[index]
        return sample && other ? reader.read(sample, other, twdDegrees, gun + offsetsSeconds[index] * 1_000) : null
      })
      return [{ indicator, role: 'pair', values }]
    }
    const recorded = (samples: readonly StartSample[] | null | undefined) => samples?.some((sample) => reader.read(sample, frame, config) !== null) ?? false
    if (indicator.onlyWhenRecorded && !recorded(primary) && !recorded(comparison)) return []
    const values = (samples: (StartSample | null)[]) => samples.map((sample) => sample ? reader.read(sample, frame, config) : null)
    return [
      { indicator, role: 'primary', values: values(primaryAt) },
      ...(comparisonAt === null ? [] : [{ indicator, role: 'comparison' as const, values: values(comparisonAt) }]),
    ]
  })
  return { offsetsSeconds, rows }
}

/**
 * One row group per inferred Start, with its detailed table, over the full canonical samples of P
 * and, when a Comparison is selected (`comparisonSamples` not `undefined`), C. A track not loaded
 * (`null`) reads unavailable.
 */
export function deriveStartAnalysisRows(
  starts: readonly InferredSessionStart[],
  lines: readonly SessionStartLine[],
  races: readonly Pick<InferredSessionRace, 'startTime' | 'endTime'>[],
  primarySamples: readonly TrackSample[] | null,
  comparisonSamples?: readonly TrackSample[] | null,
  /** Effective TWD of the Points of Sail section for Windward P–C (#38 D19) and line bias (#38 D20), or null. */
  twd: Pick<EffectiveTwd, 'degrees' | 'source'> | null = null,
  config: StartAnalysisConfig = START_ANALYSIS_CONFIG,
): StartAnalysisRow[] {
  const primary = primarySamples ? prepareStartSamples(primarySamples) : null
  const comparison = comparisonSamples ? prepareStartSamples(comparisonSamples) : null
  return starts.map((start) => {
    const frame = createStartLineFrame(lines.find((line) => line.label === start.label && line.time === start.time))
    const metrics = (samples: StartSample[] | null) => samples
      ? deriveStartActivityMetrics(samples, frame, start.time, config)
      : { ...UNAVAILABLE_START_METRICS }
    return {
      label: start.label,
      time: start.time,
      shortTimingMs: startShortTimingMs(start, races, config),
      primary: metrics(primary),
      comparison: comparisonSamples === undefined ? null : metrics(comparison),
      detail: deriveStartDetailTable(
        primary, comparisonSamples === undefined ? undefined : comparison, frame, start.time, twd?.degrees ?? null, config,
      ),
      line: deriveStartLineBias(frame, twd, config),
    }
  })
}
