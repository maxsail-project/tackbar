import { describe, expect, it } from 'vitest'
import type { HistoricalConditions, HistoricalConditionsSample } from '../types/session'
import { selectHistoricalConditionsSample } from './historicalConditions'
import { createTwdTimeResolver, resolveTwdReference } from './twdReference'

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

describe('per-instant modelled TWD resolver', () => {
  const at = (hour: number, minute = 0) => Date.UTC(2031, 0, 1, hour, minute)
  const conditions = (samples: [string, number | null][]): HistoricalConditions => ({
    weather_source: { provider: 'open-meteo' }, marine_source: null,
    hourly: samples.map(([time, direction]) => ({
      time, wind_direction_10m_deg: direction,
      air_temperature_c: null, wind_speed_10m_kn: null, wind_gusts_10m_kn: null,
      cloud_cover_pct: null, wave_height_m: null, wave_direction_deg: null, wave_period_s: null,
    })),
  })

  it('matches resolveTwdReference for nearest, earlier-tie, unsorted, invalid and duplicate samples', () => {
    const source = conditions([
      ['2031-01-01T12:00:00Z', 30],
      ['2031-01-01T10:00:00Z', 10.4],
      ['2031-01-01T11:00:00Z', null],
      ['2031-01-01T11:00:00', 99],
      ['2031-01-01T13:00:00+00:00', 40],
      ['2031-01-01T13:00:00Z', 41],
    ])
    const resolve = createTwdTimeResolver(source)!
    for (const time of [at(8), at(10), at(10, 59), at(11), at(11, 1), at(12, 30), at(13), at(15)]) {
      const reference = resolveTwdReference(time, source)
      expect(reference.status).toBe('available')
      expect(resolve(time)).toBe(reference.status === 'available' ? reference.directionDegrees : null)
    }
    expect(resolve(at(11))).toBe(10.4)
    expect(resolve(at(12, 30))).toBe(30)
    expect(resolve(at(15))).toBe(40)
  })

  it('is null without a valid modelled direction', () => {
    expect(createTwdTimeResolver(null)).toBeNull()
    expect(createTwdTimeResolver(conditions([['2031-01-01T10:00:00Z', null], ['2031-01-01T11:00:00', 5]]))).toBeNull()
  })
})
