import { describe, expect, it } from 'vitest'
import type { HistoricalConditionsSample } from '../types/session'
import {
  formatHistoricalConditionsCompact,
  formatHistoricalConditionsSource,
  selectHistoricalConditionsSample,
} from './historicalConditions'

function sample(time: string, overrides: Partial<HistoricalConditionsSample> = {}): HistoricalConditionsSample {
  return {
    time,
    air_temperature_c: 23,
    wind_speed_10m_kn: 14,
    wind_direction_10m_deg: 92,
    wind_gusts_10m_kn: 19,
    cloud_cover_pct: 35,
    wave_height_m: 0.6,
    wave_direction_deg: 110,
    wave_period_s: 3.4,
    ...overrides,
  }
}

describe('historical conditions selection', () => {
  const samples = [
    sample('2031-06-01T09:00:00Z'),
    sample('2031-06-01T10:00:00Z', { air_temperature_c: 24 }),
    sample('2031-06-01T11:00:00Z', { air_temperature_c: 25 }),
  ]

  it('selects the sample nearest to the Analysis Window midpoint', () => {
    expect(selectHistoricalConditionsSample(samples, {
      start: Date.parse('2031-06-01T09:45:00Z'),
      end: Date.parse('2031-06-01T10:45:00Z'),
    })?.air_temperature_c).toBe(24)
  })

  it('selects an exact midpoint and resolves an equal-distance tie earlier', () => {
    expect(selectHistoricalConditionsSample(samples, {
      start: Date.parse('2031-06-01T09:30:00Z'),
      end: Date.parse('2031-06-01T10:30:00Z'),
    })?.time).toBe('2031-06-01T10:00:00Z')
    expect(selectHistoricalConditionsSample(samples, {
      start: Date.parse('2031-06-01T09:00:00Z'),
      end: Date.parse('2031-06-01T10:00:00Z'),
    })?.time).toBe('2031-06-01T09:00:00Z')
  })

  it('updates from the Analysis Window and is independent from replay time', () => {
    const firstWindow = { start: Date.parse('2031-06-01T08:30:00Z'), end: Date.parse('2031-06-01T09:30:00Z') }
    const secondWindow = { start: Date.parse('2031-06-01T10:30:00Z'), end: Date.parse('2031-06-01T11:30:00Z') }
    expect(selectHistoricalConditionsSample(samples, firstWindow)?.time).toBe(samples[0].time)
    expect(selectHistoricalConditionsSample(samples, secondWindow)?.time).toBe(samples[2].time)
  })

  it('handles empty and malformed series without inventing a sample', () => {
    expect(selectHistoricalConditionsSample([], { start: 0, end: 1 })).toBeNull()
    expect(selectHistoricalConditionsSample([sample('invalid')], { start: 0, end: 1 })).toBeNull()
    expect(selectHistoricalConditionsSample(samples, null)).toBeNull()
  })
})

describe('historical conditions compact presentation', () => {
  it('uses the required field order and rounding', () => {
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_direction_10m_deg: 91.6,
      wind_speed_10m_kn: 14.04,
      wind_gusts_10m_kn: 18.96,
      air_temperature_c: 23.02,
    }))).toBe('092° · 14 kt · 23°C')
  })

  it('degrades partial atmospheric data and hides marine-only samples', () => {
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_direction_10m_deg: null,
      wind_speed_10m_kn: 14,
      wind_gusts_10m_kn: null,
      air_temperature_c: 23,
    }))).toBe('14 kt · 23°C')
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_direction_10m_deg: null,
      wind_speed_10m_kn: null,
      wind_gusts_10m_kn: null,
      air_temperature_c: null,
    }))).toBeNull()
  })

  it('does not promote gust-only data into the compact summary', () => {
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_direction_10m_deg: null,
      wind_speed_10m_kn: null,
      air_temperature_c: null,
      wind_gusts_10m_kn: 19,
    }))).toBeNull()
  })
})

describe('historical conditions source presentation', () => {
  it('uses one concise source line for shared provenance', () => {
    expect(formatHistoricalConditionsSource('open-meteo', 'open-meteo'))
      .toBe('Source: Open-Meteo')
    expect(formatHistoricalConditionsSource('open-meteo', null))
      .toBe('Source: Open-Meteo')
  })

  it('distinguishes different weather and marine providers simply', () => {
    expect(formatHistoricalConditionsSource('weather-provider', 'marine-provider'))
      .toBe('Sources: Weather: weather-provider · Marine: marine-provider')
    expect(formatHistoricalConditionsSource(null, null)).toBe('Source: —')
  })
})
