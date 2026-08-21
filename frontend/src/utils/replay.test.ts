import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import {
  advancePlaybackTime,
  clampPlaybackTime,
  findSurroundingSamples,
  formatGpsTime,
  interpolatePosition,
  nearestSample,
  PLAYBACK_SPEEDS,
  timestampToMilliseconds,
} from './replay'

const start = timestampToMilliseconds('2031-06-15T13:03:00Z')
const samples: TrackSample[] = [
  { utc: '2031-06-15T13:03:00Z', lat: 10, lon: 20, dist: 0, sog: 4, cog: null, hdg: null, heel: null, trim: null },
  { utc: '2031-06-15T13:03:10Z', lat: 12, lon: 24, dist: 1, sog: 8, cog: null, hdg: null, heel: null, trim: null },
  { utc: '2031-06-15T13:03:30Z', lat: 15, lon: 30, dist: 1, sog: 6, cog: null, hdg: null, heel: null, trim: null },
]
const end = timestampToMilliseconds(samples[2].utc)

describe('playback clock', () => {
  it('keeps the four supported playback speeds', () => {
    expect(PLAYBACK_SPEEDS).toEqual([1, 2, 5, 10])
  })

  it.each([
    [1, 1_000],
    [2, 2_000],
    [5, 5_000],
    [10, 10_000],
  ] as const)('advances elapsed time at x%s', (speed, expectedAdvance) => {
    expect(advancePlaybackTime(start, 1_000, speed, start, end))
      .toBe(start + expectedAdvance)
  })

  it('clamps before the Activity start', () => {
    expect(clampPlaybackTime(start - 5_000, start, end)).toBe(start)
  })

  it('clamps advancement at the Activity end', () => {
    expect(advancePlaybackTime(end - 500, 1_000, 1, start, end)).toBe(end)
  })

  it('formats playbackTime as GPS HH:MM:SS', () => {
    expect(formatGpsTime(start)).toBe('13:03:00')
  })
})

describe('sample lookup and presentation', () => {
  it('returns one exact sample for an exact playback time', () => {
    const exactTime = timestampToMilliseconds(samples[1].utc)
    const surrounding = findSurroundingSamples(samples, exactTime)

    expect(surrounding.before).toBe(samples[1])
    expect(surrounding.after).toBe(samples[1])
  })

  it('finds the samples around a playback time', () => {
    const surrounding = findSurroundingSamples(samples, start + 5_000)

    expect(surrounding.before).toBe(samples[0])
    expect(surrounding.after).toBe(samples[1])
  })

  it('interpolates latitude and longitude between samples', () => {
    expect(interpolatePosition(samples, start + 5_000)).toEqual({ lat: 11, lon: 22 })
  })

  it('selects the nearest sample for SOG', () => {
    expect(nearestSample(samples, start + 7_000).sog).toBe(8)
  })

  it('clamps lookup and position to the first sample', () => {
    expect(findSurroundingSamples(samples, start - 1_000)).toEqual({
      before: samples[0],
      after: samples[0],
    })
    expect(interpolatePosition(samples, start - 1_000)).toEqual({ lat: 10, lon: 20 })
  })

  it('clamps lookup and position to the last sample', () => {
    expect(findSurroundingSamples(samples, end + 1_000)).toEqual({
      before: samples[2],
      after: samples[2],
    })
    expect(interpolatePosition(samples, end + 1_000)).toEqual({ lat: 15, lon: 30 })
  })

  it('resolves two differently spaced tracks at the same playbackTime', () => {
    const secondTrack: TrackSample[] = [
      { utc: '2031-06-15T13:03:00Z', lat: 20, lon: 40, dist: 0, sog: 4, cog: null, hdg: null, heel: null, trim: null },
      { utc: '2031-06-15T13:03:20Z', lat: 24, lon: 48, dist: 1, sog: 8, cog: null, hdg: null, heel: null, trim: null },
    ]
    const sharedPlaybackTime = start + 10_000

    expect(interpolatePosition(samples, sharedPlaybackTime)).toEqual({ lat: 12, lon: 24 })
    expect(interpolatePosition(secondTrack, sharedPlaybackTime)).toEqual({ lat: 22, lon: 44 })
  })
})
