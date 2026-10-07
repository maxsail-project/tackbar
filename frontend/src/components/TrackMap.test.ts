import { describe, expect, it } from 'vitest'
import type { TrackBounds } from '../utils/trackGeometry'
import {
  boatMarkerRotation,
  createMapFitContextKey,
  currentVisibleTrackBounds,
  formatMapCogValue,
  maneuverFocusCameraOptions,
  resolveMapFocusPosition,
  shouldRefitForContextChange,
} from './TrackMap'

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

  it('changes center without supplying a zoom', () => {
    const cameraOptions = maneuverFocusCameraOptions(primaryPosition)

    expect(cameraOptions).toEqual({ center: [-30.73, 0.25] })
    expect(cameraOptions).not.toHaveProperty('zoom')
  })
})
