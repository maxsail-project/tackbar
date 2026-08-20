import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import { buildTrackGeometry, combineTrackBounds } from './trackGeometry'

function sample(utc: string, lat: number, lon: number): TrackSample {
  return { utc, lat, lon, dist: 0, sog: null, cog: null, heel: null, trim: null }
}

describe('track geometry', () => {
  it('uses longitude-latitude order and derives bounds from every sample', () => {
    const geometry = buildTrackGeometry([
      sample('2026-08-15T10:00:00Z', 39.42, -0.32),
      sample('2026-08-15T10:00:01Z', 39.40, -0.30),
      sample('2026-08-15T10:00:02Z', 39.41, -0.34),
    ])

    expect(geometry.geoJson.geometry.coordinates).toEqual([
      [-0.32, 39.42],
      [-0.30, 39.40],
      [-0.34, 39.41],
    ])
    expect(geometry.bounds).toEqual([
      [-0.34, 39.40],
      [-0.30, 39.42],
    ])
  })

  it('rejects non-finite rendering coordinates', () => {
    expect(() => buildTrackGeometry([
      sample('2026-08-15T10:00:00Z', Number.NaN, -0.32),
    ])).toThrow('Invalid track coordinate')
  })

  it('combines the bounds of two visible track geometries', () => {
    expect(combineTrackBounds([
      [[-0.33, 39.40], [-0.31, 39.42]],
      [[-0.34, 39.41], [-0.30, 39.43]],
    ])).toEqual([
      [-0.34, 39.40],
      [-0.30, 39.43],
    ])
  })
})
