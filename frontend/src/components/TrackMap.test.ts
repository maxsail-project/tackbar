import { describe, expect, it } from 'vitest'
import {
  boatMarkerRotation,
  shouldRefitForActivityChange,
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

describe('map viewport fitting', () => {
  it('does not refit when the loaded Activity selection is unchanged', () => {
    const fitActivityKey = 'primary-activity:comparison-activity'

    expect(shouldRefitForActivityChange(fitActivityKey, fitActivityKey))
      .toBe(false)
  })

  it('refits when the loaded Activity selection changes', () => {
    expect(shouldRefitForActivityChange('primary-activity:', 'primary-activity:comparison-activity'))
      .toBe(true)
    expect(shouldRefitForActivityChange('primary-activity:', 'next-primary-activity:'))
      .toBe(true)
  })
})
