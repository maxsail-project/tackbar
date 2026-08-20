import type { TrackSample } from '../types/track'
import { timestampToMilliseconds } from './replay'

export interface CogChartPoint {
  time: number
  cog: number | null
  kind: 'sample' | 'wrap-gap'
}

export function buildCogChartPoints(samples: TrackSample[]): CogChartPoint[] {
  const points: CogChartPoint[] = []
  let previousValidPoint: { time: number; cog: number } | null = null

  samples.forEach((sample) => {
    const time = timestampToMilliseconds(sample.utc)
    const cog = sample.cog !== null && Number.isFinite(sample.cog)
      ? sample.cog
      : null

    if (
      cog !== null
      && previousValidPoint !== null
      && Math.abs(previousValidPoint.cog - cog) > 180
    ) {
      points.push({
        time: previousValidPoint.time + (time - previousValidPoint.time) / 2,
        cog: null,
        kind: 'wrap-gap',
      })
    }

    points.push({ time, cog, kind: 'sample' })
    previousValidPoint = cog === null ? null : { time, cog }
  })

  return points
}
