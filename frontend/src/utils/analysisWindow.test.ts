import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import { clampPlaybackTime, timestampToMilliseconds } from './replay'
import {
  createFullAnalysisWindow,
  filterSamplesByAnalysisWindow,
  intersectAnalysisWindowRanges,
  reconcileAnalysisWindow,
  updateAnalysisWindow,
} from './analysisWindow'

const samples: TrackSample[] = [
  { utc: '2031-06-15T13:03:00Z', lat: 10, lon: 20, dist: 0, sog: 4, cog: null, heel: null, trim: null },
  { utc: '2031-06-15T13:03:10Z', lat: 11, lon: 21, dist: 1, sog: 5, cog: null, heel: null, trim: null },
  { utc: '2031-06-15T13:03:20Z', lat: 12, lon: 22, dist: 1, sog: 6, cog: null, heel: null, trim: null },
  { utc: '2031-06-15T13:03:30Z', lat: 13, lon: 23, dist: 1, sog: 7, cog: null, heel: null, trim: null },
]

const activityStart = timestampToMilliseconds(samples[0].utc)
const activityEnd = timestampToMilliseconds(samples[samples.length - 1].utc)

describe('Analysis Window', () => {
  it('defaults to the complete Activity range', () => {
    expect(createFullAnalysisWindow(activityStart, activityEnd)).toEqual({
      start: activityStart,
      end: activityEnd,
    })
  })

  it('filters samples inclusively by absolute UTC boundaries', () => {
    const selected = filterSamplesByAnalysisWindow(
      samples,
      timestampToMilliseconds(samples[1].utc),
      timestampToMilliseconds(samples[2].utc),
    )

    expect(selected).toEqual([samples[1], samples[2]])
  })

  it('preserves chronological sample order', () => {
    const selected = filterSamplesByAnalysisWindow(
      samples,
      activityStart,
      activityEnd,
    )

    expect(selected.map((sample) => sample.utc)).toEqual(
      samples.map((sample) => sample.utc),
    )
  })

  it('clamps playbackTime before, after, and inside the selected window', () => {
    const windowStart = activityStart + 10_000
    const windowEnd = activityEnd - 10_000

    expect(clampPlaybackTime(activityStart, windowStart, windowEnd)).toBe(windowStart)
    expect(clampPlaybackTime(activityEnd, windowStart, windowEnd)).toBe(windowEnd)
    expect(clampPlaybackTime(windowStart + 5_000, windowStart, windowEnd))
      .toBe(windowStart + 5_000)
  })

  it('prevents start and end controls from creating an invalid range', () => {
    const current = createFullAnalysisWindow(activityStart, activityEnd)
    const changedStart = updateAnalysisWindow(
      current,
      'start',
      activityEnd,
      activityStart,
      activityEnd,
    )
    const changedEnd = updateAnalysisWindow(
      current,
      'end',
      activityStart,
      activityStart,
      activityEnd,
    )

    expect(changedStart.start).toBeLessThan(changedStart.end)
    expect(changedEnd.start).toBeLessThan(changedEnd.end)
    expect(() => createFullAnalysisWindow(activityStart, activityStart))
      .toThrow('start must be before end')
  })

  it.each([
    [
      { start: 10, end: 12 },
      { start: 11, end: 13 },
      { start: 11, end: 12 },
    ],
    [
      { start: 10, end: 14 },
      { start: 11, end: 13 },
      { start: 11, end: 13 },
    ],
    [
      { start: 11, end: 13 },
      { start: 10, end: 14 },
      { start: 11, end: 13 },
    ],
  ])('derives the shared temporal intersection', (primary, comparison, expected) => {
    expect(intersectAnalysisWindowRanges(primary, comparison)).toEqual(expected)
  })

  it.each([
    [{ start: 10, end: 11 }, { start: 12, end: 13 }],
    [{ start: 10, end: 11 }, { start: 11, end: 13 }],
  ])('rejects missing or zero-duration temporal overlap', (primary, comparison) => {
    expect(intersectAnalysisWindowRanges(primary, comparison)).toBeNull()
  })

  it('preserves or clamps the current window to the available intersection', () => {
    const available = { start: 11, end: 13 }

    expect(reconcileAnalysisWindow({ start: 11.5, end: 12.5 }, available))
      .toEqual({ start: 11.5, end: 12.5 })
    expect(reconcileAnalysisWindow({ start: 10, end: 12 }, available))
      .toEqual({ start: 11, end: 12 })
    expect(reconcileAnalysisWindow({ start: 20, end: 21 }, available))
      .toEqual(available)
  })
})
