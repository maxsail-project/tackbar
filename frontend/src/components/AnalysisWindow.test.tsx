import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import type { InferredSessionStart } from '../utils/sessionStarts'
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
  sessionStartControlLayout,
  sessionStartControlOffsets,
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
      course_change_deg: null,
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
  sessionStarts = [],
  range = availableRange,
  window = selectedRange,
  replay = null,
  hasComparison,
  primaryMetrics = null,
  comparisonMetrics = null,
  primaryManeuverCount = null,
  comparisonManeuverCount = null,
}: {
  primarySamples: TrackSample[]
  comparisonSamples?: TrackSample[]
  maneuvers?: DisplayManeuver[]
  sessionStarts?: InferredSessionStart[]
  range?: AnalysisWindowRange
  window?: AnalysisWindowRange
  replay?: AnalysisWindowReplay | null
  hasComparison?: boolean
  primaryMetrics?: SummaryMetrics | null
  comparisonMetrics?: SummaryMetrics | null
  primaryManeuverCount?: number | null
  comparisonManeuverCount?: number | null
}) {
  return renderToStaticMarkup(
    <AnalysisWindow
      availableRange={range}
      analysisWindow={window}
      primarySamples={primarySamples}
      comparisonSamples={comparisonSamples}
      maneuvers={maneuvers}
      sessionStarts={sessionStarts}
      hasComparison={hasComparison}
      primaryMetrics={primaryMetrics}
      comparisonMetrics={comparisonMetrics}
      primaryManeuverCount={primaryManeuverCount}
      comparisonManeuverCount={comparisonManeuverCount}
      replay={replay}
      onRangeChange={() => undefined}
    />,
  )
}

describe('Analysis Window SOG timeline', () => {
  it('shows only in-window Session Starts with two accessible controls and a full-height guide', () => {
    const sessionStarts: InferredSessionStart[] = [
      { label: 'S1', time: availableRange.start + 1_000, activityIds: ['a'] },
      { label: 'S2', time: availableRange.start + 2_123, activityIds: ['a', 'b'] },
      { label: 'S3', time: availableRange.start + 8_000, activityIds: ['a', 'b'] },
      { label: 'S4', time: availableRange.start + 9_000, activityIds: ['a'] },
    ]
    const markup = render({ primarySamples: [], sessionStarts })
    expect(markup).not.toContain('>S1</span></button>')
    expect(markup.match(/>S2<\/span><\/button>/g)).toHaveLength(2)
    expect(markup.match(/>S3<\/span><\/button>/g)).toHaveLength(2)
    expect(markup).not.toContain('>S4</span></button>')
    expect(markup).toContain('analysis-window__session-start-guide')
    expect(markup).toMatch(/left:2\.05\d*%/)
    expect(markup).toContain('S2 Start at 2031-01-01T10:00:02.123 UTC, move replay')
    expect(markup).not.toContain('10:00:02.123</span>')
  })

  it('announces a median between UTC milliseconds without truncating the seek time', () => {
    const markup = render({ primarySamples: [], sessionStarts: [
      { label: 'S1', time: availableRange.start + 5_123.5, activityIds: ['a', 'b'] },
    ] })
    expect(markup).toContain('S1 Start at 2031-01-01T10:00:05.1235 UTC, move replay')
  })

  it('keeps Start tap targets above maneuver markers while leaving the timeline middle brushable', () => {
    const markup = render({ primarySamples: [], maneuvers: [maneuver(4, 'primary')], sessionStarts: [
      { label: 'S1', time: availableRange.start + 4_000, activityIds: ['a', 'b'] },
    ] })
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    expect(markup).toContain('analysis-window__maneuver-marker')
    expect(markup.match(/analysis-window__session-start-control--(?:top|bottom)/g)).toHaveLength(2)
    expect(css).toMatch(/\.analysis-window__session-starts\s*\{[^}]*z-index:\s*4;[^}]*pointer-events:\s*none;/s)
    expect(css).toMatch(/\.analysis-window__session-start-control\s*\{[^}]*pointer-events:\s*auto;/s)
    expect(css).toMatch(/\.analysis-window__session-start-control\s*\{[^}]*height:\s*28px;[^}]*min-height:\s*28px;/s)
    expect(css).toMatch(/\.analysis-window__session-start-guide\s*\{[^}]*top:\s*0;[^}]*bottom:\s*0;[^}]*pointer-events:\s*none;/s)
    expect(css).toMatch(/\.analysis-window__session-start-guide\s*\{[^}]*width:\s*1px;[^}]*background:\s*#52636b;/s)
    expect(css).toMatch(/\.analysis-window__session-start-control span\s*\{[^}]*width:\s*28px;[^}]*height:\s*18px;[^}]*border:\s*1px solid #52636b;/s)
  })

  it('keeps both edge Start controls fully inside the clipped timeline', () => {
    const markup = render({ primarySamples: [], window: availableRange, sessionStarts: [
      { label: 'S1', time: availableRange.start, activityIds: ['a'] },
      { label: 'S2', time: availableRange.end, activityIds: ['a'] },
    ] })
    expect(markup.match(/transform:translateX\(0\)/g)).toHaveLength(2)
    expect(markup.match(/transform:translateX\(-100%\)/g)).toHaveLength(2)
  })

  it('separates nearby labels on a long timeline without moving their UTC guides', () => {
    const range = { start: 0, end: 7_200_000 }
    const starts: InferredSessionStart[] = [
      { label: 'S1', time: 0, activityIds: ['a'] },
      { label: 'S2', time: 300_000, activityIds: ['a'] },
      { label: 'S3', time: 600_000, activityIds: ['a'] },
      { label: 'S4', time: 7_200_000, activityIds: ['a'] },
    ]
    const offsets = sessionStartControlOffsets(starts, range, 320)
    const centers = starts.map((start, index) => (start.time / range.end) * 320 + (offsets[index] ?? 0))
    expect(centers[0]).toBeGreaterThanOrEqual(18)
    expect(centers[3]).toBeLessThanOrEqual(302)
    expect(centers[1] - centers[0]).toBeGreaterThanOrEqual(38)
    expect(centers[2] - centers[1]).toBeGreaterThanOrEqual(38)
    expect(starts.map((start) => start.time)).toEqual([0, 300_000, 600_000, 7_200_000])
  })

  it('uses two control lanes for ten nearby Starts in a 320px timeline', () => {
    const range = { start: 0, end: 3_000_000 }
    const starts = Array.from({ length: 10 }, (_, index) => ({
      label: `S${String(index + 1).padStart(2, '0')}`,
      time: index * 300_000,
      activityIds: ['a'],
    }))
    const { dense, placements } = sessionStartControlLayout(starts, range, 320)
    expect(dense).toBe(true)
    for (const lane of [0, 1]) {
      const centers = starts.flatMap((start, index) => placements[index].lane === lane
        ? [(start.time / range.end) * 320 + (placements[index].offsetPx ?? 0)] : [])
      expect(centers[0]).toBeGreaterThanOrEqual(18)
      expect(centers.at(-1)).toBeLessThanOrEqual(302)
      for (let index = 1; index < centers.length; index += 1) {
        expect(centers[index] - centers[index - 1]).toBeGreaterThanOrEqual(38)
      }
    }
  })
  const summaryMetrics: SummaryMetrics = {
    distanceMeters: 209.6,
    distanceNm: 209.6 / 1_852,
    avgSogKnots: 5.2,
    maxSogKnots: 6,
    dominantCogDegrees: 90,
    medianPositiveHeelDegrees: null,
    medianNegativeHeelDegrees: null,
    medianPositiveTrimDegrees: null,
    medianNegativeTrimDegrees: null,
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

  it('renders shared headings and Primary window metrics in one row', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
    })

    expect(markup).toContain('analysis-window__summary-table')
    expect(markup).toMatch(/P\/C<\/th>.*Avg SOG<\/th>.*Max SOG<\/th>.*Distance<\/th>.*Dom COG<\/th>.*Maneuvers<\/th>/)
    expect(markup).toContain('color:#168097')
    expect(markup).toContain('5.20 kt')
    expect(markup).toContain('6.00 kt')
    expect(markup).toContain('210 m')
    expect(markup).toContain('90°')
    expect(markup).toContain('<td>—</td>')
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

    expect(primaryOnly.match(/<tr><th scope="row"/g)).toHaveLength(1)
    expect(compared.match(/<tr><th scope="row"/g)).toHaveLength(2)
    expect(compared).toContain('color:#9a5aaf')
    expect(compared).toContain('4.95 kt')
    expect(compared).toContain('198 m')
    expect(compared).toContain('90°')
    expect(compared).toContain('270°')
    expect(compared).toContain('Dom COG')
  })

  it('renders unavailable Avg SOG and Dominant COG without inventing values', () => {
    const markup = render({
      primarySamples: [sample(2, null), sample(8, null)],
      primaryMetrics: {
        ...summaryMetrics,
        avgSogKnots: null,
        maxSogKnots: null,
        dominantCogDegrees: null,
      },
    })

    expect(markup).toContain('<td>—</td>')
    expect(markup).toContain('210 m')
    expect(markup).not.toContain('6.00 kt')
  })

  it('uses the Summary Dominant COG whole-degree rounding', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: { ...summaryMetrics, dominantCogDegrees: 94.6 },
    })

    expect(markup).toContain('95°')
    expect(markup).toContain('Dom COG')
  })

  it('distinguishes available zero maneuvers from unavailable analytics', () => {
    const zero = render({ primarySamples: [], primaryManeuverCount: 0 })
    const missing = render({ primarySamples: [], primaryManeuverCount: null })
    expect(zero).toContain('<td>0</td>')
    expect(missing).toContain('<td>—</td>')
    expect(missing).not.toContain('<td>0</td>')
  })

  it('keeps the compact table below the timeline without horizontal scrolling', () => {
    const markup = render({ primarySamples: [] })
    expect(markup.indexOf('analysis-window__summary-table')).toBeGreaterThan(markup.indexOf('analysis-window__timeline'))
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    const section = css.slice(css.indexOf('.analysis-window__summary-table {'), css.indexOf('.track-unavailable {'))
    expect(section).toContain('width: 100%')
    expect(section).toContain('table-layout: fixed')
    expect(section).toContain('white-space: nowrap')
    expect(section).toContain('overflow-wrap: anywhere')
    expect(section).not.toMatch(/overflow-x|width: max-content|display: none/)
  })

  it('keeps only window metrics in compact summaries as replay moves', () => {
    const before = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
      replay: replay({ playbackTime: selectedRange.start }),
    })
    const after = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      primaryMetrics: summaryMetrics,
      replay: replay({ playbackTime: selectedRange.end }),
    })

    for (const markup of [before, after]) {
      expect(markup).toContain('5.20 kt')
      expect(markup).toContain('210 m')
      expect(markup).toContain('90°')
      expect(markup).not.toContain('Loss')
      expect(markup).not.toContain('Rec 12 s')
    }
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

  it('keeps the title and concise instruction inline while only the instruction may wrap', () => {
    const markup = render({
      primarySamples: [sample(2, 3), sample(8, 5)],
      replay: replay({ speed: 5 }),
    })
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

    expect(markup).toMatch(/class="analysis-window__heading-copy"><p class="section-kicker" id="analysis-window-title">Analysis window<\/p><span class="section-description">Drag SOG to select interval<\/span><\/div><div class="analysis-window__header-actions">/)
    expect(markup).toContain('<option value="5" selected="">x5</option>')
    expect(markup).toContain('>Reset</button>')
    expect(css).toMatch(/\.analysis-window__heading-copy\s*\{ min-width: 0; line-height: 1\.35; \}/)
    expect(css).toMatch(/\.analysis-window__heading-copy \.section-kicker\s*\{ display: inline; white-space: nowrap; \}/)
    expect(css).toMatch(/\.analysis-window__heading-copy \.section-description\s*\{ display: inline; margin: 0 0 0 8px; \}/)
    expect(css).toMatch(/\.analysis-window__header-actions\s*\{[^}]*flex: 0 0 auto;/)
    expect(css).not.toMatch(/\.analysis-window__heading-copy \.section-description\s*\{[^}]*white-space: nowrap;/)
    expect(css).toMatch(/button,\s*select\s*\{\s*min-height: 44px;/)
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

  it.each(['HIGH', 'LOW'])('selects a visible %s marker through the supplied replay callback', (mode) => {
    const event = maneuver(5, 'primary')
    if (mode === 'LOW') {
      event.maneuver.heading_change_deg = null
      event.maneuver.course_change_deg = 90
      event.maneuver.peak_turn_rate_deg_s = null
      event.maneuver.peak_turn_rate_time = null
    }
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
