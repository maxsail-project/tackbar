import type { Maneuver } from '../types/maneuver'
import { formatMetres, formatSeconds } from './maneuverEvents'

const UNAVAILABLE = '—'

export function withUnit(value: string, unit: string) {
  return value === UNAVAILABLE ? value : `${value} ${unit}`
}

export function compactSeconds(value: string) {
  return value === UNAVAILABLE ? value : `${value}s`
}

/**
 * Combined Loss display shared by Selected Maneuvers and the Maneuver Analysis table (#211 D14–D15):
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
