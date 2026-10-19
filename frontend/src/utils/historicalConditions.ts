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

function finite(value: number | null) {
  return value !== null && Number.isFinite(value)
}

function compactNumber(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatHistoricalConditionsCompact(
  sample: Pick<HistoricalConditionsSample,
    'air_temperature_c' | 'wind_speed_10m_kn' | 'wind_direction_10m_deg'>,
) {
  const values: string[] = []
  if (finite(sample.wind_direction_10m_deg)) {
    const direction = ((Math.round(sample.wind_direction_10m_deg!) % 360) + 360) % 360
    values.push(`${String(direction).padStart(3, '0')}°`)
  }
  if (finite(sample.wind_speed_10m_kn)) {
    values.push(`${compactNumber(sample.wind_speed_10m_kn!)} kt`)
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
