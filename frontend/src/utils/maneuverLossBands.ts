import {
  MANEUVER_LOSS_BAND_CONFIG,
  type ManeuverLossBandConfig,
} from '../config/maneuverLossBands'
import { maneuverSelectionKey, type DisplayManeuver, type ManeuverActivityRole } from './maneuverEvents'

/**
 * Descriptive loss band of one maneuver (#211.2): where its equivalent Loss time sits within its
 * own Activity's currently listed maneuvers. A presentation reading only — not a score, not a
 * ranking between sailors, never persisted and never an input to detection or metrics.
 */
export type ManeuverLossBand = 'high' | 'typical' | 'low'

/** Display order: High loss · Typical · Low loss. */
export const MANEUVER_LOSS_BANDS: readonly ManeuverLossBand[] = ['high', 'typical', 'low']

const BAND_LABELS: Record<ManeuverLossBand, string> = {
  high: 'High loss',
  typical: 'Typical',
  low: 'Low loss',
}

export function formatManeuverLossBand(band: ManeuverLossBand) {
  return BAND_LABELS[band]
}

/** The unrounded equivalent Loss time when finite; otherwise the maneuver is not classified. */
export function maneuverLossTimeSeconds(event: DisplayManeuver): number | null {
  const value = event.maneuver.speed_loss_time_s
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Linearly interpolated quantile of an ascending, non-empty list (the common "type 7"
 * definition): h = (n − 1)·q, interpolating between the values at floor(h) and ceil(h).
 */
export function interpolatedQuantile(sortedAscending: readonly number[], quantile: number) {
  if (sortedAscending.length === 0) throw new RangeError('Quantile of an empty population')
  const position = (sortedAscending.length - 1) * Math.min(1, Math.max(0, quantile))
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const lowerValue = sortedAscending[lower]
  return lowerValue + (position - lower) * (sortedAscending[upper] - lowerValue)
}

/**
 * Loss time at or below the low cut is Low loss, at or above the high cut High loss, otherwise
 * Typical. Equal cut points (no spread) make every classified maneuver Typical; ties share a band.
 */
export function classifyManeuverLossTime(lossTimeS: number, lowCut: number, highCut: number): ManeuverLossBand {
  if (lowCut === highCut) return 'typical'
  if (lossTimeS <= lowCut) return 'low'
  if (lossTimeS >= highCut) return 'high'
  return 'typical'
}

/**
 * Loss bands keyed by `maneuverSelectionKey`, computed per Activity role (P and C independently,
 * never pooled) over the given listed maneuvers. A role with fewer than `minPopulation` maneuvers
 * with a finite Loss time has no bands; maneuvers without a finite Loss time are never classified.
 */
export function deriveManeuverLossBands(
  events: readonly DisplayManeuver[],
  config: ManeuverLossBandConfig = MANEUVER_LOSS_BAND_CONFIG,
): Map<string, ManeuverLossBand> {
  const byRole = new Map<ManeuverActivityRole, { event: DisplayManeuver, lossTimeS: number }[]>()
  for (const event of events) {
    const lossTimeS = maneuverLossTimeSeconds(event)
    if (lossTimeS === null) continue
    const population = byRole.get(event.activityRole) ?? []
    population.push({ event, lossTimeS })
    byRole.set(event.activityRole, population)
  }

  const bands = new Map<string, ManeuverLossBand>()
  for (const population of byRole.values()) {
    if (population.length < Math.max(1, config.minPopulation)) continue
    const sorted = population.map(({ lossTimeS }) => lossTimeS).sort((first, second) => first - second)
    const lowCut = interpolatedQuantile(sorted, config.lowQuantile)
    const highCut = interpolatedQuantile(sorted, config.highQuantile)
    for (const { event, lossTimeS } of population) {
      bands.set(maneuverSelectionKey(event), classifyManeuverLossTime(lossTimeS, lowCut, highCut))
    }
  }
  return bands
}
