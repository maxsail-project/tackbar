import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import AnalysisWindow from './AnalysisWindow'

const availableRange = {
  start: Date.UTC(2031, 0, 1, 10, 0, 0),
  end: Date.UTC(2031, 0, 1, 10, 0, 10),
}

function sample(seconds: number, sog: number | null): TrackSample {
  return {
    utc: new Date(availableRange.start + (seconds * 1_000)).toISOString(),
    lat: 0,
    lon: 0,
    dist: 0,
    sog,
    cog: null,
    hdg: null,
    heel: null,
    trim: null,
  }
}

function render(primarySamples: TrackSample[], comparisonSamples?: TrackSample[]) {
  return renderToStaticMarkup(
    <AnalysisWindow
      availableRange={availableRange}
      analysisWindow={{ start: availableRange.start + 2_000, end: availableRange.end - 2_000 }}
      primarySamples={primarySamples}
      comparisonSamples={comparisonSamples}
      onWindowChange={() => undefined}
      onRangeChange={() => undefined}
    />,
  )
}

describe('Analysis Window SOG timeline', () => {
  it('renders one SOG curve and retains both fine-adjustment range inputs', () => {
    const markup = render([sample(0, 3), sample(10, 5)])

    expect(markup.match(/analysis-window__sog-line/g)).toHaveLength(1)
    expect(markup).toContain('Analysis Window start UTC')
    expect(markup).toContain('Analysis Window end UTC')
  })

  it('renders separate Primary and Comparison SOG curves', () => {
    const markup = render(
      [sample(0, 3), sample(10, 5)],
      [sample(0, 4), sample(10, 6)],
    )

    expect(markup.match(/analysis-window__sog-line/g)).toHaveLength(2)
    expect(markup).toContain('stroke:#168097')
    expect(markup).toContain('stroke:#9a5aaf')
  })

  it('keeps the selection controls usable when every SOG value is missing', () => {
    const markup = render([sample(0, null), sample(10, null)])

    expect(markup).not.toContain('analysis-window__sog-line')
    expect(markup).toContain('SOG timeline; drag horizontally')
    expect(markup.match(/type="range"/g)).toHaveLength(2)
  })
})
