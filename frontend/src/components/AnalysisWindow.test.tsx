import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import { maneuverSelectionKey } from '../utils/maneuverEvents'
import type { SummaryMetrics } from '../utils/summaryMetrics'
import ManeuverEventTable from './ManeuverEventTable'
import AnalysisWindow, {
  ANALYSIS_WINDOW_SOG_PLOT_BAND,
  AnalysisWindowManeuverMarker,
  completeAnalysisWindowGesture,
  formatAnalysisWindowDuration,
  isAnalysisWindowDrag,
  playbackCursorPositionPercent,
  requestAnalysisWindowReset,
  resolveAnalysisWindowPointerTimestamp,
  selectManeuverAfterPointerGesture,
  shouldCaptureAnalysisWindowPointer,
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
  metrics: Partial<DisplayManeuver['maneuver']> = {},
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
      duration_s: 0,
      ...metrics,
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
  hasComparison,
  primaryMetrics = null,
  comparisonMetrics = null,
  selectedManeuver = null,
}: {
  primarySamples: TrackSample[]
  comparisonSamples?: TrackSample[]
  maneuvers?: DisplayManeuver[]
  range?: AnalysisWindowRange
  window?: AnalysisWindowRange
  replay?: AnalysisWindowReplay | null
  hasComparison?: boolean
  primaryMetrics?: SummaryMetrics | null
  comparisonMetrics?: SummaryMetrics | null
  selectedManeuver?: DisplayManeuver | null
}) {
  return renderToStaticMarkup(
    <AnalysisWindow
      availableRange={range}
      analysisWindow={window}
      primarySamples={primarySamples}
      comparisonSamples={comparisonSamples}
      maneuvers={maneuvers}
      hasComparison={hasComparison}
      primaryMetrics={primaryMetrics}
      comparisonMetrics={comparisonMetrics}
      selectedManeuver={selectedManeuver}
      replay={replay}
      onRangeChange={() => undefined}
    />,
  )
}

describe('Analysis Window SOG timeline', () => {
  const summaryMetrics: SummaryMetrics = {
    distanceMeters: 209.6,
    distanceNm: 209.6 / 1_852,
    avgSogKnots: 5.2,
    maxSogKnots: 6,
    dominantCogDegrees: 90,
    avgPositiveHeelDegrees: null,
    avgNegativeHeelDegrees: null,
    avgPositiveTrimDegrees: null,
    avgNegativeTrimDegrees: null,
  }

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

    expect(markup).toContain('d="M0.00,56.80 L1000.00,32.00"')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('>10:00:00</span>')
    expect(markup).toContain('>10:00:10</span>')
    expect(markup).not.toContain('10:00:00 UTC')
    expect(markup).not.toContain('10:00:10 UTC')
  })

  it('renders only the selected Analysis Window across the full graph width', () => {
    const markup = render({
      primarySamples: [sample(0, 100), sample(2, 3), sample(8, 6), sample(10, 100)],
    })

    expect(markup).toContain('d="M0.00,63.00 L1000.00,32.00"')
    expect(markup).not.toContain('disabled=""')
    expect(markup).toContain('>10:00:02</span>')
    expect(markup).toContain('>10:00:08</span>')
    expect(markup).not.toContain('10:00:02 UTC')
    expect(markup).not.toContain('10:00:08 UTC')
  })

  it.each([
    [23 * 60 * 1_000 + 44_000, '23m44s'],
    [4 * 60 * 1_000 + 2_000, '4m02s'],
    [44_000, '44s'],
    [60 * 60 * 1_000 + 3 * 60 * 1_000 + 7_000, '1h03m07s'],
  ])('formats %sms as compact duration %s', (duration, expected) => {
    expect(formatAnalysisWindowDuration(duration)).toBe(expected)
  })

  it('uses a dedicated neutral duration class', () => {
    const markup = render({ primarySamples: [sample(2, 3), sample(8, 5)] })

    expect(markup).toContain('class="analysis-window__duration"')
    expect(markup).not.toContain('duration-pill')
  })

  it('renders Primary Avg SOG, rounded distance, and degree-only Dominant COG', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
    })

    expect(markup).toContain('analysis-window__compact-summary--primary')
    expect(markup).toContain('color:#168097')
    expect(markup).toContain('5.20 kt')
    expect(markup).toContain('210 m')
    expect(markup).toContain('90°')
    expect(markup).not.toContain('COG')
  })

  it('renders Comparison metrics and identity only when Comparison is selected', () => {
    const primaryOnly = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
    })
    const compared = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      hasComparison: true,
      primaryMetrics: summaryMetrics,
      comparisonMetrics: {
        ...summaryMetrics,
        avgSogKnots: 4.95,
        distanceMeters: 197.6,
        dominantCogDegrees: 270,
      },
    })

    expect(primaryOnly).not.toContain('analysis-window__compact-summary--comparison')
    expect(compared).toContain('analysis-window__compact-summary--comparison')
    expect(compared).toContain('color:#9a5aaf')
    expect(compared).toContain('4.95 kt')
    expect(compared).toContain('198 m')
    expect(compared).toContain('90°')
    expect(compared).toContain('270°')
    expect(compared).not.toContain('COG')
  })

  it('renders unavailable Avg SOG and Dominant COG without inventing values', () => {
    const markup = render({
      primarySamples: [sample(2, null), sample(8, null)],
      primaryMetrics: {
        ...summaryMetrics,
        avgSogKnots: null,
        dominantCogDegrees: null,
      },
    })

    expect(markup).toContain('<span>—</span>')
    expect(markup).toContain('210 m')
    expect(markup).not.toContain('COG')
  })

  it('uses the Summary Dominant COG whole-degree rounding', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: { ...summaryMetrics, dominantCogDegrees: 94.6 },
    })

    expect(markup).toContain('95°')
    expect(markup).not.toContain('COG')
  })

  it('shows selected Primary Loss and Recovery only under the P summary', () => {
    const selectedManeuver = maneuver(5, 'primary', {
      speed_loss_distance_m: 8.4,
      speed_loss_time_s: 3.2,
      recovery_time_s: 11.7,
    })
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      hasComparison: true,
      primaryMetrics: summaryMetrics,
      comparisonMetrics: summaryMetrics,
      selectedManeuver,
    })

    expect(markup).toContain('analysis-window__selected-maneuver--primary')
    expect(markup).not.toContain('analysis-window__selected-maneuver--comparison')
    expect(markup).toContain('<span>Loss 8 m</span>')
    expect(markup).toContain('<span>3 s</span>')
    expect(markup).toContain('<span>Rec 12 s</span>')
  })

  it('shows selected Comparison Loss and Recovery only under the C summary', () => {
    const selectedManeuver = maneuver(5, 'comparison', {
      speed_loss_distance_m: 7.6,
      speed_loss_time_s: 2.6,
      recovery_time_s: 12.4,
    })
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      hasComparison: true,
      primaryMetrics: summaryMetrics,
      comparisonMetrics: summaryMetrics,
      selectedManeuver,
    })

    expect(markup).toContain('analysis-window__selected-maneuver--comparison')
    expect(markup).not.toContain('analysis-window__selected-maneuver--primary')
    expect(markup).toContain('<span>Loss 8 m</span>')
    expect(markup).toContain('<span>3 s</span>')
    expect(markup).toContain('<span>Rec 12 s</span>')
  })

  it('uses table-compatible unavailable values and removes detail when selection clears', () => {
    const selectedManeuver = maneuver(5, 'primary', {
      speed_loss_distance_m: null,
      speed_loss_time_s: null,
      recovery_time_s: null,
    })
    const selected = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
      selectedManeuver,
    })
    const cleared = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
    })

    expect(selected).toContain('<span>Loss —</span>')
    expect(selected).toContain('<span>—</span>')
    expect(selected).toContain('<span>Rec —</span>')
    expect(selected).not.toContain('— m')
    expect(selected).not.toContain('— s')
    expect(cleared).not.toContain('analysis-window__selected-maneuver')
  })

  it('keeps selected maneuver detail independent from replay movement', () => {
    const selectedManeuver = maneuver(5, 'primary', {
      speed_loss_distance_m: 8,
      speed_loss_time_s: 3,
      recovery_time_s: 12,
    })
    const before = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
      selectedManeuver,
      replay: replay({ playbackTime: selectedRange.start }),
    })
    const after = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
      selectedManeuver,
      replay: replay({ playbackTime: selectedRange.end }),
    })

    expect(before).toContain('<span>Loss 8 m</span>')
    expect(after).toContain('<span>Loss 8 m</span>')
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

  it('places P above the central SOG band and C below it without reserving C space for P only', () => {
    const primaryOnly = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      maneuvers: [maneuver(5, 'primary')],
    })
    const compared = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      comparisonSamples: [sample(2, 4), sample(8, 6)],
      maneuvers: [maneuver(4, 'primary'), maneuver(6, 'comparison')],
    })

    expect(primaryOnly).toContain('analysis-window__maneuver-annotation--primary')
    expect(primaryOnly).not.toContain('analysis-window__maneuver-annotation--comparison')
    expect(primaryOnly).not.toContain('analysis-window__timeline--comparison')
    expect(primaryOnly).toContain('viewBox="0 0 1000 106"')
    expect(compared).toContain('analysis-window__maneuver-annotation--primary')
    expect(compared).toContain('analysis-window__maneuver-annotation--comparison')
    expect(compared).toContain('analysis-window__timeline--comparison')
    expect(compared).toContain('viewBox="0 0 1000 132"')
    expect(ANALYSIS_WINDOW_SOG_PLOT_BAND).toEqual({ top: 32, bottom: 94 })
  })

  it('renders one subtle guide for every visible maneuver', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      comparisonSamples: [sample(2, 4), sample(8, 6)],
      maneuvers: [maneuver(4, 'primary'), maneuver(6, 'comparison')],
    })

    expect(markup.match(/analysis-window__maneuver-guide/g)).toHaveLength(2)
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
    const annotation = AnalysisWindowManeuverMarker({
      event,
      position: 50,
      onSelect,
    }) as ReactElement<{
      children: ReactElement[]
    }>
    const marker = annotation.props.children[1] as ReactElement<{
      onClick: (clickEvent: { stopPropagation: () => void }) => void
    }>

    marker.props.onClick({ stopPropagation })

    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(event)
    expect(marker.props).not.toHaveProperty('onPointerDown')
  })

  it('uses the selected marker identity to mark the matching table row', () => {
    const event = maneuver(5, 'primary')
    let selectedKey: string | null = null
    const annotation = AnalysisWindowManeuverMarker({
      event,
      position: 50,
      onSelect: (selectedEvent) => {
        selectedKey = maneuverSelectionKey(selectedEvent)
      },
    }) as ReactElement<{ children: ReactElement[] }>
    const marker = annotation.props.children[1] as ReactElement<{
      onClick: (event: { stopPropagation: () => void }) => void
    }>

    marker.props.onClick({ stopPropagation: () => undefined })
    const table = renderToStaticMarkup(
      <ManeuverEventTable
        events={[event]}
        primaryStatus="available"
        selectedManeuverKey={selectedKey}
        onSelect={() => undefined}
      />,
    )

    expect(table).toContain('aria-selected="true"')
  })

  it('allows marker pointer-down to reach range selection and suppresses selection after a drag', () => {
    const onSelect = vi.fn()
    const event = maneuver(5, 'primary')
    const annotation = AnalysisWindowManeuverMarker({
      event,
      position: 50,
      onSelect,
    }) as ReactElement<{ children: ReactElement[] }>
    const marker = annotation.props.children[1]

    expect(marker.props).not.toHaveProperty('onPointerDown')
    expect(shouldCaptureAnalysisWindowPointer(true, 100, 100)).toBe(false)
    expect(shouldCaptureAnalysisWindowPointer(true, 100, 105)).toBe(false)
    expect(shouldCaptureAnalysisWindowPointer(true, 100, 106)).toBe(true)
    expect(shouldCaptureAnalysisWindowPointer(false, 100, 100)).toBe(true)

    selectManeuverAfterPointerGesture(event, true, onSelect)
    expect(onSelect).not.toHaveBeenCalled()

    selectManeuverAfterPointerGesture(event, false, onSelect)
    expect(onSelect).toHaveBeenCalledWith(event)
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
