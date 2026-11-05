// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackSample } from '../types/track'
import type { HistoricalConditionsSample } from '../types/session'
import type { TwdReference } from '../utils/twdReference'
import { resolveTwdPresentation, type TwdPresentation } from '../utils/twdPresentation'
import TrackMap from './TrackMap'

const map = vi.hoisted(() => ({
  bearing: 0,
  props: null as null | Record<string, unknown>,
  jumpTo: vi.fn(),
  fitBounds: vi.fn(),
  easeTo: vi.fn(),
  stop: vi.fn(),
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
        stop: () => map.stop(),
      }))
      return <div data-map>{props.children}</div>
    }),
    Source: ({ children }: { children: ReactNode }) => <>{children}</>,
    Layer: () => null,
    Marker: ({ children }: { children: ReactNode }) => <>{children}</>,
    Popup: () => null,
  }
})
const samples: TrackSample[] = [
  { utc: '2031-01-01T10:00:00Z', lat: 0.25, lon: -30.72, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
  { utc: '2031-01-01T10:00:01Z', lat: 0.25, lon: -30.71, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
]
const reference: TwdReference = {
  status: 'available', directionDegrees: 91.6, sourceKind: 'modelled_weather',
  sourceTimeUtc: '2031-01-01T09:00:00.000Z', provenance: { provider: 'open-meteo' },
}
const weather: HistoricalConditionsSample = {
  time: '2031-01-01T09:00:00Z', air_temperature_c: 23,
  wind_speed_10m_kn: 14, wind_gusts_10m_kn: 19, wind_direction_10m_deg: 92,
  cloud_cover_pct: null, wave_height_m: null, wave_direction_deg: null, wave_period_s: null,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  map.bearing = 0
  map.props = null
  for (const fn of [map.jumpTo, map.fitBounds, map.easeTo, map.stop, map.disableTouchRotation, map.disableKeyboardRotation]) fn.mockClear()
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
  historicalConditionsSample: HistoricalConditionsSample | null = null,
  onTwdGestureCommit = vi.fn(),
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
    onTwdGestureCommit={onTwdGestureCommit}
    historicalConditionsSample={historicalConditionsSample}
    historicalConditionsWeatherProvider="open-meteo"
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
  it('previews a desktop rotation continuously, then snaps and commits one manual correction', async () => {
    const onCommit = vi.fn()
    await renderMap(reference, resolveTwdPresentation(reference, null), 'full', vi.fn(), vi.fn(), null, weather, onCommit)
    const startRotation = map.props?.onRotateStart as (event: unknown) => void
    const rotate = map.props?.onRotate as () => void
    const endRotation = map.props?.onRotateEnd as (event: unknown) => void
    await act(async () => startRotation({ originalEvent: new MouseEvent('mousemove', { button: 2, buttons: 2 }) }))
    map.bearing = 93.4
    await act(async () => rotate())
    expect(container.querySelector('.map-bearing__value')?.textContent).toBe('TWD093°')
    expect(map.bearing).toBe(93.4)
    expect(onCommit).not.toHaveBeenCalled()
    await act(async () => endRotation({ originalEvent: new MouseEvent('mouseup', { button: 2 }) }))
    expect(map.bearing).toBe(95)
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(95)
    await renderMap(reference, resolveTwdPresentation(reference, 95), 'full', vi.fn(), vi.fn(), null, weather, onCommit)
    expect(container.querySelector('.map-bearing__value')?.textContent).toBe('TWD095°')
    expect(container.textContent).toContain('Manual · Viewer')
    expect(container.querySelector('[aria-label="Reset TWD to automatic"]')).not.toBeNull()
    expect(map.jumpTo.mock.lastCall?.[0]).toEqual({ bearing: 95 })
  })

  it('keeps automatic, manual, and unavailable modes when a gesture snaps back to its start', async () => {
    const onCommit = vi.fn()
    for (const [source, manual, live, final] of [
      [reference, null, 91.9, 90],
      [reference, 95, 96.9, 95],
      [{ status: 'unavailable' } as TwdReference, null, 1.9, 0],
    ] as const) {
      await renderMap(source, resolveTwdPresentation(source, manual), 'full', vi.fn(), vi.fn(), null, null, onCommit)
      await act(async () => (map.props?.onRotateStart as (event: unknown) => void)({ originalEvent: new TouchEvent('touchmove') }))
      map.bearing = live
      await act(async () => (map.props?.onRotate as () => void)())
      await act(async () => (map.props?.onRotateEnd as (event: unknown) => void)({ originalEvent: new TouchEvent('touchend') }))
      expect(map.bearing).toBe(final)
      expect(container.querySelector('.map-bearing__value')?.textContent)
        .toBe(manual === null && source.status === 'unavailable' ? 'TWD—' : `TWD${String(final).padStart(3, '0')}°`)
      expect(container.textContent?.includes('Manual · Viewer')).toBe(manual !== null)
    }
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('ignores programmatic rotation and restores a cancelled touch gesture', async () => {
    const onCommit = vi.fn()
    await renderMap(reference, resolveTwdPresentation(reference, null), 'full', vi.fn(), vi.fn(), null, null, onCommit)
    await act(async () => (map.props?.onRotateStart as (event: unknown) => void)({ originalEvent: undefined }))
    map.bearing = 180
    await act(async () => (map.props?.onRotateEnd as (event: unknown) => void)({ originalEvent: undefined }))
    expect(onCommit).not.toHaveBeenCalled()
    map.bearing = 90

    await act(async () => (map.props?.onRotateStart as (event: unknown) => void)({ originalEvent: new TouchEvent('touchmove') }))
    map.bearing = 112
    await act(async () => (map.props?.onRotate as () => void)())
    await act(async () => (map.props?.onTouchCancel as () => void)())
    expect(map.stop).toHaveBeenCalledOnce()
    expect(map.bearing).toBe(90)
    await act(async () => (map.props?.onRotateEnd as (event: unknown) => void)({ originalEvent: new TouchEvent('touchcancel') }))
    expect(onCommit).not.toHaveBeenCalled()
    expect(container.querySelector('.map-bearing__value')?.textContent).toBe('TWD090°')
  })

  it('cancels an active gesture when the committed TWD changes externally', async () => {
    const onCommit = vi.fn()
    await renderMap(reference, resolveTwdPresentation(reference, null), 'full', vi.fn(), vi.fn(), null, null, onCommit)
    await act(async () => (map.props?.onRotateStart as (event: unknown) => void)({ originalEvent: new MouseEvent('mousemove', { ctrlKey: true }) }))
    map.bearing = 123
    await act(async () => (map.props?.onRotate as () => void)())
    await renderMap(reference, resolveTwdPresentation(reference, 95), 'full', vi.fn(), vi.fn(), null, null, onCommit)
    expect(map.stop).toHaveBeenCalledOnce()
    expect(map.bearing).toBe(95)
    await act(async () => (map.props?.onRotateEnd as (event: unknown) => void)({ originalEvent: new MouseEvent('mouseup') }))
    expect(onCommit).not.toHaveBeenCalled()
    expect(container.querySelector('.map-bearing__value')?.textContent).toBe('TWD095°')
  })

  it('keeps fit and focus programmatic while discarding an active gesture', async () => {
    const onCommit = vi.fn()
    const presentation = resolveTwdPresentation(reference, null)
    await renderMap(reference, presentation, 'full', vi.fn(), vi.fn(), null, null, onCommit)
    await act(async () => (map.props?.onRotateStart as (event: unknown) => void)({ originalEvent: new MouseEvent('mousemove', { button: 2 }) }))
    map.bearing = 116
    await act(async () => (map.props?.onRotate as () => void)())
    await renderMap(reference, presentation, 'narrow', vi.fn(), vi.fn(), null, null, onCommit)
    expect(map.stop).toHaveBeenCalledOnce()
    expect(map.fitBounds).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ bearing: 90 }))

    await act(async () => (map.props?.onRotateStart as (event: unknown) => void)({ originalEvent: new MouseEvent('mousemove', { ctrlKey: true }) }))
    map.bearing = 121
    await act(async () => (map.props?.onRotate as () => void)())
    await renderMap(reference, presentation, 'narrow', vi.fn(), vi.fn(), { activityRole: 'primary', requestId: 2 }, null, onCommit)
    expect(map.stop).toHaveBeenCalledTimes(2)
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [-30.72, 0.25] }))
    await act(async () => (map.props?.onRotateEnd as (event: unknown) => void)({ originalEvent: new MouseEvent('mouseup') }))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('uses the free expanded TWD header as an accessible close target without changing wind controls', async () => {
    const onStep = vi.fn()
    const onAutomatic = vi.fn()
    await renderMap(reference, resolveTwdPresentation(reference, 95), 'full', onStep, onAutomatic)
    await click('TWD 095°')
    const headerClose = container.querySelector<HTMLButtonElement>('[aria-label="Close TWD reference details"]')
    expect(headerClose?.getAttribute('type')).toBe('button')
    expect(headerClose?.className).toBe('map-twd__header-dismiss')
    await click('Adjust TWD 5 degrees clockwise')
    await click('Reset TWD to automatic')
    expect(onStep).toHaveBeenCalledWith(5)
    expect(onAutomatic).toHaveBeenCalledOnce()
    expect(container.querySelector('[aria-label="TWD reference details"]')).not.toBeNull()
    await click('Close TWD reference details')
    expect(container.querySelector('[aria-label="TWD reference details"]')).toBeNull()
    expect(map.bearing).toBe(95)
    expect(onStep).toHaveBeenCalledOnce()
    expect(onAutomatic).toHaveBeenCalledOnce()
  })

  it('keeps TWD and Weather mutually exclusive and dismisses either from outside the map', async () => {
    await renderMap(reference, resolveTwdPresentation(reference, null), 'full', vi.fn(), vi.fn(), null, weather)
    const twdDetail = () => container.querySelector('[aria-label="TWD reference details"]')
    const weatherDetail = () => container.querySelector('[aria-label="Historical modelled conditions"]')
    const weatherChip = () => container.querySelector<HTMLButtonElement>('.map-conditions__chip')!
    const outside = document.createElement('button')
    outside.textContent = 'Viewer control outside map'
    const onOutsideClick = vi.fn()
    outside.addEventListener('click', onOutsideClick)
    container.append(outside)

    await click('TWD 090°')
    expect(twdDetail()).not.toBeNull()
    await act(async () => twdDetail()!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(twdDetail()).not.toBeNull()
    await act(async () => weatherChip().click())
    expect(twdDetail()).toBeNull()
    expect(weatherDetail()).not.toBeNull()
    expect(weatherDetail()?.textContent).toContain('19 kt')

    await act(async () => weatherDetail()!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(weatherDetail()).not.toBeNull()
    await act(async () => weatherChip().click())
    expect(weatherDetail()).toBeNull()
    await act(async () => weatherChip().click())
    await click('TWD 090°')
    expect(weatherDetail()).toBeNull()
    expect(twdDetail()).not.toBeNull()

    await act(async () => outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(twdDetail()).toBeNull()
    await act(async () => weatherChip().click())
    await act(async () => outside.click())
    expect(weatherDetail()).toBeNull()
    expect(onOutsideClick).toHaveBeenCalledOnce()
    outside.remove()
  })

  it('keeps TWS, TWD and Weather disclosures mutually exclusive through pointer and map interactions', async () => {
    await renderMap(reference, resolveTwdPresentation(reference, null), 'full', vi.fn(), vi.fn(), null, weather)
    const tws = () => container.querySelector('[aria-label="TWS reference details"]')
    const twd = () => container.querySelector('[aria-label="TWD reference details"]')
    const weatherDetail = () => container.querySelector('[aria-label="Historical modelled conditions"]')
    await click('TWS --')
    expect(tws()).not.toBeNull()
    await act(async () => tws()!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(tws()).not.toBeNull()
    await click('TWD 090°')
    expect(tws()).toBeNull()
    expect(twd()).not.toBeNull()
    await click('TWS --')
    expect(twd()).toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>('.map-conditions__chip')!.click())
    expect(tws()).toBeNull()
    expect(weatherDetail()).not.toBeNull()
    await click('TWS --')
    expect(weatherDetail()).toBeNull()
    await act(async () => (map.props?.onZoomStart as () => void)())
    expect(tws()).toBeNull()
  })

  it('dismisses TWD details on map taps and map interaction starts, while control interactions stay open', async () => {
    const onStep = vi.fn()
    const onAutomatic = vi.fn()
    await renderMap(reference, resolveTwdPresentation(reference, 95), 'full', onStep, onAutomatic)
    const detail = () => container.querySelector('[aria-label="TWD reference details"]')

    await click('TWD 095°')
    expect(detail()).not.toBeNull()
    await act(async () => detail()!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(detail()).not.toBeNull()
    await click('Adjust TWD 5 degrees clockwise')
    expect(onStep).toHaveBeenCalledWith(5)
    await act(async () => {
      const rotateStart = map.props?.onRotateStart as () => void
      const moveStart = map.props?.onMoveStart as () => void
      rotateStart()
      moveStart()
    })
    expect(detail()).not.toBeNull()
    await click('Reset TWD to automatic')
    expect(onAutomatic).toHaveBeenCalledOnce()
    expect(detail()).not.toBeNull()

    await click('TWD 095°')
    expect(detail()).toBeNull()
    await click('TWD 095°')
    await act(async () => container.querySelector('[data-map]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(detail()).toBeNull()
    await click('TWD 095°')
    await act(async () => container.querySelector('.map-panel')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(detail()).toBeNull()

    for (const eventName of ['onClick', 'onDragStart', 'onZoomStart'] as const) {
      await click('TWD 095°')
      expect(detail()).not.toBeNull()
      await act(async () => (map.props?.[eventName] as () => void)())
      expect(detail(), `after ${eventName}`).toBeNull()
    }
    expect(onAutomatic).toHaveBeenCalledOnce()
    expect(container.querySelector('[aria-label="Reset TWD to automatic"]')).not.toBeNull()
    expect(map.bearing).toBe(95)
  })

  it('uses rounded TWD as the camera bearing, preserving fit and geographic marker rotations', async () => {
    await renderMap()
    expect(container.querySelector('[aria-label="Reset TWD to automatic"]')).toBeNull()
    expect(map.props?.dragRotate).toBe(true)
    expect(map.props?.pitchWithRotate).toBe(false)
    expect(map.props?.touchZoomRotate).toBeUndefined() // default pinch zoom remains enabled
    expect(map.props?.scrollZoom).toBeUndefined() // default wheel zoom remains enabled
    expect(map.props?.dragPan).toBeUndefined() // default pan remains enabled
    expect(map.props?.initialViewState).toMatchObject({ bearing: 90 })
    expect(map.fitBounds).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ bearing: 90, duration: 0 }))
    expect(map.jumpTo).toHaveBeenCalledWith({ bearing: 90 })
    expectMarkerRotation(0)
    await act(async () => (map.props?.onLoad as () => void)())
    expect(map.disableTouchRotation).not.toHaveBeenCalled()
    expect(map.disableKeyboardRotation).toHaveBeenCalledOnce()
    expect(map.fitBounds).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ bearing: 90 }))
  })

  it('shows unavailable TWD with north-up camera and accepts manual-only steps', async () => {
    const unavailable: TwdReference = { status: 'unavailable' }
    const onStep = vi.fn()
    const onAutomatic = vi.fn()
    await renderMap(unavailable, resolveTwdPresentation(unavailable, null), 'full', onStep)
    expect(container.querySelector('.map-bearing__value')?.textContent).toBe('TWD—')
    expect(map.props?.initialViewState).toMatchObject({ bearing: 0 })
    expectMarkerRotation(90)
    await click('Adjust TWD 5 degrees clockwise')
    await click('Adjust TWD 5 degrees counterclockwise')
    expect(onStep.mock.calls).toEqual([[5], [-5]])
    await click('TWD —')
    expect(container.querySelector('[aria-label="TWD reference details"]')?.textContent).toContain('No automatic TWD reference available')
    await renderMap(unavailable, resolveTwdPresentation(unavailable, 355), 'full', onStep, onAutomatic)
    expect(container.textContent).toContain('Manual · Viewer')
    expect(container.textContent).toContain('Manual only')
    expect(map.jumpTo).toHaveBeenLastCalledWith({ bearing: 355 })
    expectMarkerRotation(95)
    expect(container.querySelector('[aria-label="Reset TWD to automatic"]')).not.toBeNull()
    await click('TWD 355°')
    await click('Reset TWD to automatic')
    expect(onAutomatic).toHaveBeenCalledOnce()
    await renderMap(unavailable, resolveTwdPresentation(unavailable, null))
    expect(container.querySelector('.map-bearing__value')?.textContent).toBe('TWD—')
    expect(container.querySelector('[aria-label="Reset TWD to automatic"]')).toBeNull()
  })

  it('shows original source evidence, rounded value and manual correction in accessible details', async () => {
    const onAutomatic = vi.fn()
    await renderMap(reference, resolveTwdPresentation(reference, 95), 'full', vi.fn(), onAutomatic)
    const reset = container.querySelector<HTMLButtonElement>('[aria-label="Reset TWD to automatic"]')
    expect(reset?.textContent).toBe('Reset')
    expect(reset?.getAttribute('type')).toBe('button')
    await click('TWD 095°')
    const detail = container.querySelector('[aria-label="TWD reference details"]')!
    expect(detail.textContent).toContain('Modelled weather')
    expect(detail.textContent).toContain('Nearest valid wind sample to window midpoint')
    expect(detail.textContent).toContain('01 Jan 2031')
    expect(detail.textContent).toContain('open-meteo')
    expect(detail.textContent).toContain('91.6°')
    expect(detail.textContent).toContain('090°')
    expect(detail.textContent).toContain('Viewer correction: 095°')
    expect(detail.textContent).not.toContain('Return to automatic')
    expect(container.querySelector('.map-bearing__value')?.getAttribute('aria-expanded')).toBe('true')
    await click('TWD 095°')
    expect(container.querySelector('[aria-label="TWD reference details"]')).toBeNull()
    await click('Reset TWD to automatic')
    expect(onAutomatic).toHaveBeenCalledOnce()
    await renderMap(reference, resolveTwdPresentation(reference, null))
    expect(container.querySelector('.map-bearing__value')?.textContent).toBe('TWD090°')
    expect(container.querySelector('[aria-label="Reset TWD to automatic"]')).toBeNull()
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
