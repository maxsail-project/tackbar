// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackSample } from '../types/track'
import type { TwdReference } from '../utils/twdReference'
import { resolveTwdPresentation, type TwdPresentation } from '../utils/twdPresentation'
import TrackMap from './TrackMap'

const map = vi.hoisted(() => ({
  bearing: 0,
  props: null as null | Record<string, unknown>,
  jumpTo: vi.fn(),
  fitBounds: vi.fn(),
  easeTo: vi.fn(),
  disableTouchRotation: vi.fn(),
  disableKeyboardRotation: vi.fn(),
}))

vi.mock('react-map-gl/maplibre', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    default: forwardRef(function MockMap(props: { children: ReactNode }, ref) {
      map.props = props
      useImperativeHandle(ref, () => ({
        getLayer: () => undefined,
        getBearing: () => map.bearing,
        getContainer: () => ({ clientHeight: 400 }),
        getMap: () => ({
          touchZoomRotate: { disableRotation: map.disableTouchRotation },
          keyboard: { disableRotation: map.disableKeyboardRotation },
        }),
        jumpTo: (options: { bearing?: number }) => {
          map.jumpTo(options)
          if (options.bearing !== undefined) map.bearing = options.bearing
        },
        fitBounds: (...args: unknown[]) => map.fitBounds(...args),
        easeTo: (...args: unknown[]) => map.easeTo(...args),
      }))
      return <div data-map>{props.children}</div>
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
const reference: TwdReference = {
  status: 'available', directionDegrees: 91.6, sourceKind: 'modelled_weather',
  sourceTimeUtc: '2031-01-01T09:00:00.000Z', provenance: { provider: 'open-meteo' },
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  map.bearing = 0
  map.props = null
  for (const fn of [map.jumpTo, map.fitBounds, map.easeTo, map.disableTouchRotation, map.disableKeyboardRotation]) fn.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function renderMap(
  twdReference: TwdReference = reference,
  twdPresentation: TwdPresentation = resolveTwdPresentation(twdReference, null),
  fitContextKey = 'full',
  onTwdStep = vi.fn(),
  onTwdAutomatic = vi.fn(),
  focusRequest: { activityRole: 'primary', requestId: number } | null = null,
) {
  await act(async () => root.render(<TrackMap
    primaryVisibleSamples={samples}
    comparisonVisibleSamples={samples}
    fitContextKey={fitContextKey}
    focusRequest={focusRequest}
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
    twdReference={twdReference}
    twdPresentation={twdPresentation}
    onTwdStep={onTwdStep}
    onTwdAutomatic={onTwdAutomatic}
  />))
}

async function click(name: string) {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label')?.startsWith(name))
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

function expectMarkerRotation(rotation: number) {
  for (const label of ['Primary boat position', 'Comparison boat position']) {
    expect(container.querySelector(`[aria-label="${label}"] .boat-marker__hull`)?.getAttribute('style'))
      .toContain(`rotate(${rotation}deg)`)
  }
}

describe('wind-oriented map controls', () => {
  it('uses rounded TWD as the camera bearing, preserving fit and geographic marker rotations', async () => {
    await renderMap()
    expect(map.props?.dragRotate).toBe(false)
    expect(map.props?.touchZoomRotate).toBeUndefined() // default pinch zoom remains enabled
    expect(map.props?.scrollZoom).toBeUndefined() // default wheel zoom remains enabled
    expect(map.props?.dragPan).toBeUndefined() // default pan remains enabled
    expect(map.props?.initialViewState).toMatchObject({ bearing: 90 })
    expect(map.fitBounds).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ bearing: 90, duration: 0 }))
    expect(map.jumpTo).toHaveBeenCalledWith({ bearing: 90 })
    expectMarkerRotation(0)
    await act(async () => (map.props?.onLoad as () => void)())
    expect(map.disableTouchRotation).toHaveBeenCalledOnce()
    expect(map.disableKeyboardRotation).toHaveBeenCalledOnce()
    expect(map.fitBounds).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ bearing: 90 }))
  })

  it('shows unavailable TWD with north-up camera and accepts manual-only steps', async () => {
    const unavailable: TwdReference = { status: 'unavailable' }
    const onStep = vi.fn()
    await renderMap(unavailable, resolveTwdPresentation(unavailable, null), 'full', onStep)
    expect(container.querySelector('.map-bearing__value')?.textContent).toBe('TWD—')
    expect(map.props?.initialViewState).toMatchObject({ bearing: 0 })
    expectMarkerRotation(90)
    await click('Adjust TWD 5 degrees clockwise')
    await click('Adjust TWD 5 degrees counterclockwise')
    expect(onStep.mock.calls).toEqual([[5], [-5]])
    await click('TWD —')
    expect(container.querySelector('[aria-label="TWD reference details"]')?.textContent).toContain('No automatic TWD reference available')
    await renderMap(unavailable, resolveTwdPresentation(unavailable, 355))
    expect(container.textContent).toContain('Manual · Viewer')
    expect(container.textContent).toContain('Manual only')
    expect(map.jumpTo).toHaveBeenLastCalledWith({ bearing: 355 })
    expectMarkerRotation(95)
  })

  it('shows original source evidence, rounded value and manual correction in accessible details', async () => {
    const onAutomatic = vi.fn()
    await renderMap(reference, resolveTwdPresentation(reference, 95), 'full', vi.fn(), onAutomatic)
    await click('TWD 095°')
    const detail = container.querySelector('[aria-label="TWD reference details"]')!
    expect(detail.textContent).toContain('Modelled weather')
    expect(detail.textContent).toContain('Nearest valid wind direction')
    expect(detail.textContent).toContain('01 Jan 2031')
    expect(detail.textContent).toContain('open-meteo')
    expect(detail.textContent).toContain('91.6°')
    expect(detail.textContent).toContain('090°')
    expect(detail.textContent).toContain('Viewer correction: 095°')
    expect(container.querySelector('.map-bearing__value')?.getAttribute('aria-expanded')).toBe('true')
    await act(async () => (container.querySelector('.map-twd__automatic') as HTMLButtonElement).click())
    expect(onAutomatic).toHaveBeenCalledOnce()
  })

  it('uses current effective bearing on window refit and preserves it on map focus', async () => {
    await renderMap(reference, resolveTwdPresentation(reference, 95))
    await renderMap(reference, resolveTwdPresentation(reference, 95), 'narrow-window')
    expect(map.fitBounds).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ bearing: 95 }))
    await renderMap(reference, resolveTwdPresentation(reference, 95), 'narrow-window', vi.fn(), vi.fn(), { activityRole: 'primary', requestId: 1 })
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [-30.72, 0.25] }))
    expect(map.easeTo.mock.lastCall?.[0]).not.toHaveProperty('bearing')
    expect(map.jumpTo.mock.calls.filter(([options]) => Object.keys(options).length === 1 && 'bearing' in options)).toHaveLength(1)
  })
})
