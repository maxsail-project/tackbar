import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { HistoricalConditionsSample } from '../types/session'
import HistoricalConditionsControl, { HistoricalConditionsDetail } from './HistoricalConditionsControl'

const sample: HistoricalConditionsSample = {
  time: '2031-06-01T09:00:00Z',
  air_temperature_c: 23,
  wind_speed_10m_kn: 14,
  wind_direction_10m_deg: 92,
  wind_gusts_10m_kn: 19,
  cloud_cover_pct: 35,
  wave_height_m: 0.6,
  wave_direction_deg: 110,
  wave_period_s: 3.4,
}

describe('historical conditions map control', () => {
  it('renders whole-degree temperature and a monochrome icon in a keyboard-operable button', () => {
    const markup = renderToStaticMarkup(<HistoricalConditionsControl
      sample={{
        ...sample,
        wind_direction_10m_deg: 338,
        wind_speed_10m_kn: 4.2,
        air_temperature_c: 28.8,
      }}
      weatherProvider="open-meteo"
      marineProvider="open-meteo"
      expanded={false}
      onExpandedChange={() => undefined}
    />)
    expect(markup).toContain('class="map-conditions__chip"')
    expect(markup).toContain('type="button"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('29°C')
    expect(markup).toContain('data-weather-icon="cloud-sun"')
    expect(markup).toContain('stroke="currentColor"')
    expect(markup).toContain('aria-label="Historical modelled weather: 29°C, partly cloudy sky cover. Show details"')
    expect(markup).not.toContain('338°')
    expect(markup).not.toContain('4.2')
    expect(markup).not.toContain('19 kt')
  })

  it('keeps wind and Gust out of the chip and uses the same sample for temperature and icon', () => {
    const props = {
      weatherProvider: 'open-meteo',
      marineProvider: null,
      expanded: false,
      onExpandedChange: () => undefined,
    }
    const absent = renderToStaticMarkup(<HistoricalConditionsControl
      sample={{ ...sample, wind_gusts_10m_kn: null }} {...props}
    />)
    const invalid = renderToStaticMarkup(<HistoricalConditionsControl
      sample={{ ...sample, wind_gusts_10m_kn: Number.NaN }} {...props}
    />)
    const partial = renderToStaticMarkup(<HistoricalConditionsControl
      sample={{ ...sample, wind_speed_10m_kn: null }} {...props}
    />)
    for (const markup of [absent, invalid, partial]) {
      expect(markup).toContain('23°C')
      expect(markup).toContain('data-weather-icon="cloud-sun"')
      expect(markup).not.toContain('14 kt')
      expect(markup).not.toContain('Gust')
    }
    const gustOnly = renderToStaticMarkup(<HistoricalConditionsControl sample={{
      ...sample, wind_direction_10m_deg: null, wind_speed_10m_kn: null,
      air_temperature_c: null, cloud_cover_pct: null, wave_height_m: null,
      wave_direction_deg: null, wave_period_s: null,
    }} {...props} />)
    expect(gustOnly).toContain('Weather')
    expect(gustOnly).not.toContain('19')
  })

  it('shows every available persisted field and its UTC sample time in detail', () => {
    const markup = renderToStaticMarkup(<HistoricalConditionsDetail
      sample={{ ...sample, weather_code: 80 }}
      weatherProvider="open-meteo"
      marineProvider="open-meteo"
    />)
    for (const label of ['Wind direction', 'Wind speed', 'Gusts', 'Temperature', 'Cloud cover', 'Wave height', 'Wave direction', 'Wave period', 'Sample time']) {
      expect(markup).toContain(label)
    }
    expect(markup).toContain('<dt>Gusts</dt><dd>19 kt</dd>')
    expect(markup).not.toContain('Historical · modelled')
    expect(markup).toContain('aria-label="Historical modelled conditions"')
    expect(markup).toContain('Source: Open-Meteo')
    expect(markup).toContain('01 Jun 2031')
    expect(markup).toContain('09:00 UTC')
    expect(markup).not.toContain('weather_code')
  })

  it('presents differing weather and marine provenance without diagnostic detail', () => {
    const markup = renderToStaticMarkup(<HistoricalConditionsDetail
      sample={sample}
      weatherProvider="open-meteo"
      marineProvider="marine-provider"
    />)

    expect(markup).toContain('Sources: Weather: Open-Meteo · Marine: marine-provider')
  })

  it('keeps a visible unavailable source line for backward-compatible context', () => {
    const markup = renderToStaticMarkup(<HistoricalConditionsDetail
      sample={sample}
      weatherProvider={null}
      marineProvider={null}
    />)

    expect(markup).toContain('Source: —')
  })

  it('preserves explicit chip toggle behavior', () => {
    const onExpandedChange = vi.fn()
    const collapsed = HistoricalConditionsControl({
      sample,
      weatherProvider: 'open-meteo',
      marineProvider: null,
      expanded: false,
      onExpandedChange,
    })
    const button = Array.isArray(collapsed?.props.children)
      ? collapsed.props.children[0]
      : null

    button?.props.onClick()
    expect(onExpandedChange).toHaveBeenCalledWith(true)

    const expanded = HistoricalConditionsControl({
      sample,
      weatherProvider: 'open-meteo',
      marineProvider: null,
      expanded: true,
      onExpandedChange,
    })
    const expandedButton = Array.isArray(expanded?.props.children)
      ? expanded.props.children[0]
      : null

    expandedButton?.props.onClick()
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps marine-only detail accessible and hides only unavailable context', () => {
    const marineOnly = { ...sample, air_temperature_c: null, wind_speed_10m_kn: null, wind_direction_10m_deg: null, wind_gusts_10m_kn: null, cloud_cover_pct: null }
    const props = {
      weatherProvider: 'open-meteo',
      marineProvider: null,
      expanded: false,
      onExpandedChange: () => undefined,
    }
    expect(renderToStaticMarkup(<HistoricalConditionsControl sample={null} {...props} />)).toBe('')
    const marine = renderToStaticMarkup(<HistoricalConditionsControl sample={marineOnly} {...props} />)
    expect(marine).toContain('>Weather</span>')
    expect(marine).not.toContain('data-weather-icon')
    expect(renderToStaticMarkup(<HistoricalConditionsControl sample={{ ...marineOnly, wave_height_m: null, wave_direction_deg: null, wave_period_s: null }} {...props} />)).toBe('')
  })
})
