// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { WindSegment } from '../utils/windSegments'
import WindSegmentsSection, { formatWindSegmentCount } from './WindSegmentsSection'

const t0 = Date.UTC(2025, 5, 21, 11, 30)
const segments: WindSegment[] = [
  { kind: 'unclassified', start: t0, end: t0 + 300_000 },
  { kind: 'upwind', start: t0 + 300_000, end: t0 + 670_000 },
  { kind: 'unclassified', start: t0 + 670_000, end: t0 + 715_000 },
  { kind: 'reaching', start: t0 + 715_000, end: t0 + 820_000 },
]

function text(markup: string) {
  return markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('WindSegmentsSection', () => {
  it('is collapsed by default with the segment count in the header', () => {
    const markup = renderToStaticMarkup(<WindSegmentsSection segments={segments} analysisWindow={null} onSegmentSelect={vi.fn()} />)
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toMatch(/<div id="[^"]+" hidden="">/)
    expect(text(markup.split('hidden=""')[0])).toContain('Wind Segments (P) 4 segments')
    expect(formatWindSegmentCount(1)).toBe('1 segment')
    expect(formatWindSegmentCount(0)).toBe('0 segments')
  })

  it('lists Segment, Time and Duration in page flow, with secondary Unclassified rows and the current window highlighted', () => {
    const markup = renderToStaticMarkup(<WindSegmentsSection
      segments={segments} analysisWindow={{ start: t0 + 300_000, end: t0 + 670_000 }} onSegmentSelect={vi.fn()}
    />)
    const content = text(markup)
    expect(content).toContain('Segment Time (UTC) Duration')
    expect(content).toContain('Unclassified 11:30:00–11:35:00 5m00s')
    expect(content).toContain('Upwind 11:35:00–11:41:10 6m10s')
    expect(content).toContain('Reaching 11:41:55–11:43:40 1m45s')
    expect(content).not.toMatch(/Pre-start|Reach /)
    expect(markup.match(/wind-segments__row--secondary/g)).toHaveLength(2)
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(markup).toContain('aria-pressed="true" aria-label="Set Analysis Window to Upwind segment 11:35:00–11:41:10 UTC"')
    expect(markup).toContain('<th scope="col" class="wind-segments__segment-column">Segment</th>')
    expect(markup).not.toContain('wind-context-table-wrap')
    expect(markup).not.toContain('data-wind-segment-comparison')
  })

  it('shows the isolated C column only when classifications are provided', () => {
    const markup = renderToStaticMarkup(<WindSegmentsSection
      segments={segments} analysisWindow={null} onSegmentSelect={vi.fn()}
      comparisonSegmentClassifications={['unavailable', 'upwind', 'mixed', 'reaching']}
    />)
    const content = text(markup)
    expect(content).toContain('Segment Time (UTC) Duration C')
    expect(content).toContain('Unclassified 11:30:00–11:35:00 5m00s Unavailable')
    expect(content).toContain('Upwind 11:35:00–11:41:10 6m10s Upwind')
    expect(content).toContain('Unclassified 11:41:10–11:41:55 45s Mixed')
    expect(markup.match(/data-wind-segment-comparison/g)).toHaveLength(4)
  })

  it('shows an empty state', () => {
    const markup = renderToStaticMarkup(<WindSegmentsSection segments={[]} analysisWindow={null} onSegmentSelect={vi.fn()} />)
    expect(text(markup)).toContain('0 segments')
    expect(text(markup)).toContain('No segments for P in the available range.')
  })

  it('selects a segment from its row button and toggles open', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const onSegmentSelect = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<WindSegmentsSection segments={segments} analysisWindow={null} onSegmentSelect={onSegmentSelect} />))
    const toggle = container.querySelector<HTMLButtonElement>('.maneuver-section__collapse')!
    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await act(async () => container.querySelectorAll<HTMLButtonElement>('.wind-segments__button')[1].click())
    expect(onSegmentSelect).toHaveBeenCalledTimes(1)
    expect(onSegmentSelect).toHaveBeenCalledWith(segments[1])
    await act(async () => root.unmount())
    container.remove()
  })
})
