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

async function render(manual: string | null, expanded: boolean, onStep = vi.fn(), onReset = vi.fn(), reference: TwsReference = missing, onExpandedChange = vi.fn()) {
  await act(async () => root.render(<TwsControl reference={reference} presentation={resolveTwsPresentation(reference, manual)} expanded={expanded} onExpandedChange={onExpandedChange} onStep={onStep} onReset={onReset} />))
}

describe('TWS control', () => {
  it('keeps only the narrow value chip collapsed and opens a direct step row', async () => {
    const step = vi.fn()
    const reset = vi.fn()
    const disclosure = vi.fn()
    await render(null, false, step, reset, missing, disclosure)
    expect(container.querySelector('.map-tws__chip')?.textContent).toBe('TWS--')
    expect(container.querySelector('.map-tws__chip')?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.map-tws__adjustment, input, form')).toBeNull()
    expect(container.querySelectorAll('.map-tws button')).toHaveLength(1)
    await act(async () => container.querySelector<HTMLButtonElement>('.map-tws__chip')!.click())
    expect(disclosure).toHaveBeenCalledWith(true)
    await render(null, true, step, reset)
    expect(container.querySelector('.map-tws__chip')?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('.map-tws__adjustment')?.textContent).toBe('−TWS --+')
    expect(container.textContent).not.toContain('No automatic TWS reference available.')
    expect(container.querySelector('.map-tws__footer')).toBeNull()
    expect(container.querySelectorAll('.map-tws__adjustment button')).toHaveLength(2)
    expect(container.querySelector('.map-tws__adjustment output')?.getAttribute('aria-live')).toBe('polite')
    expect(container.querySelector('input, form, [type="submit"]')).toBeNull()
    const outsidePointer = vi.fn()
    document.addEventListener('pointerdown', outsidePointer)
    const increase = container.querySelector<HTMLButtonElement>('[aria-label="Increase TWS by 1 knot"]')!
    await act(async () => increase.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(outsidePointer).not.toHaveBeenCalled()
    document.removeEventListener('pointerdown', outsidePointer)
    increase.focus()
    expect(document.activeElement).toBe(increase)
    await act(async () => increase.click())
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Decrease TWS by 1 knot"]')!.click())
    expect(step.mock.calls).toEqual([[1], [-1]])
    await render('14', true, step, reset, missing, disclosure)
    await act(async () => container.querySelector<HTMLButtonElement>('.map-tws__chip')!.click())
    expect(disclosure).toHaveBeenLastCalledWith(false)
    expect(reset).not.toHaveBeenCalled()
    await render('14', false, step, reset)
    expect(container.querySelector('.map-tws__chip')?.textContent).toBe('TWS14 kt')
    expect(container.textContent).not.toContain('Manual · Viewer')
    expect(container.querySelector('.map-tws__adjustment')).toBeNull()
    expect(container.querySelectorAll('.map-tws button')).toHaveLength(1)
    expect(container.querySelector('[aria-label="Reset TWS to automatic"]')).toBeNull()
    await render('14', true, step, reset)
    const footer = container.querySelector('.map-tws__footer')!
    expect(footer.textContent).toBe('Manual · ViewerReset')
    expect(footer.querySelectorAll('button')).toHaveLength(1)
    expect(container.querySelectorAll('.map-tws__detail button')).toHaveLength(3)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Reset TWS to automatic"]')!.click())
    expect(reset).toHaveBeenCalledOnce()
  })

  it('shows original modelled speed and provenance separately from the manual correction, without Gust', async () => {
    const reference: TwsReference = {
      status: 'available', speedKnots: 12.5, sourceKind: 'modelled_weather',
      sourceTimeUtc: '2031-06-01T09:00:00.000Z', provenance: { provider: 'open-meteo' },
    }
    await render(null, true, vi.fn(), vi.fn(), reference)
    expect(container.querySelector('.map-tws__chip')?.textContent).toBe('TWS13 kt')
    expect(container.querySelector('.map-tws__adjustment')?.textContent).toBe('−TWS 13 kt+')
    expect(container.querySelector('.map-tws__source')?.textContent).toContain('Modelled Weather')
    expect(container.querySelector('.map-tws__source')?.textContent).toContain('Original TWS12.5 kt')
    expect(container.querySelector('.map-tws__source')?.textContent).toContain('open-meteo')
    expect(container.querySelector('.map-tws__source')?.textContent).toContain('01 Jun 2031')
    await render('14', true, vi.fn(), vi.fn(), reference)
    expect(container.querySelector('.map-tws__adjustment')?.textContent).toBe('−TWS 14 kt+')
    expect(container.querySelector('.map-tws__source')?.textContent).toContain('Original TWS12.5 kt')
    expect(container.querySelector('.map-tws__footer')?.textContent).toBe('Manual · ViewerReset')
    expect(container.textContent).not.toContain('Gust')
    expect(container.querySelectorAll('input')).toHaveLength(0)
  })
})
