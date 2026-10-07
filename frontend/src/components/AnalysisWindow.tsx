import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { TrackSample } from '../types/track'
import type {
  AnalysisWindowBoundary,
  AnalysisWindowRange,
} from '../utils/analysisWindow'
import {
  ANALYSIS_WINDOW_STEP_MS,
  resolveAnalysisWindowBrushRange,
} from '../utils/analysisWindow'
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
  onWindowChange: (
    boundary: AnalysisWindowBoundary,
    requestedTime: number,
  ) => void
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

export function AnalysisWindowManeuverMarker({
  event,
  active,
  position,
  onSelect,
}: {
  event: DisplayManeuver
  active: boolean
  position: number
  onSelect: (centerTimeMs: number) => void
}) {
  const roleLabel = event.activityRole === 'primary' ? 'P' : 'C'
  const className = [
    'analysis-window__maneuver-marker',
    `analysis-window__maneuver-marker--${event.activityRole}`,
    active ? 'analysis-window__maneuver-marker--active' : 'analysis-window__maneuver-marker--context',
  ].join(' ')
  const style = {
    left: `${position}%`,
    color: ACTIVITY_COLORS[event.activityRole],
  }

  if (!active) {
    return <span className={className} style={style} aria-hidden="true" />
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

export default function AnalysisWindow({
  availableRange,
  analysisWindow,
  primarySamples,
  comparisonSamples = [],
  maneuvers = [],
  onWindowChange,
  onRangeChange,
  onManeuverSelect = () => undefined,
}: AnalysisWindowProps) {
  const [pointerSelection, setPointerSelection] = useState<TemporalPointerSelection | null>(null)
  const pointerSelectionRef = useRef<TemporalPointerSelection | null>(null)
  const primaryPoints = useMemo(
    () => availableRange === null ? [] : reduceSogTimelinePoints(
      prepareSogTimelinePoints(primarySamples, availableRange),
      TIMELINE_POINT_BUDGET,
    ),
    [availableRange, primarySamples],
  )
  const comparisonPoints = useMemo(
    () => availableRange === null ? [] : reduceSogTimelinePoints(
      prepareSogTimelinePoints(comparisonSamples, availableRange),
      TIMELINE_POINT_BUDGET,
    ),
    [availableRange, comparisonSamples],
  )
  const maximumSog = Math.max(
    1,
    ...primaryPoints.map((point) => point.sog ?? 0),
    ...comparisonPoints.map((point) => point.sog ?? 0),
  )

  useEffect(() => {
    pointerSelectionRef.current = null
    setPointerSelection(null)
  }, [availableRange?.end, availableRange?.start])

  function updatePointerSelection(nextSelection: TemporalPointerSelection | null) {
    pointerSelectionRef.current = nextSelection
    setPointerSelection(nextSelection)
  }

  function pointerTimestamp(event: ReactPointerEvent<HTMLDivElement>) {
    if (availableRange === null) return null
    const bounds = event.currentTarget.getBoundingClientRect()
    return resolveTemporalPointerTimestamp(availableRange, event.clientX, bounds)
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

  const displayedRange = pointerSelection === null
    ? analysisWindow
    : {
        start: Math.min(pointerSelection.start, pointerSelection.end),
        end: Math.max(pointerSelection.start, pointerSelection.end),
      }
  const windowStartPercent = positionPercent(displayedRange.start, availableRange)
  const windowEndPercent = positionPercent(displayedRange.end, availableRange)
  const committedStartPercent = positionPercent(analysisWindow.start, availableRange)
  const committedEndPercent = positionPercent(analysisWindow.end, availableRange)
  const primaryPath = buildSogTimelinePath(primaryPoints, availableRange, maximumSog)
  const comparisonPath = buildSogTimelinePath(comparisonPoints, availableRange, maximumSog)

  return (
    <section className="content-section analysis-window" aria-labelledby="analysis-window-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="analysis-window-title">Analysis window</p>
          <p className="section-description">Drag over SOG to select the shared interval</p>
        </div>
        <span className="duration-pill">
          {formatDuration(displayedRange.end - displayedRange.start)}
        </span>
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
          {maneuvers.map((event) => {
            const active = event.centerTimeMs >= analysisWindow.start
              && event.centerTimeMs <= analysisWindow.end
            return (
              <AnalysisWindowManeuverMarker
                key={`${event.activityRole}:${event.maneuver.start_time}:${event.maneuver.center_time}:${event.maneuver.end_time}`}
                event={event}
                active={active}
                position={positionPercent(event.centerTimeMs, availableRange)}
                onSelect={onManeuverSelect}
              />
            )
          })}
        </div>
        <div
          className={`analysis-window__brush${pointerSelection ? ' analysis-window__brush--provisional' : ''}`}
          style={{ left: `${windowStartPercent}%`, width: `${windowEndPercent - windowStartPercent}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="analysis-window__stage">
        <div className="analysis-window__available-track" aria-hidden="true" />
        <div
          className="analysis-window__selected-track"
          style={{ left: `${committedStartPercent}%`, width: `${committedEndPercent - committedStartPercent}%` }}
          aria-hidden="true"
        />
        <input
          className="analysis-window__input analysis-window__input--start"
          type="range"
          min={availableRange.start}
          max={availableRange.end}
          step={ANALYSIS_WINDOW_STEP_MS}
          value={analysisWindow.start}
          onChange={(event) => onWindowChange('start', Number(event.target.value))}
          aria-label="Analysis Window start UTC"
          aria-valuetext={`${formatGpsTime(analysisWindow.start)} UTC`}
        />
        <input
          className="analysis-window__input analysis-window__input--end"
          type="range"
          min={availableRange.start}
          max={availableRange.end}
          step={ANALYSIS_WINDOW_STEP_MS}
          value={analysisWindow.end}
          onChange={(event) => onWindowChange('end', Number(event.target.value))}
          aria-label="Analysis Window end UTC"
          aria-valuetext={`${formatGpsTime(analysisWindow.end)} UTC`}
        />
      </div>

      <div className="analysis-window__selected-times" aria-live="polite">
        <span>{formatGpsTime(displayedRange.start)} UTC</span>
        <span>{formatGpsTime(displayedRange.end)} UTC</span>
      </div>
    </section>
  )
}
