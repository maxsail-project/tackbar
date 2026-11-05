import { describe, expect, it } from 'vitest'
import type { HistoricalConditions, HistoricalConditionsSample } from '../types/session'
import { resolveTwsPresentation, resolveTwsReference, stepViewerTws } from './twsReference'

const at = (time: string) => Date.parse(time)
function sample(time: string, speed: number | null, direction: number | null = null): HistoricalConditionsSample {
  return {
    time, wind_speed_10m_kn: speed, wind_direction_10m_deg: direction,
    wind_gusts_10m_kn: 30, air_temperature_c: null, cloud_cover_pct: null,
    wave_height_m: null, wave_direction_deg: null, wave_period_s: null,
  }
}
function conditions(...hourly: HistoricalConditionsSample[]): HistoricalConditions {
  return { weather_source: { provider: 'open-meteo' }, marine_source: null, hourly }
}

describe('modelled TWS reference', () => {
  it('selects the nearest valid speed independently of direction and keeps precision and provenance', () => {
    const weather = conditions(
      sample('2031-06-01T09:00:00Z', 12.5),
      sample('2031-06-01T10:00:00Z', null, 180),
      sample('2031-06-01T11:00:00Z', 21.25),
    )
    const reference = resolveTwsReference(at('2031-06-01T09:55:00Z'), weather)
    expect(reference).toEqual({
      status: 'available', speedKnots: 12.5, sourceKind: 'modelled_weather',
      sourceTimeUtc: '2031-06-01T09:00:00.000Z', provenance: { provider: 'open-meteo' },
    })
    expect(resolveTwsPresentation(reference, null)).toEqual({ speedKnots: '13', manual: false })
    expect(resolveTwsPresentation(reference, '15')).toEqual({ speedKnots: '15', manual: true })
    expect(resolveTwsPresentation(reference, null)).toEqual({ speedKnots: '13', manual: false })
  })

  it('prefers earlier UTC on a tie regardless of array order and has no age cutoff', () => {
    const weather = conditions(sample('2031-06-01T11:00:00Z', 21), sample('2031-06-01T09:00:00Z', 9.75))
    expect(resolveTwsReference(at('2031-06-01T10:00:00Z'), weather)).toMatchObject({
      speedKnots: 9.75, sourceTimeUtc: '2031-06-01T09:00:00.000Z',
    })
    expect(resolveTwsReference(at('2035-01-01T00:00:00Z'), conditions(sample('2029-01-01T00:00:00Z', 4)))).toMatchObject({ speedKnots: 4 })
  })

  it('rejects missing, negative, nonfinite, and invalid-time speeds but accepts zero', () => {
    const weather = conditions(
      sample('2031-06-01T10:00:00Z', null),
      sample('2031-06-01T10:01:00Z', -1),
      sample('2031-06-01T10:02:00Z', Number.NaN),
      sample('2031-06-01T10:03:00Z', Number.POSITIVE_INFINITY),
      sample('2031-06-01T10:04:00Z', Number.NEGATIVE_INFINITY),
      sample('invalid', 9),
      sample('2031-06-01T10:05:00', 8),
      sample('2031-06-01T10:06:00Z', 0),
    )
    const reference = resolveTwsReference(at('2031-06-01T10:00:00Z'), weather)
    expect(reference).toMatchObject({ status: 'available', speedKnots: 0 })
    expect(resolveTwsPresentation(reference, null)).toEqual({ speedKnots: '0', manual: false })
    expect(resolveTwsReference(at('2031-06-01T10:00:00Z'), conditions(...weather.hourly.slice(0, -1))))
      .toEqual({ status: 'unavailable' })
  })

  it('returns unavailable for absent data or midpoint and does not invent a provider', () => {
    expect(resolveTwsReference(at('2031-06-01T10:00:00Z'), null)).toEqual({ status: 'unavailable' })
    expect(resolveTwsReference(at('2031-06-01T10:00:00Z'), conditions())).toEqual({ status: 'unavailable' })
    expect(resolveTwsReference(Number.NaN, conditions(sample('2031-06-01T10:00:00Z', 5)))).toEqual({ status: 'unavailable' })
    expect(resolveTwsReference(at('2031-06-01T10:00:00Z'), { ...conditions(sample('2031-06-01T10:00:00Z', 5)), weather_source: null }))
      .toMatchObject({ provenance: { provider: null } })
  })
})

describe('manual TWS presentation', () => {
  it('steps from unavailable, stops at zero and preserves exact whole knots', () => {
    expect(stepViewerTws(null, 1)).toBe('1')
    expect(stepViewerTws(null, -1)).toBe('0')
    expect(stepViewerTws('0', -1)).toBe('0')
    expect(stepViewerTws('0', 1)).toBe('1')
    expect(stepViewerTws('14', -1)).toBe('13')
    expect(stepViewerTws('9007199254740992', 1)).toBe('9007199254740993')
  })

  it('steps from rounded automatic speed and restores automatic after reset', () => {
    const reference = resolveTwsReference(at('2031-06-01T10:00:00Z'), conditions(sample('2031-06-01T10:00:00Z', 12.5)))
    const automatic = resolveTwsPresentation(reference, null)
    expect(automatic.speedKnots).toBe('13')
    const manual = stepViewerTws(automatic.speedKnots, -1)
    expect(resolveTwsPresentation(reference, manual)).toEqual({ speedKnots: '12', manual: true })
    expect(resolveTwsPresentation(reference, null)).toEqual(automatic)
    expect(resolveTwsPresentation({ status: 'unavailable' }, null)).toEqual({ speedKnots: null, manual: false })
  })
})
