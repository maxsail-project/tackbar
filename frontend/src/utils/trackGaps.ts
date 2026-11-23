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

/** Gap time of one Activity overlapping an Analysis Window (Issue #218 D4). */
export interface TrackGapWindowOverlap {
  /** Gaps with a positive-duration overlap with the window. */
  count: number
  /** Summed missing GPS time inside the window, in milliseconds. */
  overlapMilliseconds: number
}

/** Positive-duration overlap of one gap with a window, in milliseconds (0 when none). */
export function trackGapOverlapMilliseconds(
  gap: Pick<TrackGap, 'startMs' | 'endMs'>,
  window: { start: number, end: number },
) {
  return Math.max(0, Math.min(gap.endMs, window.end) - Math.max(gap.startMs, window.start))
}

/**
 * Count and summed duration of the gaps overlapping a window by a positive duration, including
 * a window boundary inside a gap and a window entirely inside one. Touching endpoints do not count.
 */
export function trackGapWindowOverlap(
  gaps: readonly TrackGap[],
  window: { start: number, end: number } | null,
): TrackGapWindowOverlap {
  let count = 0
  let overlapMilliseconds = 0
  if (window === null) return { count, overlapMilliseconds }
  for (const gap of gaps) {
    const overlap = trackGapOverlapMilliseconds(gap, window)
    if (overlap > 0) {
      count += 1
      overlapMilliseconds += overlap
    }
  }
  return { count, overlapMilliseconds }
}

/**
 * My Activities gap duration (#218 D4): whole seconds as `1 h 2 min 3 s`, omitting zero
 * parts, `0 s` for none.
 */
export function formatGapSummaryDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const parts = [
    [Math.floor(seconds / 3_600), 'h'],
    [Math.floor((seconds % 3_600) / 60), 'min'],
    [seconds % 60, 's'],
  ] as const
  const text = parts.filter(([value]) => value > 0).map(([value, unit]) => `${value} ${unit}`)
  return text.length === 0 ? '0 s' : text.join(' ')
}
