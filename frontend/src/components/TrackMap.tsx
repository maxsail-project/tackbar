import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
} from 'react-map-gl/maplibre'
import { ACTIVITY_COLORS } from '../config/activityColors'
import HistoricalConditionsControl from './HistoricalConditionsControl'
import { MAP_STYLE_URL } from '../config/map'
import type { TrackSample } from '../types/track'
import type { HistoricalConditionsSample } from '../types/session'
import {
  formatMetricValue,
  formatSignedDegreeValue,
} from '../utils/metricPresentation'
import { formatGpsTime, type TrackPosition } from '../utils/replay'
import type { ManeuverActivityRole } from '../utils/maneuverEvents'
import type { SelectedManeuverHighlight } from '../utils/selectedManeuverGeometry'
import {
  buildTrackGeometry,
  combineTrackBounds,
  type TrackBounds,
} from '../utils/trackGeometry'

export interface MapFocusRequest {
  activityRole: ManeuverActivityRole
  requestId: number
}

export interface ContextualMapActivity {
  id: string
  identity: string
  visibleSamples: TrackSample[]
  boatPosition: TrackPosition | null
  cog: number | null
}

interface TrackMapProps {
  primaryVisibleSamples: TrackSample[]
  comparisonVisibleSamples?: TrackSample[]
  contextualActivities?: ContextualMapActivity[]
  fitContextKey: string
  focusRequest?: MapFocusRequest | null
  selectedManeuverHighlights?: SelectedManeuverHighlight[]
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
  onCompareContextualActivity?: (activityId: string) => void
  historicalConditionsSample?: HistoricalConditionsSample | null
  historicalConditionsWeatherProvider?: string | null
  historicalConditionsMarineProvider?: string | null
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

export function selectedManeuverHighlightPaint(
  activityRole: ManeuverActivityRole,
  layer: 'halo' | 'trajectory',
) {
  return layer === 'halo'
    ? { 'line-color': '#fff', 'line-opacity': 0.72, 'line-width': 8 }
    : { 'line-color': ACTIVITY_COLORS[activityRole], 'line-opacity': 0.96, 'line-width': 4.5 }
}

const CONTEXTUAL_TRACK_PAINT = {
  'line-color': ACTIVITY_COLORS.contextual,
  'line-opacity': 0.42,
  'line-width': 2,
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

export function boatMarkerRotation(cog: number | null, mapBearing = 0) {
  if (cog === null) return 0

  return ((cog - mapBearing) % 360 + 360) % 360
}

export function formatMapCogValue(cog: number | null) {
  if (cog === null) return '—'

  const roundedCog = Math.round(cog)
  const normalizedCog = ((roundedCog % 360) + 360) % 360
  return `${normalizedCog}°`
}

export function formatMapBearing(mapBearing: number) {
  const roundedBearing = Math.round(mapBearing)
  const normalizedBearing = ((roundedBearing % 360) + 360) % 360
  return `${String(normalizedBearing).padStart(3, '0')}°`
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

export function trackFitOptions(mapBearing: number) {
  return {
    ...FIT_OPTIONS,
    bearing: mapBearing,
  }
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
  mapBearing,
}: {
  color: string
  cog: number | null
  label: string
  mapBearing: number
}) {
  return (
    <div className="boat-marker" role="img" aria-label={label}>
      <span
        aria-hidden="true"
        className="boat-marker__hull"
        style={{
          color,
          transform: `rotate(${boatMarkerRotation(cog, mapBearing)}deg)`,
        }}
      />
    </div>
  )
}

export function openContextualActivityPopup(
  activityId: string,
  event: { stopPropagation: () => void },
) {
  event.stopPropagation()
  return activityId
}

export function ContextualActivityAffordance({
  identity,
  onCompare,
}: {
  identity: string
  onCompare: () => void
}) {
  return (
    <div className="contextual-activity-affordance">
      <strong>{identity}</strong>
      <button type="button" onClick={onCompare}>Compare</button>
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

export function mapWeatherDetailDismissHandlers(onDismiss: () => void) {
  return {
    onClick: onDismiss,
    onDragStart: onDismiss,
    onZoomStart: onDismiss,
    onRotateStart: onDismiss,
    onMoveStart: onDismiss,
  }
}

export default function TrackMap({
  primaryVisibleSamples,
  comparisonVisibleSamples = [],
  contextualActivities = [],
  fitContextKey,
  focusRequest = null,
  selectedManeuverHighlights = [],
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
  onCompareContextualActivity,
  historicalConditionsSample = null,
  historicalConditionsWeatherProvider = null,
  historicalConditionsMarineProvider = null,
}: TrackMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [mapBearing, setMapBearing] = useState(0)
  const [weatherDetailExpanded, setWeatherDetailExpanded] = useState(false)
  const [inspectedContextualActivityId, setInspectedContextualActivityId] = useState<string | null>(null)
  const fittedContextKeyRef = useRef<string | null>(null)
  const handledFocusRequestIdRef = useRef<number | null>(null)
  const dismissWeatherDetail = useCallback(
    () => setWeatherDetailExpanded(false),
    [],
  )
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
  const contextualGeometryKey = contextualActivities.map((activity) => [
    activity.id,
    activity.visibleSamples.length,
    activity.visibleSamples[0]?.utc ?? '',
    activity.visibleSamples[activity.visibleSamples.length - 1]?.utc ?? '',
  ].join(':')).join('|')
  const contextualGeometries = useMemo(
    () => contextualActivities.map((activity) => ({
      activity,
      geometry: activity.visibleSamples.length >= 2
        ? buildTrackGeometry(activity.visibleSamples)
        : null,
    })),
    // Replay updates marker state, but geometry changes only with Activities/window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextualGeometryKey],
  )
  const combinedBounds = useMemo(
    () => currentVisibleTrackBounds(
      primaryGeometry?.bounds ?? null,
      comparisonGeometry?.bounds ?? null,
    ),
    [comparisonGeometry, primaryGeometry],
  )
  const windowFocus = primaryVisibleSamples[0]
  const inspectedContextualActivity = contextualActivities.find(
    (activity) => activity.id === inspectedContextualActivityId,
  ) ?? null
  const fitTrack = useCallback(() => {
    if (!mapRef.current || !windowFocus) return

    if (combinedBounds) {
      mapRef.current.fitBounds(
        combinedBounds,
        trackFitOptions(mapRef.current.getBearing()),
      )
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

  useEffect(() => {
    if (
      inspectedContextualActivityId !== null
      && !contextualActivities.some(
        (activity) => activity.id === inspectedContextualActivityId,
      )
    ) {
      setInspectedContextualActivityId(null)
    }
  }, [contextualActivities, inspectedContextualActivityId])

  useEffect(() => {
    dismissWeatherDetail()
  }, [
    dismissWeatherDetail,
    fitContextKey,
    focusRequest?.requestId,
    historicalConditionsSample?.time,
    playbackTime,
  ])

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
        {...mapWeatherDetailDismissHandlers(dismissWeatherDetail)}
        onLoad={fitTrack}
        onRotate={(event) => setMapBearing(event.viewState.bearing)}
      >
        <NavigationControl position="top-right" />
        {contextualGeometries.map(({ activity, geometry }) => geometry && (
          <Source
            key={activity.id}
            id={`contextual-activity-track-${activity.id}`}
            type="geojson"
            data={geometry.geoJson}
          >
            <Layer
              id={`contextual-activity-track-line-${activity.id}`}
              type="line"
              paint={CONTEXTUAL_TRACK_PAINT}
              layout={TRACK_LAYOUT}
            />
          </Source>
        ))}
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
        {selectedManeuverHighlights.map((highlight) => (
          <Source
            key={`halo-${highlight.selectionIndex}`}
            id={`selected-maneuver-halo-${highlight.selectionIndex}`}
            type="geojson"
            data={highlight.geoJson}
          >
            <Layer
              id={`selected-maneuver-highlight-halo-${highlight.selectionIndex}`}
              type="line"
              paint={selectedManeuverHighlightPaint(highlight.activityRole, 'halo')}
              layout={TRACK_LAYOUT}
            />
          </Source>
        ))}
        {selectedManeuverHighlights.map((highlight) => (
          <Source
            key={`trajectory-${highlight.selectionIndex}`}
            id={`selected-maneuver-trajectory-${highlight.selectionIndex}`}
            type="geojson"
            data={highlight.geoJson}
          >
            <Layer
              id={`selected-maneuver-highlight-line-${highlight.selectionIndex}`}
              type="line"
              paint={selectedManeuverHighlightPaint(highlight.activityRole, 'trajectory')}
              layout={TRACK_LAYOUT}
            />
          </Source>
        ))}
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
              mapBearing={mapBearing}
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
              mapBearing={mapBearing}
            />
          </Marker>
        )}
        {contextualActivities.map((activity) => activity.boatPosition && (
          <Marker
            key={activity.id}
            longitude={activity.boatPosition.lon}
            latitude={activity.boatPosition.lat}
            anchor="center"
          >
            <button
              type="button"
              className="contextual-boat-marker"
              aria-label={`Inspect ${activity.identity}`}
              onClick={(event) => {
                setInspectedContextualActivityId(
                  openContextualActivityPopup(activity.id, event),
                )
              }}
            >
              <BoatMarker
                color={ACTIVITY_COLORS.contextual}
                cog={activity.cog}
                label={`${activity.identity} contextual boat position`}
                mapBearing={mapBearing}
              />
            </button>
          </Marker>
        ))}
        {inspectedContextualActivity?.boatPosition && (
          <Popup
            longitude={inspectedContextualActivity.boatPosition.lon}
            latitude={inspectedContextualActivity.boatPosition.lat}
            anchor="bottom"
            offset={18}
            closeOnClick
            onClose={() => setInspectedContextualActivityId(null)}
            className="contextual-activity-popup"
          >
            <ContextualActivityAffordance
              identity={inspectedContextualActivity.identity}
              onCompare={() => {
                setInspectedContextualActivityId(null)
                onCompareContextualActivity?.(inspectedContextualActivity.id)
              }}
            />
          </Popup>
        )}
      </Map>
      <div
        className="map-bearing"
        aria-label={`Map direction ${formatMapBearing(mapBearing)}`}
      >
        <span>DIR</span>
        <strong>{formatMapBearing(mapBearing)}</strong>
      </div>
      <HistoricalConditionsControl
        sample={historicalConditionsSample}
        weatherProvider={historicalConditionsWeatherProvider}
        marineProvider={historicalConditionsMarineProvider}
        expanded={weatherDetailExpanded}
        onExpandedChange={setWeatherDetailExpanded}
      />
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
