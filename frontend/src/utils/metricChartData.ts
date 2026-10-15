import type { SailingMetric } from '../types/session'
import type { TrackSample } from '../types/track'
import { COG_SIGNAL_TUNING } from '../config/cogSignal'
import { HEEL_SIGNAL_TUNING } from '../config/heelSignal'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import { TRIM_SIGNAL_TUNING } from '../config/trimSignal'
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

export type HeelChartPoint = ScalarChartPoint

export interface HeelSignalRange {
  start: number
  end: number
}

export interface HeelSignalDomain {
  minimum: number
  maximum: number
}

export type TrimChartPoint = ScalarChartPoint

export interface TrimSignalRange {
  start: number
  end: number
}

export interface TrimSignalDomain {
  minimum: number
  maximum: number
}

export interface CogChartPoint {
  time: number
  cog: number | null
  kind: 'sample' | 'gap' | 'wrap-gap'
}

export interface CogSignalRange {
  start: number
  end: number
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
const COG_SMOOTHING_HALF_WINDOW_MILLISECONDS = (
  COG_SIGNAL_TUNING.smoothingWindowSeconds * 1_000 / 2
)
const COG_SMOOTHING_MAX_GAP_MILLISECONDS = COG_SIGNAL_TUNING.maxGapSeconds * 1_000
const COG_SIGNAL_PLOT_BAND = { top: 8, bottom: 192 }
export const COG_SIGNAL_VIEWBOX_WIDTH = 1_000
export const COG_SIGNAL_VIEWBOX_HEIGHT = 200
const HEEL_SIGNAL_PLOT_BAND = { top: 8, bottom: 192 }
export const HEEL_SIGNAL_VIEWBOX_WIDTH = 1_000
export const HEEL_SIGNAL_VIEWBOX_HEIGHT = 200
const TRIM_SIGNAL_PLOT_BAND = { top: 8, bottom: 192 }
export const TRIM_SIGNAL_VIEWBOX_WIDTH = 1_000
export const TRIM_SIGNAL_VIEWBOX_HEIGHT = 200

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

export function buildHeelChartPoints(samples: TrackSample[]): HeelChartPoint[] {
  return buildScalarChartPoints(samples, 'HEEL')
    .sort((first, second) => first.time - second.time)
}

function heelBucketRepresentative(points: HeelChartPoint[]) {
  const gapPoint = points.find((point) => point.value === null)
  if (gapPoint !== undefined) return { ...gapPoint }
  if (points.length === 0) return null
  return { ...points[Math.floor(points.length / 2)] }
}

export function reduceRawHeelChartPoints(
  points: HeelChartPoint[],
  maximumPoints: number = HEEL_SIGNAL_TUNING.rawPointBudget,
): HeelChartPoint[] {
  if (maximumPoints < 2) throw new Error('HEEL point budget must be at least 2')
  if (points.length <= maximumPoints) return [...points]

  const first = points[0]
  const last = points[points.length - 1]
  if (maximumPoints === 2) return [first, last]

  const interior = points.slice(1, -1)
  const bucketCount = maximumPoints - 2
  const reduced = [first]
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = Math.floor((bucketIndex * interior.length) / bucketCount)
    const end = Math.floor(((bucketIndex + 1) * interior.length) / bucketCount)
    const representative = heelBucketRepresentative(interior.slice(start, end))
    if (representative !== null) reduced.push(representative)
  }

  return reduced.concat(last)
}

export function resolveHeelSignalDomain(
  pointCollections: HeelChartPoint[][],
): HeelSignalDomain | null {
  let minimum = 0
  let maximum = 0
  let hasFiniteValue = false
  pointCollections.forEach((points) => {
    points.forEach((point) => {
      if (point.value === null || !Number.isFinite(point.value)) return
      minimum = Math.min(minimum, point.value)
      maximum = Math.max(maximum, point.value)
      hasFiniteValue = true
    })
  })
  if (!hasFiniteValue) return null

  minimum = Math.floor(minimum)
  maximum = Math.ceil(maximum)
  if (minimum === maximum) return { minimum: -1, maximum: 1 }
  return { minimum, maximum }
}

export function heelSignalYPosition(
  value: number,
  domain: HeelSignalDomain,
) {
  const domainHeight = domain.maximum - domain.minimum
  const plotHeight = HEEL_SIGNAL_PLOT_BAND.bottom - HEEL_SIGNAL_PLOT_BAND.top
  if (domainHeight <= 0) return HEEL_SIGNAL_PLOT_BAND.bottom
  return HEEL_SIGNAL_PLOT_BAND.bottom
    - ((value - domain.minimum) / domainHeight) * plotHeight
}

export function buildHeelSignalPath(
  points: HeelChartPoint[],
  range: HeelSignalRange,
  domain: HeelSignalDomain,
) {
  const duration = range.end - range.start
  if (duration <= 0 || domain.maximum <= domain.minimum) return ''

  let path = ''
  let beginsSegment = true
  points.forEach((point) => {
    if (point.value === null) {
      beginsSegment = true
      return
    }

    const x = ((point.time - range.start) / duration) * HEEL_SIGNAL_VIEWBOX_WIDTH
    const y = heelSignalYPosition(point.value, domain)
    path += `${beginsSegment ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `
    beginsSegment = false
  })

  return path.trim()
}

export function heelSignalXPosition(
  timestamp: number,
  range: HeelSignalRange,
) {
  const duration = range.end - range.start
  if (duration <= 0) return 0
  const ratio = (timestamp - range.start) / duration
  return Math.min(1, Math.max(0, ratio)) * HEEL_SIGNAL_VIEWBOX_WIDTH
}

export function buildTrimChartPoints(samples: TrackSample[]): TrimChartPoint[] {
  return buildScalarChartPoints(samples, 'TRIM')
    .sort((first, second) => first.time - second.time)
}

function trimBucketRepresentative(points: TrimChartPoint[]) {
  const gapPoint = points.find((point) => point.value === null)
  if (gapPoint !== undefined) return { ...gapPoint }
  if (points.length === 0) return null
  return { ...points[Math.floor(points.length / 2)] }
}

export function reduceRawTrimChartPoints(
  points: TrimChartPoint[],
  maximumPoints: number = TRIM_SIGNAL_TUNING.rawPointBudget,
): TrimChartPoint[] {
  if (maximumPoints < 2) throw new Error('TRIM point budget must be at least 2')
  if (points.length <= maximumPoints) return [...points]

  const first = points[0]
  const last = points[points.length - 1]
  if (maximumPoints === 2) return [first, last]

  const interior = points.slice(1, -1)
  const bucketCount = maximumPoints - 2
  const reduced = [first]
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = Math.floor((bucketIndex * interior.length) / bucketCount)
    const end = Math.floor(((bucketIndex + 1) * interior.length) / bucketCount)
    const representative = trimBucketRepresentative(interior.slice(start, end))
    if (representative !== null) reduced.push(representative)
  }

  return reduced.concat(last)
}

export function resolveTrimSignalDomain(
  pointCollections: TrimChartPoint[][],
): TrimSignalDomain | null {
  let minimum = 0
  let maximum = 0
  let hasFiniteValue = false
  pointCollections.forEach((points) => {
    points.forEach((point) => {
      if (point.value === null || !Number.isFinite(point.value)) return
      minimum = Math.min(minimum, point.value)
      maximum = Math.max(maximum, point.value)
      hasFiniteValue = true
    })
  })
  if (!hasFiniteValue) return null

  minimum = Math.floor(minimum)
  maximum = Math.ceil(maximum)
  if (minimum === maximum) return { minimum: -1, maximum: 1 }
  return { minimum, maximum }
}

export function trimSignalYPosition(
  value: number,
  domain: TrimSignalDomain,
) {
  const domainHeight = domain.maximum - domain.minimum
  const plotHeight = TRIM_SIGNAL_PLOT_BAND.bottom - TRIM_SIGNAL_PLOT_BAND.top
  if (domainHeight <= 0) return TRIM_SIGNAL_PLOT_BAND.bottom
  return TRIM_SIGNAL_PLOT_BAND.bottom
    - ((value - domain.minimum) / domainHeight) * plotHeight
}

export function buildTrimSignalPath(
  points: TrimChartPoint[],
  range: TrimSignalRange,
  domain: TrimSignalDomain,
) {
  const duration = range.end - range.start
  if (duration <= 0 || domain.maximum <= domain.minimum) return ''

  let path = ''
  let beginsSegment = true
  points.forEach((point) => {
    if (point.value === null) {
      beginsSegment = true
      return
    }

    const x = ((point.time - range.start) / duration) * TRIM_SIGNAL_VIEWBOX_WIDTH
    const y = trimSignalYPosition(point.value, domain)
    path += `${beginsSegment ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `
    beginsSegment = false
  })

  return path.trim()
}

export function trimSignalXPosition(
  timestamp: number,
  range: TrimSignalRange,
) {
  const duration = range.end - range.start
  if (duration <= 0) return 0
  const ratio = (timestamp - range.start) / duration
  return Math.min(1, Math.max(0, ratio)) * TRIM_SIGNAL_VIEWBOX_WIDTH
}

export function normalizeCogDegrees(value: number) {
  if (value >= 0 && value < 360) return value
  const normalized = ((value % 360) + 360) % 360
  return normalized >= 360 - 1e-12 ? 0 : normalized
}

export function buildCanonicalCogChartPoints(samples: TrackSample[]): CogChartPoint[] {
  return samples
    .map((sample): CogChartPoint => ({
      time: timestampToMilliseconds(sample.utc),
      cog: sample.cog !== null && Number.isFinite(sample.cog)
        ? normalizeCogDegrees(sample.cog)
        : null,
      kind: 'sample',
    }))
    .sort((first, second) => first.time - second.time)
}

export function insertCogWrapBreaks(points: CogChartPoint[]): CogChartPoint[] {
  const wrappedPoints: CogChartPoint[] = []
  let previousValidPoint: { time: number; cog: number } | null = null

  points.forEach((point) => {
    if (
      point.cog !== null
      && previousValidPoint !== null
      && Math.abs(previousValidPoint.cog - point.cog) > 180
    ) {
      wrappedPoints.push({
        time: previousValidPoint.time + (point.time - previousValidPoint.time) / 2,
        cog: null,
        kind: 'wrap-gap',
      })
    }

    wrappedPoints.push(point)
    previousValidPoint = point.cog === null
      ? null
      : { time: point.time, cog: point.cog }
  })

  return wrappedPoints
}

export function buildCogChartPoints(samples: TrackSample[]): CogChartPoint[] {
  return insertCogWrapBreaks(buildCanonicalCogChartPoints(samples))
}

interface CogVectorPoint extends CogChartPoint {
  cog: number
  x: number
  y: number
}

function integratedCogVectorAt(
  points: CogVectorPoint[],
  cumulativeX: number[],
  cumulativeY: number[],
  time: number,
) {
  if (time <= points[0].time) return { x: 0, y: 0 }
  if (time >= points[points.length - 1].time) {
    return {
      x: cumulativeX[cumulativeX.length - 1],
      y: cumulativeY[cumulativeY.length - 1],
    }
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
      const ratio = elapsed / interval
      const interpolatedX = first.x + (second.x - first.x) * ratio
      const interpolatedY = first.y + (second.y - first.y) * ratio
      return {
        x: cumulativeX[middle] + (first.x + interpolatedX) * elapsed / 2,
        y: cumulativeY[middle] + (first.y + interpolatedY) * elapsed / 2,
      }
    }
  }

  return { x: 0, y: 0 }
}

function smoothCogSegment(
  points: Array<CogChartPoint & { cog: number }>,
): CogChartPoint[] {
  if (points.length === 1) return [{ ...points[0], kind: 'sample' }]

  const vectorPoints: CogVectorPoint[] = points.map((point) => {
    const radians = point.cog * Math.PI / 180
    return {
      ...point,
      x: Math.cos(radians),
      y: Math.sin(radians),
    }
  })
  const cumulativeX = [0]
  const cumulativeY = [0]
  for (let index = 1; index < vectorPoints.length; index += 1) {
    const first = vectorPoints[index - 1]
    const second = vectorPoints[index]
    const duration = second.time - first.time
    cumulativeX.push(
      cumulativeX[index - 1] + (first.x + second.x) * duration / 2,
    )
    cumulativeY.push(
      cumulativeY[index - 1] + (first.y + second.y) * duration / 2,
    )
  }

  const segmentStart = vectorPoints[0].time
  const segmentEnd = vectorPoints[vectorPoints.length - 1].time
  return vectorPoints.map((point) => {
    const windowStart = Math.max(
      segmentStart,
      point.time - COG_SMOOTHING_HALF_WINDOW_MILLISECONDS,
    )
    const windowEnd = Math.min(
      segmentEnd,
      point.time + COG_SMOOTHING_HALF_WINDOW_MILLISECONDS,
    )
    const representedDuration = windowEnd - windowStart
    if (representedDuration <= 0) return { ...point, kind: 'sample' }

    const startVector = integratedCogVectorAt(
      vectorPoints,
      cumulativeX,
      cumulativeY,
      windowStart,
    )
    const endVector = integratedCogVectorAt(
      vectorPoints,
      cumulativeX,
      cumulativeY,
      windowEnd,
    )
    const meanX = (endVector.x - startVector.x) / representedDuration
    const meanY = (endVector.y - startVector.y) / representedDuration
    const magnitude = Math.hypot(meanX, meanY)
    const cog = magnitude <= COG_SIGNAL_TUNING.circularMeanTolerance
      ? null
      : normalizeCogDegrees(Math.atan2(meanY, meanX) * 180 / Math.PI)

    return { time: point.time, cog, kind: 'sample' }
  })
}

export function buildSmoothedCogChartPoints(
  points: CogChartPoint[],
): CogChartPoint[] {
  const smoothedPoints: CogChartPoint[] = []
  let segment: Array<CogChartPoint & { cog: number }> = []

  function finishSegment() {
    if (segment.length === 0) return
    smoothedPoints.push(...smoothCogSegment(segment))
    segment = []
  }

  points.forEach((point) => {
    if (point.cog === null || !Number.isFinite(point.cog)) {
      finishSegment()
      smoothedPoints.push({ ...point, cog: null, kind: 'sample' })
      return
    }

    const previousPoint = segment[segment.length - 1]
    if (previousPoint !== undefined) {
      const gap = point.time - previousPoint.time
      if (gap <= 0 || gap > COG_SMOOTHING_MAX_GAP_MILLISECONDS) {
        finishSegment()
        smoothedPoints.push({
          time: previousPoint.time + gap / 2,
          cog: null,
          kind: 'gap',
        })
      }
    }

    segment.push({ ...point, cog: normalizeCogDegrees(point.cog), kind: 'sample' })
  })

  finishSegment()
  return insertCogWrapBreaks(smoothedPoints)
}

function cogBucketRepresentative(points: CogChartPoint[]) {
  const breakPoint = points.find((point) => point.cog === null)
  if (breakPoint !== undefined) return { ...breakPoint }
  if (points.length === 0) return null
  return { ...points[Math.floor(points.length / 2)] }
}

export function reduceRawCogChartPoints(
  points: CogChartPoint[],
  maximumPoints: number,
): CogChartPoint[] {
  if (maximumPoints < 2) throw new Error('COG point budget must be at least 2')
  if (points.length <= maximumPoints) return [...points]

  const first = points[0]
  const last = points[points.length - 1]
  if (maximumPoints === 2) return [first, last]

  const interior = points.slice(1, -1)
  const bucketCount = maximumPoints - 2
  const reduced = [first]
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = Math.floor((bucketIndex * interior.length) / bucketCount)
    const end = Math.floor(((bucketIndex + 1) * interior.length) / bucketCount)
    const representative = cogBucketRepresentative(interior.slice(start, end))
    if (representative !== null) reduced.push(representative)
  }

  return reduced.concat(last)
}

export function buildCogSignalPath(
  points: CogChartPoint[],
  range: CogSignalRange,
) {
  const duration = range.end - range.start
  const plotHeight = COG_SIGNAL_PLOT_BAND.bottom - COG_SIGNAL_PLOT_BAND.top
  if (duration <= 0 || plotHeight <= 0) return ''

  let path = ''
  let beginsSegment = true
  points.forEach((point) => {
    if (point.cog === null) {
      beginsSegment = true
      return
    }

    const x = ((point.time - range.start) / duration) * COG_SIGNAL_VIEWBOX_WIDTH
    const y = COG_SIGNAL_PLOT_BAND.bottom
      - (normalizeCogDegrees(point.cog) / 360) * plotHeight
    path += `${beginsSegment ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `
    beginsSegment = false
  })

  return path.trim()
}

export function cogSignalXPosition(
  timestamp: number,
  range: CogSignalRange,
) {
  const duration = range.end - range.start
  if (duration <= 0) return 0
  const ratio = (timestamp - range.start) / duration
  return Math.min(1, Math.max(0, ratio)) * COG_SIGNAL_VIEWBOX_WIDTH
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
