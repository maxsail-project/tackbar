import {
  formatGpsTime,
  PLAYBACK_SPEEDS,
  type PlaybackSpeed,
} from '../utils/replay'

interface ReplayControlsProps {
  playbackTime: number
  replayStart: number
  replayEnd: number
  isPlaying: boolean
  speed: PlaybackSpeed
  onTogglePlayback: () => void
  onScrub: (playbackTime: number) => void
  onScrubStart: () => void
  onSpeedChange: (speed: PlaybackSpeed) => void
}

export default function ReplayControls({
  playbackTime,
  replayStart,
  replayEnd,
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
      <div className="replay-heading">
        <p className="section-kicker" id="replay-title">Replay</p>
        <strong className="replay-time">{formattedTime}</strong>
      </div>

      <div className="replay-scrub-row">
        <button
          type="button"
          className="play-button"
          onClick={onTogglePlayback}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <div className="replay-scrub">
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
        </div>
      </div>

      <div className="replay-speed-row">
        <div
          className="speed-options"
          role="group"
          aria-label="Playback speed"
        >
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
