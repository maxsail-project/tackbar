import type { SailingMetric } from '../types/session'
import type { TrackSample } from '../types/track'
import { timestampToMilliseconds } from './replay'

export type ScalarChartMetric = Extract<SailingMetric, 'HEEL' | 'TRIM'>

export interface ScalarChartPoint {
  time: number
  value: number | null
}

export interface CogChartPoint {
  time: number
  cog: number | null
  kind: 'sample' | 'wrap-gap'
}

const SCALAR_SAMPLE_FIELDS: Record<
  ScalarChartMetric,
  'heel' | 'trim'
> = {
  HEEL: 'heel',
  TRIM: 'trim',
}

export function buildScalarChartPoints(
  samples: TrackSample[],
  metric: ScalarChartMetric,
): ScalarChartPoint[] {
  const sampleField = SCALAR_SAMPLE_FIELDS[metric]

  return samples.map((sample) => {
    const value = sample[sampleField]
    return {
      time: timestampToMilliseconds(sample.utc),
      value: value !== null && Number.isFinite(value) ? value : null,
    }
  })
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
