import type { TrackSample } from '../types/track'
import { timestampToMilliseconds } from './replay'

export interface AnalysisWindowRange {
  start: number
  end: number
}

export type AnalysisWindowBoundary = 'start' | 'end'

export const ANALYSIS_WINDOW_STEP_MS = 1_000

export function createFullAnalysisWindow(
  activityStart: number,
  activityEnd: number,
): AnalysisWindowRange {
  if (
    !Number.isFinite(activityStart)
    || !Number.isFinite(activityEnd)
    || activityStart >= activityEnd
  ) {
    throw new Error('Analysis Window start must be before end')
  }

  return { start: activityStart, end: activityEnd }
}

export function intersectAnalysisWindowRanges(
  first: AnalysisWindowRange,
  second: AnalysisWindowRange,
): AnalysisWindowRange | null {
  const start = Math.max(first.start, second.start)
  const end = Math.min(first.end, second.end)

  return start < end ? { start, end } : null
}

export function reconcileAnalysisWindow(
  current: AnalysisWindowRange | null,
  available: AnalysisWindowRange,
): AnalysisWindowRange {
  if (
    current !== null
    && current.start >= available.start
    && current.end <= available.end
  ) {
    return current
  }

  if (current !== null) {
    const intersection = intersectAnalysisWindowRanges(current, available)
    if (intersection !== null) return intersection
  }

  return available
}

export function updateAnalysisWindow(
  current: AnalysisWindowRange,
  boundary: AnalysisWindowBoundary,
  requestedTime: number,
  activityStart: number,
  activityEnd: number,
): AnalysisWindowRange {
  const availableDuration = activityEnd - activityStart
  if (availableDuration <= 0) {
    throw new Error('Activity start must be before end')
  }

  const minimumDuration = Math.min(ANALYSIS_WINDOW_STEP_MS, availableDuration)

  if (boundary === 'start') {
    return {
      start: Math.max(
        activityStart,
        Math.min(requestedTime, current.end - minimumDuration),
      ),
      end: current.end,
    }
  }

  return {
    start: current.start,
    end: Math.min(
      activityEnd,
      Math.max(requestedTime, current.start + minimumDuration),
    ),
  }
}

export function filterSamplesByAnalysisWindow(
  samples: TrackSample[],
  windowStart: number,
  windowEnd: number,
) {
  if (windowStart >= windowEnd) {
    throw new Error('Analysis Window start must be before end')
  }

  return samples.filter((sample) => {
    const sampleTime = timestampToMilliseconds(sample.utc)
    return sampleTime >= windowStart && sampleTime <= windowEnd
  })
}
