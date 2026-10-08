import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { TrackBounds } from '../utils/trackGeometry'
import {
  boatMarkerRotation,
  createMapFitContextKey,
  currentVisibleTrackBounds,
  formatMapCogValue,
  MapTelemetryOverlay,
  maneuverFocusCameraOptions,
  resolveMapFocusPosition,
  shouldRefitForContextChange,
} from './TrackMap'

function renderTelemetry(hasComparison: boolean) {
  return renderToStaticMarkup(MapTelemetryOverlay({
    hasComparison,
    primaryActivityIdentity: 'Maxima Sailing Team',
    comparisonActivityIdentity: 'Juan Carlos',
    playbackTime: Date.UTC(2031, 0, 1, 12, 9, 49),
    primarySog: 2.5,
    primaryCog: 16,
    primaryHeel: -2.6,
    primaryTrim: -2.9,
    comparisonSog: 3.1,
    comparisonCog: 22,
    comparisonHeel: -1.8,
    comparisonTrim: -1.5,
  }))
}

describe('compact map telemetry overlay', () => {
  it('renders GPS time, metric headers, Primary values, and Primary identity', () => {
    const markup = renderTelemetry(false)

    expect(markup).toContain('class="map-status__gps-time"')
    expect(markup).toContain('aria-label="GPS time 12:09:49 UTC"')
    expect(markup).toContain('<span>GPS</span><strong>12:09:49</strong>')
    expect(markup).not.toContain('class="map-status__time"')
    expect(markup).not.toContain('>UTC<')
    expect(markup).toContain('>SOG</th>')
    expect(markup).toContain('>COG</th>')
    expect(markup).toContain('>HEEL</th>')
    expect(markup).toContain('>TRIM</th>')
    expect(markup).toContain('map-status__activity-role">P</span>')
    expect(markup).toContain('map-status__activity-name" title="Maxima Sailing Team"')
    expect(markup).toContain('2.5 kt')
    expect(markup).toContain('16°')
    expect(markup).toContain('-2.6°')
    expect(markup).toContain('-2.9°')
    expect(markup).toContain(`background-color:${ACTIVITY_COLORS.primary}`)
    expect(markup).not.toContain('map-status__activity-role">C</span>')
    expect(markup).not.toContain('Juan Carlos')
    expect(markup).not.toContain(`background-color:${ACTIVITY_COLORS.comparison}`)
  })

  it('adds the Comparison row with its values and identity color', () => {
    const markup = renderTelemetry(true)

    expect(markup).toContain('map-status__activity-role">C</span>')
    expect(markup).toContain('map-status__activity-name" title="Juan Carlos"')
    expect(markup).toContain('3.1 kt')
    expect(markup).toContain('22°')
    expect(markup).toContain('-1.8°')
    expect(markup).toContain('-1.5°')
    expect(markup).toContain(`background-color:${ACTIVITY_COLORS.comparison}`)
  })
})

describe('boat marker rotation', () => {
  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
    [359, 359],
    [null, 0],
  ])('uses COG %s as the north-up marker rotation', (cog, expected) => {
    expect(boatMarkerRotation(cog)).toBe(expected)
  })
})

describe('map COG presentation', () => {
  it.each([
    [120.4, '120°'],
    [359.9, '0°'],
    [null, '—'],
  ])('formats map COG %s as %s', (cog, expected) => {
    expect(formatMapCogValue(cog)).toBe(expected)
  })
})

describe('map viewport fitting', () => {
  const fullWindow = createMapFitContextKey('primary', 'comparison', 100, 500)
  const narrowWindow = createMapFitContextKey('primary', 'comparison', 200, 400)

  it('does not refit when Activity selection and Analysis Window are unchanged', () => {
    expect(shouldRefitForContextChange(fullWindow, fullWindow)).toBe(false)
  })

  it('changes context for Primary, Comparison, and either Analysis Window boundary', () => {
    expect(createMapFitContextKey('next-primary', 'comparison', 100, 500))
      .not.toBe(fullWindow)
    expect(createMapFitContextKey('primary', 'next-comparison', 100, 500))
      .not.toBe(fullWindow)
    expect(createMapFitContextKey('primary', 'comparison', 101, 500))
      .not.toBe(fullWindow)
    expect(createMapFitContextKey('primary', 'comparison', 100, 499))
      .not.toBe(fullWindow)
  })

  it('does not include playbackTime in the fit context', () => {
    const beforeReplayProgress = createMapFitContextKey('primary', 'comparison', 100, 500)
    const afterReplayProgress = createMapFitContextKey('primary', 'comparison', 100, 500)

    expect(afterReplayProgress).toBe(beforeReplayProgress)
  })

  it('requests a new fit for narrower and reset Analysis Windows', () => {
    expect(shouldRefitForContextChange(fullWindow, narrowWindow)).toBe(true)
    expect(shouldRefitForContextChange(narrowWindow, fullWindow)).toBe(true)
  })

  it('fits Primary bounds alone or combined current-window bounds', () => {
    const primaryBounds: TrackBounds = [[-30.73, 0.25], [-30.71, 0.27]]
    const comparisonBounds: TrackBounds = [[-30.74, 0.26], [-30.70, 0.28]]

    expect(currentVisibleTrackBounds(primaryBounds, null)).toEqual(primaryBounds)
    expect(currentVisibleTrackBounds(primaryBounds, comparisonBounds)).toEqual([
      [-30.74, 0.25],
      [-30.70, 0.28],
    ])
  })
})

describe('maneuver map focus', () => {
  const primaryPosition = { lat: 0.25, lon: -30.73 }
  const comparisonPosition = { lat: 0.28, lon: -30.70 }

  it('resolves the explicitly requested boat role', () => {
    expect(resolveMapFocusPosition(
      { activityRole: 'primary', requestId: 1 },
      primaryPosition,
      comparisonPosition,
    )).toBe(primaryPosition)
    expect(resolveMapFocusPosition(
      { activityRole: 'comparison', requestId: 2 },
      primaryPosition,
      comparisonPosition,
    )).toBe(comparisonPosition)
  })

  it('does not invent a position when the requested boat is unavailable', () => {
    expect(resolveMapFocusPosition(
      { activityRole: 'comparison', requestId: 1 },
      primaryPosition,
      null,
    )).toBeNull()
  })

  it('places the requested position above center using the rendered map height', () => {
    const cameraOptions = maneuverFocusCameraOptions(primaryPosition, 400)

    expect(cameraOptions).toEqual({
      center: [-30.73, 0.25],
      offset: [0, -50],
    })
    expect(cameraOptions).not.toHaveProperty('zoom')
    expect(cameraOptions).not.toHaveProperty('bearing')
    expect(cameraOptions).not.toHaveProperty('pitch')
  })

  it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'keeps the requested position centered for invalid map height %s',
    (mapHeight) => {
      expect(maneuverFocusCameraOptions(primaryPosition, mapHeight)).toEqual({
        center: [-30.73, 0.25],
        offset: [0, 0],
      })
    },
  )

  it('scales the focus offset when the rendered map height changes', () => {
    expect(maneuverFocusCameraOptions(primaryPosition, 520).offset)
      .toEqual([0, -65])
  })
})
