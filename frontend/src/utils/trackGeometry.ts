import type { TrackSample } from '../types/track'
import { distanceMeters } from './sessionStartLines'
import { isTrackGapInterval } from './trackGaps'

export type TrackBounds = [[number, number], [number, number]]

export function combineTrackBounds(bounds: TrackBounds[]): TrackBounds {
  if (bounds.length === 0) {
    throw new Error('Cannot combine an empty collection of track bounds')
  }

  return bounds.reduce<TrackBounds>(
    (combined, current) => [
      [
        Math.min(combined[0][0], current[0][0]),
        Math.min(combined[0][1], current[0][1]),
      ],
      [
        Math.max(combined[1][0], current[1][0]),
        Math.max(combined[1][1], current[1][1]),
      ],
    ],
    bounds[0],
  )
}

type LonLat = [number, number]

/**
 * Presentation-only straight connector between the two recorded endpoints of a gap
 * (Issue #218 D3/D4). It is an unknown-path geometric chord, never recorded track or sailed
 * distance.
 */
export interface TrackGapChord {
  /** Stable within one geometry: the UTC time of the last recorded sample before the gap. */
  key: string
  from: LonLat
  to: LonLat
  /** Presentation anchor for the chord's explanation control. */
  midpoint: LonLat
  /** Missing GPS time between the two recorded endpoints. */
  durationMilliseconds: number
  /** Net geometric displacement between the recorded endpoints, in metres. */
  displacementMeters: number
}

/**
 * Recorded track geometry: one LineString run per continuous recorded section, split at every
 * gap between adjacent samples (Issue #218), plus one chord per gap. A run with a single
 * recorded sample has no line. Bounds still cover every sample.
 */
export function buildTrackGeometry(samples: TrackSample[]) {
  if (samples.length === 0) {
    throw new Error('Cannot build track geometry without samples')
  }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  const runs: LonLat[][] = []
  const gapChords: TrackGapChord[] = []
  let run: LonLat[] = []
  let previousTime = Number.NaN

  samples.forEach((sample, index) => {
    if (
      !Number.isFinite(sample.lat)
      || !Number.isFinite(sample.lon)
      || sample.lat < -90
      || sample.lat > 90
      || sample.lon < -180
      || sample.lon > 180
    ) {
      throw new Error(`Invalid track coordinate at sample ${index}`)
    }

    minLat = Math.min(minLat, sample.lat)
    maxLat = Math.max(maxLat, sample.lat)
    minLon = Math.min(minLon, sample.lon)
    maxLon = Math.max(maxLon, sample.lon)
    const coordinate: LonLat = [sample.lon, sample.lat]
    const time = Date.parse(sample.utc)
    if (index > 0 && isTrackGapInterval(previousTime, time)) {
      const from = run[run.length - 1]
      if (run.length >= 2) runs.push(run)
      run = []
      gapChords.push({
        key: samples[index - 1].utc,
        from,
        to: coordinate,
        midpoint: [(from[0] + coordinate[0]) / 2, (from[1] + coordinate[1]) / 2],
        durationMilliseconds: time - previousTime,
        displacementMeters: distanceMeters(
          { latitude: from[1], longitude: from[0] },
          { latitude: coordinate[1], longitude: coordinate[0] },
        ),
      })
    }
    run.push(coordinate)
    previousTime = time
  })
  if (run.length >= 2) runs.push(run)

  return {
    geoJson: {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: runs,
      },
    },
    gapChords,
    bounds: [
      [minLon, minLat],
      [maxLon, maxLat],
    ] as TrackBounds,
  }
}

/** One dashed-connector collection per Activity; each feature joins only two recorded endpoints. */
export function buildGapChordCollection(chords: readonly TrackGapChord[]) {
  return {
    type: 'FeatureCollection' as const,
    features: chords.map((chord) => ({
      type: 'Feature' as const,
      properties: { key: chord.key },
      geometry: { type: 'LineString' as const, coordinates: [chord.from, chord.to] },
    })),
  }
}
