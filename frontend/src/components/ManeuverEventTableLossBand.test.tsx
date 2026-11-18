// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import { maneuverSelectionKey } from '../utils/maneuverEvents'
import type { ManeuverWindSector } from '../utils/maneuverWindSector'
import ManeuverEventTable from './ManeuverEventTable'

const base = Date.parse('2031-06-15T08:00:00Z')

function eventAt(
  minute: number,
  activityRole: DisplayManeuver['activityRole'],
  lossTimeS: number | null,
): DisplayManeuver {
  const centerTimeMs = base + minute * 60_000
  return {
    activityRole,
    centerTimeMs,
    maneuver: {
      start_time: new Date(centerTimeMs - 2_000).toISOString(),
      center_time: new Date(centerTimeMs).toISOString(),
      end_time: new Date(centerTimeMs + 3_000).toISOString(),
      heading_change_deg: 80,
      course_change_deg: null,
      peak_turn_rate_deg_s: null,
      peak_turn_rate_time: null,
      duration_s: 5,
      speed_loss_distance_m: 9,
      speed_loss_time_s: lossTimeS,
      recovery_time_s: 12,
    },
  }
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

const BANDS = ['all', 'high', 'typical', 'low']
const time = (minute: number) => `08:${String(minute).padStart(2, '0')}:00`

function lossTimeCells(markup: string) {
  const rows = [...markup.matchAll(/<tr class="maneuver-event-table__row[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1])
  return rows.map((row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)][4][0])
}

describe('Maneuver Analysis loss band styling (#211.2)', () => {
  it('marks the Loss (s) cell of banded maneuvers with a neutral marker and accessible text, without a new column', () => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={events} primaryStatus="available" comparisonStatus="available" onSelect={vi.fn()}
      windSectors={sectors} sectorFilterResetKey="k"
    />)
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

  it('adds no band styling or band filter below the minimum population', () => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={upwindP.slice(0, 7)} primaryStatus="available" onSelect={vi.fn()}
      windSectors={sectors} sectorFilterResetKey="k"
    />)
    expect(markup).not.toContain('data-maneuver-loss-band')
    expect(markup).not.toContain('data-maneuver-band-filter')
    expect(markup).not.toContain('Filter maneuvers by loss band')
    expect(markup).toContain('data-maneuver-sector-filter')
  })
})

describe('Maneuver Analysis loss band filter (#211.2)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const render = (props: {
    events?: DisplayManeuver[]
    windSectors?: ReadonlyMap<string, ManeuverWindSector> | null
    resetKey?: string
    selectedKey?: string | null
    onSelect?: (event: DisplayManeuver) => void
  } = {}) => act(async () => root.render(<ManeuverEventTable
    events={props.events ?? events}
    primaryStatus="available"
    comparisonStatus="available"
    primaryDetectorMode="HIGH"
    comparisonDetectorMode="LOW"
    selectedManeuverKey={props.selectedKey ?? null}
    onSelect={props.onSelect ?? vi.fn()}
    windSectors={props.windSectors === undefined ? sectors : props.windSectors}
    sectorFilterResetKey={props.resetKey ?? 'k1'}
  />))
  const bandOption = (filter: string) => container.querySelector<HTMLButtonElement>(`[data-maneuver-band-filter="${filter}"]`)!
  const sectorOption = (filter: string) => container.querySelector<HTMLButtonElement>(`[data-maneuver-sector-filter="${filter}"]`)!
  const bandGroup = () => container.querySelector<HTMLElement>('[aria-label="Filter maneuvers by loss band"]')
  const rows = () => [...container.querySelectorAll<HTMLTableRowElement>('.maneuver-event-table tbody tr')]
  const rowTimes = () => rows().map((row) => row.querySelector('td')!.textContent)
  const rowBands = () => rows().map((row) => row.querySelectorAll('td')[4].getAttribute('data-maneuver-loss-band'))
  const bandTexts = () => BANDS.map((filter) => bandOption(filter).textContent)
  const emptyState = () => container.querySelector('[data-maneuver-band-empty]')
  const click = (button: HTMLButtonElement) => act(async () => button.click())

  it('offers All · High loss · Typical · Low loss below the sector filter, with counts, accessible names and markers', async () => {
    await render()
    const group = bandGroup()!
    expect(group.getAttribute('role')).toBe('group')
    expect(group.classList.contains('wind-segments__filter')).toBe(true)
    expect(bandTexts()).toEqual(['All 15', 'High loss 3', 'Typical 5', 'Low loss 3'])
    expect(BANDS.map((filter) => bandOption(filter).getAttribute('aria-label'))).toEqual([
      'All, 15 maneuvers', 'High loss, 3 maneuvers', 'Typical, 5 maneuvers', 'Low loss, 3 maneuvers',
    ])
    expect(BANDS.map((filter) => bandOption(filter).getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    expect([...group.querySelectorAll('button')].every((button) => button.classList.contains('wind-segments__filter-option'))).toBe(true)
    // The options carry the same markers as the cells, so they serve as the legend.
    expect(bandOption('high').querySelector('.maneuver-loss-band__marker--high')!.getAttribute('aria-hidden')).toBe('true')
    expect(bandOption('low').querySelector('.maneuver-loss-band__marker--low')).not.toBeNull()
    expect(bandOption('typical').querySelector('.maneuver-loss-band__marker')).toBeNull()
    expect(bandOption('all').querySelector('.maneuver-loss-band__marker')).toBeNull()
    // Directly below the sector filter and above the table.
    const sectorGroup = container.querySelector('[aria-label="Filter maneuvers by wind sector"]')!
    expect(sectorGroup.nextElementSibling).toBe(group)
    expect(group.compareDocumentPosition(container.querySelector('.maneuver-event-table')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('narrows the table only; unbanded maneuvers appear only under All', async () => {
    const onSelect = vi.fn()
    await render({ onSelect })
    expect(rows()).toHaveLength(15)
    await click(bandOption('high'))
    expect(bandOption('high').getAttribute('aria-pressed')).toBe('true')
    expect(rowTimes()).toEqual([time(13), time(14), time(15)])
    await click(bandOption('low'))
    expect(rowTimes()).toEqual([time(2), time(4), time(6)])
    await click(bandOption('typical'))
    expect(rowTimes()).toEqual([time(1), time(3), time(5), time(7), time(8)])
    expect(rowBands()).toEqual(Array(5).fill('typical'))
    // Counts stay those of the listed maneuvers while filtered; the sector filter is untouched.
    expect(bandTexts()).toEqual(['All 15', 'High loss 3', 'Typical 5', 'Low loss 3'])
    expect(sectorOption('all').getAttribute('aria-pressed')).toBe('true')
    await click(bandOption('all'))
    expect(rows()).toHaveLength(15)
    expect(onSelect).not.toHaveBeenCalled()
    expect(container.querySelector('.maneuver-evidence')!.textContent).toContain('P · HIGH evidence')
  })

  it('keeps sorting, row selection and P/C attribution inside the band-filtered table', async () => {
    const onSelect = vi.fn()
    await render({ onSelect, selectedKey: maneuverSelectionKey(reachP[2]) })
    await click(bandOption('high'))
    await click(container.querySelector<HTMLButtonElement>('.maneuver-event-table__sort')!)
    expect(rowTimes()).toEqual([time(15), time(14), time(13)])
    expect(rows().map((row) => row.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(rows()[0].className).toContain('maneuver-event-table__row--primary')
    await act(async () => rows()[1].click())
    expect(onSelect).toHaveBeenCalledWith(reachP[1])
  })

  it('recomputes bands over the sector-filtered list without resetting the band filter', async () => {
    await render()
    await click(bandOption('high'))
    expect(rowTimes()).toEqual([time(13), time(14), time(15)])
    // Up lists P m1–m9 only: P's eight Loss times 1…8 give cuts 2.75 and 6.25.
    await click(sectorOption('upwind'))
    expect(bandOption('high').getAttribute('aria-pressed')).toBe('true')
    expect(bandTexts()).toEqual(['All 9', 'High loss 2', 'Typical 4', 'Low loss 2'])
    expect(rowTimes()).toEqual([time(3), time(7)])
    await click(bandOption('low'))
    expect(rowTimes()).toEqual([time(2), time(6)])
    await click(bandOption('all'))
    expect(rowBands()).toEqual(['typical', 'low', 'high', 'typical', 'typical', 'low', 'high', 'typical', null])
  })

  it('keeps a selected band without listed maneuvers selected and shows its empty state', async () => {
    await render()
    await click(bandOption('high'))
    // Reach lists only three P maneuvers: below the minimum, so no bands.
    await click(sectorOption('reaching'))
    expect(bandGroup()).not.toBeNull()
    expect(bandTexts()).toEqual(['All 3', 'High loss 0', 'Typical 0', 'Low loss 0'])
    expect(bandOption('high').getAttribute('aria-pressed')).toBe('true')
    expect(bandOption('high').disabled).toBe(false)
    expect(BANDS.map((filter) => bandOption(filter).disabled)).toEqual([false, false, true, true])
    expect(emptyState()!.textContent).toBe('No High loss maneuvers in this window')
    expect(container.querySelector('.maneuver-event-table')).toBeNull()
    // All brings back every listed (unbanded) maneuver and the band filter disappears.
    await click(bandOption('all'))
    expect(emptyState()).toBeNull()
    expect(rowTimes()).toEqual([time(13), time(14), time(15)])
    expect(rowBands()).toEqual([null, null, null])
    expect(bandGroup()).toBeNull()
  })

  it('keeps an active band filter and its empty state when no maneuvers are listed', async () => {
    await render({ windSectors: null })
    await click(bandOption('low'))
    await render({ windSectors: null, events: [] })
    expect(bandOption('low').getAttribute('aria-pressed')).toBe('true')
    expect(emptyState()!.textContent).toBe('No Low loss maneuvers in this window')
    expect(container.textContent).not.toContain('No maneuvers detected in this Analysis Window.')
  })

  it('resets to All on the shared reset key (Activity or Analysis Window change)', async () => {
    await render({ resetKey: 'a::1' })
    await click(sectorOption('upwind'))
    await click(bandOption('low'))
    expect(rowTimes()).toEqual([time(2), time(6)])
    await render({ resetKey: 'a::2' })
    expect(sectorOption('all').getAttribute('aria-pressed')).toBe('true')
    expect(bandOption('all').getAttribute('aria-pressed')).toBe('true')
    expect(rows()).toHaveLength(15)
    // Without a TWD reference the band filter still resets with the key.
    await render({ resetKey: 'a::2', windSectors: null })
    await click(bandOption('high'))
    await render({ resetKey: 'a:b:3', windSectors: null })
    expect(bandOption('all').getAttribute('aria-pressed')).toBe('true')
  })

  it('bands the Analysis Window events without a TWD reference (no sector filter)', async () => {
    await render({ windSectors: null })
    expect(container.querySelector('[data-maneuver-sector-filter]')).toBeNull()
    expect(bandGroup()).not.toBeNull()
    expect(bandTexts()).toEqual(['All 15', 'High loss 3', 'Typical 5', 'Low loss 3'])
    await click(bandOption('high'))
    expect(rowTimes()).toEqual([time(13), time(14), time(15)])
  })

  it('shows no band filter when no listed maneuver has a band', async () => {
    await render({ events: [...comparisonC, noLossP, ...reachP] })
    expect(bandGroup()).toBeNull()
    expect(container.querySelector('[data-maneuver-loss-band]')).toBeNull()
    expect(rows()).toHaveLength(7)
  })
})
