import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import { buildTrackGeometry, combineTrackBounds } from './trackGeometry'

function sample(utc: string, lat: number, lon: number): TrackSample {
  return {
    utc,
    lat,
    lon,
    dist: 0,
    sog: null,
    cog: null,
    hdg: null,
    heel: null,
    trim: null,
  }
}

describe('track geometry', () => {
  it('uses longitude-latitude order and derives bounds from every sample', () => {
    const geometry = buildTrackGeometry([
      sample('2031-06-15T10:00:00Z', 0.27, -30.72),
      sample('2031-06-15T10:00:01Z', 0.25, -30.70),
      sample('2031-06-15T10:00:02Z', 0.26, -30.74),
    ])

    expect(geometry.geoJson.geometry.coordinates).toEqual([
      [-30.72, 0.27],
      [-30.70, 0.25],
      [-30.74, 0.26],
    ])
    expect(geometry.bounds).toEqual([
      [-30.74, 0.25],
      [-30.70, 0.27],
    ])
  })

  it('rejects non-finite rendering coordinates', () => {
    expect(() => buildTrackGeometry([
      sample('2031-06-15T10:00:00Z', Number.NaN, -30.72),
    ])).toThrow('Invalid track coordinate')
  })

  it('combines the bounds of two visible track geometries', () => {
    expect(combineTrackBounds([
      [[-30.73, 0.25], [-30.71, 0.27]],
      [[-30.74, 0.26], [-30.70, 0.28]],
    ])).toEqual([
      [-30.74, 0.25],
      [-30.70, 0.28],
    ])
  })
})
