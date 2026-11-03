import { describe, expect, it } from 'vitest'
import type { HistoricalConditions, HistoricalConditionsSample } from '../types/session'
import { selectHistoricalConditionsSample } from './historicalConditions'
import { resolveTwdReference } from './twdReference'

function sample(time: string, direction: number | null): HistoricalConditionsSample {
  return {
    time,
    wind_direction_10m_deg: direction,
    air_temperature_c: null,
    wind_speed_10m_kn: null,
    wind_gusts_10m_kn: null,
    cloud_cover_pct: null,
    wave_height_m: null,
    wave_direction_deg: null,
    wave_period_s: null,
  }
}

function conditions(...hourly: HistoricalConditionsSample[]): HistoricalConditions {
  return { weather_source: { provider: 'open-meteo' }, marine_source: null, hourly }
}

const at = (time: string) => Date.parse(time)

describe('modelled TWD reference resolution', () => {
  it('selects the nearest usable wind direction and keeps its original value and provenance', () => {
    const weather = conditions(
      sample('2031-06-01T09:00:00Z', 91.6),
      sample('2031-06-01T10:00:00Z', null),
      sample('2031-06-01T11:00:00Z', 274),
    )

    expect(resolveTwdReference(at('2031-06-01T09:55:00Z'), weather)).toEqual({
      status: 'available',
      directionDegrees: 91.6,
      sourceKind: 'modelled_weather',
      sourceTimeUtc: '2031-06-01T09:00:00.000Z',
      provenance: { provider: 'open-meteo' },
    })
    // The descriptive cue still selects the nearest sample, whether it has wind or not.
    expect(selectHistoricalConditionsSample(weather.hourly, {
      start: at('2031-06-01T09:50:00Z'),
      end: at('2031-06-01T10:00:00Z'),
    })?.time).toBe('2031-06-01T10:00:00Z')
  })

  it('ignores missing, non-finite, and invalid-time samples', () => {
    const weather = conditions(
      sample('2031-06-01T10:00:00Z', null),
      sample('2031-06-01T10:01:00Z', Number.NaN),
      sample('2031-06-01T10:02:00Z', Number.POSITIVE_INFINITY),
      sample('2031-06-01T10:03:00Z', Number.NEGATIVE_INFINITY),
      sample('invalid', 10),
      sample('2031-06-01T10:04:00', 20),
      sample('2031-06-01T10:05:00Z', 42),
    )
    expect(resolveTwdReference(at('2031-06-01T10:00:00Z'), weather)).toMatchObject({
      status: 'available', directionDegrees: 42,
    })
  })

  it('returns an explicit unavailable result without usable data or a valid target', () => {
    expect(resolveTwdReference(at('2031-06-01T10:00:00Z'), null)).toEqual({ status: 'unavailable' })
    expect(resolveTwdReference(at('2031-06-01T10:00:00Z'), conditions())).toEqual({ status: 'unavailable' })
    expect(resolveTwdReference(at('2031-06-01T10:00:00Z'), conditions(sample('invalid', 30), sample('2031-06-01T11:00:00Z', null))))
      .toEqual({ status: 'unavailable' })
    expect(resolveTwdReference(Number.NaN, conditions(sample('2031-06-01T10:00:00Z', 30))))
      .toEqual({ status: 'unavailable' })
  })

  it('prefers earlier UTC on equal distance, regardless of input order', () => {
    const weather = conditions(sample('2031-06-01T11:00:00Z', 120), sample('2031-06-01T09:00:00Z', 80))
    expect(resolveTwdReference(at('2031-06-01T10:00:00Z'), weather)).toMatchObject({
      directionDegrees: 80, sourceTimeUtc: '2031-06-01T09:00:00.000Z',
    })
  })

  it('allows a distant sample outside the analysis interval without a cutoff', () => {
    const weather = conditions(sample('2029-01-01T00:00:00Z', 240))
    expect(resolveTwdReference(at('2031-06-01T10:00:00Z'), weather)).toMatchObject({
      status: 'available', directionDegrees: 240,
    })
  })

  it('preserves original 0° and 360° directions across the circular boundary', () => {
    const weather = conditions(sample('2031-06-01T09:00:00Z', 360), sample('2031-06-01T11:00:00Z', 0))
    expect(resolveTwdReference(at('2031-06-01T09:00:00Z'), weather)).toMatchObject({ directionDegrees: 360 })
    expect(resolveTwdReference(at('2031-06-01T11:00:00Z'), weather)).toMatchObject({ directionDegrees: 0 })
  })

  it('reports absent provider provenance without inventing it', () => {
    expect(resolveTwdReference(at('2031-06-01T09:00:00Z'), {
      ...conditions(sample('2031-06-01T09:00:00Z', 45)), weather_source: null,
    })).toMatchObject({ provenance: { provider: null } })
  })
})
