import { TRACK_GAP_CONFIG } from '../config/trackGaps'
import type { TrackSample } from '../types/track'

const GAP_THRESHOLD_MILLISECONDS = TRACK_GAP_CONFIG.gapThresholdSeconds * 1_000

/** One gap between two adjacent canonical samples (Issue #218 D5). */
export interface TrackGap {
  /** Index of the last recorded sample before the gap. */
  beforeIndex: number
  /** Index of the first recorded sample after the gap. */
  afterIndex: number
  startMs: number
  endMs: number
}

/** True when an adjacent sample interval is strictly longer than the shared gap threshold. */
export function isTrackGapInterval(startMs: number, endMs: number) {
  return endMs - startMs > GAP_THRESHOLD_MILLISECONDS
}

/** Gaps between adjacent samples, in sample order; derived only from their UTC times. */
export function findTrackGaps(samples: readonly TrackSample[]): TrackGap[] {
  const gaps: TrackGap[] = []
  for (let index = 1; index < samples.length; index += 1) {
    const startMs = Date.parse(samples[index - 1].utc)
    const endMs = Date.parse(samples[index].utc)
    if (isTrackGapInterval(startMs, endMs)) {
      gaps.push({ beforeIndex: index - 1, afterIndex: index, startMs, endMs })
    }
  }
  return gaps
}

/**
 * Presentation-only path breaks: inserts one `createBreak(midpoint)` point between adjacent
 * time-ordered points separated by a gap, so a chart path never joins them.
 */
export function insertTrackGapBreaks<T extends { time: number }>(
  points: readonly T[],
  createBreak: (time: number) => T,
): T[] {
  const result: T[] = []
  points.forEach((point, index) => {
    const previous = points[index - 1]
    if (previous !== undefined && isTrackGapInterval(previous.time, point.time)) {
      result.push(createBreak(previous.time + (point.time - previous.time) / 2))
    }
    result.push(point)
  })
  return result
}
