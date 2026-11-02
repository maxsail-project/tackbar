// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AnalysisWindow from './AnalysisWindow'

const startTime = Date.UTC(2031, 0, 1, 10)
const range = { start: startTime, end: startTime + 10_000 }
const timestamp = new Date(startTime + 5_000).toISOString()

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

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

function pointer(target: Element, type: string, clientX: number, pointerType = 'mouse') {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { isPrimary: true, pointerType, button: 0, pointerId: 1, clientX })
  target.dispatchEvent(event)
}

function pointerClick(target: Element) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
}

async function renderWindow() {
  const onStart = vi.fn()
  const onManeuver = vi.fn()
  const onRangeChange = vi.fn()
  await act(async () => root.render(<AnalysisWindow
    availableRange={range}
    analysisWindow={range}
    primarySamples={[]}
    maneuvers={[{
      activityRole: 'primary', centerTimeMs: startTime + 5_000,
      maneuver: { start_time: timestamp, center_time: timestamp, end_time: timestamp } as never,
    }]}
    sessionStarts={[{ label: 'S1', time: startTime + 5_000, activityIds: ['a', 'b'] }]}
    onRangeChange={onRangeChange}
    onManeuverSelect={onManeuver}
    onSessionStartSelect={onStart}
  />))

  const timeline = container.querySelector<HTMLDivElement>('.analysis-window__timeline')!
  const captured = new Set<number>()
  const setPointerCapture = vi.fn((id: number) => captured.add(id))
  Object.assign(timeline, {
    getBoundingClientRect: () => ({ left: 0, right: 200 }),
    setPointerCapture,
    hasPointerCapture: (id: number) => captured.has(id),
  })
  return { timeline, onStart, onManeuver, onRangeChange, setPointerCapture }
}

describe('Analysis Window Start controls', () => {
  it.each(['top', 'bottom'])('taps the %s Sxx control before a colocated maneuver', async (end) => {
    const { onStart, onManeuver, onRangeChange, setPointerCapture } = await renderWindow()
    const control = container.querySelector<HTMLButtonElement>(`.analysis-window__session-start-control--${end}`)!
    await act(async () => {
      pointer(control.firstElementChild!, 'pointerdown', 100)
      pointer(control.firstElementChild!, 'pointerup', 100)
      pointerClick(control)
    })
    expect(onStart).toHaveBeenCalledExactlyOnceWith({ label: 'S1', time: startTime + 5_000, activityIds: ['a', 'b'] })
    expect(onManeuver).not.toHaveBeenCalled()
    expect(onRangeChange).not.toHaveBeenCalled()
    expect(setPointerCapture).not.toHaveBeenCalled()
  })

  it.each([
    ['top', 'mouse'], ['bottom', 'mouse'], ['top', 'touch'], ['bottom', 'touch'],
  ])('drags from the %s Sxx control with %s without navigating', async (end, pointerType) => {
    const { timeline, onStart, onManeuver, onRangeChange, setPointerCapture } = await renderWindow()
    const control = container.querySelector<HTMLButtonElement>(`.analysis-window__session-start-control--${end}`)!
    await act(async () => {
      pointer(control.firstElementChild!, 'pointerdown', 100, pointerType)
      pointer(control.firstElementChild!, 'pointermove', 105, pointerType)
    })
    expect(setPointerCapture).not.toHaveBeenCalled()
    await act(async () => {
      pointer(control.firstElementChild!, 'pointermove', 106, pointerType)
      pointer(timeline, 'pointermove', 160, pointerType)
      pointer(timeline, 'pointerup', 160, pointerType)
      pointerClick(control) // Browser-generated click after pointerup must not navigate.
    })
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(1)
    expect(onRangeChange).toHaveBeenCalledExactlyOnceWith({ start: startTime + 5_000, end: startTime + 8_000 })
    expect(onStart).not.toHaveBeenCalled()
    expect(onRangeChange).toHaveBeenCalledOnce()
    expect(onManeuver).not.toHaveBeenCalled()
  })

  it.each(['mouse', 'touch'])('keeps a sub-threshold %s Sxx gesture as a tap', async (pointerType) => {
    const { onStart, onRangeChange, setPointerCapture } = await renderWindow()
    const control = container.querySelector<HTMLButtonElement>('.analysis-window__session-start-control--top')!
    await act(async () => {
      pointer(control, 'pointerdown', 100, pointerType)
      pointer(control, 'pointermove', 105, pointerType)
      pointer(control, 'pointerup', 105, pointerType)
      pointerClick(control)
    })
    expect(setPointerCapture).not.toHaveBeenCalled()
    expect(onStart).toHaveBeenCalledOnce()
    expect(onRangeChange).not.toHaveBeenCalled()
  })

  it('keeps keyboard activation available if a drag produces no click', async () => {
    const { timeline, onStart, onRangeChange } = await renderWindow()
    const control = container.querySelector<HTMLButtonElement>('.analysis-window__session-start-control--top')!
    await act(async () => {
      pointer(control, 'pointerdown', 100)
      pointer(control, 'pointermove', 160)
      pointer(timeline, 'pointerup', 160)
      control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      control.click()
    })
    expect(onRangeChange).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('does not navigate if the range update rerenders before the post-drag click', async () => {
    const onStart = vi.fn()
    function ControlledWindow() {
      const [window, setWindow] = useState(range)
      return <AnalysisWindow
        availableRange={range}
        analysisWindow={window}
        primarySamples={[]}
        sessionStarts={[{ label: 'S1', time: startTime + 5_000, activityIds: ['a'] }]}
        onRangeChange={setWindow}
        onSessionStartSelect={onStart}
      />
    }
    await act(async () => root.render(<ControlledWindow />))
    const timeline = container.querySelector<HTMLDivElement>('.analysis-window__timeline')!
    const captured = new Set<number>()
    Object.assign(timeline, {
      getBoundingClientRect: () => ({ left: 0, right: 200 }),
      setPointerCapture: (id: number) => captured.add(id),
      hasPointerCapture: (id: number) => captured.has(id),
    })
    const control = container.querySelector<HTMLButtonElement>('.analysis-window__session-start-control--top')!
    await act(async () => {
      pointer(control, 'pointerdown', 100)
      pointer(control, 'pointermove', 160)
      pointer(timeline, 'pointerup', 160)
    })
    expect((container.querySelector('.analysis-window__session-start') as HTMLElement).style.left).toBe('0%')
    await act(async () => pointerClick(control))
    expect(onStart).not.toHaveBeenCalled()
  })

  it('keeps central brushing and maneuver-marker drag behavior', async () => {
    const { timeline, onStart, onManeuver, onRangeChange, setPointerCapture } = await renderWindow()
    await act(async () => {
      pointer(timeline, 'pointerdown', 20)
      pointer(timeline, 'pointermove', 100)
      pointer(timeline, 'pointerup', 100)
    })
    expect(setPointerCapture).toHaveBeenCalledWith(1)
    expect(onRangeChange).toHaveBeenCalledWith({ start: startTime + 1_000, end: startTime + 5_000 })

    const maneuver = container.querySelector<HTMLButtonElement>('.analysis-window__maneuver-marker')!
    await act(async () => {
      pointer(maneuver, 'pointerdown', 100)
      pointer(maneuver, 'pointermove', 160)
      pointer(timeline, 'pointerup', 160)
      pointerClick(maneuver)
    })
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: startTime + 5_000, end: startTime + 8_000 })
    expect(onRangeChange).toHaveBeenCalledTimes(2)
    expect(onManeuver).not.toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
  })
})
