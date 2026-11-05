import { describe, expect, it } from 'vitest'
import type { HistoricalConditionsSample } from '../types/session'
import {
  classifyCloudCover,
  classifyWeatherCode,
  formatHistoricalConditionsCompact,
  formatHistoricalConditionsSource,
  resolveHistoricalConditionsCompact,
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
    }))).toBe('092° · 14 (19) kt · 23°C')
  })

  it('omits absent or invalid gusts while retaining wind speed', () => {
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_gusts_10m_kn: null,
    }))).toBe('092° · 14 kt · 23°C')
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_gusts_10m_kn: Number.POSITIVE_INFINITY,
    }))).toBe('092° · 14 kt · 23°C')
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_gusts_10m_kn: Number.NaN,
    }))).toBe('092° · 14 kt · 23°C')
  })

  it('degrades partial atmospheric data and hides marine-only samples', () => {
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_direction_10m_deg: null,
      wind_speed_10m_kn: 14,
      wind_gusts_10m_kn: 19,
      air_temperature_c: 23,
    }))).toBe('14 (19) kt · 23°C')
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_direction_10m_deg: null,
      wind_speed_10m_kn: null,
      wind_gusts_10m_kn: 19,
      air_temperature_c: 23,
    }))).toBe('23°C')
    expect(formatHistoricalConditionsCompact(sample('2031-06-01T09:00:00Z', {
      wind_speed_10m_kn: Number.NaN,
      wind_gusts_10m_kn: 19,
    }))).toBe('092° · 23°C')
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

describe('Viewer Weather compact presentation', () => {
  const at = '2031-06-01T09:00:00Z'

  it.each([
    [0, 'sun'], [1, 'sun'], [2, 'cloud-sun'], [3, 'cloud'],
    [51, 'cloud-rain'], [53, 'cloud-rain'], [55, 'cloud-rain'], [56, 'cloud-rain'],
    [57, 'cloud-rain'], [61, 'cloud-rain'], [63, 'cloud-rain'], [65, 'cloud-rain'],
    [66, 'cloud-rain'], [67, 'cloud-rain'], [80, 'cloud-rain'], [81, 'cloud-rain'], [82, 'cloud-rain'],
  ] as const)('maps WMO %i to %s', (code, icon) => {
    expect(classifyWeatherCode(code)).toBe(icon)
    expect(resolveHistoricalConditionsCompact(sample(at, { weather_code: code, cloud_cover_pct: 0 }))?.icon).toBe(icon)
  })

  it('does not fall back to cloud cover for a present unsupported code', () => {
    for (const code of [45, 71, 95, 999]) {
      expect(classifyWeatherCode(code)).toBeNull()
      expect(resolveHistoricalConditionsCompact(sample(at, { weather_code: code, cloud_cover_pct: 100 }))?.icon).toBeNull()
    }
  })

  it.each([
    [0, 'sun'], [20, 'sun'], [20.1, 'cloud-sun'],
    [79.9, 'cloud-sun'], [80, 'cloud'], [100, 'cloud'],
  ] as const)('uses %s%% cloud cover for sky icon %s when code is absent', (cover, icon) => {
    expect(classifyCloudCover(cover)).toBe(icon)
    expect(resolveHistoricalConditionsCompact(sample(at, { weather_code: null, cloud_cover_pct: cover }))?.icon).toBe(icon)
  })

  it('ignores invalid codes and cloud cover without inventing rain', () => {
    for (const code of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 2.5, -1]) {
      expect(resolveHistoricalConditionsCompact(sample(at, { weather_code: code, cloud_cover_pct: 80 }))?.icon).toBe('cloud')
    }
    for (const cover of [null, Number.NaN, Number.POSITIVE_INFINITY, -0.1, 100.1]) {
      expect(classifyCloudCover(cover)).toBeNull()
      const compact = resolveHistoricalConditionsCompact(sample(at, { weather_code: null, cloud_cover_pct: cover }))
      expect(compact?.label).toBe('23°C')
      expect(compact?.icon).toBeNull()
    }
  })

  it('rounds compact temperature without changing the original sample', () => {
    const original = sample(at, { air_temperature_c: 19.6, weather_code: 80 })
    expect(resolveHistoricalConditionsCompact(original)).toMatchObject({ label: '20°C', icon: 'cloud-rain' })
    expect(original.air_temperature_c).toBe(19.6)
    expect(resolveHistoricalConditionsCompact(sample(at, { air_temperature_c: 19.5, weather_code: 3 }))?.label).toBe('20°C')
  })

  it('retains Weather access for meaningful weather or marine data without temperature', () => {
    const empty = sample(at, {
      air_temperature_c: null, weather_code: null, wind_direction_10m_deg: null,
      wind_speed_10m_kn: null, wind_gusts_10m_kn: null, cloud_cover_pct: null,
      wave_height_m: null, wave_direction_deg: null, wave_period_s: null,
    })
    expect(resolveHistoricalConditionsCompact(null)).toBeNull()
    expect(resolveHistoricalConditionsCompact(empty)).toBeNull()
    expect(resolveHistoricalConditionsCompact({ ...empty, wind_gusts_10m_kn: 19 })).toMatchObject({ label: 'Weather', icon: null })
    expect(resolveHistoricalConditionsCompact({ ...empty, wave_height_m: 0.6 })).toMatchObject({ label: 'Weather', icon: null })
    expect(resolveHistoricalConditionsCompact({ ...empty, weather_code: 2 })).toMatchObject({ label: 'Weather', icon: 'cloud-sun' })
    expect(resolveHistoricalConditionsCompact({ ...empty, weather_code: 45 })).toMatchObject({ label: 'Weather', icon: null })
    expect(resolveHistoricalConditionsCompact({ ...empty, cloud_cover_pct: 150 })).toBeNull()
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
