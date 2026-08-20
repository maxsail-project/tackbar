import { formatGpsTime } from '../utils/replay'
import { ANALYSIS_WINDOW_STEP_MS } from '../utils/analysisWindow'

interface AnalysisWindowProps {
  activityStart: number | null
  activityEnd: number | null
  windowStart: number | null
  windowEnd: number | null
  onStartChange: (windowStart: number) => void
  onEndChange: (windowEnd: number) => void
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

export default function AnalysisWindow({
  activityStart,
  activityEnd,
  windowStart,
  windowEnd,
  onStartChange,
  onEndChange,
}: AnalysisWindowProps) {
  const isAvailable = activityStart !== null
    && activityEnd !== null
    && windowStart !== null
    && windowEnd !== null

  return (
    <section className="content-section" aria-labelledby="analysis-window-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="analysis-window-title">Analysis window</p>
          <p className="section-description">Shared absolute GPS/UTC interval</p>
        </div>
        {isAvailable && (
          <span className="duration-pill">
            {formatDuration(windowEnd - windowStart)}
          </span>
        )}
      </div>

      {isAvailable ? (
        <div className="analysis-window-controls">
          <div className="analysis-window-values" aria-live="polite">
            <span>Start <strong>{formatGpsTime(windowStart)} UTC</strong></span>
            <span>End <strong>{formatGpsTime(windowEnd)} UTC</strong></span>
          </div>

          <label className="analysis-window-range">
            <span>Adjust start</span>
            <input
              type="range"
              min={activityStart}
              max={activityEnd}
              step={ANALYSIS_WINDOW_STEP_MS}
              value={windowStart}
              onChange={(event) => onStartChange(Number(event.target.value))}
              aria-label="Analysis Window start UTC"
              aria-valuetext={`${formatGpsTime(windowStart)} UTC`}
            />
          </label>

          <label className="analysis-window-range">
            <span>Adjust end</span>
            <input
              type="range"
              min={activityStart}
              max={activityEnd}
              step={ANALYSIS_WINDOW_STEP_MS}
              value={windowEnd}
              onChange={(event) => onEndChange(Number(event.target.value))}
              aria-label="Analysis Window end UTC"
              aria-valuetext={`${formatGpsTime(windowEnd)} UTC`}
            />
          </label>

          <p className="analysis-window-duration">
            Duration <strong>{formatDuration(windowEnd - windowStart)}</strong>
          </p>
        </div>
      ) : (
        <div className="window-placeholder">No Analysis Window for this mock Activity.</div>
      )}
    </section>
  )
}
