import { describe, expect, it } from 'vitest'
import { compactSeconds, formatManeuverDirectionChange, formatManeuverLoss, formatManeuverSog, withUnit } from './maneuverCompactFormat'

describe('formatManeuverLoss (#211 D14–D15)', () => {
  it('reads equivalent Loss time first, then Loss distance, with the Selected Maneuvers accessible name', () => {
    expect(formatManeuverLoss({ speed_loss_distance_m: 18, speed_loss_time_s: 8 })).toEqual({
      text: '8s · 18 m',
      ariaLabel: 'Loss distance 18 m; equivalent Loss time 8 s',
    })
  })

  it('shows — for each unavailable part and keeps both unavailable as — · —', () => {
    expect(formatManeuverLoss({ speed_loss_distance_m: null, speed_loss_time_s: 8 })).toEqual({
      text: '8s · —',
      ariaLabel: 'Loss distance —; equivalent Loss time 8 s',
    })
    expect(formatManeuverLoss({ speed_loss_distance_m: 18, speed_loss_time_s: null })).toEqual({
      text: '— · 18 m',
      ariaLabel: 'Loss distance 18 m; equivalent Loss time —',
    })
    expect(formatManeuverLoss({ speed_loss_distance_m: null, speed_loss_time_s: null }).text).toBe('— · —')
  })

  it('adds units only to available values', () => {
    expect(withUnit('5', 'm')).toBe('5 m')
    expect(withUnit('—', 'm')).toBe('—')
    expect(compactSeconds('5')).toBe('5s')
    expect(compactSeconds('—')).toBe('—')
  })
})

describe('formatManeuverSog and formatManeuverDirectionChange (#211 D17)', () => {
  it('formats the SOG triplet with one trailing kt and knots in the accessible name', () => {
    expect(formatManeuverSog({ sog_entry_kn: 6.7, sog_min_kn: 4, sog_exit_kn: 6.1 })).toEqual({
      text: '6.7/4.0/6.1 kt',
      ariaLabel: 'Entry SOG 6.7 knots, Minimum SOG 4.0 knots, Exit SOG 6.1 knots',
    })
    expect(formatManeuverSog({ sog_entry_kn: null, sog_min_kn: null, sog_exit_kn: null }).text).toBe('—/—/—')
  })

  it('prefers HDG, falls back to COG and reads — when neither exists', () => {
    expect(formatManeuverDirectionChange({ heading_change_deg: -90.6, course_change_deg: 10 })).toEqual({ source: 'HDG', text: '−91°' })
    expect(formatManeuverDirectionChange({ heading_change_deg: null, course_change_deg: 85 })).toEqual({ source: 'COG', text: '+85°' })
    expect(formatManeuverDirectionChange({ heading_change_deg: null, course_change_deg: null })).toEqual({ source: null, text: '—' })
  })
})
