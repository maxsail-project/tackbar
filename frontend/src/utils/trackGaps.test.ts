import { describe, expect, it } from 'vitest'
import { TRACK_GAP_CONFIG } from '../config/trackGaps'
import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import {
  gapFixtureTime,
  gapFixtureTrack,
  gapFixtureWindow,
  ONE_GAP_RUNS,
  TWO_GAP_RUNS,
} from './trackGapTestFixtures'
import {
  findTrackGaps,
  formatGapSummaryDuration,
  insertTrackGapBreaks,
  isTrackGapInterval,
  trackGapWindowOverlap,
} from './trackGaps'

describe('shared temporal gap threshold', () => {
  it('uses one 10-second threshold shared with Wind analysis', () => {
    expect(TRACK_GAP_CONFIG.gapThresholdSeconds).toBe(10)
    expect(WIND_CONTEXT_CONFIG.maxGapSeconds).toBe(TRACK_GAP_CONFIG.gapThresholdSeconds)
  })

  it('treats only intervals strictly longer than 10 seconds as gaps', () => {
    expect(isTrackGapInterval(0, 10_000)).toBe(false)
    expect(isTrackGapInterval(0, 10_001)).toBe(true)
    expect(isTrackGapInterval(0, 0)).toBe(false)
    expect(isTrackGapInterval(10_000, 0)).toBe(false)
  })
})

describe('gap identification from samples', () => {
  it('finds no gap in a clean track or at exactly 10 seconds', () => {
    expect(findTrackGaps(gapFixtureTrack([[0, 120]]))).toEqual([])
    expect(findTrackGaps(gapFixtureTrack([[0, 5], [15, 20]]))).toEqual([])
    expect(findTrackGaps([])).toEqual([])
  })

  it('identifies each gap by its recorded endpoint samples and UTC interval', () => {
    expect(findTrackGaps(gapFixtureTrack(ONE_GAP_RUNS))).toEqual([{
      beforeIndex: 60,
      afterIndex: 61,
      startMs: gapFixtureTime(60),
      endMs: gapFixtureTime(124),
    }])
    expect(findTrackGaps(gapFixtureTrack(TWO_GAP_RUNS)).map((gap) => [
      gap.beforeIndex,
      (gap.endMs - gap.startMs) / 1_000,
    ])).toEqual([[60, 64], [121, 30]])
  })
})

describe('presentation path breaks', () => {
  it('inserts one break at the midpoint of each gap and keeps every point', () => {
    const points = [0, 1_000, 31_000, 41_000, 52_000].map((time) => ({ time, value: 1 }))
    const broken = insertTrackGapBreaks(points, (time) => ({ time, value: Number.NaN }))

    expect(broken.map((point) => point.time)).toEqual([0, 1_000, 16_000, 31_000, 41_000, 46_500, 52_000])
    expect(broken.filter((point) => Number.isNaN(point.value))).toHaveLength(2)
  })
})

describe('gap overlap with an Analysis Window (#218 D4)', () => {
  const gaps = findTrackGaps(gapFixtureTrack(TWO_GAP_RUNS))
  const overlap = (startSeconds: number, endSeconds: number) => (
    trackGapWindowOverlap(gaps, gapFixtureWindow(startSeconds, endSeconds))
  )

  it.each([
    ['no overlap', 0, 60, 0, 0],
    ['touching gap endpoints only', 124, 184, 0, 0],
    ['a whole gap', 0, 184, 1, 64],
    ['a boundary inside a gap', 100, 150, 1, 24],
    ['a window entirely inside a gap', 70, 100, 1, 30],
    ['two gaps', 50, 274, 2, 94],
  ])('measures %s', (_case, startSeconds, endSeconds, count, seconds) => {
    expect(overlap(startSeconds, endSeconds)).toEqual({ count, overlapMilliseconds: seconds * 1_000 })
  })

  it('reports nothing without a window or gaps', () => {
    expect(trackGapWindowOverlap(gaps, null)).toEqual({ count: 0, overlapMilliseconds: 0 })
    expect(trackGapWindowOverlap([], gapFixtureWindow(0, 274))).toEqual({ count: 0, overlapMilliseconds: 0 })
  })
})

describe('My Activities gap duration', () => {
  it.each([
    [64, '1 min 4 s'],
    [45, '45 s'],
    [120, '2 min'],
    [3_723, '1 h 2 min 3 s'],
    [12.6, '13 s'],
    [0, '0 s'],
  ])('formats %s seconds as %s', (seconds, text) => {
    expect(formatGapSummaryDuration(seconds)).toBe(text)
  })
})
