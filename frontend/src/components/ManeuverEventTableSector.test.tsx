// @vitest-environment jsdom
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { maneuverSelectionKey } from '../utils/maneuverEvents'
import { maneuverAtMinute } from '../utils/maneuverTestFixtures'
import type { ManeuverWindSector } from '../utils/maneuverWindSector'
import ManeuverEventTable, { formatManeuverCount } from './ManeuverEventTable'
import { setupManeuverEventTableHarness } from './maneuverEventTableTestUtils'

const upP = maneuverAtMinute(1, 'primary')
const upDownC = maneuverAtMinute(2, 'comparison')
const reachP = maneuverAtMinute(3, 'primary')
const unknownP = maneuverAtMinute(4, 'primary')
const upC = maneuverAtMinute(5, 'comparison')
const events = [upC, unknownP, reachP, upDownC, upP]

const sectors = new Map<string, ManeuverWindSector>([
  [maneuverSelectionKey(upP), { kind: 'single', sector: 'upwind' }],
  [maneuverSelectionKey(upDownC), { kind: 'transition', entry: 'upwind', exit: 'downwind' }],
  [maneuverSelectionKey(reachP), { kind: 'single', sector: 'reaching' }],
  [maneuverSelectionKey(upC), { kind: 'single', sector: 'upwind' }],
])

const FILTERS = ['all', 'upwind', 'reaching', 'downwind', 'transition']

function sectorCells(markup: string) {
  return [...markup.matchAll(/<td class="maneuver-event-table__sector"[^>]*>(.*?)<\/td>/g)].map((match) => match[1])
}

describe('Maneuver Analysis Sector column (#211.1)', () => {
  it('shows the Sector column last with short labels, transitions and — for unavailable context', () => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={events} primaryStatus="available" comparisonStatus="available" onSelect={vi.fn()}
      windSectors={sectors} sectorFilterResetKey="k"
    />)
    const headers = [...markup.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((match) => match[1].replace(/<[^>]+>/g, ''))
    expect(headers.slice(0, 2)).toEqual(['Time▲', 'Activity'])
    expect(headers.at(-1)).toBe('Sector')
    expect(sectorCells(markup)).toEqual(['Up', 'Up→Down', 'Reach', '—', 'Up'])
    expect(markup).toContain('data-maneuver-sector="transition" title="Upwind to Downwind"')
    expect(markup).toContain('data-maneuver-sector="unavailable">—</td>')
    expect(markup).not.toMatch(/tack|gybe/i)
  })

  it('shows — in every Sector cell and no sector filter without a TWD reference', () => {
    for (const windSectors of [null, undefined]) {
      const markup = renderToStaticMarkup(<ManeuverEventTable
        events={events} primaryStatus="available" comparisonStatus="available" onSelect={vi.fn()}
        windSectors={windSectors}
      />)
      expect(sectorCells(markup)).toEqual(['—', '—', '—', '—', '—'])
      expect(markup).not.toContain('data-maneuver-sector-filter')
      expect(markup).not.toContain('Filter maneuvers by wind sector')
    }
  })

  it('has no sector filter when no maneuvers are listed and keeps the existing empty state', () => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={[]} primaryStatus="available" onSelect={vi.fn()} windSectors={new Map()} sectorFilterResetKey="k"
    />)
    expect(markup).not.toContain('data-maneuver-sector-filter')
    expect(markup).toContain('No maneuvers detected in this Analysis Window.')
  })

  it('formats maneuver counts', () => {
    expect(formatManeuverCount(1)).toBe('1 maneuver')
    expect(formatManeuverCount(0)).toBe('0 maneuvers')
    expect(formatManeuverCount(6)).toBe('6 maneuvers')
  })
})

describe('Maneuver Analysis sector filter (#211.1)', () => {
  const harness = setupManeuverEventTableHarness({ events, windSectors: sectors })
  const { render, rowTimes, click } = harness
  let container: HTMLDivElement
  beforeEach(() => {
    container = harness.container
  })

  const option = (filter: string) => container.querySelector<HTMLButtonElement>(`[data-maneuver-sector-filter="${filter}"]`)!
  const rowSectors = () => [...container.querySelectorAll<HTMLElement>('.maneuver-event-table tbody .maneuver-event-table__sector')]
    .map((cell) => cell.textContent)
  const emptyState = () => container.querySelector('[data-maneuver-sector-empty]')

  it('offers All · Up · Reach · Down · Transition with counts, full accessible names and disabled empty options', async () => {
    await render()
    const group = container.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Filter maneuvers by wind sector')
    expect(group.className).toBe('wind-segments__filter')
    expect(FILTERS.map((filter) => option(filter).textContent)).toEqual(['All 5', 'Up 2', 'Reach 1', 'Down 0', 'Transition 1'])
    expect(FILTERS.map((filter) => option(filter).getAttribute('aria-label'))).toEqual([
      'All, 5 maneuvers', 'Upwind, 2 maneuvers', 'Reaching, 1 maneuver', 'Downwind, 0 maneuvers', 'Transition, 1 maneuver',
    ])
    expect(FILTERS.map((filter) => option(filter).disabled)).toEqual([false, false, false, true, false])
    expect(FILTERS.map((filter) => option(filter).getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect([...group.querySelectorAll('button')].every((button) => button.classList.contains('wind-segments__filter-option'))).toBe(true)
    // The first option is always All: there is no Reset option restoring the Analysis Window.
    expect(group.textContent).not.toContain('Reset')
    // Filter sits above the table.
    expect(group.compareDocumentPosition(container.querySelector('.maneuver-event-table')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('narrows the table only; — maneuvers appear only under All', async () => {
    const onSelect = vi.fn()
    await render({ onSelect })
    expect(rowSectors()).toEqual(['Up', 'Up→Down', 'Reach', '—', 'Up'])
    await click(option('upwind'))
    expect(option('upwind').getAttribute('aria-pressed')).toBe('true')
    expect(rowSectors()).toEqual(['Up', 'Up'])
    expect(rowTimes()).toEqual(['08:01:00', '08:05:00'])
    await click(option('transition'))
    expect(rowSectors()).toEqual(['Up→Down'])
    await click(option('reaching'))
    expect(rowSectors()).toEqual(['Reach'])
    // Counts stay those of all listed maneuvers while filtered.
    expect(FILTERS.map((filter) => option(filter).textContent)).toEqual(['All 5', 'Up 2', 'Reach 1', 'Down 0', 'Transition 1'])
    await click(option('all'))
    expect(rowSectors()).toEqual(['Up', 'Up→Down', 'Reach', '—', 'Up'])
    expect(onSelect).not.toHaveBeenCalled()
    // Evidence summary and statuses are untouched by the filter.
    expect(container.querySelector('.maneuver-evidence')!.textContent).toContain('P · HIGH evidence')
  })

  it('keeps sorting, row selection and P/C attribution inside the filtered table', async () => {
    const onSelect = vi.fn()
    await render({ onSelect, selectedKey: maneuverSelectionKey(upC) })
    await click(option('upwind'))
    await click(container.querySelector<HTMLButtonElement>('.maneuver-event-table__sort')!)
    expect(rowTimes()).toEqual(['08:05:00', '08:01:00'])
    const rows = [...container.querySelectorAll<HTMLTableRowElement>('.maneuver-event-table tbody tr')]
    expect(rows.map((row) => row.getAttribute('aria-selected'))).toEqual(['true', 'false'])
    expect(rows[0].className).toContain('maneuver-event-table__row--comparison')
    expect(rows.map((row) => row.querySelector('.maneuver-event-table__activity')!.textContent)).toEqual(['C', 'P'])
    await act(async () => rows[1].click())
    expect(onSelect).toHaveBeenCalledWith(upP)
  })

  it('selects once through the row when its time button is activated (keyboard Enter/Space dispatch click) (#211.4)', async () => {
    const onSelect = vi.fn()
    await render({ onSelect })
    await click(container.querySelector<HTMLButtonElement>('.maneuver-event-table__button')!)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(upP)
  })

  it('only hides a selected maneuver that does not match; it is highlighted again under All', async () => {
    await render({ selectedKey: maneuverSelectionKey(reachP) })
    await click(option('upwind'))
    expect(container.querySelector('[aria-selected="true"]')).toBeNull()
    await click(option('all'))
    const selected = container.querySelector<HTMLTableRowElement>('[aria-selected="true"]')!
    expect(selected.querySelector('td')!.textContent).toBe('08:03:00')
  })

  it('keeps a selected option with no listed maneuvers selected and shows its empty state', async () => {
    await render()
    await click(option('transition'))
    // Same reset key, but the listed maneuvers no longer contain a transition.
    await render({ events: [upP, reachP, unknownP] })
    expect(option('transition').textContent).toBe('Transition 0')
    expect(option('transition').getAttribute('aria-pressed')).toBe('true')
    expect(option('transition').disabled).toBe(false)
    expect(option('downwind').disabled).toBe(true)
    expect(emptyState()!.textContent).toBe('No Transition maneuvers in this window')
    expect(container.querySelector('.maneuver-event-table')).toBeNull()
    await click(option('reaching'))
    expect(emptyState()).toBeNull()
    expect(rowSectors()).toEqual(['Reach'])
    // An empty listed population with an active filter keeps the filter and its empty state.
    await render({ events: [] })
    expect(option('reaching').getAttribute('aria-pressed')).toBe('true')
    expect(emptyState()!.textContent).toBe('No Reaching maneuvers in this window')
    expect(container.textContent).not.toContain('No maneuvers detected in this Analysis Window.')
  })

  it('resets to All when the reset key changes (Activity or Analysis Window change)', async () => {
    await render({ resetKey: 'a::1' })
    await click(option('reaching'))
    expect(rowSectors()).toEqual(['Reach'])
    await render({ resetKey: 'a::2' })
    expect(option('all').getAttribute('aria-pressed')).toBe('true')
    expect(rowSectors()).toEqual(['Up', 'Up→Down', 'Reach', '—', 'Up'])
    await click(option('upwind'))
    await render({ resetKey: 'a:b:3' })
    expect(option('all').getAttribute('aria-pressed')).toBe('true')
    expect(rowSectors()).toHaveLength(5)
  })

  it('removes the filter and shows every row with — when the TWD reference disappears', async () => {
    await render()
    await click(option('upwind'))
    await render({ windSectors: null })
    expect(container.querySelector('[data-maneuver-sector-filter]')).toBeNull()
    expect(rowSectors()).toEqual(['—', '—', '—', '—', '—'])
  })

  it('recomputes column values and counts when the sector context changes (TWD correction)', async () => {
    await render()
    const allDown = new Map<string, ManeuverWindSector>(events.map((event) => [maneuverSelectionKey(event), { kind: 'single', sector: 'downwind' }]))
    await render({ windSectors: allDown })
    expect(rowSectors()).toEqual(['Down', 'Down', 'Down', 'Down', 'Down'])
    expect(FILTERS.map((filter) => option(filter).textContent)).toEqual(['All 5', 'Up 0', 'Reach 0', 'Down 5', 'Transition 0'])
  })
})
