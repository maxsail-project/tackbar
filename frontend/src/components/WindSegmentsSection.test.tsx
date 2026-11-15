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
    const markup = renderToStaticMarkup(<WindSegmentsSection segments={segments} analysisWindow={null} onSegmentSelect={vi.fn()} filterResetKey="a" />)
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toMatch(/<div id="[^"]+" hidden="">/)
    expect(text(markup.split('hidden=""')[0])).toContain('Wind Segments (P) 4 segments')
    expect(formatWindSegmentCount(1)).toBe('1 segment')
    expect(formatWindSegmentCount(0)).toBe('0 segments')
  })

  it('lists Segment, Time and Duration in page flow, with secondary Unclassified rows and the current window highlighted', () => {
    const markup = renderToStaticMarkup(<WindSegmentsSection
      segments={segments} analysisWindow={{ start: t0, end: t0 + 820_000 }} onSegmentSelect={vi.fn()} filterResetKey="a"
    />)
    const content = text(markup)
    expect(content).toContain('Segment Time (UTC) Duration')
    expect(content).toContain('Unclassified 11:30:00–11:35:00 5m00s')
    expect(content).toContain('Upwind 11:35:00–11:41:10 6m10s')
    expect(content).toContain('Reaching 11:41:55–11:43:40 1m45s')
    // Table labels keep the full type names; the compact filter labels are separate.
    expect(text(markup.slice(markup.indexOf('<table')))).not.toMatch(/Pre-start|Reach |Other|partial/)
    expect(markup.match(/wind-segments__row--secondary/g)).toHaveLength(2)
    const highlighted = renderToStaticMarkup(<WindSegmentsSection
      segments={segments} analysisWindow={{ start: t0 + 300_000, end: t0 + 670_000 }} onSegmentSelect={vi.fn()} filterResetKey="a"
    />)
    expect(highlighted.slice(highlighted.indexOf('<table')).match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(highlighted).toContain('aria-pressed="true" aria-label="Set Analysis Window to Upwind segment 11:35:00–11:41:10 UTC"')
    expect(markup).toContain('<th scope="col" class="wind-segments__segment-column">Segment</th>')
    expect(markup).not.toContain('wind-context-table-wrap')
    expect(markup).not.toContain('data-wind-segment-comparison')
  })

  it('shows the isolated C column only when classifications are provided', () => {
    const markup = renderToStaticMarkup(<WindSegmentsSection
      segments={segments} analysisWindow={null} onSegmentSelect={vi.fn()} filterResetKey="a"
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
    const markup = renderToStaticMarkup(<WindSegmentsSection segments={[]} analysisWindow={null} onSegmentSelect={vi.fn()} filterResetKey="a" />)
    expect(text(markup)).toContain('0 segments')
    expect(text(markup)).toContain('No segments for P in this Analysis Window.')
  })

  it('selects a segment from its row button and toggles open', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const onSegmentSelect = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<WindSegmentsSection segments={segments} analysisWindow={null} onSegmentSelect={onSegmentSelect} filterResetKey="a" />))
    const toggle = container.querySelector<HTMLButtonElement>('.maneuver-section__collapse')!
    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await act(async () => container.querySelectorAll<HTMLButtonElement>('.wind-segments__button')[1].click())
    expect(onSegmentSelect).toHaveBeenCalledTimes(1)
    expect(onSegmentSelect).toHaveBeenCalledWith(segments[1])
    await act(async () => root.unmount())
    container.remove()
  })

  it('lists only segments overlapping the window, marks partial ones and selects full segment bounds', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const onSegmentSelect = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    // Window 11:36:00–11:42:00 touches Upwind (partial), Unclassified (inside) and Reaching (partial).
    const window = { start: t0 + 360_000, end: t0 + 720_000 }
    await act(async () => root.render(<WindSegmentsSection segments={segments} analysisWindow={window} onSegmentSelect={onSegmentSelect} filterResetKey="a" />))
    const rows = () => [...container.querySelectorAll<HTMLTableRowElement>('[data-wind-segment]')]
    expect(rows().map((row) => row.dataset.windSegment)).toEqual(['upwind', 'unclassified', 'reaching'])
    expect(rows().map((row) => row.dataset.windSegmentPartial ?? 'no')).toEqual(['true', 'no', 'true'])
    expect(rows()[0].querySelector('.wind-segments__partial')!.textContent).toBe('partial')
    expect(rows()[0].querySelector('button')!.getAttribute('aria-label')).toBe('Set Analysis Window to Upwind segment 11:35:00–11:41:10 UTC, partly outside the current window')
    expect(container.querySelector('[data-wind-segments-summary]')!.textContent).toBe('3 segments')
    await act(async () => rows()[0].querySelector('button')!.click())
    expect(onSegmentSelect).toHaveBeenCalledWith(segments[1])
    await act(async () => root.unmount())
    container.remove()
  })

  it('filters by type with counts, disables empty types, shows — for a missing C value and resets to All on a new Primary', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const render = (key: string, comparison?: ('upwind' | 'mixed')[]) => act(async () => root.render(<WindSegmentsSection
      segments={segments} analysisWindow={null} onSegmentSelect={vi.fn()} filterResetKey={key}
      comparisonSegmentClassifications={comparison}
    />))
    await render('a', ['upwind', 'mixed'])
    const option = (filter: string) => container.querySelector<HTMLButtonElement>(`[data-wind-segment-filter="${filter}"]`)!
    const kinds = () => [...container.querySelectorAll<HTMLTableRowElement>('[data-wind-segment]')].map((row) => row.dataset.windSegment)
    expect(['all', 'upwind', 'reaching', 'downwind', 'unclassified'].map((filter) => option(filter).textContent))
      .toEqual(['All 4', 'Up 1', 'Reach 1', 'Down 0', 'Other 2'])
    expect(['all', 'upwind', 'reaching', 'downwind', 'unclassified'].map((filter) => option(filter).getAttribute('aria-label')))
      .toEqual(['All, 4 segments', 'Upwind, 1 segment', 'Reaching, 1 segment', 'Downwind, 0 segments', 'Unclassified, 2 segments'])
    expect(option('downwind').disabled).toBe(true)
    expect(option('upwind').disabled).toBe(false)
    expect(option('all').getAttribute('aria-pressed')).toBe('true')
    expect([...container.querySelectorAll('[data-wind-segment-comparison]')].map((cell) => cell.textContent)).toEqual(['Upwind', 'Mixed', '—', '—'])
    await act(async () => option('unclassified').click())
    expect(kinds()).toEqual(['unclassified', 'unclassified'])
    expect(option('unclassified').getAttribute('aria-pressed')).toBe('true')
    await render('a')
    expect(kinds()).toEqual(['unclassified', 'unclassified'])
    expect(container.querySelector('[data-wind-segment-comparison]')).toBeNull()
    await render('b')
    expect(option('all').getAttribute('aria-pressed')).toBe('true')
    expect(kinds()).toEqual(['unclassified', 'upwind', 'unclassified', 'reaching'])
    await act(async () => root.unmount())
    container.remove()
  })

  it('uses normal weight for classified rows and keeps the muted style only for Unclassified', () => {
    const markup = renderToStaticMarkup(<WindSegmentsSection segments={segments} analysisWindow={null} onSegmentSelect={vi.fn()} filterResetKey="a" />)
    const rowClasses = [...markup.matchAll(/<tr class="([^"]+)" data-wind-segment="([a-z]+)"/g)].map((match) => [match[2], match[1]])
    expect(rowClasses).toEqual([
      ['unclassified', 'wind-segments__row wind-segments__row--secondary'],
      ['upwind', 'wind-segments__row'],
      ['unclassified', 'wind-segments__row wind-segments__row--secondary'],
      ['reaching', 'wind-segments__row'],
    ])
  })

  it('keeps a selected type with no listed segments selected and shows its empty state', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const render = (window: { start: number, end: number } | null) => act(async () => root.render(<WindSegmentsSection
      segments={segments} analysisWindow={window} onSegmentSelect={vi.fn()} filterResetKey="a"
    />))
    await render(null)
    const option = (filter: string) => container.querySelector<HTMLButtonElement>(`[data-wind-segment-filter="${filter}"]`)!
    await act(async () => option('upwind').click())
    // A window covering only the trailing Reaching segment lists no Upwind segment.
    await render({ start: t0 + 720_000, end: t0 + 800_000 })
    expect(option('upwind').textContent).toBe('Up 0')
    expect(option('upwind').getAttribute('aria-pressed')).toBe('true')
    expect(option('upwind').disabled).toBe(false)
    expect(option('downwind').disabled).toBe(true)
    expect(container.querySelector('[data-wind-segments-empty]')!.textContent).toBe('No Upwind segments in this window')
    expect(container.querySelector('[data-wind-segment]')).toBeNull()
    await act(async () => option('all').click())
    expect([...container.querySelectorAll<HTMLTableRowElement>('[data-wind-segment]')].map((row) => row.dataset.windSegment)).toEqual(['reaching'])
    await act(async () => root.unmount())
    container.remove()
  })
})
