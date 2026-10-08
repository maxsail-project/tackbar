import { useCallback, useEffect, useMemo, useRef } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapRef,
} from 'react-map-gl/maplibre'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { MAP_STYLE_URL } from '../config/map'
import type { TrackSample } from '../types/track'
import {
  formatMetricValue,
  formatSignedDegreeValue,
} from '../utils/metricPresentation'
import { formatGpsTime, type TrackPosition } from '../utils/replay'
import type { ManeuverActivityRole } from '../utils/maneuverEvents'
import {
  buildTrackGeometry,
  combineTrackBounds,
  type TrackBounds,
} from '../utils/trackGeometry'

export interface MapFocusRequest {
  activityRole: ManeuverActivityRole
  requestId: number
}

interface TrackMapProps {
  primaryVisibleSamples: TrackSample[]
  comparisonVisibleSamples?: TrackSample[]
  fitContextKey: string
  focusRequest?: MapFocusRequest | null
  primaryActivityIdentity: string
  comparisonActivityIdentity?: string | null
  primaryBoatPosition: TrackPosition | null
  comparisonBoatPosition?: TrackPosition | null
  hasComparison?: boolean
  playbackTime: number
  primarySog: number | null
  primaryCog: number | null
  primaryHeel: number | null
  primaryTrim: number | null
  comparisonSog?: number | null
  comparisonCog?: number | null
  comparisonHeel?: number | null
  comparisonTrim?: number | null
}

interface MapTelemetryOverlayProps {
  hasComparison: boolean
  primaryActivityIdentity: string
  comparisonActivityIdentity: string | null
  playbackTime: number
  primarySog: number | null
  primaryCog: number | null
  primaryHeel: number | null
  primaryTrim: number | null
  comparisonSog: number | null
  comparisonCog: number | null
  comparisonHeel: number | null
  comparisonTrim: number | null
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

const MANEUVER_FOCUS_VERTICAL_OFFSET_RATIO = 0.125

export function boatMarkerRotation(cog: number | null) {
  return cog ?? 0
}

export function formatMapCogValue(cog: number | null) {
  if (cog === null) return '—'

  const roundedCog = Math.round(cog)
  const normalizedCog = ((roundedCog % 360) + 360) % 360
  return `${normalizedCog}°`
}

export function createMapFitContextKey(
  primaryActivityId: string,
  comparisonActivityId: string | null,
  windowStart: number | null,
  windowEnd: number | null,
) {
  return [
    primaryActivityId,
    comparisonActivityId ?? '',
    windowStart ?? '',
    windowEnd ?? '',
  ].join(':')
}

export function shouldRefitForContextChange(
  previousFitContextKey: string | null,
  fitContextKey: string,
) {
  return previousFitContextKey !== fitContextKey
}

export function currentVisibleTrackBounds(
  primaryBounds: TrackBounds | null,
  comparisonBounds: TrackBounds | null,
) {
  const bounds = [primaryBounds, comparisonBounds]
    .filter((candidate): candidate is TrackBounds => candidate !== null)
  return bounds.length > 0 ? combineTrackBounds(bounds) : null
}

export function resolveMapFocusPosition(
  focusRequest: MapFocusRequest,
  primaryBoatPosition: TrackPosition | null,
  comparisonBoatPosition: TrackPosition | null,
) {
  return focusRequest.activityRole === 'primary'
    ? primaryBoatPosition
    : comparisonBoatPosition
}

export function maneuverFocusCameraOptions(
  position: TrackPosition,
  mapHeight?: number | null,
) {
  const verticalOffset = mapHeight !== null
    && mapHeight !== undefined
    && Number.isFinite(mapHeight)
    && mapHeight > 0
    ? -mapHeight * MANEUVER_FOCUS_VERTICAL_OFFSET_RATIO
    : 0

  return {
    center: [position.lon, position.lat] as [number, number],
    offset: [0, verticalOffset] as [number, number],
  }
}

function BoatMarker({
  color,
  cog,
  label,
}: {
  color: string
  cog: number | null
  label: string
}) {
  return (
    <div className="boat-marker" role="img" aria-label={label}>
      <span
        aria-hidden="true"
        className="boat-marker__hull"
        style={{
          color,
          transform: `rotate(${boatMarkerRotation(cog)}deg)`,
        }}
      />
    </div>
  )
}

export function MapTelemetryOverlay({
  hasComparison,
  primaryActivityIdentity,
  comparisonActivityIdentity,
  playbackTime,
  primarySog,
  primaryCog,
  primaryHeel,
  primaryTrim,
  comparisonSog,
  comparisonCog,
  comparisonHeel,
  comparisonTrim,
}: MapTelemetryOverlayProps) {
  const gpsTime = formatGpsTime(playbackTime)

  return (
    <div className="map-status" aria-label="Current replay GPS time and SOG/COG/HEEL/TRIM telemetry">
      <table
        className="map-status__telemetry"
        aria-label="Instantaneous boat telemetry"
      >
        <colgroup>
          <col className="map-status__activity-column" />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="map-status__gps-time"
              aria-label={`GPS time ${gpsTime} UTC`}
            >
              <span aria-hidden="true">
                <span>GPS</span>
                <strong>{gpsTime}</strong>
              </span>
            </th>
            <th scope="col">SOG</th>
            <th scope="col">COG</th>
            <th scope="col">HEEL</th>
            <th scope="col">TRIM</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              <span className="map-status__activity-identity">
                <span
                  aria-hidden="true"
                  className="map-status__activity-indicator"
                  style={{ backgroundColor: ACTIVITY_COLORS.primary }}
                />
                <span className="map-status__activity-role">P</span>
                <span
                  className="map-status__activity-name"
                  title={primaryActivityIdentity}
                >
                  {primaryActivityIdentity}
                </span>
              </span>
            </th>
            <td>{formatMetricValue('SOG', primarySog)}</td>
            <td>{formatMapCogValue(primaryCog)}</td>
            <td>{formatSignedDegreeValue(primaryHeel)}</td>
            <td>{formatSignedDegreeValue(primaryTrim)}</td>
          </tr>
          {hasComparison && (
            <tr>
              <th scope="row">
                <span className="map-status__activity-identity">
                  <span
                    aria-hidden="true"
                    className="map-status__activity-indicator"
                    style={{ backgroundColor: ACTIVITY_COLORS.comparison }}
                  />
                  <span className="map-status__activity-role">C</span>
                  <span
                    className="map-status__activity-name"
                    title={comparisonActivityIdentity ?? ''}
                  >
                    {comparisonActivityIdentity}
                  </span>
                </span>
              </th>
              <td>{formatMetricValue('SOG', comparisonSog)}</td>
              <td>{formatMapCogValue(comparisonCog)}</td>
              <td>{formatSignedDegreeValue(comparisonHeel)}</td>
              <td>{formatSignedDegreeValue(comparisonTrim)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function TrackMap({
  primaryVisibleSamples,
  comparisonVisibleSamples = [],
  fitContextKey,
  focusRequest = null,
  primaryActivityIdentity,
  comparisonActivityIdentity = null,
  primaryBoatPosition,
  comparisonBoatPosition = null,
  hasComparison = false,
  playbackTime,
  primarySog,
  primaryCog,
  primaryHeel,
  primaryTrim,
  comparisonSog = null,
  comparisonCog = null,
  comparisonHeel = null,
  comparisonTrim = null,
}: TrackMapProps) {
  const mapRef = useRef<MapRef>(null)
  const fittedContextKeyRef = useRef<string | null>(null)
  const handledFocusRequestIdRef = useRef<number | null>(null)
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
  const combinedBounds = useMemo(
    () => currentVisibleTrackBounds(
      primaryGeometry?.bounds ?? null,
      comparisonGeometry?.bounds ?? null,
    ),
    [comparisonGeometry, primaryGeometry],
  )
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
    if (!shouldRefitForContextChange(
      fittedContextKeyRef.current,
      fitContextKey,
    )) return

    fittedContextKeyRef.current = fitContextKey
    fitTrack()
  }, [fitContextKey, fitTrack])

  useEffect(() => {
    if (
      focusRequest === null
      || handledFocusRequestIdRef.current === focusRequest.requestId
      || mapRef.current === null
    ) return

    handledFocusRequestIdRef.current = focusRequest.requestId
    const focusPosition = resolveMapFocusPosition(
      focusRequest,
      primaryBoatPosition,
      comparisonBoatPosition,
    )
    if (focusPosition === null) return

    const mapHeight = mapRef.current.getContainer().clientHeight
    mapRef.current.easeTo(maneuverFocusCameraOptions(focusPosition, mapHeight))
  }, [comparisonBoatPosition, focusRequest, primaryBoatPosition])

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
        <NavigationControl position="top-right" />
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
            <BoatMarker
              color={ACTIVITY_COLORS.primary}
              cog={primaryCog}
              label="Primary boat position"
            />
          </Marker>
        )}
        {comparisonBoatPosition && (
          <Marker
            longitude={comparisonBoatPosition.lon}
            latitude={comparisonBoatPosition.lat}
            anchor="center"
          >
            <BoatMarker
              color={ACTIVITY_COLORS.comparison}
              cog={comparisonCog}
              label="Comparison boat position"
            />
          </Marker>
        )}
      </Map>
      <MapTelemetryOverlay
        hasComparison={hasComparison}
        primaryActivityIdentity={primaryActivityIdentity}
        comparisonActivityIdentity={comparisonActivityIdentity}
        playbackTime={playbackTime}
        primarySog={primarySog}
        primaryCog={primaryCog}
        primaryHeel={primaryHeel}
        primaryTrim={primaryTrim}
        comparisonSog={comparisonSog}
        comparisonCog={comparisonCog}
        comparisonHeel={comparisonHeel}
        comparisonTrim={comparisonTrim}
      />
    </section>
  )
}
