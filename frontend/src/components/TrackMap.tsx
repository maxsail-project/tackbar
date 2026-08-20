import Map from 'react-map-gl/maplibre'
import { INITIAL_MAP_VIEW, MAP_STYLE_URL } from '../config/map'
import type { SailingMetric } from '../types/session'

interface TrackMapProps {
  metric: SailingMetric
}

export default function TrackMap({ metric }: TrackMapProps) {
  return (
    <section className="map-panel" aria-label="Session track map">
      <Map
        initialViewState={INITIAL_MAP_VIEW}
        mapStyle={MAP_STYLE_URL}
        attributionControl={{ compact: true }}
      />
      <div className="map-status" aria-label="Future map status">
        <span>GPS time</span>
        <strong>11:24:18</strong>
        <span className="map-status__metric">Metric · {metric}</span>
      </div>
      <div className="track-placeholder" aria-hidden="true">
        <span className="track-placeholder__line" />
        <span className="track-placeholder__boat">●</span>
      </div>
    </section>
  )
}
