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
  | 'insufficient-positions'
  | 'course-off-axis'

export type WindProgress =
  | {
      status: 'available'
      sector: ProgressSector
      /** Existing Summary distance for the same window (accumulated normalized `dist`). */
      distanceMeters: number | null
      /** Net displacement projected on the wind axis; positive towards windward/leeward. */
      progressMeters: number
      efficiency: number | null
      durationSeconds: number
      progressSpeedMetersPerSecond: number
      netBearingDegrees: number
    }
  | {
      status: 'unavailable'
      reason: ProgressUnavailableReason
      distanceMeters: number | null
    }

export type ProgressDifference =
  | { status: 'similar', sector: ProgressSector, meters: number, seconds: number }
  | { status: 'difference', sector: ProgressSector, meters: number, seconds: number }

function isValidPosition(sample: TrackSample) {
  return Number.isFinite(sample.lat) && Number.isFinite(sample.lon)
    && Math.abs(sample.lat) <= 90 && Math.abs(sample.lon) <= 180
}

/**
 * Window-level progress along the effective TWD axis (#192.2): net displacement from the
 * first to the last valid in-window position, projected on TWD (upwind) or TWD + 180°
 * (downwind). A Viewer presentation measure only — not per-sample/per-tack VMG.
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

  let first: { sample: TrackSample, time: number } | null = null
  let last: { sample: TrackSample, time: number } | null = null
  for (const sample of samples) {
    const time = Date.parse(sample.utc)
    if (!Number.isFinite(time) || time < analysisWindow.start || time > analysisWindow.end) continue
    if (!isValidPosition(sample)) continue
    if (first === null) first = { sample, time }
    last = { sample, time }
  }
  if (first === null || last === null || last.time <= first.time) return unavailable('insufficient-positions')
  const from = { latitude: first.sample.lat, longitude: first.sample.lon }
  const to = { latitude: last.sample.lat, longitude: last.sample.lon }
  const displacement = distanceMeters(from, to)
  if (!(displacement > 0)) return unavailable('insufficient-positions')

  const netBearingDegrees = bearing(from, to)
  const axis = classification === 'upwind' ? effectiveTwd.degrees : effectiveTwd.degrees + 180
  const offset = Math.abs(normalizeSignedDegrees(netBearingDegrees - axis))
  if (offset > config.progressMaxAxisOffsetDegrees) return unavailable('course-off-axis')

  const progressMeters = displacement * Math.cos(offset * Math.PI / 180)
  const durationSeconds = (last.time - first.time) / 1_000
  return {
    status: 'available',
    sector: classification,
    distanceMeters: distance,
    progressMeters,
    efficiency: distance !== null && distance > 0 ? progressMeters / distance : null,
    durationSeconds,
    progressSpeedMetersPerSecond: progressMeters / durationSeconds,
    netBearingDegrees,
  }
}

/**
 * Neutral P−C difference, only when both Activities are eligible in the same sector.
 * Equivalent seconds = Δ metres ÷ mean of the two net progress speeds; `Similar` within the limit.
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
  const meters = primary.progressMeters - comparison.progressMeters
  const seconds = meters / meanSpeed
  return {
    status: Math.abs(seconds) <= config.progressSimilarSeconds ? 'similar' : 'difference',
    sector: primary.sector,
    meters,
    seconds,
  }
}

function formatSigned(value: number) {
  const rounded = Math.round(value)
  if (rounded === 0) return '0'
  return rounded < 0 ? `−${Math.abs(rounded)}` : `+${rounded}`
}

export function formatProgressDifference(difference: ProgressDifference) {
  if (difference.status === 'similar') return 'Δ progress P−C: Similar'
  return `Δ progress P−C: ${formatSigned(difference.meters)} m (≈${formatSigned(difference.seconds).replace('+', '')} s)`
}

export function formatProgressReason(reason: ProgressUnavailableReason) {
  switch (reason) {
    case 'reaching': return 'Reaching window'
    case 'mixed': return 'Mixed window'
    case 'sector-unavailable': return 'Sector unavailable'
    case 'wind-reference-age': return 'Wind reference too far in time'
    case 'insufficient-positions': return 'Insufficient position data'
    default: return 'Course not along wind axis'
  }
}
