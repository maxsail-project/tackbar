// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, revealMapIfNeeded } from './mapReveal'

function mapAt(top: number, height = 400): HTMLElement {
  const element = document.createElement('section')
  document.body.append(element)
  element.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: top, width: 360, height })
  element.scrollIntoView = vi.fn()
  return element
}

// jsdom's default viewport is 1024 × 768.
describe('revealMapIfNeeded', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('does not scroll when the map is already fully visible', () => {
    const map = mapAt(100)
    expect(revealMapIfNeeded(map, { reducedMotion: false })).toBe(false)
    expect(map.scrollIntoView).not.toHaveBeenCalled()
  })

  it.each([
    ['above the viewport', -900],
    ['partially above the viewport', -50],
    ['partially below the viewport', 600],
  ])('smoothly aligns the map to the top when it is %s', (_label, top) => {
    const map = mapAt(top)
    expect(revealMapIfNeeded(map, { reducedMotion: false })).toBe(true)
    expect(map.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start', inline: 'nearest' })
  })

  it('scrolls instantly when reduced motion is requested', () => {
    const map = mapAt(-900)
    revealMapIfNeeded(map, { reducedMotion: true })
    expect(map.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start', inline: 'nearest' })
  })

  it('is a no-op without a rendered map', () => {
    expect(revealMapIfNeeded(null, { reducedMotion: false })).toBe(false)
    const detached = mapAt(-900)
    detached.remove()
    expect(revealMapIfNeeded(detached, { reducedMotion: false })).toBe(false)
    const unrendered = mapAt(-900, 0)
    unrendered.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 })
    expect(revealMapIfNeeded(unrendered, { reducedMotion: false })).toBe(false)
    expect(detached.scrollIntoView).not.toHaveBeenCalled()
    expect(unrendered.scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('prefersReducedMotion', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it.each([true, false])('reads the reduced-motion media query (%s)', (matches) => {
    const matchMedia = vi.fn(() => ({ matches }))
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia
    expect(prefersReducedMotion()).toBe(matches)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('treats a missing matchMedia as no preference', () => {
    expect(prefersReducedMotion()).toBe(false)
  })
})
