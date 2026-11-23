// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { UNAVAILABLE_START_METRICS, type StartAnalysisRow } from '../utils/startAnalysis'
import { START_FIXTURE_GUN } from '../utils/startAnalysisTestFixtures'
import StartAnalysisSection, {
  formatStartCross,
  formatStartDistance,
  formatStartLinePercent,
  formatStartTimingNote,
} from './StartAnalysisSection'

const rows: StartAnalysisRow[] = [
  {
    label: 'S1',
    time: START_FIXTURE_GUN,
    shortTimingMs: 84_000,
    primary: { crossSeconds: 2.5, distanceAtGunMeters: 5, linePercent: 50.4, sogCrossKnots: 5.3 },
    comparison: { crossSeconds: -1.5, distanceAtGunMeters: -4.5, linePercent: -15.4, sogCrossKnots: null },
  },
  {
    label: 'S2',
    time: START_FIXTURE_GUN + 600_000,
    shortTimingMs: null,
    primary: { ...UNAVAILABLE_START_METRICS },
    comparison: { crossSeconds: null, distanceAtGunMeters: 73.66, linePercent: 130, sogCrossKnots: null },
  },
]

function cells(row: Element) {
  return [...row.querySelectorAll('td')].map((cell) => cell.textContent)
}

async function mount(sectionRows: StartAnalysisRow[], onSelect = vi.fn()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<StartAnalysisSection rows={sectionRows} onSelect={onSelect} />))
  return { container, onSelect, unmount: async () => { await act(async () => root.unmount()); container.remove() } }
}

describe('START ANALYSIS formatting (#38.1)', () => {
  it('signs Cross and Dist with one decimal, rounds Line to an integer and states the short-timing fact', () => {
    expect([2.46, -1.5, 0.04, -0.04, null].map(formatStartCross)).toEqual(['+2.5', '−1.5', '0.0', '0.0', '—'])
    expect([73.66, -2.3, null].map(formatStartDistance)).toEqual(['+73.7', '−2.3', '—'])
    expect([50.4, -15.4, 130, null].map(formatStartLinePercent)).toEqual(['50', '−15', '130', '—'])
    expect([84_000, 36_000, null].map(formatStartTimingNote)).toEqual(['⚠ Ends +1m24s', '⚠ Ends +36s', ''])
  })
})

describe('StartAnalysisSection (#38.1)', () => {
  it('is a collapsed-by-default section with an accessible summary table', () => {
    const markup = renderToStaticMarkup(<StartAnalysisSection rows={rows} onSelect={vi.fn()} />)
    const container = document.createElement('div')
    container.innerHTML = markup
    const section = container.querySelector('section')!
    expect(section.getAttribute('aria-labelledby')).toBe('start-analysis-title')
    expect(section.querySelector('#start-analysis-title')!.textContent).toBe('Start Analysis')
    const toggle = section.querySelector('.maneuver-section__collapse')!
    expect([toggle.textContent, toggle.getAttribute('aria-expanded')]).toEqual(['Expand', 'false'])
    expect(section.querySelector('[hidden]')!.id).toBe(toggle.getAttribute('aria-controls'))
    expect(section.querySelector('[data-start-analysis-caption]')!.textContent).toBe('Starts inferred from race timer · times UTC')
    const table = section.querySelector('table')!
    expect(table.getAttribute('aria-label')).toBe('Start summary')
    expect([...table.querySelectorAll('thead th')].map((header) => header.textContent))
      .toEqual(['Activity', 'Start', 'Cross (s)', 'Dist at gun (m)', 'Line (%)', 'SOG cross (kt)', 'Note'])
    expect(table.querySelector('thead th .maneuver-event-table__sr-only')!.textContent).toBe('Activity')
  })

  it('lists one row group per Start, P row then C row, with `—` for unavailable values and no better-boat marking', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(<StartAnalysisSection rows={rows} onSelect={vi.fn()} />)
    const groups = [...container.querySelectorAll('tbody')]
    expect(groups.map((group) => group.getAttribute('data-start-analysis-row'))).toEqual(['S1', 'S2'])
    const [p1, c1] = groups[0].querySelectorAll('tr')
    expect([p1, c1].map((row) => row.getAttribute('data-start-analysis-role'))).toEqual(['primary', 'comparison'])
    expect(cells(p1)).toEqual(['P', 'S1 10:00:00', '+2.5', '+5.0', '50', '5.3', '⚠ Ends +1m24s'])
    expect(cells(c1)).toEqual(['C', '−1.5', '−4.5', '−15', '—'])
    expect(p1.querySelector('button')!.closest('td')!.getAttribute('rowspan')).toBe('2')
    expect(p1.querySelector('[data-start-analysis-value="note"]')!.getAttribute('rowspan')).toBe('2')
    expect(cells(groups[1].querySelectorAll('tr')[0])).toEqual(['P', 'S2 10:10:00', '—', '—', '—', '—', ''])
    expect(cells(groups[1].querySelectorAll('tr')[1])).toEqual(['C', '—', '+73.7', '130', '—'])
    expect(container.querySelectorAll('[data-start-analysis-value][style], strong, b')).toHaveLength(0)
    expect(p1.querySelector('td')!.getAttribute('style')).toContain('color')
  })

  it('shows only P rows without a Comparison and nothing without Starts', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(<StartAnalysisSection rows={rows.map((row) => ({ ...row, comparison: null }))} onSelect={vi.fn()} />)
    expect([...container.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-start-analysis-role'))).toEqual(['primary', 'primary'])
    expect(container.querySelector('tbody button')!.closest('td')!.getAttribute('rowspan')).toBe('1')
    expect(renderToStaticMarkup(<StartAnalysisSection rows={[]} onSelect={vi.fn()} />)).toBe('')
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
})
