import type { PointerEvent } from 'react'
import type { HistoricalConditionsSample } from '../types/session'
import {
  formatHistoricalConditionsCompact,
  formatHistoricalConditionsSource,
  formatHistoricalConditionsTime,
  formatHistoricalConditionsValue,
} from '../utils/historicalConditions'

function stopMapInteraction(event: PointerEvent) {
  event.stopPropagation()
}

export default function HistoricalConditionsControl({
  sample,
  weatherProvider,
  marineProvider,
  expanded,
  onExpandedChange,
}: {
  sample: HistoricalConditionsSample | null
  weatherProvider: string | null
  marineProvider: string | null
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  if (sample === null) return null
  const compact = formatHistoricalConditionsCompact(sample)
  if (compact === null) return null

  return (
    <div className="map-conditions" onPointerDown={stopMapInteraction}>
      <button
        type="button"
        className="map-conditions__chip"
        aria-expanded={expanded}
        aria-controls="map-conditions-detail"
        onClick={() => onExpandedChange(!expanded)}
      >
        {compact}
      </button>
      {expanded && <HistoricalConditionsDetail
        sample={sample}
        weatherProvider={weatherProvider}
        marineProvider={marineProvider}
      />}
    </div>
  )
}

export function HistoricalConditionsDetail({
  sample,
  weatherProvider,
  marineProvider,
}: {
  sample: HistoricalConditionsSample
  weatherProvider: string | null
  marineProvider: string | null
}) {
  const source = formatHistoricalConditionsSource(weatherProvider, marineProvider)
  const details = [
    ['Wind direction', formatHistoricalConditionsValue(sample.wind_direction_10m_deg, '°')],
    ['Wind speed', formatHistoricalConditionsValue(sample.wind_speed_10m_kn, ' kt')],
    ['Gusts', formatHistoricalConditionsValue(sample.wind_gusts_10m_kn, ' kt')],
    ['Temperature', formatHistoricalConditionsValue(sample.air_temperature_c, '°C')],
    ['Cloud cover', formatHistoricalConditionsValue(sample.cloud_cover_pct, '%')],
    ['Wave height', formatHistoricalConditionsValue(sample.wave_height_m, ' m')],
    ['Wave direction', formatHistoricalConditionsValue(sample.wave_direction_deg, '°')],
    ['Wave period', formatHistoricalConditionsValue(sample.wave_period_s, ' s')],
    ['Sample time', formatHistoricalConditionsTime(sample.time)],
  ].filter((item): item is [string, string] => item[1] !== null)

  return (
    <section
      id="map-conditions-detail"
      className="map-conditions__detail"
      aria-label="Historical modelled conditions"
    >
      <dl>
        {details.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {source && <p className="map-conditions__source">{source}</p>}
    </section>
  )
}
