import { useCallback, useEffect, useMemo, useRef } from 'react'
import Map, {
  Layer,
  Marker,
  Source,
  type MapRef,
} from 'react-map-gl/maplibre'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { MAP_STYLE_URL } from '../config/map'
import type { TrackSample } from '../types/track'
import { formatMetricValue } from '../utils/metricPresentation'
import { formatGpsTime, type TrackPosition } from '../utils/replay'
import { buildTrackGeometry, combineTrackBounds } from '../utils/trackGeometry'

interface TrackMapProps {
  primaryVisibleSamples: TrackSample[]
  comparisonVisibleSamples?: TrackSample[]
  primaryBoatPosition: TrackPosition | null
  comparisonBoatPosition?: TrackPosition | null
  hasComparison?: boolean
  playbackTime: number
  primarySog: number | null
  primaryCog: number | null
  comparisonSog?: number | null
  comparisonCog?: number | null
}

const PRIMARY_TRACK_PAINT = {
  'line-color': ACTIVITY_COLORS.primary,
  'line-opacity': 0.92,
  'line-width': 4,
}

const COMPARISON_TRACK_PAINT = {
  'line-color': ACTIVITY_COLORS.comparison,
  'line-opacity': 0.88,
  'line-width': 4,
}

const TRACK_LAYOUT = {
  'line-cap': 'round' as const,
  'line-join': 'round' as const,
}

const FIT_OPTIONS = {
  padding: { top: 42, right: 42, bottom: 106, left: 42 },
  duration: 0,
}

export default function TrackMap({
  primaryVisibleSamples,
  comparisonVisibleSamples = [],
  primaryBoatPosition,
  comparisonBoatPosition = null,
  hasComparison = false,
  playbackTime,
  primarySog,
  primaryCog,
  comparisonSog = null,
  comparisonCog = null,
}: TrackMapProps) {
  const mapRef = useRef<MapRef>(null)
  const primaryGeometry = useMemo(
    () => primaryVisibleSamples.length >= 2
      ? buildTrackGeometry(primaryVisibleSamples)
      : null,
    [primaryVisibleSamples],
  )
  const comparisonGeometry = useMemo(
    () => comparisonVisibleSamples.length >= 2
      ? buildTrackGeometry(comparisonVisibleSamples)
      : null,
    [comparisonVisibleSamples],
  )
  const combinedBounds = useMemo(() => {
    const bounds = [primaryGeometry?.bounds, comparisonGeometry?.bounds]
      .filter((candidate) => candidate !== undefined)
    return bounds.length > 0 ? combineTrackBounds(bounds) : null
  }, [comparisonGeometry, primaryGeometry])
  const windowFocus = primaryVisibleSamples[0]
  const fitTrack = useCallback(() => {
    if (!mapRef.current || !windowFocus) return

    if (combinedBounds) {
      mapRef.current.fitBounds(combinedBounds, FIT_OPTIONS)
      return
    }

    mapRef.current.jumpTo({
      center: [windowFocus.lon, windowFocus.lat],
      zoom: 14,
    })
  }, [combinedBounds, windowFocus])

  useEffect(() => {
    fitTrack()
  }, [fitTrack])

  if (!windowFocus) return null

  return (
    <section className="map-panel" aria-label="Session track map">
      <Map
        ref={mapRef}
        initialViewState={combinedBounds
          ? {
              bounds: combinedBounds,
              fitBoundsOptions: FIT_OPTIONS,
            }
          : {
              longitude: windowFocus.lon,
              latitude: windowFocus.lat,
              zoom: 14,
            }}
        mapStyle={MAP_STYLE_URL}
        attributionControl={{ compact: true }}
        onLoad={fitTrack}
      >
        {primaryGeometry && (
          <Source
            id="primary-activity-track"
            type="geojson"
            data={primaryGeometry.geoJson}
          >
            <Layer
              id="primary-activity-track-line"
              type="line"
              paint={PRIMARY_TRACK_PAINT}
              layout={TRACK_LAYOUT}
            />
          </Source>
        )}
        {comparisonGeometry && (
          <Source
            id="comparison-activity-track"
            type="geojson"
            data={comparisonGeometry.geoJson}
          >
            <Layer
              id="comparison-activity-track-line"
              type="line"
              paint={COMPARISON_TRACK_PAINT}
              layout={TRACK_LAYOUT}
            />
          </Source>
        )}
        {primaryBoatPosition && (
          <Marker
            longitude={primaryBoatPosition.lon}
            latitude={primaryBoatPosition.lat}
            anchor="center"
          >
            <div
              className="boat-marker"
              style={{ backgroundColor: ACTIVITY_COLORS.primary }}
              role="img"
              aria-label="Primary boat position"
            >
              <span aria-hidden="true">P</span>
            </div>
          </Marker>
        )}
        {comparisonBoatPosition && (
          <Marker
            longitude={comparisonBoatPosition.lon}
            latitude={comparisonBoatPosition.lat}
            anchor="center"
          >
            <div
              className="boat-marker"
              style={{ backgroundColor: ACTIVITY_COLORS.comparison }}
              role="img"
              aria-label="Comparison boat position"
            >
              <span aria-hidden="true">C</span>
            </div>
          </Marker>
        )}
      </Map>
      <div
        className="map-status"
        aria-label="Current replay GPS time and SOG/COG telemetry"
      >
        <div className="map-status__time">
          <span>GPS time</span>
          <strong>{formatGpsTime(playbackTime)}</strong>
        </div>
        <div className="map-status__telemetry">
          <span className="map-status__telemetry-row">
            P · SOG {formatMetricValue('SOG', primarySog)} · COG {formatMetricValue('COG', primaryCog)}
          </span>
          {hasComparison && (
            <span className="map-status__telemetry-row">
              C · SOG {formatMetricValue('SOG', comparisonSog)} · COG {formatMetricValue('COG', comparisonCog)}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
