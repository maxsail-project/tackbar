import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import {
  GAP_FIXTURE_START_MS,
  gapFixtureTrack,
  ONE_GAP_RUNS,
  TWO_GAP_RUNS,
} from './trackGapTestFixtures'
import { buildGapChordCollection, buildTrackGeometry, combineTrackBounds } from './trackGeometry'

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

    expect(geometry.geoJson.geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [[
        [-30.72, 0.27],
        [-30.70, 0.25],
        [-30.74, 0.26],
      ]],
    })
    expect(geometry.gapChords).toEqual([])
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

  it('splits recorded runs at each gap and adds one chord between the recorded endpoints (#218)', () => {
    const samples = gapFixtureTrack(TWO_GAP_RUNS)
    const geometry = buildTrackGeometry(samples)
    const runs = geometry.geoJson.geometry.coordinates
    const at = (index: number) => [samples[index].lon, samples[index].lat]

    expect(runs.map((run) => run.length)).toEqual([61, 61, 61])
    expect([runs[0].at(-1), runs[1][0], runs[1].at(-1), runs[2][0]]).toEqual([at(60), at(61), at(121), at(122)])
    expect(geometry.gapChords.map(({ from, to, durationMilliseconds }) => ({ from, to, durationMilliseconds }))).toEqual([
      { from: at(60), to: at(61), durationMilliseconds: 64_000 },
      { from: at(121), to: at(122), durationMilliseconds: 30_000 },
    ])
    expect(geometry.gapChords[0].key).toBe(new Date(GAP_FIXTURE_START_MS + 60_000).toISOString())
    expect(geometry.gapChords[0].midpoint).toEqual([(at(60)[0] + at(61)[0]) / 2, at(60)[1]])
    // 64 s × 0.000018° of longitude at 0.25° latitude ≈ 128 m of net displacement.
    expect(geometry.gapChords[0].displacementMeters).toBeCloseTo(128.1, 0)
    expect(geometry.bounds).toEqual(buildTrackGeometry([samples[0], samples.at(-1)!]).bounds)
  })

  it('keeps chords out of the recorded geometry and omits a line for a single-sample run', () => {
    const samples = gapFixtureTrack([[0, 10], [30, 30], [50, 60]])
    const geometry = buildTrackGeometry(samples)
    const collection = buildGapChordCollection(geometry.gapChords)

    expect(geometry.geoJson.geometry.coordinates.map((run) => run.length)).toEqual([11, 11])
    expect(geometry.gapChords).toHaveLength(2)
    expect(collection.features.map((feature) => feature.geometry)).toEqual(geometry.gapChords.map((chord) => ({
      type: 'LineString', coordinates: [chord.from, chord.to],
    })))
    expect(collection.features.every((feature) => feature.geometry.coordinates.length === 2)).toBe(true)
  })

  it('draws a clean track as one run without chords', () => {
    const geometry = buildTrackGeometry(gapFixtureTrack([ONE_GAP_RUNS[0]]))
    expect(geometry.geoJson.geometry.coordinates).toHaveLength(1)
    expect(geometry.gapChords).toEqual([])
  })
})
