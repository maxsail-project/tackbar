import type { Maneuver } from '../types/maneuver'
import { formatHeadingChange, formatKnots, formatMetres, formatSeconds } from './maneuverEvents'

const UNAVAILABLE = '—'

export function withUnit(value: string, unit: string) {
  return value === UNAVAILABLE ? value : `${value} ${unit}`
}

export function compactSeconds(value: string) {
  return value === UNAVAILABLE ? value : `${value}s`
}

/**
 * Compact maneuver formats shared by Selected Maneuvers and the Maneuver Analysis table (#211 D14–D17).
 * Combined Loss display:
 * equivalent Loss time first, then Loss distance (`8s · 18 m`); each unavailable part reads `—`.
 */
export function formatManeuverLoss(maneuver: Pick<Maneuver, 'speed_loss_distance_m' | 'speed_loss_time_s'>) {
  const distance = withUnit(formatMetres(maneuver.speed_loss_distance_m), 'm')
  const time = withUnit(formatSeconds(maneuver.speed_loss_time_s), 's')
  return {
    text: `${compactSeconds(formatSeconds(maneuver.speed_loss_time_s))} · ${distance}`,
    ariaLabel: `Loss distance ${distance}; equivalent Loss time ${time}`,
  }
}

/**
 * SOG triplet `in/min/out` with one trailing `kt` when any value is available; all unavailable
 * stays `—/—/—`. The accessible name states Entry/Minimum/Exit SOG in knots.
 */
export function formatManeuverSog(maneuver: Pick<Maneuver, 'sog_entry_kn' | 'sog_min_kn' | 'sog_exit_kn'>) {
  const values = [maneuver.sog_entry_kn, maneuver.sog_min_kn, maneuver.sog_exit_kn].map(formatKnots)
  const triplet = values.join('/')
  const [entry, minimum, exit] = values.map((value) => withUnit(value, 'knots'))
  return {
    text: values.every((value) => value === UNAVAILABLE) ? triplet : `${triplet} kt`,
    ariaLabel: `Entry SOG ${entry}, Minimum SOG ${minimum}, Exit SOG ${exit}`,
  }
}

/** Signed direction change in degrees (HDG preferred, else COG) with its source; `—` when unavailable. */
export function formatManeuverDirectionChange(maneuver: Pick<Maneuver, 'heading_change_deg' | 'course_change_deg'>) {
  if (maneuver.heading_change_deg !== null) return { source: 'HDG' as const, text: `${formatHeadingChange(maneuver.heading_change_deg)}°` }
  if (maneuver.course_change_deg !== null) return { source: 'COG' as const, text: `${formatHeadingChange(maneuver.course_change_deg)}°` }
  return { source: null, text: UNAVAILABLE }
}
