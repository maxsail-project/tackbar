import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import AnalysisWindow, {
  AnalysisWindowManeuverMarker,
  completeAnalysisWindowGesture,
  isAnalysisWindowDrag,
  playbackCursorPositionPercent,
  requestAnalysisWindowReset,
  resolveAnalysisWindowPointerTimestamp,
  type AnalysisWindowReplay,
} from './AnalysisWindow'

const availableRange = {
  start: Date.UTC(2031, 0, 1, 10, 0, 0),
  end: Date.UTC(2031, 0, 1, 10, 0, 10),
}
const selectedRange = {
  start: availableRange.start + 2_000,
  end: availableRange.end - 2_000,
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

function render({
  primarySamples,
  comparisonSamples,
  maneuvers = [],
  range = availableRange,
  window = selectedRange,
  replay = null,
}: {
  primarySamples: TrackSample[]
  comparisonSamples?: TrackSample[]
  maneuvers?: DisplayManeuver[]
  range?: AnalysisWindowRange
  window?: AnalysisWindowRange
  replay?: AnalysisWindowReplay | null
}) {
  return renderToStaticMarkup(
    <AnalysisWindow
      availableRange={range}
      analysisWindow={window}
      primarySamples={primarySamples}
      comparisonSamples={comparisonSamples}
      maneuvers={maneuvers}
      replay={replay}
      onRangeChange={() => undefined}
    />,
  )
}

describe('Analysis Window SOG timeline', () => {
  function replay(overrides: Partial<AnalysisWindowReplay> = {}): AnalysisWindowReplay {
    return {
      playbackTime: availableRange.start + 5_000,
      isPlaying: false,
      speed: 1,
      onTogglePlayback: () => undefined,
      onSpeedChange: () => undefined,
      ...overrides,
    }
  }

  it('removes the native range inputs and lower slider stage', () => {
    const markup = render({ primarySamples: [sample(2, 3), sample(8, 5)] })

    expect(markup).not.toContain('type="range"')
    expect(markup).not.toContain('analysis-window__stage')
    expect(markup).not.toContain('Analysis Window start UTC')
    expect(markup).not.toContain('Analysis Window end UTC')
  })

  it('initially renders the full available range across the graph', () => {
    const markup = render({
      primarySamples: [sample(0, 3), sample(10, 5)],
      window: availableRange,
    })

    expect(markup).toContain('d="M0.00,35.20 L1000.00,8.00"')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('10:00:00 UTC')
    expect(markup).toContain('10:00:10 UTC')
  })

  it('renders only the selected Analysis Window across the full graph width', () => {
    const markup = render({
      primarySamples: [sample(0, 100), sample(2, 3), sample(8, 6), sample(10, 100)],
    })

    expect(markup).toContain('d="M0.00,42.00 L1000.00,8.00"')
    expect(markup).not.toContain('disabled=""')
    expect(markup).toContain('10:00:02 UTC')
    expect(markup).toContain('10:00:08 UTC')
  })

  it('prepares the displayed range before applying the fixed visual point budget', () => {
    const longRange = {
      start: availableRange.start,
      end: availableRange.start + 1_000_000,
    }
    const zoomedRange = {
      start: availableRange.start + 400_000,
      end: availableRange.start + 600_000,
    }
    const samples = Array.from({ length: 1_001 }, (_, seconds) => sample(seconds, seconds % 10))
    const markup = render({ primarySamples: samples, range: longRange, window: zoomedRange })
    const path = markup.match(/class="analysis-window__sog-line" d="([^"]+)"/)?.[1] ?? ''

    expect(path.match(/[ML]/g)?.length).toBeLessThanOrEqual(240)
    expect(path).toMatch(/^M0\.00,/)
    expect(path).toMatch(/L1000\.00,[\d.]+$/)
  })

  it('maps a second drag to a narrower interval inside the zoomed range', () => {
    const bounds = { left: 100, right: 500 }
    const secondStart = resolveAnalysisWindowPointerTimestamp(selectedRange, 200, bounds)
    const secondEnd = resolveAnalysisWindowPointerTimestamp(selectedRange, 400, bounds)

    expect(secondStart).toBe(availableRange.start + 3_500)
    expect(secondEnd).toBe(availableRange.start + 6_500)
  })

  it('renders integrated Play and Pause controls when replay is available', () => {
    const stoppedMarkup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      replay: replay(),
    })
    const playingMarkup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      replay: replay({ isPlaying: true }),
    })

    expect(stoppedMarkup).toContain('aria-label="Play replay"')
    expect(stoppedMarkup).toContain('aria-pressed="false"')
    expect(playingMarkup).toContain('aria-label="Pause replay"')
    expect(playingMarkup).toContain('aria-pressed="true"')
    expect(playingMarkup).not.toContain('replay-section')
  })

  it('shows the current speed and exactly x1, x2, x5, and x10', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      replay: replay({ speed: 5 }),
    })

    expect(markup).toContain('aria-label="Playback speed"')
    expect(markup).toContain('<option value="1">x1</option>')
    expect(markup).toContain('<option value="2">x2</option>')
    expect(markup).toContain('<option value="5" selected="">x5</option>')
    expect(markup).toContain('<option value="10">x10</option>')
  })

  it.each([
    [selectedRange.start, 0],
    [selectedRange.start + 3_000, 50],
    [selectedRange.end, 100],
    [selectedRange.start - 10_000, 0],
    [selectedRange.end + 10_000, 100],
  ])('positions and clamps the playback cursor for %s', (playbackTime, expectedPosition) => {
    expect(playbackCursorPositionPercent(playbackTime, selectedRange)).toBe(expectedPosition)

    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      replay: replay({ playbackTime }),
    })
    expect(markup).toContain(`analysis-window__playback-cursor" style="left:${expectedPosition}%`)
  })

  it('treats a free-space tap as a no-op and commits only a real drag', () => {
    const onRangeChange = vi.fn()
    const selection = {
      pointerId: 1,
      start: availableRange.start + 3_000,
      end: availableRange.start + 7_000,
    }

    completeAnalysisWindowGesture(selection, 100, 104, onRangeChange)
    expect(isAnalysisWindowDrag(100, 104)).toBe(false)
    expect(onRangeChange).not.toHaveBeenCalled()

    completeAnalysisWindowGesture(selection, 100, 106, onRangeChange)
    expect(isAnalysisWindowDrag(100, 106)).toBe(true)
    expect(onRangeChange).toHaveBeenCalledWith({
      start: selection.start,
      end: selection.end,
    })
  })

  it('keeps replay and header controls outside the timeline selection surface', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      replay: replay(),
    })
    const timelineIndex = markup.indexOf('analysis-window__timeline')

    expect(markup.indexOf('aria-label="Playback speed"')).toBeLessThan(timelineIndex)
    expect(markup.indexOf('aria-label="Play replay"')).toBeLessThan(timelineIndex)
    expect(markup.indexOf('>Reset</button>')).toBeLessThan(timelineIndex)
  })

  it('Reset requests the complete available range', () => {
    const onRangeChange = vi.fn()

    requestAnalysisWindowReset(availableRange, onRangeChange)

    expect(onRangeChange).toHaveBeenCalledWith(availableRange)
  })

  it('positions visible maneuvers relative to the displayed range', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      maneuvers: [maneuver(2, 'primary'), maneuver(5, 'comparison'), maneuver(8, 'primary')],
    })

    expect(markup).toContain('left:0%')
    expect(markup).toContain('left:50%')
    expect(markup).toContain('left:100%')
    expect(markup).toContain('color:#168097')
    expect(markup).toContain('color:#9a5aaf')
  })

  it('does not render maneuvers outside the displayed range', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      maneuvers: [maneuver(1, 'primary'), maneuver(5, 'primary'), maneuver(9, 'comparison')],
    })

    expect(markup).toContain('Move replay to 10:00:05 UTC')
    expect(markup).not.toContain('Move replay to 10:00:01 UTC')
    expect(markup).not.toContain('Move replay to 10:00:09 UTC')
  })

  it('selects a visible marker through the supplied replay callback', () => {
    const event = maneuver(5, 'primary')
    const onSelect = vi.fn()
    const stopPropagation = vi.fn()
    const marker = AnalysisWindowManeuverMarker({
      event,
      position: 50,
      onSelect,
    }) as ReactElement<{
      onClick: (clickEvent: { stopPropagation: () => void }) => void
    }>

    marker.props.onClick({ stopPropagation })

    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(event.centerTimeMs)
  })

  it('remains selectable when every displayed SOG value is missing', () => {
    const markup = render({ primarySamples: [sample(2, null), sample(8, null)] })

    expect(markup).not.toContain('analysis-window__sog-line')
    expect(markup).toContain('SOG timeline; drag horizontally')
    expect(markup).toContain('Reset')
  })

  it('renders Primary and Comparison SOG independently', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      comparisonSamples: [sample(2, 4), sample(8, 6)],
    })

    expect(markup.match(/analysis-window__sog-line/g)).toHaveLength(2)
    expect(markup).toContain('stroke:#168097')
    expect(markup).toContain('stroke:#9a5aaf')
  })

  it('preserves null SOG as a visible path gap', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(5, null), sample(8, 5)],
    })
    const path = markup.match(/class="analysis-window__sog-line" d="([^"]+)"/)?.[1] ?? ''

    expect(path).toContain(' M')
  })
})
