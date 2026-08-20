import { useState } from 'react'

type PlaybackSpeed = 1 | 2 | 5 | 10

export default function ReplayControls() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)

  return (
    <section className="content-section replay-section" aria-labelledby="replay-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="replay-title">Replay</p>
          <p className="section-description">Shared GPS clock placeholder</p>
        </div>
        <strong className="replay-time">11:24:18</strong>
      </div>

      <input
        className="replay-slider"
        type="range"
        min="0"
        max="100"
        defaultValue="34"
        aria-label="Replay position placeholder"
      />

      <div className="replay-actions">
        <button
          type="button"
          className="play-button"
          onClick={() => setIsPlaying((playing) => !playing)}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <div className="speed-options" aria-label="Playback speed">
          {([1, 2, 5, 10] as PlaybackSpeed[]).map((option) => (
            <button
              type="button"
              key={option}
              className={speed === option ? 'is-active' : ''}
              onClick={() => setSpeed(option)}
              aria-pressed={speed === option}
            >
              ×{option}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

