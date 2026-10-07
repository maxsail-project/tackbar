import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import { resolveAnalysisWindowBrushRange } from '../utils/analysisWindow'
import {
  resolveTemporalPointerTimestamp,
  startTemporalPointerSelection,
  updateTemporalPointerSelection,
  type TemporalPointerSelection,
} from '../utils/metricChartZoom'
import { formatGpsTime } from '../utils/replay'
import {
  buildSogTimelinePath,
  prepareSogTimelinePoints,
  reduceSogTimelinePoints,
} from '../utils/sogTimeline'
import type { DisplayManeuver } from '../utils/maneuverEvents'

const TIMELINE_POINT_BUDGET = 240

interface AnalysisWindowProps {
  availableRange: AnalysisWindowRange | null
  analysisWindow: AnalysisWindowRange | null
  primarySamples: TrackSample[]
  comparisonSamples?: TrackSample[]
  maneuvers?: DisplayManeuver[]
  onRangeChange: (requestedRange: AnalysisWindowRange) => void
  onManeuverSelect?: (centerTimeMs: number) => void
}

function formatDuration(durationMilliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(durationMilliseconds / 1_000))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  return [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    seconds > 0 || totalSeconds === 0 ? `${seconds}s` : null,
  ].filter(Boolean).join(' ')
}

function positionPercent(value: number, availableRange: AnalysisWindowRange) {
  const duration = availableRange.end - availableRange.start
  if (duration <= 0) return 0
  return Math.min(Math.max(
    ((value - availableRange.start) / duration) * 100,
    0,
  ), 100)
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
  onSelect: (centerTimeMs: number) => void
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
    <button
      type="button"
      className={className}
      style={style}
      onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onSelect(event.centerTimeMs)
      }}
      aria-label={`Move replay to ${formatGpsTime(event.centerTimeMs)} UTC, Activity ${roleLabel}`}
    />
  )
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
  onRangeChange,
  onManeuverSelect = () => undefined,
}: AnalysisWindowProps) {
  const [pointerSelection, setPointerSelection] = useState<TemporalPointerSelection | null>(null)
  const pointerSelectionRef = useRef<TemporalPointerSelection | null>(null)
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
    setPointerSelection(null)
  }, [displayRange?.end, displayRange?.start])

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

    event.currentTarget.setPointerCapture(event.pointerId)
    updatePointerSelection(nextSelection)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerSelectionRef.current?.pointerId !== event.pointerId) return
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
    const requestedRange = resolveAnalysisWindowBrushRange(
      completed?.start ?? null,
      completed?.end ?? null,
    )
    if (requestedRange !== null) onRangeChange(requestedRange)
  }

  function cancelPointerSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerSelectionRef.current?.pointerId === event.pointerId) {
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
  const primaryPath = buildSogTimelinePath(primaryPoints, analysisWindow, maximumSog)
  const comparisonPath = buildSogTimelinePath(comparisonPoints, analysisWindow, maximumSog)
  const isFullRange = analysisWindow.start === availableRange.start
    && analysisWindow.end === availableRange.end

  return (
    <section className="content-section analysis-window" aria-labelledby="analysis-window-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="analysis-window-title">Analysis window</p>
          <p className="section-description">Drag over SOG to select the shared interval</p>
        </div>
        <div className="analysis-window__header-actions">
          <AnalysisWindowResetButton
            disabled={isFullRange}
            onReset={() => requestAnalysisWindowReset(availableRange, onRangeChange)}
          />
          <span className="duration-pill">
            {formatDuration(selectedRange.end - selectedRange.start)}
          </span>
        </div>
      </div>

      <div
        className="analysis-window__timeline"
        aria-label="SOG timeline; drag horizontally to select the Analysis Window"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelPointerSelection}
        onPointerLeave={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) cancelPointerSelection(event)
        }}
        onLostPointerCapture={cancelPointerSelection}
      >
        <svg viewBox="0 0 1000 84" preserveAspectRatio="none" aria-hidden="true">
          {primaryPath && <path className="analysis-window__sog-line" d={primaryPath} style={{ stroke: ACTIVITY_COLORS.primary }} />}
          {comparisonPath && <path className="analysis-window__sog-line" d={comparisonPath} style={{ stroke: ACTIVITY_COLORS.comparison }} />}
        </svg>
        <div className="analysis-window__maneuver-markers">
          {maneuvers
            .filter((event) => event.centerTimeMs >= analysisWindow.start
              && event.centerTimeMs <= analysisWindow.end)
            .map((event) => (
              <AnalysisWindowManeuverMarker
                key={`${event.activityRole}:${event.maneuver.start_time}:${event.maneuver.center_time}:${event.maneuver.end_time}`}
                event={event}
                position={positionPercent(event.centerTimeMs, analysisWindow)}
                onSelect={onManeuverSelect}
              />
            ))}
        </div>
        {pointerSelection && (
          <div
            className="analysis-window__brush analysis-window__brush--provisional"
            style={{ left: `${windowStartPercent}%`, width: `${windowEndPercent - windowStartPercent}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="analysis-window__selected-times" aria-live="polite">
        <span>{formatGpsTime(selectedRange.start)} UTC</span>
        <span>{formatGpsTime(selectedRange.end)} UTC</span>
      </div>
    </section>
  )
}
