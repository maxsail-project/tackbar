import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { timestampToMilliseconds } from './replay'

export interface SogTimelinePoint {
  time: number
  sog: number | null
}

export function prepareSogTimelinePoints(
  samples: TrackSample[],
  availableRange: AnalysisWindowRange,
): SogTimelinePoint[] {
  return samples
    .map((sample) => ({
      time: timestampToMilliseconds(sample.utc),
      sog: sample.sog !== null && Number.isFinite(sample.sog) ? sample.sog : null,
    }))
    .filter((point) => (
      Number.isFinite(point.time)
      && point.time >= availableRange.start
      && point.time <= availableRange.end
    ))
    .sort((first, second) => first.time - second.time)
}

function bucketRepresentative(points: SogTimelinePoint[]) {
  const nullPoint = points.find((point) => point.sog === null)
  if (nullPoint !== undefined) return { ...nullPoint }

  const finitePoints = points.filter(
    (point): point is SogTimelinePoint & { sog: number } => point.sog !== null,
  )
  if (finitePoints.length === 0) return null

  return {
    time: finitePoints[Math.floor(finitePoints.length / 2)].time,
    sog: finitePoints.reduce((total, point) => total + point.sog, 0)
      / finitePoints.length,
  }
}

export function reduceSogTimelinePoints(
  points: SogTimelinePoint[],
  maximumPoints: number,
): SogTimelinePoint[] {
  if (maximumPoints < 2) throw new Error('Timeline point budget must be at least 2')
  if (points.length <= maximumPoints) return [...points]

  const first = points[0]
  const last = points[points.length - 1]
  if (maximumPoints === 2) return [first, last]

  const interior = points.slice(1, -1)
  const representativeBudget = maximumPoints - 2
  const bucketCount = Math.max(1, representativeBudget)
  const reduced = [first]

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = Math.floor((bucketIndex * interior.length) / bucketCount)
    const end = Math.floor(((bucketIndex + 1) * interior.length) / bucketCount)
    const representative = bucketRepresentative(interior.slice(start, end))
    if (representative !== null) reduced.push(representative)
  }

  return reduced.concat(last)
}

export function buildSogTimelinePath(
  points: SogTimelinePoint[],
  availableRange: AnalysisWindowRange,
  maximumSog: number,
) {
  const duration = availableRange.end - availableRange.start
  if (duration <= 0) return ''

  let path = ''
  let beginsSegment = true
  points.forEach((point) => {
    if (point.sog === null) {
      beginsSegment = true
      return
    }

    const x = ((point.time - availableRange.start) / duration) * 1000
    const y = 76 - ((Math.max(0, point.sog) / maximumSog) * 68)
    path += `${beginsSegment ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `
    beginsSegment = false
  })

  return path.trim()
}
