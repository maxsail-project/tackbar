import type { SailingMetric } from '../types/session'
import type { TrackSample } from '../types/track'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import { timestampToMilliseconds } from './replay'
import {
  buildSogTimelinePath,
  reduceSogTimelinePoints,
  type SogTimelinePoint,
} from './sogTimeline'

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

export type SogChartPoint = SogTimelinePoint

export interface SogTrendPoint extends SogChartPoint {
  kind: 'sample' | 'gap'
}

export interface SogSignalRange {
  start: number
  end: number
}

const SOG_TREND_HALF_WINDOW_MILLISECONDS = (
  SOG_SIGNAL_TUNING.smoothingWindowSeconds * 1_000 / 2
)
const SOG_TREND_MAX_GAP_MILLISECONDS = 1_500
const SOG_SIGNAL_PLOT_BAND = { top: 8, bottom: 192 }
export const SOG_SIGNAL_VIEWBOX_WIDTH = 1_000
export const SOG_SIGNAL_VIEWBOX_HEIGHT = 200

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

export function buildSogChartPoints(samples: TrackSample[]): SogChartPoint[] {
  return samples
    .map((sample) => ({
      time: timestampToMilliseconds(sample.utc),
      sog: sample.sog !== null && Number.isFinite(sample.sog)
        ? sample.sog
        : null,
    }))
    .sort((first, second) => first.time - second.time)
}

export function reduceRawSogChartPoints(
  points: SogChartPoint[],
  maximumPoints: number,
): SogChartPoint[] {
  return reduceSogTimelinePoints(points, maximumPoints)
}

function integratedSogAt(
  points: Array<SogChartPoint & { sog: number }>,
  cumulativeAreas: number[],
  time: number,
) {
  if (time <= points[0].time) return 0
  if (time >= points[points.length - 1].time) {
    return cumulativeAreas[cumulativeAreas.length - 1]
  }

  let low = 0
  let high = points.length - 2
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (points[middle + 1].time <= time) low = middle + 1
    else if (points[middle].time > time) high = middle - 1
    else {
      const first = points[middle]
      const second = points[middle + 1]
      const elapsed = time - first.time
      const interval = second.time - first.time
      const interpolatedSog = first.sog
        + (second.sog - first.sog) * elapsed / interval
      return cumulativeAreas[middle]
        + (first.sog + interpolatedSog) * elapsed / 2
    }
  }

  return 0
}

function smoothSogSegment(
  points: Array<SogChartPoint & { sog: number }>,
): SogTrendPoint[] {
  if (points.length === 1) {
    return [{ ...points[0], kind: 'sample' }]
  }

  const cumulativeAreas = [0]
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1]
    const second = points[index]
    cumulativeAreas.push(
      cumulativeAreas[index - 1]
      + (first.sog + second.sog) * (second.time - first.time) / 2,
    )
  }

  const segmentStart = points[0].time
  const segmentEnd = points[points.length - 1].time
  return points.map((point) => {
    const windowStart = Math.max(
      segmentStart,
      point.time - SOG_TREND_HALF_WINDOW_MILLISECONDS,
    )
    const windowEnd = Math.min(
      segmentEnd,
      point.time + SOG_TREND_HALF_WINDOW_MILLISECONDS,
    )
    const representedDuration = windowEnd - windowStart
    const representedArea = integratedSogAt(points, cumulativeAreas, windowEnd)
      - integratedSogAt(points, cumulativeAreas, windowStart)

    return {
      time: point.time,
      sog: representedDuration > 0
        ? representedArea / representedDuration
        : point.sog,
      kind: 'sample',
    }
  })
}

export function buildSogTrendPoints(points: SogChartPoint[]): SogTrendPoint[] {
  const trendPoints: SogTrendPoint[] = []
  let segment: Array<SogChartPoint & { sog: number }> = []

  function finishSegment() {
    if (segment.length === 0) return
    trendPoints.push(...smoothSogSegment(segment))
    segment = []
  }

  points.forEach((point) => {
    if (point.sog === null || !Number.isFinite(point.sog)) {
      finishSegment()
      trendPoints.push({ ...point, sog: null, kind: 'sample' })
      return
    }

    const previousPoint = segment[segment.length - 1]
    if (previousPoint !== undefined) {
      const gap = point.time - previousPoint.time
      if (gap <= 0 || gap > SOG_TREND_MAX_GAP_MILLISECONDS) {
        finishSegment()
        trendPoints.push({
          time: previousPoint.time + gap / 2,
          sog: null,
          kind: 'gap',
        })
      }
    }

    segment.push({ ...point, sog: point.sog })
  })

  finishSegment()
  return trendPoints
}

export function buildSogSignalPath(
  points: SogChartPoint[],
  range: SogSignalRange,
  maximumSog: number,
) {
  return buildSogTimelinePath(
    points,
    range,
    maximumSog,
    SOG_SIGNAL_PLOT_BAND,
  )
}

export function sogSignalXPosition(
  timestamp: number,
  range: SogSignalRange,
) {
  const duration = range.end - range.start
  if (duration <= 0) return 0
  const ratio = (timestamp - range.start) / duration
  return Math.min(1, Math.max(0, ratio)) * SOG_SIGNAL_VIEWBOX_WIDTH
}
