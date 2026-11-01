// @vitest-environment jsdom
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import type { CSSProperties, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { TrackSample } from '../types/track'
import type { SelectedManeuverHighlight } from '../utils/selectedManeuverGeometry'
import TrackMap from './TrackMap'

const layerStack = vi.hoisted(() => [] as string[])

vi.mock('react-map-gl/maplibre', async () => {
  const { forwardRef, useEffect, useImperativeHandle, useRef } = await import('react')
  return {
  default: forwardRef(function MockMap({ children }: { children: ReactNode }, ref) {
    useImperativeHandle(ref, () => ({
      getLayer: (id: string) => layerStack.includes(id) ? { id } : undefined,
      getBearing: () => 0,
      fitBounds: () => undefined,
    }))
    return <div data-map>{children}</div>
  }),
  Source: ({ id, data, children }: { id: string, data: { geometry: { type: string, coordinates: number[][] | number[][][] } }, children: ReactNode }) => {
    const longitude = data.geometry.type === 'LineString'
      ? (data.geometry.coordinates as number[][])[0][0]
      : (data.geometry.coordinates as number[][][])[0][0][0]
    return <div data-source={id} data-start-longitude={longitude}>{children}</div>
  },
  Layer: ({ id, beforeId, paint }: { id: string, beforeId?: string, paint: Record<string, string | number> }) => {
    const previousBeforeId = useRef(beforeId)
    useEffect(() => {
      if (!layerStack.includes(id)) {
        const index = beforeId ? layerStack.indexOf(beforeId) : -1
        layerStack.splice(index < 0 ? layerStack.length : index, 0, id)
      } else if (previousBeforeId.current !== beforeId) {
        layerStack.splice(layerStack.indexOf(id), 1)
        const index = beforeId ? layerStack.indexOf(beforeId) : -1
        layerStack.splice(index < 0 ? layerStack.length : index, 0, id)
      }
      previousBeforeId.current = beforeId
      return () => {
        const index = layerStack.indexOf(id)
        if (index >= 0) layerStack.splice(index, 1)
      }
    }, [id, beforeId])
    return <div data-layer={id} data-color={paint['line-color']} data-width={paint['line-width']} />
  },
  Marker: ({ children, style, longitude, latitude }: { children: ReactNode, style?: CSSProperties, longitude: number, latitude: number }) =>
    <div className="maplibregl-marker" data-boat-marker data-longitude={longitude} data-latitude={latitude} style={style}>{children}</div>,
  NavigationControl: () => null,
  Popup: ({ children, style }: { children: ReactNode, style?: CSSProperties }) =>
    <div className="maplibregl-popup" style={style}>{children}</div>,
  }
})
vi.mock('./HistoricalConditionsControl', () => ({ default: () => null }))

const samples: TrackSample[] = [
  { utc: '2031-01-01T10:00:00Z', lat: 0.25, lon: -30.72, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
  { utc: '2031-01-01T10:00:01Z', lat: 0.25, lon: -30.71, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
]
const otherSamples = samples.map((sample) => ({ ...sample, lon: sample.lon + 0.01 }))

function highlight(selectionIndex: 1 | 2, activityRole: 'primary' | 'comparison'): SelectedManeuverHighlight {
  return {
    selectionIndex,
    activityRole,
    geoJson: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiLineString', coordinates: [[[-30.72, 0.25], [-30.71, 0.25]]] },
    },
  }
}

function mapElement(
  selectedManeuverHighlights: SelectedManeuverHighlight[],
  primarySamples = samples,
  comparisonSamples: TrackSample[] = samples,
  showFleet = true,
  fitContextKey = 'test',
  markerOptions: {
    primaryIdentity?: string
    comparisonIdentity?: string
    primaryPosition?: { lat: number, lon: number } | null
    comparisonPosition?: { lat: number, lon: number } | null
    contextualPosition?: { lat: number, lon: number } | null
    onCompare?: (activityId: string) => void
  } = {},
) {
  const overlap = { lat: 0.25, lon: -30.72 }
  return <TrackMap
    primaryVisibleSamples={primarySamples}
    comparisonVisibleSamples={comparisonSamples}
    contextualActivities={showFleet ? [{
      id: 'fleet', identity: 'Fleet', visibleSamples: samples,
      boatPosition: markerOptions.contextualPosition ?? null, cog: null,
    }] : []}
    fitContextKey={fitContextKey}
    selectedManeuverHighlights={selectedManeuverHighlights}
    primaryActivityIdentity={markerOptions.primaryIdentity ?? 'Primary'}
    comparisonActivityIdentity={markerOptions.comparisonIdentity ?? 'Comparison'}
    primaryBoatPosition={markerOptions.primaryPosition === undefined ? overlap : markerOptions.primaryPosition}
    comparisonBoatPosition={markerOptions.comparisonPosition === undefined ? { lat: 0.25, lon: -30.71 } : markerOptions.comparisonPosition}
    hasComparison={markerOptions.comparisonPosition !== null}
    playbackTime={Date.parse(samples[0].utc)}
    primarySog={5}
    primaryCog={90}
    primaryHeel={null}
    primaryTrim={null}
    comparisonSog={5}
    comparisonCog={90}
    comparisonHeel={null}
    comparisonTrim={null}
    onCompareContextualActivity={markerOptions.onCompare}
  />
}

function renderMap(
  selectedManeuverHighlights: SelectedManeuverHighlight[],
  primarySamples = samples,
  comparisonSamples: TrackSample[] = samples,
) {
  return renderToStaticMarkup(mapElement(selectedManeuverHighlights, primarySamples, comparisonSamples))
}

describe('selected maneuver map layer order', () => {
  it('keeps the layer stack ordered when selected tracks and fleet layers mount later', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    layerStack.length = 0
    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      await act(async () => root.render(mapElement([], samples, [], false)))
      expect(layerStack).toEqual(['primary-activity-track-line'])

      await act(async () => root.render(mapElement([highlight(1, 'primary')], samples, otherSamples, true)))
      expect(layerStack).toEqual([
        'contextual-activity-track-line-fleet',
        'comparison-activity-track-line',
        'primary-activity-track-line',
        'selected-maneuver-highlight-halo-1',
        'selected-maneuver-highlight-line-1',
      ])

      await act(async () => root.render(mapElement([highlight(1, 'comparison')], otherSamples, samples, true, 'new-window')))
      expect(layerStack).toEqual([
        'contextual-activity-track-line-fleet',
        'comparison-activity-track-line',
        'primary-activity-track-line',
        'selected-maneuver-highlight-halo-1',
        'selected-maneuver-highlight-line-1',
      ])
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('keeps fleet, Comparison, Primary, and maneuver layers in role order after a role swap', () => {
    for (const [primary, comparison] of [[samples, otherSamples], [otherSamples, samples]]) {
      const markup = renderMap([highlight(1, 'primary')], primary, comparison)
      const layerIds = [...markup.matchAll(/data-layer="([^"]+)"/g)].map((match) => match[1])

      expect(layerIds).toEqual([
        'contextual-activity-track-line-fleet',
        'comparison-activity-track-line',
        'primary-activity-track-line',
        'selected-maneuver-highlight-halo-1',
        'selected-maneuver-highlight-line-1',
      ])
      expect(markup).toContain(`data-source="primary-activity-track" data-start-longitude="${primary[0].lon}"`)
      expect(markup).toContain(`data-source="comparison-activity-track" data-start-longitude="${comparison[0].lon}"`)
    }
  })

  it('keeps Primary alone above fleet context without changing its line style', () => {
    const markup = renderMap([], samples, [])
    const layerIds = [...markup.matchAll(/data-layer="([^"]+)"/g)].map((match) => match[1])

    expect(layerIds).toEqual(['contextual-activity-track-line-fleet', 'primary-activity-track-line'])
    expect(markup).toContain(`data-layer="primary-activity-track-line" data-color="${ACTIVITY_COLORS.primary}" data-width="4"`)
    expect(markup).not.toContain('comparison-activity-track-line')
  })

  it('draws each halo below its P/C line and leaves replay boats above the lines', () => {
    const markup = renderMap([highlight(1, 'primary'), highlight(2, 'comparison')])
    const halo1 = markup.indexOf('data-layer="selected-maneuver-highlight-halo-1"')
    const line1 = markup.indexOf('data-layer="selected-maneuver-highlight-line-1"')
    const halo2 = markup.indexOf('data-layer="selected-maneuver-highlight-halo-2"')
    const line2 = markup.indexOf('data-layer="selected-maneuver-highlight-line-2"')
    const boat = markup.indexOf('aria-label="Primary boat position"')

    expect(halo1).toBeGreaterThan(-1)
    expect(halo1).toBeLessThan(halo2)
    expect(halo2).toBeLessThan(line1)
    expect(line1).toBeLessThan(line2)
    expect(line2).toBeLessThan(boat)
    expect(markup).toContain(`data-layer="selected-maneuver-highlight-line-1" data-color="${ACTIVITY_COLORS.primary}"`)
    expect(markup).toContain(`data-layer="selected-maneuver-highlight-line-2" data-color="${ACTIVITY_COLORS.comparison}"`)
    expect(markup).not.toContain('selected-maneuver-map-marker')
  })

  it('renders no highlight layers without selections', () => {
    expect(renderMap([])).not.toContain('selected-maneuver-highlight-')
  })
})

describe('replay boat marker stack', () => {
  function marker(container: HTMLElement, label: string) {
    const boat = container.querySelector(`[aria-label="${label}"]`)
    expect(boat).not.toBeNull()
    const outer = boat!.closest('.maplibregl-marker') as HTMLElement | null
    expect(outer).not.toBeNull()
    return outer!
  }

  function expectRoleStack(container: HTMLElement) {
    const contextual = marker(container, 'Fleet contextual boat position')
    const comparison = marker(container, 'Comparison boat position')
    const primary = marker(container, 'Primary boat position')
    expect([contextual, comparison, primary].map((element) => getComputedStyle(element).zIndex)).toEqual(['1', '2', '3'])
    expect([contextual, comparison, primary].map((element) => [element.dataset.longitude, element.dataset.latitude]))
      .toEqual(Array(3).fill(['-30.72', '0.25']))
  }

  it('keeps contextual below Comparison below Primary after role swaps and replay movement', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const overlap = { lat: 0.25, lon: -30.72 }
    try {
      await act(async () => root.render(mapElement([], samples, samples, true, 'initial', {
        primaryIdentity: 'A', comparisonIdentity: 'B', primaryPosition: overlap,
        comparisonPosition: overlap, contextualPosition: overlap,
      })))
      expectRoleStack(container)

      await act(async () => root.render(mapElement([], otherSamples, samples, true, 'role-swap', {
        primaryIdentity: 'B', comparisonIdentity: 'A', primaryPosition: overlap,
        comparisonPosition: overlap, contextualPosition: overlap,
      })))
      expectRoleStack(container)

      const moved = { lat: 0.26, lon: -30.7 }
      await act(async () => root.render(mapElement([], otherSamples, samples, true, 'new-window', {
        primaryIdentity: 'B', comparisonIdentity: 'A', primaryPosition: moved,
        comparisonPosition: moved, contextualPosition: moved,
      })))
      expect([marker(container, 'Fleet contextual boat position'), marker(container, 'Comparison boat position'), marker(container, 'Primary boat position')]
        .map((element) => [getComputedStyle(element).zIndex, element.dataset.longitude, element.dataset.latitude]))
        .toEqual([['1', '-30.7', '0.26'], ['2', '-30.7', '0.26'], ['3', '-30.7', '0.26']])
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('preserves precedence when Comparison and contextual markers mount after Primary, and keeps the popup above them', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const overlap = { lat: 0.25, lon: -30.72 }
    const onCompare = vi.fn()
    try {
      await act(async () => root.render(mapElement([], samples, samples, true, 'primary-only', {
        primaryPosition: overlap, comparisonPosition: null, contextualPosition: null,
      })))
      expect(container.querySelectorAll('.maplibregl-marker')).toHaveLength(1)
      expect(getComputedStyle(marker(container, 'Primary boat position')).zIndex).toBe('3')

      await act(async () => root.render(mapElement([], samples, samples, true, 'later-markers', {
        primaryPosition: overlap, comparisonPosition: overlap, contextualPosition: overlap, onCompare,
      })))
      expectRoleStack(container)
      await act(async () => (container.querySelector('.contextual-boat-marker') as HTMLButtonElement).click())
      const popup = container.querySelector('.maplibregl-popup') as HTMLElement
      expect(getComputedStyle(popup).zIndex).toBe('4')
      await act(async () => (popup.querySelector('button') as HTMLButtonElement).click())
      expect(onCompare).toHaveBeenCalledExactlyOnceWith('fleet')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
