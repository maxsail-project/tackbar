import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import type { TwdReference } from './twdReference'

export type WindSector = 'upwind' | 'reaching' | 'downwind'
export type WindWindowClassification = WindSector | 'mixed' | 'unavailable'
export type UpwindTack = 'port' | 'starboard' | 'indeterminate'
export type TwdSource = 'modelled' | 'manual'

export interface EffectiveTwd {
  /** Numeric calculation value: original unrounded modelled direction or the manual Viewer value. */
  degrees: number
  source: TwdSource
}

export type HdgCheck = 'agree' | 'disagree' | 'unavailable'
export type HeelCheck = 'opposite' | 'same' | 'weak' | 'unavailable'
export type TackCheckLabel = 'COG only' | 'HDG ✓' | 'HEEL ✓' | '?'

export interface TackCheck {
  hdg: HdgCheck
  heel: HeelCheck
  labels: TackCheckLabel[]
}

export interface UpwindTackSummary {
  upwindSeconds: number
  shares: Record<UpwindTack, number>
  meanAbsTwaDegrees: { port: number | null, starboard: number | null }
  check: TackCheck
}

export interface WindContextResult {
  classification: WindWindowClassification
  movingSeconds: number
  sectorShares: Record<WindSector, number> | null
  /** Present only for an upwind-dominant window. */
  upwindTack: UpwindTackSummary | null
}

type WindContextConfig = typeof WIND_CONTEXT_CONFIG

const UNAVAILABLE: WindContextResult = {
  classification: 'unavailable',
  movingSeconds: 0,
  sectorShares: null,
  upwindTack: null,
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value)
}

/** Normalize any angle to the circular signed range (-180°, 180°]. */
export function normalizeSignedDegrees(value: number) {
  const normalized = ((value % 360) + 360) % 360
  return normalized > 180 ? normalized - 360 : normalized
}

/**
 * Signed true wind angle from a course and TWD, circular-safe across 0°/360°.
 * Positive means wind on the starboard side (TWD − course > 0), negative on port.
 */
export function signedTwaDegrees(twdDegrees: number, courseDegrees: number | null) {
  if (!Number.isFinite(twdDegrees) || !isFiniteNumber(courseDegrees)) return null
  return normalizeSignedDegrees(twdDegrees - courseDegrees)
}

export function classifyWindSector(
  twaDegrees: number,
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): WindSector {
  const magnitude = Math.abs(twaDegrees)
  if (magnitude < config.upwindMaxTwaDegrees) return 'upwind'
  if (magnitude > config.downwindMinTwaDegrees) return 'downwind'
  return 'reaching'
}

export function classifyUpwindTack(
  twaDegrees: number,
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): UpwindTack {
  if (Math.abs(twaDegrees) < config.tackIndeterminateTwaDegrees) return 'indeterminate'
  return twaDegrees > 0 ? 'starboard' : 'port'
}

/**
 * Effective TWD for wind-relative calculation: an active manual Viewer value wins;
 * otherwise the original unrounded modelled direction; otherwise none (North-up is not wind).
 */
export function resolveEffectiveTwd(
  reference: TwdReference,
  manualDegrees: number | null,
): EffectiveTwd | null {
  if (manualDegrees !== null && Number.isFinite(manualDegrees)) {
    return { degrees: manualDegrees, source: 'manual' }
  }
  if (reference.status === 'available' && Number.isFinite(reference.directionDegrees)) {
    return { degrees: reference.directionDegrees, source: 'modelled' }
  }
  return null
}

type Weighted = [value: number, weight: number]

function weightedMedian(values: Weighted[]) {
  const total = values.reduce((sum, [, weight]) => sum + weight, 0)
  if (total <= 0) return null
  const sorted = [...values].sort(([first], [second]) => first - second)
  let cumulative = 0
  for (const [value, weight] of sorted) {
    cumulative += weight
    if (cumulative >= total / 2) return value
  }
  return null
}

function weightedMean(values: Weighted[]) {
  const total = values.reduce((sum, [, weight]) => sum + weight, 0)
  if (total <= 0) return null
  return values.reduce((sum, [value, weight]) => sum + value * weight, 0) / total
}

/** HDG consistency: per COG tack group, the HDG-based signed TWA median must share the group's sign. */
export function evaluateHdgCheck(groups: { port: Weighted[], starboard: Weighted[] }): HdgCheck {
  const portMedian = weightedMedian(groups.port)
  const starboardMedian = weightedMedian(groups.starboard)
  if (portMedian === null && starboardMedian === null) return 'unavailable'
  if (portMedian !== null && !(portMedian < 0)) return 'disagree'
  if (starboardMedian !== null && !(starboardMedian > 0)) return 'disagree'
  return 'agree'
}

/**
 * HEEL consistency: only relative sign opposition between the two COG tack groups.
 * No absolute HEEL sign is mapped to a side.
 */
export function evaluateHeelCheck(
  groups: { port: Weighted[], starboard: Weighted[] },
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): HeelCheck {
  const portMedian = weightedMedian(groups.port)
  const starboardMedian = weightedMedian(groups.starboard)
  if (portMedian === null || starboardMedian === null) return 'unavailable'
  if (
    Math.abs(portMedian) < config.heelCheckMinMagnitudeDegrees
    || Math.abs(starboardMedian) < config.heelCheckMinMagnitudeDegrees
  ) return 'weak'
  return Math.sign(portMedian) !== Math.sign(starboardMedian) ? 'opposite' : 'same'
}

/** Checks only annotate the COG tack result; any inconsistent available check yields `?`. */
export function resolveTackCheckLabels(hdg: HdgCheck, heel: HeelCheck): TackCheckLabel[] {
  if (hdg === 'disagree' || heel === 'same') return ['?']
  const labels: TackCheckLabel[] = []
  if (hdg === 'agree') labels.push('HDG ✓')
  if (heel === 'opposite') labels.push('HEEL ✓')
  return labels.length > 0 ? labels : ['COG only']
}

/**
 * Wind-relative context of one Activity over the Analysis Window.
 * Each valid canonical sample inside the window represents the interval to the next sample,
 * clipped to the window; nonpositive intervals and gaps over the configured limit add no time.
 * Missing/non-finite COG or SOG is excluded, never reconstructed. HDG and HEEL are checks only.
 */
export function calculateWindContext(
  samples: TrackSample[],
  analysisWindow: AnalysisWindowRange | null,
  effectiveTwd: EffectiveTwd | null,
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): WindContextResult {
  if (effectiveTwd === null || analysisWindow === null || !Number.isFinite(effectiveTwd.degrees)) {
    return UNAVAILABLE
  }

  const maxGapMs = config.maxGapSeconds * 1_000
  const sectorMs: Record<WindSector, number> = { upwind: 0, reaching: 0, downwind: 0 }
  const tackMs: Record<UpwindTack, number> = { port: 0, starboard: 0, indeterminate: 0 }
  const absTwa = { port: [] as Weighted[], starboard: [] as Weighted[] }
  const hdgTwa = { port: [] as Weighted[], starboard: [] as Weighted[] }
  const heel = { port: [] as Weighted[], starboard: [] as Weighted[] }

  for (let index = 0; index + 1 < samples.length; index += 1) {
    const sample = samples[index]
    if (!isFiniteNumber(sample.sog) || sample.sog < config.movingMinSogKnots) continue
    const twa = signedTwaDegrees(effectiveTwd.degrees, sample.cog)
    if (twa === null) continue

    const intervalStart = Date.parse(sample.utc)
    const intervalEnd = Date.parse(samples[index + 1].utc)
    if (!Number.isFinite(intervalStart) || !Number.isFinite(intervalEnd)) continue
    if (intervalStart < analysisWindow.start || intervalStart > analysisWindow.end) continue
    const intervalDuration = intervalEnd - intervalStart
    if (intervalDuration <= 0 || intervalDuration > maxGapMs) continue
    const represented = Math.min(intervalEnd, analysisWindow.end) - intervalStart
    if (represented <= 0) continue

    const sector = classifyWindSector(twa, config)
    sectorMs[sector] += represented
    if (sector !== 'upwind') continue

    const tack = classifyUpwindTack(twa, config)
    tackMs[tack] += represented
    if (tack === 'indeterminate') continue

    absTwa[tack].push([Math.abs(twa), represented])
    const hdgBasedTwa = signedTwaDegrees(effectiveTwd.degrees, sample.hdg)
    if (hdgBasedTwa !== null) hdgTwa[tack].push([hdgBasedTwa, represented])
    if (isFiniteNumber(sample.heel)) heel[tack].push([sample.heel, represented])
  }

  const movingMs = sectorMs.upwind + sectorMs.reaching + sectorMs.downwind
  if (movingMs <= 0) return UNAVAILABLE

  const sectorShares: Record<WindSector, number> = {
    upwind: sectorMs.upwind / movingMs,
    reaching: sectorMs.reaching / movingMs,
    downwind: sectorMs.downwind / movingMs,
  }
  const dominant = (Object.keys(sectorShares) as WindSector[])
    .find((sector) => sectorShares[sector] >= config.dominantShare)
  const classification: WindWindowClassification = dominant ?? 'mixed'

  let upwindTack: UpwindTackSummary | null = null
  if (classification === 'upwind') {
    const hdg = evaluateHdgCheck(hdgTwa)
    const heelCheck = evaluateHeelCheck(heel, config)
    upwindTack = {
      upwindSeconds: sectorMs.upwind / 1_000,
      shares: {
        port: tackMs.port / sectorMs.upwind,
        starboard: tackMs.starboard / sectorMs.upwind,
        indeterminate: tackMs.indeterminate / sectorMs.upwind,
      },
      meanAbsTwaDegrees: {
        port: weightedMean(absTwa.port),
        starboard: weightedMean(absTwa.starboard),
      },
      check: { hdg, heel: heelCheck, labels: resolveTackCheckLabels(hdg, heelCheck) },
    }
  }

  return {
    classification,
    movingSeconds: movingMs / 1_000,
    sectorShares,
    upwindTack,
  }
}

export function formatWindShare(share: number | null | undefined) {
  return isFiniteNumber(share) ? `${Math.round(share * 100)}%` : '—'
}

export function formatWindClassification(classification: WindWindowClassification) {
  switch (classification) {
    case 'upwind': return 'Upwind'
    case 'reaching': return 'Reaching'
    case 'downwind': return 'Downwind'
    case 'mixed': return 'Mixed'
    default: return 'Unavailable'
  }
}

export function formatTwdSource(source: TwdSource) {
  return source === 'manual' ? 'Manual · Viewer' : 'Modelled'
}
