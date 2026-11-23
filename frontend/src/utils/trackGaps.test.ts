import { describe, expect, it } from 'vitest'
import { TRACK_GAP_CONFIG } from '../config/trackGaps'
import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import {
  gapFixtureTime,
  gapFixtureTrack,
  ONE_GAP_RUNS,
  TWO_GAP_RUNS,
} from './trackGapTestFixtures'
import { findTrackGaps, insertTrackGapBreaks, isTrackGapInterval } from './trackGaps'

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
