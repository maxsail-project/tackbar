import { describe, expect, it } from 'vitest'
import { compactSeconds, formatManeuverLoss, withUnit } from './maneuverLossFormat'

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
