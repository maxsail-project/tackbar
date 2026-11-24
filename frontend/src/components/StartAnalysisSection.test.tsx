// @vitest-environment jsdom
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { START_ANALYSIS_CONFIG } from '../config/startAnalysis'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import { UNAVAILABLE_START_METRICS, type StartAnalysisRow, type StartDetailTable } from '../utils/startAnalysis'
import { START_FIXTURE_GUN } from '../utils/startAnalysisTestFixtures'
import StartAnalysisSection, {
  formatStartCross,
  formatStartDetailHeading,
  formatStartDetailValue,
  formatStartDistance,
  formatStartFavoured,
  formatStartLinePercent,
  formatStartOffset,
  formatStartTimingNote,
  formatStartUpwindLead,
} from './StartAnalysisSection'

const offsetsSeconds = START_ANALYSIS_CONFIG.detailOffsetsSeconds
const [sog, distance, hdg, cog, heel, windwardGap] = START_ANALYSIS_CONFIG.detailIndicators
const series = (value: number | null) => offsetsSeconds.map(() => value)

/** S1 detail with a Comparison: HDG not recorded for P, directions around north, signed Heel. */
const s1Detail: StartDetailTable = {
  offsetsSeconds,
  rows: [
    { indicator: sog, role: 'primary', values: [3, 4.5, 5, 6.04, null] },
    { indicator: sog, role: 'comparison', values: series(4) },
    { indicator: distance, role: 'primary', values: [45, 15, -5, 0.04, null] },
    { indicator: distance, role: 'comparison', values: series(-4.5) },
    { indicator: hdg, role: 'primary', values: series(null) },
    { indicator: hdg, role: 'comparison', values: series(359.6) },
    { indicator: cog, role: 'primary', values: series(359.4) },
    { indicator: cog, role: 'comparison', values: series(0.4) },
    { indicator: heel, role: 'primary', values: series(-12.6) },
    { indicator: heel, role: 'comparison', values: series(8.4) },
    { indicator: windwardGap, role: 'pair', values: [12.4, -3.6, 0.3, -0.4, null] },
  ],
}

const rows: StartAnalysisRow[] = [
  {
    label: 'S1',
    time: START_FIXTURE_GUN,
    shortTimingMs: 84_000,
    primary: { crossSeconds: 2.5, distanceAtGunMeters: 5, linePercent: 50.4, sogCrossKnots: 5.3 },
    comparison: { crossSeconds: -1.5, distanceAtGunMeters: -4.5, linePercent: -15.4, sogCrossKnots: null },
    detail: s1Detail,
    line: { lengthMeters: 200.4, wind: { source: 'modelled', biasDegrees: 5.4, favouredEnd: 'boat', advantageMeters: 18.8 } },
  },
  {
    label: 'S2',
    time: START_FIXTURE_GUN + 600_000,
    shortTimingMs: null,
    primary: { ...UNAVAILABLE_START_METRICS },
    comparison: { crossSeconds: null, distanceAtGunMeters: 73.66, linePercent: 130, sogCrossKnots: null },
    detail: { offsetsSeconds, rows: s1Detail.rows.map((row) => ({ ...row, values: series(null) })) },
    line: null,
  },
]

function withoutComparison(row: StartAnalysisRow): StartAnalysisRow {
  return { ...row, comparison: null, detail: { ...row.detail, rows: row.detail.rows.filter((detailRow) => detailRow.role === 'primary') } }
}

function cells(row: Element) {
  return [...row.querySelectorAll('td')].map((cell) => cell.textContent)
}

function summaryMarkup(sectionRows: StartAnalysisRow[], analysisWindow: AnalysisWindowRange | null = fullWindow) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<StartAnalysisSection rows={sectionRows} analysisWindow={analysisWindow} onSelect={vi.fn()} />)
  return container
}

/** S1 at its start and S2 at its end: both endpoints are inside (#38 D15). */
const fullWindow = { start: START_FIXTURE_GUN, end: START_FIXTURE_GUN + 600_000 }

async function mount(sectionRows: StartAnalysisRow[], onSelect = vi.fn(), analysisWindow: AnalysisWindowRange | null = fullWindow) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = (range: AnalysisWindowRange | null) => act(async () => root.render(
    <StartAnalysisSection rows={sectionRows} analysisWindow={range} onSelect={onSelect} />,
  ))
  await render(analysisWindow)
  return { container, onSelect, render, unmount: async () => { await act(async () => root.unmount()); container.remove() } }
}

describe('START ANALYSIS formatting (#38.1, D16)', () => {
  it('formats Cross as signed compact seconds with SOG, Dist and Line with units, and states the short-timing fact', () => {
    expect([[7.44, 4.6], [-1.5, null], [0.04, 5], [-0.04, 5], [null, 4.6]].map(([seconds, knots]) => formatStartCross(seconds, knots)))
      .toEqual(['+7.4s · 4.6 kt', '−1.5s · —', '0.0s · 5.0 kt', '0.0s · 5.0 kt', '—'])
    expect([15.8, 73.66, -2.3, null].map(formatStartDistance)).toEqual(['+15.8 m', '+73.7 m', '−2.3 m', '—'])
    expect([87.4, -15.4, 130, null].map(formatStartLinePercent)).toEqual(['87%', '−15%', '130%', '—'])
    expect([84_000, 36_000, null].map(formatStartTimingNote)).toEqual(['⚠ Ends +1m24s', '⚠ Ends +36s', ''])
  })
})

describe('START ANALYSIS line bias presentation (#38 D20)', () => {
  const wind = (favouredEnd: 'pin' | 'boat' | 'square', source: 'modelled' | 'manual' = 'modelled') => ({
    lengthMeters: 286.6, wind: { source, biasDegrees: favouredEnd === 'pin' ? -7.6 : 0.2, favouredEnd, advantageMeters: 37.9 },
  })

  it('shows the favoured end by name, Square, or `—` without line or TWD', () => {
    expect([wind('pin'), wind('boat'), wind('square'), { lengthMeters: 286.6, wind: null }, null].map((line) => formatStartFavoured(line).text))
      .toEqual(['PIN', 'BOAT', 'Square', '—', '—'])
    expect(formatStartFavoured(wind('pin')).ariaLabel).toBe('Favoured end PIN')
  })

  it('extends the detailed heading with the line length, bias and wind source when available', () => {
    const heading = (line: StartAnalysisRow['line']) => formatStartDetailHeading({ label: 'S2', time: START_FIXTURE_GUN, line })
    expect(heading(wind('pin'))).toBe('S2 10:00:00 UTC · Line 287 m · PIN +8° (38 m) · TWD Modelled')
    expect(heading(wind('square', 'manual'))).toBe('S2 10:00:00 UTC · Line 287 m · Square · TWD Manual · Viewer')
    expect(heading({ lengthMeters: 286.6, wind: null })).toBe('S2 10:00:00 UTC · Line 287 m')
    expect(heading(null)).toBe('S2 10:00:00 UTC')
  })
})

describe('START ANALYSIS upwind lead (#38 D21)', () => {
  it('uses the unrounded gap for Level and names the leader at the 1 m boundary', () => {
    expect([-8.4, -1, -0.99, 0, 0.99, 1, 8.4, null].map((gap) => formatStartUpwindLead(gap).text))
      .toEqual(['C 8', 'C 1', 'Level', 'Level', 'Level', 'P 1', 'P 8', '—'])
  })
})

describe('START ANALYSIS table alignment (#38 D22)', () => {
  it('centres only Start table headers and values, with detailed indicator labels left aligned', () => {
    const css = readFileSync('src/styles.css', 'utf8')
    const startRules = css.slice(css.indexOf('/* #38 START ANALYSIS:'), css.indexOf('.wind-metric-table {'))
    expect(startRules).toMatch(/\.start-analysis-table th,\s*\.start-analysis-table td\s*\{[^}]*text-align: center/s)
    expect(startRules).toMatch(/\.start-analysis-table--detail th\.start-analysis-table__indicator\s*\{[^}]*text-align: left/s)
    expect(startRules).not.toMatch(/start-analysis-table__number\s*\{\s*text-align: right/)
  })
})

describe('StartAnalysisSection (#38.1)', () => {
  it('is a collapsed-by-default section with an accessible summary table', () => {
    const markup = renderToStaticMarkup(<StartAnalysisSection rows={rows} analysisWindow={fullWindow} onSelect={vi.fn()} />)
    const container = document.createElement('div')
    container.innerHTML = markup
    const section = container.querySelector('section')!
    expect(section.getAttribute('aria-labelledby')).toBe('start-analysis-title')
    expect(section.querySelector('#start-analysis-title')!.textContent).toBe('Start Analysis')
    const toggle = section.querySelector('.maneuver-section__collapse')!
    expect([toggle.textContent, toggle.getAttribute('aria-expanded')]).toEqual(['Expand', 'false'])
    expect(section.querySelector('[hidden]')!.id).toBe(toggle.getAttribute('aria-controls'))
    expect(section.querySelector('[data-start-analysis-caption]')!.textContent).toBe('Starts inferred from race timer · times UTC')
    expect(section.querySelector('[data-start-analysis-help]')!.textContent).toBe('Cross: time and SOG when crossing the line · Dist, Line: position at the gun')
    const table = section.querySelector('table')!
    expect(table.getAttribute('aria-label')).toBe('Start summary')
    expect([...table.querySelectorAll('thead th')].map((header) => header.textContent))
      .toEqual(['Activity', 'Start', 'Cross', 'Dist', 'Line', 'Fav', 'Note'])
    expect(table.querySelector('thead th .maneuver-event-table__sr-only')!.textContent).toBe('Activity')
  })

  it('lists one row group per Start, P row then C row, with `—` for unavailable values and no better-boat marking', () => {
    const container = summaryMarkup(rows)
    const groups = [...container.querySelectorAll('tbody')]
    expect(groups.map((group) => group.getAttribute('data-start-analysis-row'))).toEqual(['S1', 'S2'])
    const [p1, c1] = groups[0].querySelectorAll('tr')
    expect([p1, c1].map((row) => row.getAttribute('data-start-analysis-role'))).toEqual(['primary', 'comparison'])
    expect(cells(p1)).toEqual(['P', 'S110:00:00', '+2.5s · 5.3 kt', '+5.0 m', '50%', 'BOAT', '⚠ Ends +1m24s'])
    const favoured = p1.querySelector('[data-start-analysis-value="favoured"]')!
    expect([favoured.getAttribute('rowspan'), favoured.getAttribute('aria-label')]).toEqual(['2', 'Favoured end BOAT'])
    expect(cells(c1)).toEqual(['C', '−1.5s · —', '−4.5 m', '−15%'])
    const startButton = p1.querySelector('button')!
    expect([startButton.querySelector('.start-analysis-table__start-label')!.textContent, startButton.querySelector('.start-analysis-table__start-time')!.textContent])
      .toEqual(['S1', '10:00:00'])
    expect([...p1.querySelectorAll('[data-start-analysis-value]')].slice(0, 3).map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'Cross +2.5 seconds, SOG 5.3 knots', 'Distance to the line at the gun +5.0 metres', 'Line position at the gun 50 percent',
    ])
    expect(c1.querySelector('[data-start-analysis-value="cross"]')!.getAttribute('aria-label')).toBe('Cross −1.5 seconds, SOG unavailable')
    expect(p1.querySelector('button')!.closest('td')!.getAttribute('rowspan')).toBe('2')
    expect(p1.querySelector('[data-start-analysis-value="note"]')!.getAttribute('rowspan')).toBe('2')
    expect(cells(groups[1].querySelectorAll('tr')[0])).toEqual(['P', 'S210:10:00', '—', '—', '—', '—', ''])
    expect(cells(groups[1].querySelectorAll('tr')[1])).toEqual(['C', '—', '+73.7 m', '130%'])
    expect(groups[1].querySelector('[data-start-analysis-value="cross"]')!.getAttribute('aria-label')).toBe('Cross unavailable')
    expect(container.querySelectorAll('[data-start-analysis-value][style], strong, b')).toHaveLength(0)
    expect(p1.querySelector('td')!.getAttribute('style')).toContain('color')
  })

  it('shows crossings without an end-tolerance marker, including when SOG is unavailable', () => {
    const beyondEnds = { ...rows[0], primary: { ...rows[0].primary, linePercent: 102.5 }, comparison: { ...rows[0].comparison!, linePercent: -2.5 } }
    const container = summaryMarkup([beyondEnds, rows[1]])
    const [primary, comparison] = container.querySelectorAll('[data-start-analysis-row="S1"] tr')
    const cross = (row: Element) => row.querySelector('[data-start-analysis-value="cross"]')!
    expect([cross(primary).textContent, cross(primary).getAttribute('aria-label')]).toEqual([
      '+2.5s · 5.3 kt', 'Cross +2.5 seconds, SOG 5.3 knots',
    ])
    expect([cross(comparison).textContent, cross(comparison).getAttribute('aria-label')]).toEqual([
      '−1.5s · —', 'Cross −1.5 seconds, SOG unavailable',
    ])
    expect([primary, comparison].map((row) => row.querySelector('[data-start-analysis-value="line"]')!.textContent)).toEqual(['103%', '−2%'])
    expect(cross(container.querySelector('[data-start-analysis-row="S2"] tr')!).textContent).toBe('—')
  })

  it('renders the Note column only when a visible Start has a note', () => {
    const s2Only = summaryMarkup(rows, { start: START_FIXTURE_GUN + 1, end: START_FIXTURE_GUN + 600_000 })
    expect([...s2Only.querySelectorAll('thead th')].map((header) => header.textContent)).toEqual(['Activity', 'Start', 'Cross', 'Dist', 'Line', 'Fav'])
    expect(s2Only.querySelector('[data-start-analysis-value="note"]')).toBeNull()
    expect(cells(s2Only.querySelector('[data-start-analysis-role="primary"]')!)).toEqual(['P', 'S210:10:00', '—', '—', '—', '—'])
    expect(summaryMarkup(rows).querySelectorAll('[data-start-analysis-value="note"]')).toHaveLength(2)
  })

  it('shows only P rows without a Comparison and nothing without Starts', () => {
    const container = summaryMarkup(rows.map(withoutComparison))
    expect([...container.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-start-analysis-role'))).toEqual(['primary', 'primary'])
    expect(container.querySelector('tbody button')!.closest('td')!.getAttribute('rowspan')).toBe('1')
    expect(renderToStaticMarkup(<StartAnalysisSection rows={[]} analysisWindow={fullWindow} onSelect={vi.fn()} />)).toBe('')
  })

  it('expands, and selecting a row by pointer or keyboard button highlights its Start and seeks to its gun', async () => {
    const { container, onSelect, unmount } = await mount(rows)
    const toggle = container.querySelector<HTMLButtonElement>('.maneuver-section__collapse')!
    await act(async () => toggle.click())
    expect([toggle.textContent, toggle.getAttribute('aria-expanded')]).toEqual(['Collapse', 'true'])
    const group = (label: string) => container.querySelector(`[data-start-analysis-row="${label}"]`)!
    const button = (label: string) => group(label).querySelector('button')!
    expect(button('S1').getAttribute('aria-label')).toBe('Move replay to S1 gun at 10:00:00 UTC, inferred from race timer')
    expect([button('S1'), button('S2')].map((item) => item.getAttribute('aria-pressed'))).toEqual(['false', 'false'])

    await act(async () => group('S2').querySelector<HTMLElement>('[data-start-analysis-role="comparison"] td:last-child')!.click())
    expect(onSelect).toHaveBeenLastCalledWith({ label: 'S2', time: START_FIXTURE_GUN + 600_000 })
    expect(group('S2').classList.contains('start-analysis-table__start--selected')).toBe(true)
    expect(button('S2').getAttribute('aria-pressed')).toBe('true')

    // Enter/Space on the native button dispatch its click, which the row handles once.
    await act(async () => button('S1').click())
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith({ label: 'S1', time: START_FIXTURE_GUN })
    expect([button('S1'), button('S2')].map((item) => item.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    expect(group('S2').classList.contains('start-analysis-table__start--selected')).toBe(false)
    await unmount()
  })

  it('shows the detailed table of the selected Start only, switching with the selection and kept while collapsed', async () => {
    const { container, unmount } = await mount(rows)
    const toggle = container.querySelector<HTMLButtonElement>('.maneuver-section__collapse')!
    await act(async () => toggle.click())
    const detail = () => container.querySelector('[data-start-analysis-detail]')
    expect(detail()).toBeNull()

    await act(async () => container.querySelector<HTMLButtonElement>('[data-start-analysis-row="S1"] button')!.click())
    expect(detail()!.getAttribute('data-start-analysis-detail')).toBe('S1')
    expect(container.querySelector('table[aria-label="Start summary"]')!.compareDocumentPosition(detail()!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(detail()!.querySelector('h3')!.textContent).toBe('S1 10:00:00 UTC · Line 200 m · BOAT +5° (19 m) · TWD Modelled')
    expect(detail()!.querySelector('table')!.getAttribute('aria-label')).toBe('S1 details around the gun')

    await act(async () => container.querySelector<HTMLElement>('[data-start-analysis-row="S2"] td:last-child')!.click())
    expect(detail()!.querySelector('table')!.getAttribute('aria-label')).toBe('S2 details around the gun')
    expect(container.querySelectorAll('[data-start-analysis-detail]')).toHaveLength(1)

    await act(async () => toggle.click())
    expect(detail()!.closest('[hidden]')).not.toBeNull()
    await act(async () => toggle.click())
    expect(detail()!.getAttribute('data-start-analysis-detail')).toBe('S2')
    await unmount()
  })
})

describe('Start Analysis Analysis Window filter (#38 D15)', () => {
  const groups = (container: Element) => [...container.querySelectorAll('[data-start-analysis-row]')].map((group) => group.getAttribute('data-start-analysis-row'))

  it('lists only Starts whose gun lies inside the window, endpoints included', async () => {
    const { container, render, unmount } = await mount(rows)
    expect(groups(container)).toEqual(['S1', 'S2'])
    await render({ start: START_FIXTURE_GUN + 1, end: START_FIXTURE_GUN + 600_000 })
    expect(groups(container)).toEqual(['S2'])
    await render({ start: START_FIXTURE_GUN, end: START_FIXTURE_GUN + 599_999 })
    expect(groups(container)).toEqual(['S1'])
    expect(container.querySelector('[data-start-analysis-empty]')).toBeNull()
    await unmount()
  })

  it('keeps the section with the empty-window text when no Start is inside the window, or without a window', async () => {
    const { container, render, unmount } = await mount(rows, vi.fn(), { start: START_FIXTURE_GUN + 1, end: START_FIXTURE_GUN + 599_999 })
    expect(container.querySelector('section.start-analysis-section')).not.toBeNull()
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelector('[data-start-analysis-empty]')!.textContent).toBe('No inferred Start in the Analysis Window')
    await render(null)
    expect(container.querySelector('[data-start-analysis-empty]')).not.toBeNull()
    await unmount()
  })

  it('clears the selection and hides the detailed table when the selected Start leaves the window', async () => {
    const { container, render, unmount } = await mount(rows)
    await act(async () => container.querySelector<HTMLButtonElement>('[data-start-analysis-row="S1"] button')!.click())
    expect(container.querySelector('[data-start-analysis-detail="S1"]')).not.toBeNull()
    await render({ start: START_FIXTURE_GUN + 300_000, end: START_FIXTURE_GUN + 600_000 })
    expect(container.querySelector('[data-start-analysis-detail]')).toBeNull()
    // The selection is cleared, not hidden: S1 back in the window stays unselected.
    await render(fullWindow)
    expect(container.querySelector('[data-start-analysis-detail]')).toBeNull()
    expect(container.querySelector('[data-start-analysis-row="S1"] button')!.getAttribute('aria-pressed')).toBe('false')
    await unmount()
  })
})

describe('Start detailed table (#38.2)', () => {
  const rowText = (row: Element) => [...row.children].map((cell) => cell.textContent)

  async function selectedDetail(sectionRows: StartAnalysisRow[]) {
    const mounted = await mount(sectionRows)
    await act(async () => mounted.container.querySelector<HTMLButtonElement>('[data-start-analysis-row="S1"] button')!.click())
    return { ...mounted, table: mounted.container.querySelector('[data-start-analysis-detail] table')! }
  }

  it('formats offsets and each configured value format', () => {
    expect(offsetsSeconds.map(formatStartOffset)).toEqual(['−15s', '−5s', '0s', '+5s', '+15s'])
    expect([5.04, null].map((value) => formatStartDetailValue(value, 'fixed1'))).toEqual(['5.0', '—'])
    expect([2.46, -6, 0.04].map((value) => formatStartDetailValue(value, 'signed1'))).toEqual(['+2.5', '−6.0', '0.0'])
    expect([359.6, 359.4, 0.4, -1].map((value) => formatStartDetailValue(value, 'direction'))).toEqual(['0', '359', '0', '359'])
    expect([-12.6, 8.4, 80.6].map((value) => formatStartDetailValue(value, 'integer'))).toEqual(['−13', '8', '81'])
    expect([12.4, -3.6, 0.3, -0.4, null].map((value) => formatStartDetailValue(value, 'upwindLead'))).toEqual(['P 12', 'C 4', 'Level', 'Level', '—'])
  })

  it('has indicator, untitled P/C and offset headers, P/C rows per indicator and one upwind lead row', async () => {
    const { table, unmount } = await selectedDetail(rows)
    expect([...table.querySelectorAll('thead th')].map((header) => header.textContent))
      .toEqual(['Indicator', 'Activity', '−15s', '−5s', '0s', '+5s', '+15s'])
    expect(table.querySelectorAll('thead th .maneuver-event-table__sr-only')).toHaveLength(2)
    const groups = [...table.querySelectorAll('tbody')]
    expect(groups.map((group) => group.getAttribute('data-start-detail-indicator'))).toEqual(['sog', 'distance', 'hdg', 'cog', 'heel', 'windwardGap'])
    expect(groups.map((group) => [...group.querySelectorAll('tr')].map((row) => row.getAttribute('data-start-detail-role')).join('/')))
      .toEqual(['primary/comparison', 'primary/comparison', 'primary/comparison', 'primary/comparison', 'primary/comparison', 'pair'])
    const texts = groups.map((group) => [...group.querySelectorAll('tr')].map(rowText))
    expect(texts[0]).toEqual([['SOG (kt)', 'P', '3.0', '4.5', '5.0', '6.0', '—'], ['C', ...series(null).map(() => '4.0')]])
    expect(texts[1][0]).toEqual(['Dist (m)', 'P', '+45.0', '+15.0', '−5.0', '0.0', '—'])
    expect(texts[1][1]).toEqual(['C', ...series(null).map(() => '−4.5')])
    expect(texts[2]).toEqual([['HDG (°)', 'P', ...series(null).map(() => '—')], ['C', ...series(null).map(() => '0')]])
    expect(texts[3]).toEqual([['COG (°)', 'P', ...series(null).map(() => '359')], ['C', ...series(null).map(() => '0')]])
    expect(texts[4]).toEqual([['Heel (°)', 'P', ...series(null).map(() => '−13')], ['C', ...series(null).map(() => '8')]])
    expect(texts[5]).toEqual([['Lead (m)', '', 'P 12', 'C 4', 'Level', 'Level', '—']])
    expect(groups[0].querySelector('th')!.getAttribute('rowspan')).toBe('2')
    expect(groups[5].querySelector('th')!.getAttribute('rowspan')).toBe('1')
    expect(groups[0].querySelector('[data-start-detail-role="comparison"] td')!.getAttribute('style')).toContain('color')
    expect(groups[5].querySelector('td')!.getAttribute('style')).toBeNull()
    expect(table.querySelectorAll('td.start-analysis-table__number[style], strong, b')).toHaveLength(0)
    const leadCells = groups[5].querySelectorAll('td.start-analysis-table__number')
    expect([...leadCells].map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'P 12 metres further upwind', 'C 4 metres further upwind', 'Level upwind', 'Level upwind', 'Upwind lead unavailable',
    ])
    for (const [index, role] of [[0, 'primary'], [1, 'comparison']] as const) {
      const expected = document.createElement('span')
      expected.style.color = ACTIVITY_COLORS[role]
      expect((leadCells[index].querySelector('span') as HTMLElement).style.color).toBe(expected.style.color)
    }
    expect([...leadCells].slice(2).every((cell) => cell.querySelector('span') === null)).toBe(true)
    await unmount()
  })

  it('has P rows only and no upwind lead row without a Comparison', async () => {
    const { table, unmount } = await selectedDetail(rows.map(withoutComparison))
    expect([...table.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-start-detail-role'))).toEqual(Array(5).fill('primary'))
    expect(table.querySelector('[data-start-detail-indicator="windwardGap"]')).toBeNull()
    await unmount()
  })
})
