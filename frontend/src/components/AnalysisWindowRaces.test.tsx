// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { commitSessionTimelineWindow, reconcileAnalysisWindow, type AnalysisWindowRange } from '../utils/analysisWindow'
import { inferSessionRaces, type InferredSessionRace } from '../utils/sessionRaces'
import { PAIRED_RACE_ACTIVITIES, raceFixtureTime } from '../utils/sessionRaceTestFixtures'
import { inferSessionStarts } from '../utils/sessionStarts'
import AnalysisWindow, { resolveAnalysisWindowRaceOptions } from './AnalysisWindow'

const RACES = inferSessionRaces(inferSessionStarts(PAIRED_RACE_ACTIVITIES), PAIRED_RACE_ACTIVITIES)
// The track starts 2 minutes before S1, so R1's 5-minute margin is clamped.
const AVAILABLE = { start: raceFixtureTime(-2), end: raceFixtureTime(90) }
const SEGMENT = { start: raceFixtureTime(10), end: raceFixtureTime(20) }

let container: HTMLDivElement
let unmount: (() => Promise<void>) | null = null

afterEach(async () => {
  await unmount?.()
  unmount = null
})

/** Commits through the same clamping path as the Viewer and exposes an outside window change. */
function Harness({ races, onRangeChange }: { races: InferredSessionRace[], onRangeChange: (range: AnalysisWindowRange) => void }) {
  const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindowRange>(AVAILABLE)
  const [availableRange, setAvailableRange] = useState(AVAILABLE)
  const [raceList, setRaceList] = useState(races)
  const commit = (requested: AnalysisWindowRange) => {
    onRangeChange(requested)
    const next = commitSessionTimelineWindow(requested, availableRange, availableRange.start)
    if (next !== null) setAnalysisWindow(next.analysisWindow)
  }
  const reconcile = (nextRange: AnalysisWindowRange) => {
    setAvailableRange(nextRange)
    setAnalysisWindow((current) => reconcileAnalysisWindow(current, nextRange))
  }
  return <>
    <button type="button" data-outside-window onClick={() => setAnalysisWindow(SEGMENT)}>Wind segment</button>
    <button type="button" data-restore-window onClick={() => setAnalysisWindow(RACES[1].window)}>Restore window</button>
    <button type="button" data-reconcile-keep onClick={() => reconcile({ start: raceFixtureTime(45), end: AVAILABLE.end })}>Reconcile inside race</button>
    <button type="button" data-reconcile-change onClick={() => reconcile({ start: raceFixtureTime(50), end: AVAILABLE.end })}>Reconcile outside race</button>
    <button type="button" data-remove-race onClick={() => setRaceList([RACES[0]])}>Remove race</button>
    <button type="button" data-renumber-race onClick={() => setRaceList([RACES[0], {
      ...RACES[1],
      startTime: raceFixtureTime(54),
      window: { start: raceFixtureTime(49), end: raceFixtureTime(82) },
    }])}>Replace race under label</button>
    <button type="button" data-restore-races onClick={() => setRaceList(races)}>Restore races</button>
    <output data-window={`${analysisWindow.start}:${analysisWindow.end}`} />
    <AnalysisWindow
      availableRange={availableRange}
      analysisWindow={analysisWindow}
      primarySamples={[]}
      sessionRaces={raceList}
      replay={{ playbackTime: AVAILABLE.start, isPlaying: false, speed: 5, onTogglePlayback: vi.fn(), onSpeedChange: vi.fn() }}
      onRangeChange={commit}
    />
  </>
}

async function renderHarness(races: InferredSessionRace[] = RACES) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  unmount = async () => {
    await act(async () => root.unmount())
    container.remove()
  }
  const onRangeChange = vi.fn()
  await act(async () => root.render(<Harness races={races} onRangeChange={onRangeChange} />))
  const raceSelect = () => container.querySelector<HTMLSelectElement>('select[aria-label="Race"]')
  const windowValue = () => container.querySelector('[data-window]')!.getAttribute('data-window')
  const choose = async (value: string) => act(async () => {
    raceSelect()!.value = value
    raceSelect()!.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const click = async (selector: string) => act(async () => container.querySelector<HTMLElement>(selector)!.click())
  return { onRangeChange, raceSelect, windowValue, choose, click }
}

describe('Analysis Window Race control (#220)', () => {
  it('is hidden when no race qualifies or no race overlaps the available range', async () => {
    const { raceSelect } = await renderHarness([])
    expect(raceSelect()).toBeNull()
    expect(container.querySelector('.analysis-window__heading--race')).toBeNull()
    const outside = { ...RACES[0], window: { start: raceFixtureTime(200), end: raceFixtureTime(230) } }
    expect(resolveAnalysisWindowRaceOptions([outside], AVAILABLE)).toEqual([])
    expect(resolveAnalysisWindowRaceOptions(RACES, null)).toEqual([])
  })

  it('offers only All and R1…RN, unlabelled, immediately left of the speed select', async () => {
    const { raceSelect } = await renderHarness()
    expect([...raceSelect()!.options].map((option) => option.textContent)).toEqual(['All', 'R1', 'R2'])
    expect(raceSelect()!.value).toBe('all')
    expect(raceSelect()!.className).toBe('playback-speed-select analysis-window__race')
    expect(raceSelect()!.nextElementSibling!.getAttribute('aria-label')).toBe('Playback speed')
    expect(raceSelect()!.parentElement!.className).toBe('analysis-window__header-actions')
    expect(container.querySelector('label')).toBeNull()
  })

  it('sets the clamped race window, shows the race, and returns to All after an outside change', async () => {
    const { onRangeChange, raceSelect, windowValue, choose, click } = await renderHarness()
    await choose('R1')
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: raceFixtureTime(-5), end: raceFixtureTime(41) })
    expect(windowValue()).toBe(`${AVAILABLE.start}:${raceFixtureTime(41)}`)
    expect(raceSelect()!.value).toBe('R1')
    await click('[data-outside-window]')
    expect(raceSelect()!.value).toBe('all')
    await choose('R2')
    expect(windowValue()).toBe(`${raceFixtureTime(50)}:${raceFixtureTime(82)}`)
    expect(raceSelect()!.value).toBe('R2')
    await click('.analysis-window__reset')
    expect(onRangeChange).toHaveBeenLastCalledWith(AVAILABLE)
    expect(raceSelect()!.value).toBe('all')
  })

  it('returns to All after a timeline drag and restores the full range from All', async () => {
    const { onRangeChange, raceSelect, windowValue, choose } = await renderHarness()
    await choose('R2')
    const timeline = container.querySelector<HTMLDivElement>('.analysis-window__timeline')!
    const captured = new Set<number>()
    Object.assign(timeline, {
      getBoundingClientRect: () => ({ left: 0, right: 200 }),
      setPointerCapture: (id: number) => captured.add(id),
      hasPointerCapture: (id: number) => captured.has(id),
    })
    await act(async () => {
      for (const [type, clientX] of [['pointerdown', 20], ['pointermove', 120], ['pointerup', 120]] as const) {
        const event = new Event(type, { bubbles: true })
        Object.assign(event, { isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 1, clientX })
        timeline.dispatchEvent(event)
      }
    })
    expect(raceSelect()!.value).toBe('all')
    await choose('R1')
    await choose('all')
    expect(onRangeChange).toHaveBeenLastCalledWith(AVAILABLE)
    expect(windowValue()).toBe(`${AVAILABLE.start}:${AVAILABLE.end}`)
    expect(raceSelect()!.value).toBe('all')
  })

  it('keeps Rn when Activity reconciliation preserves its clamped bounds', async () => {
    const { raceSelect, choose, click } = await renderHarness()
    await choose('R2')
    await click('[data-reconcile-keep]')
    expect(raceSelect()!.value).toBe('R2')
  })

  it('clears Rn when Activity reconciliation moves outside that race', async () => {
    const { raceSelect, choose, click } = await renderHarness()
    await choose('R1')
    await click('[data-reconcile-change]')
    expect(raceSelect()!.value).toBe('all')
    await choose('R2')
    expect(raceSelect()!.value).toBe('R2')
  })

  it('clears a selected race when it disappears or another race takes its label', async () => {
    const { raceSelect, choose, click } = await renderHarness()
    await choose('R2')
    await click('[data-remove-race]')
    expect(raceSelect()!.value).toBe('all')
    await click('[data-restore-races]')
    expect(raceSelect()!.value).toBe('all')
    await choose('R2')
    // Both races clamp to 50–82 in this available range, despite different Starts.
    await click('[data-reconcile-change]')
    expect(raceSelect()!.value).toBe('R2')
    await click('[data-renumber-race]')
    expect(raceSelect()!.value).toBe('all')
    await click('[data-restore-races]')
    expect(raceSelect()!.value).toBe('all')
  })

  it('clears the selection after an outside window change even if race bounds return', async () => {
    const { raceSelect, choose, click } = await renderHarness()
    await choose('R2')
    await click('[data-outside-window]')
    expect(raceSelect()!.value).toBe('all')
    await click('[data-restore-window]')
    expect(raceSelect()!.value).toBe('all')
  })
})
