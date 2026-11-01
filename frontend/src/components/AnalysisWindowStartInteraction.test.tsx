// @vitest-environment jsdom
import { act } from 'react'
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

describe('Analysis Window Start controls', () => {
  it('lets both Sxx controls navigate before a colocated maneuver and does not brush', async () => {
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
      sessionStarts={[{ label: 'S01', time: startTime + 5_000, activityIds: ['a', 'b'] }]}
      onRangeChange={onRangeChange}
      onManeuverSelect={onManeuver}
      onSessionStartSelect={onStart}
    />))

    const controls = container.querySelectorAll<HTMLButtonElement>('.analysis-window__session-start-control')
    expect(controls).toHaveLength(2)
    for (const control of controls) {
      await act(async () => {
        const pointer = new Event('pointerdown', { bubbles: true })
        Object.assign(pointer, { isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 1, clientX: 100 })
        control.dispatchEvent(pointer)
        control.click()
      })
    }
    expect(onStart).toHaveBeenCalledTimes(2)
    expect(onManeuver).not.toHaveBeenCalled()
    expect(onRangeChange).not.toHaveBeenCalled()
    expect(container.querySelector('.analysis-window__brush')).toBeNull()
  })
})
