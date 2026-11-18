// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import { maneuverSelectionKey } from '../utils/maneuverEvents'
import { MANEUVER_FIXTURE_BASE_MS, maneuverAtMinute } from '../utils/maneuverTestFixtures'
import type { ManeuverWindSector } from '../utils/maneuverWindSector'
import ManeuverEventTable, { sortManeuverEventsByLossTime } from './ManeuverEventTable'
import { setupManeuverEventTableHarness } from './maneuverEventTableTestUtils'

function eventAt(
  minute: number,
  activityRole: DisplayManeuver['activityRole'],
  lossTimeS: number | null,
): DisplayManeuver {
  return maneuverAtMinute(minute, activityRole, {
    speed_loss_distance_m: 9,
    speed_loss_time_s: lossTimeS,
    recovery_time_s: 12,
  })
}

// P upwind m1–m8 (Loss 5, 1, 8, 3, 6, 2, 7, 4 s), P upwind m9 without Loss time,
// C m10–m12 without sector (below the minimum population), P reaching m13–m15 (20, 21, 22 s).
const upwindP = [5, 1, 8, 3, 6, 2, 7, 4].map((loss, index) => eventAt(index + 1, 'primary', loss))
const noLossP = eventAt(9, 'primary', null)
const comparisonC = [1, 2, 3].map((loss, index) => eventAt(index + 10, 'comparison', loss))
const reachP = [20, 21, 22].map((loss, index) => eventAt(index + 13, 'primary', loss))
const events = [...reachP, ...comparisonC, noLossP, ...upwindP].reverse()

const sectors = new Map<string, ManeuverWindSector>([
  ...[...upwindP, noLossP].map((event): [string, ManeuverWindSector] => [maneuverSelectionKey(event), { kind: 'single', sector: 'upwind' }]),
  ...reachP.map((event): [string, ManeuverWindSector] => [maneuverSelectionKey(event), { kind: 'single', sector: 'reaching' }]),
])

const time = (minute: number) => `08:${String(minute).padStart(2, '0')}:00`

function lossTimeCells(markup: string) {
  const rows = [...markup.matchAll(/<tr class="maneuver-event-table__row[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1])
  return rows.map((row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)][4][0])
}

const staticMarkup = (tableEvents: DisplayManeuver[]) => renderToStaticMarkup(<ManeuverEventTable
  events={tableEvents} primaryStatus="available" comparisonStatus="available" onSelect={vi.fn()}
  windSectors={sectors} sectorFilterResetKey="k"
/>)

describe('Maneuver Analysis loss band markers (#211.2)', () => {
  it('marks the Loss (s) cell of banded maneuvers with a neutral marker and accessible text, without a new column', () => {
    const markup = staticMarkup(events)
    const headers = [...markup.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)]
    expect(headers).toHaveLength(11)
    expect(markup).not.toMatch(/<th[^>]*>[^<]*(band|High loss)/i)
    const cells = lossTimeCells(markup)
    expect(cells).toHaveLength(15)
    // m3 (8 s) among P's 11 Loss times 1…8, 20, 21, 22: cuts 3.5 and 14 → Typical.
    expect(cells[2]).toBe('<td class="maneuver-loss-band maneuver-loss-band--typical" data-maneuver-loss-band="typical" title="Typical">8<span class="maneuver-event-table__sr-only"> · Typical</span></td>')
    expect(cells[1]).toBe('<td class="maneuver-loss-band maneuver-loss-band--low" data-maneuver-loss-band="low" title="Low loss"><span class="maneuver-loss-band__marker maneuver-loss-band__marker--low" aria-hidden="true"></span>1<span class="maneuver-event-table__sr-only"> · Low loss</span></td>')
    expect(cells[14]).toBe('<td class="maneuver-loss-band maneuver-loss-band--high" data-maneuver-loss-band="high" title="High loss"><span class="maneuver-loss-band__marker maneuver-loss-band__marker--high" aria-hidden="true"></span>22<span class="maneuver-event-table__sr-only"> · High loss</span></td>')
    // Unbanded: P without Loss time (unavailable stays unavailable) and C below the minimum population.
    expect(cells[8]).toBe('<td>—</td>')
    expect(cells.slice(9, 12)).toEqual(['<td>1</td>', '<td>2</td>', '<td>3</td>'])
    expect(markup.match(/data-maneuver-loss-band="/g)).toHaveLength(11)
    // Bands never use P/C colours on the Loss cell and never read as a score or ranking.
    expect(cells.join('')).not.toMatch(/style=/)
    expect(markup).not.toMatch(/score|rank|better|worse|best|worst/i)
  })

  it('adds no band markers and no legend below the minimum population', () => {
    const markup = staticMarkup(upwindP.slice(0, 7))
    expect(markup).not.toContain('data-maneuver-loss-band')
    expect(markup).not.toContain('maneuver-loss-band__marker')
    expect(markup).toContain('data-maneuver-sector-filter')
  })

  it('shows a one-line marker legend below the table, and no band filter', () => {
    const markup = staticMarkup(events)
    const legend = markup.match(/<p class="maneuver-loss-band-legend"[^>]*>([\s\S]*?)<\/p>/)!
    expect(markup.indexOf('</table>')).toBeLessThan(markup.indexOf('maneuver-loss-band-legend'))
    expect(legend[1].replace(/<[^>]+>/g, '')).toBe('High loss, Low loss · within each Activity')
    expect(legend[1]).toContain('<span class="maneuver-loss-band__marker maneuver-loss-band__marker--high" aria-hidden="true"></span>High loss')
    expect(legend[1]).toContain('<span class="maneuver-loss-band__marker maneuver-loss-band__marker--low" aria-hidden="true"></span>Low loss')
    expect(markup).not.toContain('data-maneuver-band-filter')
    expect(markup).not.toContain('Filter maneuvers by loss band')
    expect(markup).not.toContain('data-maneuver-band-empty')
  })
})

describe('sortManeuverEventsByLossTime (#211.2 D12)', () => {
  it('sorts P and C together by unrounded Loss time, ties chronologically and unavailable last', () => {
    const finer = eventAt(20, 'comparison', 3.4)
    const nan = eventAt(21, 'primary', Number.NaN)
    const input = [noLossP, nan, comparisonC[2], finer, upwindP[3], upwindP[0]]
    const minutes = (sorted: DisplayManeuver[]) => sorted.map((event) => (event.centerTimeMs - MANEUVER_FIXTURE_BASE_MS) / 60_000)
    // Loss 5 (m1), 3.4 (m20 C), 3 (m4 P) and 3 (m12 C) tie chronologically; m9 and m21 stay last.
    expect(minutes(sortManeuverEventsByLossTime(input, 'desc'))).toEqual([1, 20, 4, 12, 9, 21])
    expect(minutes(sortManeuverEventsByLossTime(input, 'asc'))).toEqual([4, 12, 20, 1, 9, 21])
  })
})

describe('Maneuver Analysis Loss (s) sorting and legend (#211.2)', () => {
  const harness = setupManeuverEventTableHarness({ events, windSectors: sectors })
  const { render, rowTimes, click } = harness
  let container: HTMLDivElement
  beforeEach(() => {
    container = harness.container
  })

  const sectorOption = (filter: string) => container.querySelector<HTMLButtonElement>(`[data-maneuver-sector-filter="${filter}"]`)!
  const headerCell = (label: string) => [...container.querySelectorAll<HTMLTableCellElement>('thead th')]
    .find((cell) => cell.textContent!.startsWith(label))!
  const sortButton = (label: string) => headerCell(label).querySelector<HTMLButtonElement>('button')!
  const legend = () => container.querySelector('[data-maneuver-loss-band-legend]')
  const headerState = (label: string) => [
    headerCell(label).getAttribute('aria-sort'),
    sortButton(label).textContent,
    sortButton(label).getAttribute('aria-label'),
  ]
  const lossDescending = [15, 14, 13, 3, 7, 5, 1, 8, 4, 12, 6, 11, 2, 10, 9].map(time)
  const lossAscending = [2, 10, 6, 11, 4, 12, 8, 1, 5, 7, 3, 13, 14, 15, 9].map(time)
  const chronological = Array.from({ length: 15 }, (_, index) => time(index + 1))

  it('sorts by Loss (s) largest first, then reverses, with direction indicator and aria-sort', async () => {
    await render()
    expect(rowTimes()).toEqual(chronological)
    expect(headerState('Time')).toEqual(['ascending', 'Time▲', 'Sort maneuvers by time descending'])
    expect(headerState('Loss (s)')).toEqual([null, 'Loss (s)⇅', 'Sort maneuvers by Loss time, largest first'])
    expect(container.querySelectorAll('thead th[aria-sort]')).toHaveLength(1)
    await click(sortButton('Loss (s)'))
    expect(rowTimes()).toEqual(lossDescending)
    expect(headerState('Loss (s)')).toEqual(['descending', 'Loss (s)▼', 'Sort maneuvers by Loss time, smallest first'])
    expect(headerState('Time')).toEqual([null, 'Time⇅', 'Sort maneuvers by time ascending'])
    await click(sortButton('Loss (s)'))
    expect(rowTimes()).toEqual(lossAscending)
    expect(headerState('Loss (s)')).toEqual(['ascending', 'Loss (s)▲', 'Sort maneuvers by Loss time, largest first'])
    expect(container.querySelectorAll('thead th[aria-sort]')).toHaveLength(1)
  })

  it('returns to chronological order from Time, keeping its own direction toggle', async () => {
    await render()
    await click(sortButton('Time'))
    expect(headerState('Time')).toEqual(['descending', 'Time▼', 'Sort maneuvers by time ascending'])
    await click(sortButton('Loss (s)'))
    await click(sortButton('Loss (s)'))
    expect(rowTimes()).toEqual(lossAscending)
    // Back to Time in its current (descending) direction; Loss starts largest first again.
    await click(sortButton('Time'))
    expect(rowTimes()).toEqual([...chronological].reverse())
    expect(headerState('Time')).toEqual(['descending', 'Time▼', 'Sort maneuvers by time ascending'])
    expect(headerState('Loss (s)')).toEqual([null, 'Loss (s)⇅', 'Sort maneuvers by Loss time, largest first'])
    await click(sortButton('Time'))
    expect(rowTimes()).toEqual(chronological)
    await click(sortButton('Loss (s)'))
    expect(rowTimes()).toEqual(lossDescending)
  })

  it('keeps the Loss sort and row selection across sector filter and reset key changes', async () => {
    const onSelect = vi.fn()
    await render({ onSelect, selectedKey: maneuverSelectionKey(upwindP[2]) })
    await click(sortButton('Loss (s)'))
    await click(sectorOption('upwind'))
    expect(rowTimes()).toEqual([3, 7, 5, 1, 8, 4, 6, 2, 9].map(time))
    expect(container.querySelector('[aria-selected="true"]')!.querySelector('td')!.textContent).toBe(time(3))
    await render({ onSelect, selectedKey: maneuverSelectionKey(upwindP[2]), resetKey: 'k2' })
    expect(sectorOption('all').getAttribute('aria-pressed')).toBe('true')
    expect(rowTimes()).toEqual(lossDescending)
    expect(headerCell('Loss (s)').getAttribute('aria-sort')).toBe('descending')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows the legend only while a listed maneuver has a band (bands follow the sector filter)', async () => {
    await render()
    expect(legend()).not.toBeNull()
    // Reach lists three P maneuvers: below the minimum population, so no bands and no legend.
    await click(sectorOption('reaching'))
    expect(rowTimes()).toEqual([13, 14, 15].map(time))
    expect(container.querySelector('[data-maneuver-loss-band]')).toBeNull()
    expect(legend()).toBeNull()
    await click(sectorOption('upwind'))
    expect(legend()).not.toBeNull()
  })

  it('bands and legends the Analysis Window events without a TWD reference', async () => {
    await render({ windSectors: null })
    expect(container.querySelector('[data-maneuver-sector-filter]')).toBeNull()
    expect(legend()).not.toBeNull()
    expect(container.querySelectorAll('[data-maneuver-loss-band="high"]')).toHaveLength(3)
    await render({ windSectors: null, events: [...comparisonC, noLossP, ...reachP] })
    expect(legend()).toBeNull()
  })
})
