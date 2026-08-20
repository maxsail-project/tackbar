import type { TrackSample } from '../types/track'

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

export function buildTrackGeometry(samples: TrackSample[]) {
  if (samples.length === 0) {
    throw new Error('Cannot build track geometry without samples')
  }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  const coordinates = samples.map((sample, index) => {
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
    return [sample.lon, sample.lat] as [number, number]
  })

  return {
    geoJson: {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates,
      },
    },
    bounds: [
      [minLon, minLat],
      [maxLon, maxLat],
    ] as TrackBounds,
  }
}
