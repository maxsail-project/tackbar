import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { TrackSample } from '../types/track'
import type { SummaryMetrics } from '../utils/summaryMetrics'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import { resolveAnalysisWindowBrushRange } from '../utils/analysisWindow'
import {
  resolveTemporalPointerTimestamp,
  startTemporalPointerSelection,
  updateTemporalPointerSelection,
  type TemporalPointerSelection,
} from '../utils/metricChartZoom'
import {
  formatGpsTime,
  parsePlaybackSpeed,
  PLAYBACK_SPEEDS,
  type PlaybackSpeed,
} from '../utils/replay'
import {
  buildSogTimelinePath,
  prepareSogTimelinePoints,
  reduceSogTimelinePoints,
} from '../utils/sogTimeline'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import type { InferredSessionStart } from '../utils/sessionStarts'
import { formatAverageSog } from '../utils/metricPresentation'

const TIMELINE_POINT_BUDGET = 240
const ANALYSIS_WINDOW_DRAG_THRESHOLD_PX = 6
export const ANALYSIS_WINDOW_SOG_PLOT_BAND = { top: 32, bottom: 94 } as const
const SINGLE_ACTIVITY_TIMELINE_HEIGHT = 106
const COMPARISON_TIMELINE_HEIGHT = 132

export interface AnalysisWindowReplay {
  playbackTime: number
  isPlaying: boolean
  speed: PlaybackSpeed
  onTogglePlayback: () => void
  onSpeedChange: (speed: PlaybackSpeed) => void
}

interface AnalysisWindowProps {
  availableRange: AnalysisWindowRange | null
  analysisWindow: AnalysisWindowRange | null
  primarySamples: TrackSample[]
  comparisonSamples?: TrackSample[]
  maneuvers?: DisplayManeuver[]
  sessionStarts?: InferredSessionStart[]
  hasComparison?: boolean
  primaryMetrics?: SummaryMetrics | null
  comparisonMetrics?: SummaryMetrics | null
  primaryManeuverCount?: number | null
  comparisonManeuverCount?: number | null
  replay?: AnalysisWindowReplay | null
  onRangeChange: (requestedRange: AnalysisWindowRange) => void
  onManeuverSelect?: (event: DisplayManeuver) => void
  onSessionStartSelect?: (start: InferredSessionStart) => void
}

export function formatAnalysisWindowDuration(durationMilliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(durationMilliseconds / 1_000))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`
  }
  if (minutes > 0) {
    return `${minutes}m${String(seconds).padStart(2, '0')}s`
  }
  return `${seconds}s`
}

export function AnalysisWindowCompactSummary({
  activityRole,
  metrics,
  maneuverCount,
}: {
  activityRole: 'primary' | 'comparison'
  metrics: SummaryMetrics | null
  maneuverCount: number | null
}) {
  const roleLabel = activityRole === 'primary' ? 'P' : 'C'
  const averageSog = metrics === null ? '—' : formatAverageSog(metrics.avgSogKnots)
  const maximumSog = metrics?.maxSogKnots == null ? '—' : `${metrics.maxSogKnots.toFixed(2)} kt`
  const distance = metrics === null ? '—' : `${Math.round(metrics.distanceMeters)} m`
  const dominantCog = metrics?.dominantCogDegrees === null
    || metrics?.dominantCogDegrees === undefined
    ? '—'
    : `${metrics.dominantCogDegrees.toFixed(0)}°`
  return (
    <tr>
      <th scope="row" style={{ color: ACTIVITY_COLORS[activityRole] }} aria-label={activityRole === 'primary' ? 'Primary Activity' : 'Comparison Activity'}>{roleLabel}</th>
      <td>{averageSog}</td>
      <td>{maximumSog}</td>
      <td>{distance}</td>
      <td>{dominantCog}</td>
      <td>{maneuverCount ?? '—'}</td>
    </tr>
  )
}

function positionPercent(value: number, availableRange: AnalysisWindowRange) {
  const duration = availableRange.end - availableRange.start
  if (duration <= 0) return 0
  return Math.min(Math.max(
    ((value - availableRange.start) / duration) * 100,
    0,
  ), 100)
}

export function playbackCursorPositionPercent(
  playbackTime: number,
  analysisWindow: AnalysisWindowRange,
) {
  return positionPercent(playbackTime, analysisWindow)
}

export function isAnalysisWindowDrag(startClientX: number, endClientX: number) {
  return Number.isFinite(startClientX)
    && Number.isFinite(endClientX)
    && Math.abs(endClientX - startClientX) >= ANALYSIS_WINDOW_DRAG_THRESHOLD_PX
}

export function shouldCaptureAnalysisWindowPointer(
  startedOnMarker: boolean,
  startClientX: number,
  currentClientX: number,
) {
  return !startedOnMarker
    || isAnalysisWindowDrag(startClientX, currentClientX)
}

export function completeAnalysisWindowGesture(
  selection: TemporalPointerSelection | null,
  startClientX: number | null,
  endClientX: number,
  onRangeChange: (requestedRange: AnalysisWindowRange) => void,
) {
  if (
    selection === null
    || startClientX === null
    || !isAnalysisWindowDrag(startClientX, endClientX)
  ) return

  const requestedRange = resolveAnalysisWindowBrushRange(
    selection.start,
    selection.end,
  )
  if (requestedRange !== null) onRangeChange(requestedRange)
}

export function selectManeuverAfterPointerGesture(
  event: DisplayManeuver,
  pointerGestureWasDrag: boolean,
  onSelect: (event: DisplayManeuver) => void,
) {
  if (!pointerGestureWasDrag) onSelect(event)
}

export function resolveAnalysisWindowPointerTimestamp(
  displayRange: AnalysisWindowRange,
  clientX: number,
  bounds: Pick<DOMRect, 'left' | 'right'>,
) {
  return resolveTemporalPointerTimestamp(displayRange, clientX, bounds)
}

export function requestAnalysisWindowReset(
  availableRange: AnalysisWindowRange,
  onRangeChange: (requestedRange: AnalysisWindowRange) => void,
) {
  onRangeChange(availableRange)
}

export function AnalysisWindowManeuverMarker({
  event,
  position,
  onSelect,
}: {
  event: DisplayManeuver
  position: number
  onSelect: (event: DisplayManeuver) => void
}) {
  const roleLabel = event.activityRole === 'primary' ? 'P' : 'C'
  const className = [
    'analysis-window__maneuver-marker',
    `analysis-window__maneuver-marker--${event.activityRole}`,
    'analysis-window__maneuver-marker--active',
  ].join(' ')
  const style = {
    left: `${position}%`,
    color: ACTIVITY_COLORS[event.activityRole],
  }

  return (
    <div
      className={`analysis-window__maneuver-annotation analysis-window__maneuver-annotation--${event.activityRole}`}
      style={style}
    >
      <span className="analysis-window__maneuver-guide" aria-hidden="true" />
      <button
        type="button"
        className={className}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation()
          onSelect(event)
        }}
        aria-label={`Move replay to ${formatGpsTime(event.centerTimeMs)} UTC, Activity ${roleLabel}`}
      />
    </div>
  )
}

export function AnalysisWindowSessionStartMarker({
  start,
  position,
  controlOffsetPx = null,
  lane = 0,
  onSelect,
}: {
  start: InferredSessionStart
  position: number
  controlOffsetPx?: number | null
  lane?: 0 | 1
  onSelect: (start: InferredSessionStart) => void
}) {
  const wholeMilliseconds = Math.floor(start.time)
  const fractionalMilliseconds = start.time - wholeMilliseconds
  const accessibleTime = new Date(wholeMilliseconds).toISOString().replace(
    /Z$/,
    `${fractionalMilliseconds ? String(fractionalMilliseconds).slice(2) : ''} UTC`,
  )
  const edgeTransform = controlOffsetPx === null
    ? position === 0 ? 'translateX(0)' : position === 100 ? 'translateX(-100%)' : undefined
    : undefined
  const select = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onSelect(start)
  }
  return <div className="analysis-window__session-start" style={{ left: `${position}%` }}>
    <span className="analysis-window__session-start-guide" aria-hidden="true" />
    {(['top', 'bottom'] as const).map((end) => <button
      key={end}
      type="button"
      className={`analysis-window__session-start-control analysis-window__session-start-control--${end} analysis-window__session-start-control--lane-${lane}`}
      style={controlOffsetPx === null
        ? edgeTransform ? { transform: edgeTransform } : undefined
        : { left: `${controlOffsetPx}px` }}
      aria-label={`${start.label} Start at ${accessibleTime}, move replay`}
      onClick={select}
    ><span>{start.label}</span></button>)}
  </div>
}

export function sessionStartControlOffsets(
  starts: InferredSessionStart[],
  range: AnalysisWindowRange,
  width: number,
) {
  const controlHalfWidth = 18
  const controlSpacing = 38
  if (width <= 0 || starts.length === 0) return starts.map(() => null)
  const desired = starts.map((start) => positionPercent(start.time, range) * width / 100)
  const centers = desired.map((position) => Math.min(Math.max(position, controlHalfWidth), width - controlHalfWidth))
  if ((starts.length - 1) * controlSpacing <= width - 2 * controlHalfWidth) {
    for (let index = 1; index < centers.length; index += 1) {
      centers[index] = Math.max(centers[index], centers[index - 1] + controlSpacing)
    }
    if (centers[centers.length - 1] > width - controlHalfWidth) {
      centers[centers.length - 1] = width - controlHalfWidth
      for (let index = centers.length - 2; index >= 0; index -= 1) {
        centers[index] = Math.min(centers[index], centers[index + 1] - controlSpacing)
      }
    }
  }
  return centers.map((center, index) => center - desired[index])
}

export function sessionStartControlLayout(
  starts: InferredSessionStart[],
  range: AnalysisWindowRange,
  width: number,
) {
  const dense = width > 0 && starts.length * 38 > width
  const placements: { offsetPx: number | null, lane: 0 | 1 }[] = starts.map((_, index) => ({
    offsetPx: null,
    lane: dense ? index % 2 as 0 | 1 : 0,
  }))
  for (const lane of ([0, 1] as const)) {
    const indices = starts.flatMap((_, index) => placements[index].lane === lane ? [index] : [])
    const offsets = sessionStartControlOffsets(indices.map((index) => starts[index]), range, width)
    indices.forEach((index, position) => { placements[index].offsetPx = offsets[position] })
  }
  return { dense, placements }
}

export function AnalysisWindowResetButton({
  disabled,
  onReset,
}: {
  disabled: boolean
  onReset: () => void
}) {
  return (
    <button
      type="button"
      className="analysis-window__reset"
      disabled={disabled}
      onClick={onReset}
    >
      Reset
    </button>
  )
}

export default function AnalysisWindow({
  availableRange,
  analysisWindow,
  primarySamples,
  comparisonSamples = [],
  maneuvers = [],
  sessionStarts = [],
  hasComparison,
  primaryMetrics = null,
  comparisonMetrics = null,
  primaryManeuverCount = null,
  comparisonManeuverCount = null,
  replay = null,
  onRangeChange,
  onManeuverSelect = () => undefined,
  onSessionStartSelect = () => undefined,
}: AnalysisWindowProps) {
  const [pointerSelection, setPointerSelection] = useState<TemporalPointerSelection | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [timelineWidth, setTimelineWidth] = useState(0)
  const pointerSelectionRef = useRef<TemporalPointerSelection | null>(null)
  const pointerStartClientXRef = useRef<number | null>(null)
  const pointerStartedOnMarkerRef = useRef(false)
  const completedGestureWasDragRef = useRef(false)
  const displayRange = analysisWindow
  const primaryPoints = useMemo(
    () => displayRange === null ? [] : reduceSogTimelinePoints(
      prepareSogTimelinePoints(primarySamples, displayRange),
      TIMELINE_POINT_BUDGET,
    ),
    [displayRange, primarySamples],
  )
  const comparisonPoints = useMemo(
    () => displayRange === null ? [] : reduceSogTimelinePoints(
      prepareSogTimelinePoints(comparisonSamples, displayRange),
      TIMELINE_POINT_BUDGET,
    ),
    [comparisonSamples, displayRange],
  )
  const maximumSog = Math.max(
    1,
    ...primaryPoints.map((point) => point.sog ?? 0),
    ...comparisonPoints.map((point) => point.sog ?? 0),
  )

  useEffect(() => {
    pointerSelectionRef.current = null
    pointerStartClientXRef.current = null
    pointerStartedOnMarkerRef.current = false
    setPointerSelection(null)
  }, [displayRange?.end, displayRange?.start])

  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline) return
    const measure = () => setTimelineWidth(timeline.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(timeline)
    return () => observer.disconnect()
  }, [availableRange, analysisWindow])

  function updatePointerSelection(nextSelection: TemporalPointerSelection | null) {
    pointerSelectionRef.current = nextSelection
    setPointerSelection(nextSelection)
  }

  function pointerTimestamp(event: ReactPointerEvent<HTMLDivElement>) {
    if (displayRange === null) return null
    const bounds = event.currentTarget.getBoundingClientRect()
    return resolveAnalysisWindowPointerTimestamp(displayRange, event.clientX, bounds)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    const nextSelection = startTemporalPointerSelection(event.pointerId, pointerTimestamp(event))
    if (nextSelection === null) return

    const startedOnMarker = event.target instanceof Element
      && event.target.closest('.analysis-window__maneuver-marker, .analysis-window__session-start-control') !== null
    if (!startedOnMarker) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    pointerStartClientXRef.current = event.clientX
    pointerStartedOnMarkerRef.current = startedOnMarker
    completedGestureWasDragRef.current = false
    updatePointerSelection(nextSelection)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerSelectionRef.current?.pointerId !== event.pointerId) return
    if (
      pointerStartClientXRef.current !== null
      && !event.currentTarget.hasPointerCapture(event.pointerId)
      && shouldCaptureAnalysisWindowPointer(
        pointerStartedOnMarkerRef.current,
        pointerStartClientXRef.current,
        event.clientX,
      )
    ) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    updatePointerSelection(updateTemporalPointerSelection(
      pointerSelectionRef.current,
      event.pointerId,
      pointerTimestamp(event),
    ))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerSelectionRef.current?.pointerId !== event.pointerId) return
    const completed = updateTemporalPointerSelection(
      pointerSelectionRef.current,
      event.pointerId,
      pointerTimestamp(event),
    )
    updatePointerSelection(null)
    const gestureWasDrag = pointerStartClientXRef.current !== null
      && isAnalysisWindowDrag(pointerStartClientXRef.current, event.clientX)
    completedGestureWasDragRef.current = gestureWasDrag
    completeAnalysisWindowGesture(
      completed,
      pointerStartClientXRef.current,
      event.clientX,
      onRangeChange,
    )
    pointerStartClientXRef.current = null
    pointerStartedOnMarkerRef.current = false
  }

  function cancelPointerSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerSelectionRef.current?.pointerId === event.pointerId) {
      pointerStartClientXRef.current = null
      pointerStartedOnMarkerRef.current = false
      updatePointerSelection(null)
    }
  }

  if (availableRange === null || analysisWindow === null) {
    return (
      <section className="content-section" aria-labelledby="analysis-window-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker" id="analysis-window-title">Analysis window</p>
            <p className="section-description">Shared absolute GPS/UTC interval</p>
          </div>
        </div>
        <div className="window-placeholder">No Analysis Window for these Activities.</div>
      </section>
    )
  }

  const selectedRange = pointerSelection === null
    ? analysisWindow
    : {
        start: Math.min(pointerSelection.start, pointerSelection.end),
        end: Math.max(pointerSelection.start, pointerSelection.end),
      }
  const windowStartPercent = positionPercent(selectedRange.start, analysisWindow)
  const windowEndPercent = positionPercent(selectedRange.end, analysisWindow)
  const showsComparisonLane = hasComparison ?? (
    comparisonPoints.length > 0
    || maneuvers.some((event) => event.activityRole === 'comparison')
  )
  const visibleSessionStarts = sessionStarts.filter((start) => start.time >= analysisWindow.start && start.time <= analysisWindow.end)
  const sessionStartLayout = sessionStartControlLayout(visibleSessionStarts, analysisWindow, timelineWidth)
  const timelineHeight = (showsComparisonLane
    ? COMPARISON_TIMELINE_HEIGHT
    : SINGLE_ACTIVITY_TIMELINE_HEIGHT) + (sessionStartLayout.dense ? 40 : 0)
  const plotBand = sessionStartLayout.dense
    ? { top: 60, bottom: timelineHeight - 60 }
    : ANALYSIS_WINDOW_SOG_PLOT_BAND
  const comparisonPath = buildSogTimelinePath(
    comparisonPoints,
    analysisWindow,
    maximumSog,
    plotBand,
  )
  const centralPrimaryPath = buildSogTimelinePath(
    primaryPoints,
    analysisWindow,
    maximumSog,
    plotBand,
  )
  const isFullRange = analysisWindow.start === availableRange.start
    && analysisWindow.end === availableRange.end
  const playbackCursorPosition = replay === null
    ? null
    : playbackCursorPositionPercent(replay.playbackTime, analysisWindow)

  return (
    <section className="content-section analysis-window" aria-labelledby="analysis-window-title">
      <div className="section-heading">
        <div className="analysis-window__heading-copy">
          <p className="section-kicker" id="analysis-window-title">Analysis window</p>
          <span className="section-description">Drag SOG to select interval</span>
        </div>
        <div className="analysis-window__header-actions">
          {replay && (
            <select
              className="playback-speed-select analysis-window__speed"
              value={replay.speed}
              onChange={(event) => {
                const nextSpeed = parsePlaybackSpeed(event.target.value)
                if (nextSpeed !== null) replay.onSpeedChange(nextSpeed)
              }}
              aria-label="Playback speed"
            >
              {PLAYBACK_SPEEDS.map((option) => (
                <option key={option} value={option}>x{option}</option>
              ))}
            </select>
          )}
          <AnalysisWindowResetButton
            disabled={isFullRange}
            onReset={() => requestAnalysisWindowReset(availableRange, onRangeChange)}
          />
        </div>
      </div>

      <div className={`analysis-window__replay-row${replay === null ? ' analysis-window__replay-row--timeline-only' : ''}`}>
        {replay && (
          <button
            type="button"
            className="play-button analysis-window__play-button"
            onClick={replay.onTogglePlayback}
            aria-pressed={replay.isPlaying}
            aria-label={replay.isPlaying ? 'Pause replay' : 'Play replay'}
          >
            {replay.isPlaying ? '❚❚' : '▶'}
          </button>
        )}
        <div
          ref={timelineRef}
          className={`analysis-window__timeline${showsComparisonLane ? ' analysis-window__timeline--comparison' : ''}${sessionStartLayout.dense ? ' analysis-window__timeline--dense' : ''}`}
          style={sessionStartLayout.dense ? { height: `${timelineHeight}px` } : undefined}
          aria-label="SOG timeline; drag horizontally to select the Analysis Window"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={cancelPointerSelection}
          onPointerLeave={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) cancelPointerSelection(event)
          }}
          onLostPointerCapture={cancelPointerSelection}
          onKeyDownCapture={(event) => {
            if (event.key === 'Enter' || event.key === ' ') completedGestureWasDragRef.current = false
          }}
        >
          <svg viewBox={`0 0 1000 ${timelineHeight}`} preserveAspectRatio="none" aria-hidden="true">
            {centralPrimaryPath && <path className="analysis-window__sog-line" d={centralPrimaryPath} style={{ stroke: ACTIVITY_COLORS.primary }} />}
            {comparisonPath && <path className="analysis-window__sog-line" d={comparisonPath} style={{ stroke: ACTIVITY_COLORS.comparison }} />}
          </svg>
          {playbackCursorPosition !== null && (
            <div
              className="analysis-window__playback-cursor"
              style={{ left: `${playbackCursorPosition}%` }}
              aria-hidden="true"
            />
          )}
          <div className="analysis-window__maneuver-markers">
            {maneuvers
              .filter((event) => event.centerTimeMs >= analysisWindow.start
                && event.centerTimeMs <= analysisWindow.end)
              .map((event) => (
                <AnalysisWindowManeuverMarker
                  key={`${event.activityRole}:${event.maneuver.start_time}:${event.maneuver.center_time}:${event.maneuver.end_time}`}
                  event={event}
                  position={positionPercent(event.centerTimeMs, analysisWindow)}
                  onSelect={(selectedEvent) => {
                    selectManeuverAfterPointerGesture(
                      selectedEvent,
                      completedGestureWasDragRef.current,
                      onManeuverSelect,
                    )
                    completedGestureWasDragRef.current = false
                  }}
                />
              ))}
          </div>
          <div className="analysis-window__session-starts">
            {visibleSessionStarts
              .map((start, index) => <AnalysisWindowSessionStartMarker
                key={start.label}
                start={start}
                position={positionPercent(start.time, analysisWindow)}
                controlOffsetPx={sessionStartLayout.placements[index].offsetPx}
                lane={sessionStartLayout.placements[index].lane}
                onSelect={(selectedStart) => {
                  if (!completedGestureWasDragRef.current) onSessionStartSelect(selectedStart)
                  completedGestureWasDragRef.current = false
                }}
              />)}
          </div>
          {pointerSelection && (
            <div
              className="analysis-window__brush analysis-window__brush--provisional"
              style={{ left: `${windowStartPercent}%`, width: `${windowEndPercent - windowStartPercent}%` }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      <div className="analysis-window__summary-row" aria-live="polite">
        <span className="analysis-window__start-time">{formatGpsTime(selectedRange.start)}</span>
        <span className="analysis-window__duration">
          {formatAnalysisWindowDuration(selectedRange.end - selectedRange.start)}
        </span>
        <span className="analysis-window__end-time">{formatGpsTime(selectedRange.end)}</span>
      </div>
      <table className="analysis-window__summary-table" aria-label="Analysis Window Activity comparison" aria-live="polite">
        <thead><tr>
          <th scope="col" aria-label="Activity">P/C</th>
          <th scope="col">Avg SOG</th>
          <th scope="col">Max SOG</th>
          <th scope="col">Distance</th>
          <th scope="col">Dom COG</th>
          <th scope="col">Maneuvers</th>
        </tr></thead>
        <tbody>
          <AnalysisWindowCompactSummary activityRole="primary" metrics={primaryMetrics} maneuverCount={primaryManeuverCount} />
          {showsComparisonLane && <AnalysisWindowCompactSummary activityRole="comparison" metrics={comparisonMetrics} maneuverCount={comparisonManeuverCount} />}
        </tbody>
      </table>
    </section>
  )
}
