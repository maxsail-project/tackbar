// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTwsPresentation, type TwsReference } from '../utils/twsReference'
import TwsControl from './TwsControl'

const missing: TwsReference = { status: 'unavailable' }
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

async function render(manual: string | null, expanded: boolean, onApply = vi.fn(), onReset = vi.fn(), reference: TwsReference = missing) {
  await act(async () => root.render(<TwsControl reference={reference} presentation={resolveTwsPresentation(reference, manual)} expanded={expanded} onExpandedChange={vi.fn()} onApply={onApply} onReset={onReset} />))
}

describe('TWS control', () => {
  it('shows missing, accepts zero and whole knots, rejects invalid entry, and exposes collapsed Reset', async () => {
    const apply = vi.fn()
    const reset = vi.fn()
    await render(null, true, apply, reset)
    expect(container.querySelector('.map-tws__chip')?.textContent).toBe('TWS--')
    const input = container.querySelector<HTMLInputElement>('input')!
    const submit = async (value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        setter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => container.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    }
    await submit('0')
    await submit('14')
    expect(apply.mock.calls.map(([value]) => value)).toEqual(['0', '14'])
    for (const value of ['-1', '1.5', 'abc', '']) await submit(value)
    expect(apply).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    await render('14', false, apply, reset)
    expect(container.querySelector('.map-tws__chip')?.textContent).toBe('TWS14 kt')
    expect(container.textContent).toContain('Manual · Viewer')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Reset TWS to automatic"]')!.click())
    expect(reset).toHaveBeenCalledOnce()
  })

  it('keeps Gust read-only and out of the compact value', async () => {
    await render(null, true, vi.fn(), vi.fn(), { status: 'available', speedKnots: 12, gustKnots: 19, source: 'future source' })
    expect(container.querySelector('.map-tws__chip')?.textContent).toBe('TWS12 kt')
    expect(container.querySelector('.map-tws__detail')?.textContent).toContain('Gust: 19 kt')
    expect(container.querySelectorAll('input')).toHaveLength(1)
  })
})
