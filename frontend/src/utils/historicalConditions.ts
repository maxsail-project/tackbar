import type { HistoricalConditionsSample } from '../types/session'
import type { AnalysisWindowRange } from './analysisWindow'

export function selectHistoricalConditionsSample(
  samples: HistoricalConditionsSample[],
  analysisWindow: AnalysisWindowRange | null,
) {
  if (analysisWindow === null || samples.length === 0) return null

  const midpoint = analysisWindow.start
    + (analysisWindow.end - analysisWindow.start) / 2
  let selected: HistoricalConditionsSample | null = null
  let selectedTime = 0
  let selectedDistance = Number.POSITIVE_INFINITY

  for (const sample of samples) {
    const sampleTime = Date.parse(sample.time)
    if (!Number.isFinite(sampleTime)) continue
    const distance = Math.abs(sampleTime - midpoint)
    if (
      distance < selectedDistance
      || (distance === selectedDistance && sampleTime < selectedTime)
    ) {
      selected = sample
      selectedTime = sampleTime
      selectedDistance = distance
    }
  }

  return selected
}

function finite(value: number | null | undefined) {
  return value !== null && Number.isFinite(value)
}

function compactNumber(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export type WeatherConditionIcon = 'sun' | 'cloud-sun' | 'cloud' | 'cloud-rain'

export function classifyWeatherCode(code: number | null | undefined): WeatherConditionIcon | null {
  if (code === null || code === undefined || !Number.isInteger(code) || code < 0) return null
  if (code <= 1) return 'sun'
  if (code === 2) return 'cloud-sun'
  if (code === 3) return 'cloud'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'cloud-rain'
  return null
}

export function classifyCloudCover(cover: number | null | undefined): Exclude<WeatherConditionIcon, 'cloud-rain'> | null {
  if (!finite(cover) || cover! < 0 || cover! > 100) return null
  if (cover! <= 20) return 'sun'
  if (cover! < 80) return 'cloud-sun'
  return 'cloud'
}

export function resolveHistoricalConditionsCompact(sample: HistoricalConditionsSample | null): {
  label: string
  icon: WeatherConditionIcon | null
  accessibleLabel: string
} | null {
  if (sample === null) return null
  const code = sample.weather_code
  const validCode = code !== null && code !== undefined && Number.isInteger(code) && code >= 0
  const icon = validCode ? classifyWeatherCode(code) : classifyCloudCover(sample.cloud_cover_pct)
  const hasDetail = validCode || classifyCloudCover(sample.cloud_cover_pct) !== null || [
    sample.air_temperature_c, sample.wind_direction_10m_deg, sample.wind_speed_10m_kn,
    sample.wind_gusts_10m_kn, sample.wave_height_m,
    sample.wave_direction_deg, sample.wave_period_s,
  ].some(finite)
  if (!hasDetail) return null

  const label = finite(sample.air_temperature_c) ? `${Math.round(sample.air_temperature_c!)}°C` : 'Weather'
  const condition = icon === 'sun' ? (validCode ? 'clear or mainly clear' : 'clear sky cover')
    : icon === 'cloud-sun' ? (validCode ? 'partly cloudy' : 'partly cloudy sky cover')
      : icon === 'cloud' ? (validCode ? 'overcast' : 'overcast sky cover')
        : icon === 'cloud-rain' ? 'drizzle, rain or showers' : null
  return {
    label,
    icon,
    accessibleLabel: `Historical modelled weather: ${label}${condition ? `, ${condition}` : ''}. Show details`,
  }
}

export function formatHistoricalConditionsCompact(
  sample: Pick<HistoricalConditionsSample,
    'air_temperature_c' | 'wind_speed_10m_kn' | 'wind_direction_10m_deg'>
    & Partial<Pick<HistoricalConditionsSample, 'wind_gusts_10m_kn'>>,
) {
  const values: string[] = []
  if (finite(sample.wind_direction_10m_deg)) {
    const direction = ((Math.round(sample.wind_direction_10m_deg!) % 360) + 360) % 360
    values.push(`${String(direction).padStart(3, '0')}°`)
  }
  if (finite(sample.wind_speed_10m_kn)) {
    const gust = finite(sample.wind_gusts_10m_kn)
      ? ` (${compactNumber(sample.wind_gusts_10m_kn!)})`
      : ''
    values.push(`${compactNumber(sample.wind_speed_10m_kn!)}${gust} kt`)
  }
  if (finite(sample.air_temperature_c)) {
    values.push(`${compactNumber(sample.air_temperature_c!)}°C`)
  }
  return values.length > 0 ? values.join(' · ') : null
}

export function formatHistoricalConditionsValue(
  value: number | null,
  unit: string,
) {
  return finite(value) ? `${compactNumber(value!)}${unit}` : null
}

export function formatHistoricalConditionsTime(timestamp: string) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return timestamp
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date) + ' UTC'
}

function formatProvider(provider: string) {
  const value = provider.trim()
  if (value.toLowerCase() === 'open-meteo') return 'Open-Meteo'
  return value
}

export function formatHistoricalConditionsSource(
  weatherProvider: string | null,
  marineProvider: string | null,
) {
  const weather = weatherProvider ? formatProvider(weatherProvider) : ''
  const marine = marineProvider ? formatProvider(marineProvider) : ''
  if (!weather && !marine) return 'Source: —'
  if (!weather || !marine || weather === marine) {
    return `Source: ${weather || marine}`
  }
  return `Sources: Weather: ${weather} · Marine: ${marine}`
}
