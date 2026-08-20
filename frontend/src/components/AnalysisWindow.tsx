import type {
  AnalysisWindowBoundary,
  AnalysisWindowRange,
} from '../utils/analysisWindow'
import { ANALYSIS_WINDOW_STEP_MS } from '../utils/analysisWindow'
import { formatGpsTime } from '../utils/replay'

interface AnalysisWindowProps {
  availableRange: AnalysisWindowRange | null
  analysisWindow: AnalysisWindowRange | null
  onWindowChange: (
    boundary: AnalysisWindowBoundary,
    requestedTime: number,
  ) => void
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

function positionPercent(
  value: number,
  availableRange: AnalysisWindowRange,
) {
  const duration = availableRange.end - availableRange.start
  if (duration <= 0) return 0
  return Math.min(Math.max(
    ((value - availableRange.start) / duration) * 100,
    0,
  ), 100)
}

export default function AnalysisWindow({
  availableRange,
  analysisWindow,
  onWindowChange,
}: AnalysisWindowProps) {
  const isAvailable = availableRange !== null && analysisWindow !== null

  if (!isAvailable) {
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

  const windowStartPercent = positionPercent(analysisWindow.start, availableRange)
  const windowEndPercent = positionPercent(analysisWindow.end, availableRange)

  return (
    <section className="content-section analysis-window" aria-labelledby="analysis-window-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="analysis-window-title">Analysis window</p>
          <p className="section-description">Shared map, chart and summary interval</p>
        </div>
        <span className="duration-pill">
          {formatDuration(analysisWindow.end - analysisWindow.start)}
        </span>
      </div>

      <div className="analysis-window__values" aria-live="polite">
        <span>
          Start
          <strong>{formatGpsTime(analysisWindow.start)} <small>UTC</small></strong>
        </span>
        <span>
          End
          <strong>{formatGpsTime(analysisWindow.end)} <small>UTC</small></strong>
        </span>
      </div>

      <div className="analysis-window__stage">
        <div className="analysis-window__available-track" aria-hidden="true" />
        <div
          className="analysis-window__selected-track"
          style={{
            left: `${windowStartPercent}%`,
            width: `${windowEndPercent - windowStartPercent}%`,
          }}
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

      <div className="analysis-window__range" aria-hidden="true">
        <span>{formatGpsTime(availableRange.start)}</span>
        <span>{formatGpsTime(availableRange.end)}</span>
      </div>
      <div className="analysis-window__legend" aria-hidden="true">
        <span className="analysis-window__legend-start">Start</span>
        <span className="analysis-window__legend-end">End</span>
      </div>
    </section>
  )
}
