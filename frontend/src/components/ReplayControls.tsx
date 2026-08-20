import type { EnabledReplayMetric } from '../types/session'
import { formatReplayMetric } from '../utils/metricPresentation'
import type { PlaybackSpeed } from '../utils/replay'
import { formatGpsTime } from '../utils/replay'

interface ReplayControlsProps {
  playbackTime: number
  replayStart: number
  replayEnd: number
  selectedMetric: EnabledReplayMetric
  currentMetric: number | null
  isPlaying: boolean
  speed: PlaybackSpeed
  onTogglePlayback: () => void
  onScrub: (playbackTime: number) => void
  onScrubStart: () => void
  onSpeedChange: (speed: PlaybackSpeed) => void
}

const PLAYBACK_SPEEDS: PlaybackSpeed[] = [1, 2, 5, 10]

export default function ReplayControls({
  playbackTime,
  replayStart,
  replayEnd,
  selectedMetric,
  currentMetric,
  isPlaying,
  speed,
  onTogglePlayback,
  onScrub,
  onScrubStart,
  onSpeedChange,
}: ReplayControlsProps) {
  const formattedTime = formatGpsTime(playbackTime)

  return (
    <section className="content-section replay-section" aria-labelledby="replay-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="replay-title">Replay</p>
          <p className="section-description">One virtual GPS clock · {selectedMetric}</p>
        </div>
        <div className="replay-readout">
          <strong className="replay-time">{formattedTime}</strong>
          <span>{formatReplayMetric(selectedMetric, currentMetric)}</span>
        </div>
      </div>

      <input
        className="replay-slider"
        type="range"
        min={replayStart}
        max={replayEnd}
        step="100"
        value={playbackTime}
        onPointerDown={onScrubStart}
        onChange={(event) => onScrub(Number(event.target.value))}
        aria-label="Shared replay GPS time"
        aria-valuetext={`${formattedTime} UTC`}
      />

      <div className="replay-range" aria-hidden="true">
        <span>{formatGpsTime(replayStart)}</span>
        <span>{formatGpsTime(replayEnd)}</span>
      </div>

      <div className="replay-actions">
        <button
          type="button"
          className="play-button"
          onClick={onTogglePlayback}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <div className="speed-options" aria-label="Playback speed">
          {PLAYBACK_SPEEDS.map((option) => (
            <button
              type="button"
              key={option}
              className={speed === option ? 'is-active' : ''}
              onClick={() => onSpeedChange(option)}
              aria-pressed={speed === option}
            >
              x{option}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
