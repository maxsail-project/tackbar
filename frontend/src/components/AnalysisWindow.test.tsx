import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TrackSample } from '../types/track'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import AnalysisWindow, { AnalysisWindowManeuverMarker } from './AnalysisWindow'

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

function maneuver(
  seconds: number,
  activityRole: DisplayManeuver['activityRole'],
): DisplayManeuver {
  const centerTimeMs = availableRange.start + (seconds * 1_000)
  const centerTime = new Date(centerTimeMs).toISOString()
  return {
    activityRole,
    centerTimeMs,
    maneuver: {
      start_time: centerTime,
      center_time: centerTime,
      end_time: centerTime,
      heading_change_deg: 90,
      peak_turn_rate_deg_s: 12,
      peak_turn_rate_time: centerTime,
    },
  }
}

function render(
  primarySamples: TrackSample[],
  comparisonSamples?: TrackSample[],
  maneuvers: DisplayManeuver[] = [],
) {
  return renderToStaticMarkup(
    <AnalysisWindow
      availableRange={availableRange}
      analysisWindow={{ start: availableRange.start + 2_000, end: availableRange.end - 2_000 }}
      primarySamples={primarySamples}
      comparisonSamples={comparisonSamples}
      maneuvers={maneuvers}
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

  it('renders an active Primary marker at its absolute timeline position', () => {
    const markup = render(
      [sample(0, 3), sample(10, 5)],
      undefined,
      [maneuver(5, 'primary')],
    )

    expect(markup).toContain('analysis-window__maneuver-marker--primary')
    expect(markup).toContain('analysis-window__maneuver-marker--active')
    expect(markup).toContain('left:50%')
    expect(markup).toContain('Activity P')
  })

  it('renders Primary and Comparison markers on separate color roles', () => {
    const markup = render(
      [sample(0, 3), sample(10, 5)],
      [sample(0, 4), sample(10, 6)],
      [maneuver(4, 'primary'), maneuver(6, 'comparison')],
    )

    expect(markup).toContain('analysis-window__maneuver-marker--primary')
    expect(markup).toContain('analysis-window__maneuver-marker--comparison')
    expect(markup).toContain('color:#168097')
    expect(markup).toContain('color:#9a5aaf')
  })

  it('keeps an out-of-window marker visible but non-interactive', () => {
    const markup = render(
      [sample(0, 3), sample(10, 5)],
      undefined,
      [maneuver(1, 'primary')],
    )

    expect(markup).toContain('analysis-window__maneuver-marker--context')
    expect(markup).toContain('left:10%')
    expect(markup).not.toContain('Move replay to 10:00:01 UTC')
  })

  it('selects an active marker through the supplied replay callback', () => {
    const event = maneuver(5, 'primary')
    const onSelect = vi.fn()
    const stopPropagation = vi.fn()
    const marker = AnalysisWindowManeuverMarker({
      event,
      active: true,
      position: 50,
      onSelect,
    }) as ReactElement<{
      onClick: (clickEvent: { stopPropagation: () => void }) => void
    }>

    marker.props.onClick({ stopPropagation })

    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(event.centerTimeMs)
  })

  it('renders safely without maneuver analytics', () => {
    const markup = render([sample(0, 3), sample(10, 5)])

    expect(markup).toContain('analysis-window__maneuver-markers')
    expect(markup).not.toContain('analysis-window__maneuver-marker--active')
  })
})
