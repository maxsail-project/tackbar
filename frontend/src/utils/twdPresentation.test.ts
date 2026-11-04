import { describe, expect, it } from 'vitest'
import { resolveGestureTwd, resolveTwdPresentation, stepViewerTwd } from './twdPresentation'
import type { TwdReference } from './twdReference'

const unavailable: TwdReference = { status: 'unavailable' }
const reference = (directionDegrees: number): TwdReference => ({
  status: 'available', directionDegrees, sourceKind: 'modelled_weather',
  sourceTimeUtc: '2031-01-01T10:00:00.000Z', provenance: { provider: 'open-meteo' },
})

describe('Viewer TWD presentation', () => {
  it.each([
    [359, 0], [360, 0], [361, 0], [-1, 0], [357.5, 0], [2.5, 5],
    [352.5, 355], [-2.5, 0], [94.9, 95],
  ])('snaps gesture bearing %s° circularly to %s°', (bearing, snapped) => {
    expect(resolveGestureTwd(bearing, 90)?.snappedBearing).toBe(snapped)
  })

  it('preserves the prior mode when snapped bearing matches the pre-gesture effective TWD', () => {
    for (const before of [
      resolveTwdPresentation(reference(91.6), null),
      resolveTwdPresentation(reference(91.6), 95),
      resolveTwdPresentation(unavailable, null),
    ]) {
      const result = resolveGestureTwd(before.bearing + 1.9, before.bearing)
      expect(result).toEqual({ snappedBearing: before.bearing, changed: false })
    }
    expect(resolveGestureTwd(355, 0)).toEqual({ snappedBearing: 355, changed: true })
    expect(resolveGestureTwd(102, 95)).toEqual({ snappedBearing: 100, changed: true })
    expect(resolveGestureTwd(Number.NaN, 90)).toBeNull()
  })

  it.each([
    [0, 0], [360, 0], [359.9, 0], [357.4, 355], [2.5, 5], [91.6, 90],
  ])('rounds original %s° circularly to %s° only for presentation', (original, rounded) => {
    expect(resolveTwdPresentation(reference(original), null)).toEqual({
      bearing: rounded, displayDegrees: rounded, automaticDegrees: rounded, manual: false,
    })
    expect(reference(original)).toMatchObject({ directionDegrees: original })
  })

  it('keeps unavailable wind separate from operational north-up bearing', () => {
    expect(resolveTwdPresentation(unavailable, null)).toEqual({
      bearing: 0, displayDegrees: null, automaticDegrees: null, manual: false,
    })
  })

  it('steps through 0°/360° and starts manual-only adjustment from north-up', () => {
    expect(stepViewerTwd(null, 5)).toBe(5)
    expect(stepViewerTwd(null, -5)).toBe(355)
    expect(stepViewerTwd(355, 5)).toBe(0)
    expect(stepViewerTwd(0, -5)).toBe(355)
    expect(resolveTwdPresentation(unavailable, 355)).toEqual({
      bearing: 355, displayDegrees: 355, automaticDegrees: null, manual: true,
    })
  })

  it('preserves a Viewer override when the automatic source changes or disappears', () => {
    const manual = stepViewerTwd(resolveTwdPresentation(reference(92), null).displayDegrees, 5)
    expect(resolveTwdPresentation(reference(210), manual)).toMatchObject({
      bearing: 95, automaticDegrees: 210, manual: true,
    })
    expect(resolveTwdPresentation(unavailable, manual)).toMatchObject({
      bearing: 95, automaticDegrees: null, manual: true,
    })
    expect(resolveTwdPresentation(reference(210), null)).toMatchObject({
      bearing: 210, manual: false,
    })
  })
})
