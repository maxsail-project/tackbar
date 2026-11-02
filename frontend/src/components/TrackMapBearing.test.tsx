// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackSample } from '../types/track'
import TrackMap from './TrackMap'

const map = vi.hoisted(() => ({
  bearing: 0,
  onRotate: null as null | ((event: { viewState: { bearing: number } }) => void),
  jumpTo: vi.fn(),
  fitBounds: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}))

vi.mock('react-map-gl/maplibre', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    default: forwardRef(function MockMap({ children, onRotate }: {
      children: ReactNode
      onRotate: (event: { viewState: { bearing: number } }) => void
    }, ref) {
      map.onRotate = onRotate
      useImperativeHandle(ref, () => ({
        getLayer: () => undefined,
        getBearing: () => map.bearing,
        getMap: () => ({ zoomIn: map.zoomIn, zoomOut: map.zoomOut }),
        jumpTo: (options: { bearing?: number }) => {
          map.jumpTo(options)
          if (options.bearing !== undefined) {
            map.bearing = options.bearing
            map.onRotate?.({ viewState: { bearing: map.bearing } })
          }
        },
        fitBounds: (...args: unknown[]) => map.fitBounds(...args),
      }))
      return <div data-map>{children}</div>
    }),
    Source: ({ children }: { children: ReactNode }) => <>{children}</>,
    Layer: () => null,
    Marker: ({ children }: { children: ReactNode }) => <>{children}</>,
    Popup: () => null,
  }
})
vi.mock('./HistoricalConditionsControl', () => ({ default: () => null }))

const samples: TrackSample[] = [
  { utc: '2031-01-01T10:00:00Z', lat: 0.25, lon: -30.72, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
  { utc: '2031-01-01T10:00:01Z', lat: 0.25, lon: -30.71, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  map.bearing = 0
  map.onRotate = null
  map.jumpTo.mockClear()
  map.fitBounds.mockClear()
  map.zoomIn.mockClear()
  map.zoomOut.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function renderMap(fitContextKey = 'full') {
  await act(async () => root.render(<TrackMap
    primaryVisibleSamples={samples}
    comparisonVisibleSamples={samples}
    fitContextKey={fitContextKey}
    primaryActivityIdentity="Primary"
    comparisonActivityIdentity="Comparison"
    primaryBoatPosition={{ lat: 0.25, lon: -30.72 }}
    comparisonBoatPosition={{ lat: 0.25, lon: -30.71 }}
    hasComparison
    playbackTime={Date.parse(samples[0].utc)}
    primarySog={5}
    primaryCog={90}
    primaryHeel={null}
    primaryTrim={null}
    comparisonSog={5}
    comparisonCog={90}
    comparisonHeel={null}
    comparisonTrim={null}
  />))
}

async function rotateByButton(name: string) {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === name,
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

function expectBearing(value: string, markerRotation: number) {
  expect(container.querySelector('.map-bearing__value')?.getAttribute('aria-label'))
    .toBe(`Map direction ${value}`)
  for (const label of ['Primary boat position', 'Comparison boat position']) {
    expect(container.querySelector(`[aria-label="${label}"] .boat-marker__hull`)
      ?.getAttribute('style')).toContain(`rotate(${markerRotation}deg)`)
  }
}

describe('map bearing controls', () => {
  it('keeps one accessible direction display between the two buttons', async () => {
    await renderMap()
    const group = container.querySelector('.map-navigation-group')!
    const control = group.querySelector('.map-navigation-group__direction')!
    const value = control.querySelector('.map-bearing__value')!

    expect(group.contains(control)).toBe(true)
    expect(group.querySelector('.maplibregl-ctrl-top-right')).toBeNull()
    expect(control.querySelector('.map-bearing__value')).toBe(value)
    expect(value.querySelectorAll('.map-bearing__value')).toHaveLength(0)
    expect(value.getAttribute('role')).toBe('status')
    expect(value.getAttribute('aria-label')).toBe('Map direction 000°')
    expect(value.children[0].textContent).toBe('DIR')
    expect(value.children[1].textContent).toBe('000°')
    expect(control.querySelectorAll('button svg')).toHaveLength(2)
  })

  it('renders one integrated horizontal zoom row and delegates to MapLibre zoom operations', async () => {
    await renderMap()
    const group = container.querySelector('.map-navigation-group')!
    const direction = group.querySelector('.map-navigation-group__direction')!
    const zoom = group.querySelector('.map-navigation-group__zoom')!

    expect(group.children).toHaveLength(2)
    expect(group.children[0]).toBe(direction)
    expect(group.children[1]).toBe(zoom)
    expect(zoom.querySelectorAll('button')).toHaveLength(2)
    expect([...zoom.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')))
      .toEqual(['Zoom out', 'Zoom in'])
    expect(container.querySelectorAll('.maplibregl-ctrl-group')).toHaveLength(0)

    await act(async () => zoom.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!.click())
    await act(async () => zoom.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click())
    expect(map.zoomOut).toHaveBeenCalledOnce()
    expect(map.zoomIn).toHaveBeenCalledOnce()
  })

  it('rotates the map in 5-degree steps, wraps both ways, and updates both markers', async () => {
    await renderMap()
    expectBearing('000°', 90)

    await rotateByButton('Rotate map 5 degrees counterclockwise')
    expect(map.jumpTo).toHaveBeenLastCalledWith({ bearing: 355 })
    expectBearing('355°', 95)

    await rotateByButton('Rotate map 5 degrees clockwise')
    expect(map.jumpTo).toHaveBeenLastCalledWith({ bearing: 0 })
    expectBearing('000°', 90)

    await act(async () => {
      map.bearing = 355
      map.onRotate?.({ viewState: { bearing: 355 } })
    })
    await rotateByButton('Rotate map 5 degrees clockwise')
    expect(map.jumpTo).toHaveBeenLastCalledWith({ bearing: 0 })
    expectBearing('000°', 90)
  })

  it('follows gesture rotation and preserves the effective bearing on window refit', async () => {
    await renderMap()
    await act(async () => {
      map.bearing = 30
      map.onRotate?.({ viewState: { bearing: 30 } })
    })
    expectBearing('030°', 60)

    await renderMap('narrow-window')
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ bearing: 30, duration: 0 }),
    )
    expectBearing('030°', 60)
  })
})
