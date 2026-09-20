import { describe, expect, it } from 'vitest'
import { boatMarkerRotation } from './TrackMap'

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
