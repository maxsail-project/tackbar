import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { bearing, distanceMeters } from './sessionStartLines'
import {
  normalizeSignedDegrees,
  type EffectiveTwd,
  type WindWindowClassification,
} from './windContext'

type WindContextConfig = typeof WIND_CONTEXT_CONFIG

export type ProgressSector = 'upwind' | 'downwind'

export type ProgressUnavailableReason =
  | 'reaching'
  | 'mixed'
  | 'sector-unavailable'
  | 'wind-reference-age'
  | 'no-start-position'
  | 'no-end-position'
  | 'insufficient-positions'
  | 'course-off-axis'

export interface ProgressPosition {
  latitude: number
  longitude: number
}

export type WindProgress =
  | {
      status: 'available'
      sector: ProgressSector
      /** Existing Summary distance for the same window (accumulated normalized `dist`). */
      distanceMeters: number | null
      /** Net displacement between the window-start and window-end positions projected on the wind axis. */
      progressMeters: number
      efficiency: number | null
      /** Window duration: both Activities are measured at the same instants (#192.2.1). */
      durationSeconds: number
      progressSpeedMetersPerSecond: number
      netBearingDegrees: number
      /** Wind axis bearing: effective TWD upwind, TWD + 180° downwind. */
      axisDegrees: number
      startPosition: ProgressPosition
      endPosition: ProgressPosition
      startTimeMs: number
      endTimeMs: number
    }
  | {
      status: 'unavailable'
      reason: ProgressUnavailableReason
      distanceMeters: number | null
    }

/** Position of P relative to C along (+ towards windward/leeward) and across the wind axis. */
export interface ProgressGap {
  timeMs: number
  /** P minus C along the axis: positive when P is further towards windward (upwind) / leeward (downwind). */
  alongMeters: number
  lateralMeters: number
}

export interface ProgressDifference {
  status: 'similar' | 'difference'
  sector: ProgressSector
  /** P's gain on C along the axis; equals `endGap.alongMeters - startGap.alongMeters`. */
  gainMeters: number
  seconds: number
  startGap: ProgressGap
  endGap: ProgressGap
  wideLateralSeparation: boolean
}

function isValidPosition(sample: TrackSample) {
  return Number.isFinite(sample.lat) && Number.isFinite(sample.lon)
    && Math.abs(sample.lat) <= 90 && Math.abs(sample.lon) <= 180
}

/** Nearest valid sample (earliest on ties) within `maxSeconds` of the instant, or null. */
function positionNear(samples: TrackSample[], instant: number, maxSeconds: number): ProgressPosition | null {
  let best: { sample: TrackSample, offset: number, time: number } | null = null
  for (const sample of samples) {
    const time = Date.parse(sample.utc)
    if (!Number.isFinite(time) || !isValidPosition(sample)) continue
    const offset = Math.abs(time - instant)
    if (offset > maxSeconds * 1_000) continue
    if (best === null || offset < best.offset || (offset === best.offset && time < best.time)) {
      best = { sample, offset, time }
    }
  }
  return best === null ? null : { latitude: best.sample.lat, longitude: best.sample.lon }
}

/**
 * Window-level progress along the effective TWD axis (#192.2, same instants #192.2.1): net
 * displacement between the nearest valid positions to the window start and end instants,
 * projected on TWD (upwind) or TWD + 180° (downwind). A Viewer presentation measure only —
 * not per-sample/per-tack VMG.
 */
export function calculateWindProgress(
  samples: TrackSample[],
  analysisWindow: AnalysisWindowRange | null,
  effectiveTwd: EffectiveTwd | null,
  classification: WindWindowClassification,
  summaryDistanceMeters: number | null,
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): WindProgress {
  const distance = summaryDistanceMeters !== null && Number.isFinite(summaryDistanceMeters)
    ? summaryDistanceMeters
    : null
  const unavailable = (reason: ProgressUnavailableReason): WindProgress => ({
    status: 'unavailable', reason, distanceMeters: distance,
  })

  if (classification === 'reaching' || classification === 'mixed') return unavailable(classification)
  if (classification === 'unavailable' || effectiveTwd === null || analysisWindow === null) {
    return unavailable('sector-unavailable')
  }

  if (effectiveTwd.source === 'modelled') {
    const sourceTime = effectiveTwd.sourceTimeUtc === undefined ? Number.NaN : Date.parse(effectiveTwd.sourceTimeUtc)
    const midpoint = analysisWindow.start + (analysisWindow.end - analysisWindow.start) / 2
    if (
      !Number.isFinite(sourceTime)
      || Math.abs(sourceTime - midpoint) > config.progressMaxModelledTwdAgeMinutes * 60_000
    ) return unavailable('wind-reference-age')
  }

  const durationSeconds = (analysisWindow.end - analysisWindow.start) / 1_000
  if (!(durationSeconds > 0)) return unavailable('insufficient-positions')
  const from = positionNear(samples, analysisWindow.start, config.sameInstantMaxSeconds)
  if (from === null) return unavailable('no-start-position')
  const to = positionNear(samples, analysisWindow.end, config.sameInstantMaxSeconds)
  if (to === null) return unavailable('no-end-position')
  const displacement = distanceMeters(from, to)
  if (!(displacement > 0)) return unavailable('insufficient-positions')

  const netBearingDegrees = bearing(from, to)
  const axisDegrees = ((classification === 'upwind' ? effectiveTwd.degrees : effectiveTwd.degrees + 180) % 360 + 360) % 360
  const offset = Math.abs(normalizeSignedDegrees(netBearingDegrees - axisDegrees))
  if (offset > config.progressMaxAxisOffsetDegrees) return unavailable('course-off-axis')

  const progressMeters = displacement * Math.cos(offset * Math.PI / 180)
  return {
    status: 'available',
    sector: classification,
    distanceMeters: distance,
    progressMeters,
    efficiency: distance !== null && distance > 0 ? progressMeters / distance : null,
    durationSeconds,
    progressSpeedMetersPerSecond: progressMeters / durationSeconds,
    netBearingDegrees,
    axisDegrees,
    startPosition: from,
    endPosition: to,
    startTimeMs: analysisWindow.start,
    endTimeMs: analysisWindow.end,
  }
}

/** Along-axis and lateral coordinates of `point` from `origin`, via the shared geodesic helpers. */
function project(origin: ProgressPosition, point: ProgressPosition, axisDegrees: number) {
  const meters = distanceMeters(origin, point)
  if (!(meters > 0)) return { along: 0, lateral: 0 }
  const angle = normalizeSignedDegrees(bearing(origin, point) - axisDegrees) * Math.PI / 180
  return { along: meters * Math.cos(angle), lateral: meters * Math.sin(angle) }
}

function gapAt(timeMs: number, primary: ProgressPosition, comparison: ProgressPosition, axisDegrees: number): ProgressGap {
  // C relative to the local frame centred on P; P relative to C is the negation.
  const c = project(primary, comparison, axisDegrees)
  return { timeMs, alongMeters: -c.along, lateralMeters: -c.lateral }
}

/**
 * P-perspective gain (#192.2.1), only when both Activities are eligible in the same sector.
 * Gain = end gap - start gap along the axis, with both gaps measured at the same window
 * instants. Equivalent seconds = |gain| / mean of both along-axis speeds; `Similar` within the limit.
 */
export function calculateProgressDifference(
  primary: WindProgress,
  comparison: WindProgress | null | undefined,
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): ProgressDifference | null {
  if (primary.status !== 'available' || comparison?.status !== 'available') return null
  if (primary.sector !== comparison.sector) return null
  const meanSpeed = (primary.progressSpeedMetersPerSecond + comparison.progressSpeedMetersPerSecond) / 2
  if (!(meanSpeed > 0)) return null
  const startGap = gapAt(primary.startTimeMs, primary.startPosition, comparison.startPosition, primary.axisDegrees)
  const endGap = gapAt(primary.endTimeMs, primary.endPosition, comparison.endPosition, primary.axisDegrees)
  const gainMeters = endGap.alongMeters - startGap.alongMeters
  const seconds = Math.abs(gainMeters) / meanSpeed
  return {
    status: seconds <= config.progressSimilarSeconds ? 'similar' : 'difference',
    sector: primary.sector,
    gainMeters,
    seconds,
    startGap,
    endGap,
    wideLateralSeparation: Math.abs(startGap.lateralMeters) > config.lateralWideMeters
      || Math.abs(endGap.lateralMeters) > config.lateralWideMeters,
  }
}

function formatUtcTime(timeMs: number) {
  return new Date(timeMs).toISOString().slice(11, 19)
}

export function formatProgressDifference(difference: ProgressDifference) {
  const direction = difference.sector === 'upwind' ? 'windward' : 'leeward'
  if (difference.status === 'similar') return `P and C made similar progress to ${direction} (within 5 s).`
  const verb = difference.gainMeters >= 0 ? 'gained' : 'lost'
  const meters = Math.round(Math.abs(difference.gainMeters))
  const seconds = Math.round(difference.seconds)
  return `P ${verb} ${meters} m to ${direction} on C — equivalent to about ${seconds}s of sailing.`
}

function formatGap(gap: ProgressGap, sector: ProgressSector, config: WindContextConfig) {
  if (Math.abs(gap.alongMeters) < config.levelGapMeters) return 'level with C'
  const meters = Math.round(Math.abs(gap.alongMeters))
  const further = gap.alongMeters > 0 // P further along the axis than C
  if (sector === 'upwind') return `${meters} m to ${further ? 'windward' : 'leeward'} of C`
  return `${meters} m ${further ? 'downwind' : 'upwind'} of C`
}

export function formatProgressGaps(difference: ProgressDifference, config: WindContextConfig = WIND_CONTEXT_CONFIG) {
  const { startGap, endGap, sector } = difference
  return `At ${formatUtcTime(startGap.timeMs)} P ${formatGap(startGap, sector, config)} → at ${formatUtcTime(endGap.timeMs)} ${formatGap(endGap, sector, config)}`
}

export function formatProgressReason(reason: ProgressUnavailableReason) {
  switch (reason) {
    case 'reaching': return 'Reaching window'
    case 'mixed': return 'Mixed window'
    case 'sector-unavailable': return 'Sector unavailable'
    case 'wind-reference-age': return 'Wind reference too far in time'
    case 'no-start-position': return 'No position near window start'
    case 'no-end-position': return 'No position near window end'
    case 'insufficient-positions': return 'Insufficient position data'
    default: return 'Course not along wind axis'
  }
}
