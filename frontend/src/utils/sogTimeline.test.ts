import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import {
  buildSogTimelinePath,
  prepareSogTimelinePoints,
  reduceSogTimelinePoints,
  type SogTimelinePoint,
} from './sogTimeline'

function sample(seconds: number, sog: number | null): TrackSample {
  return {
    utc: new Date(Date.UTC(2031, 0, 1, 0, 0, seconds)).toISOString(),
    lat: 0,
    lon: 0,
    dist: 0,
    sog,
    cog: null,
    hdg: null,
    heel: null,
    trim: null,
  }
}

describe('SOG Analysis Window timeline', () => {
  const range = {
    start: Date.UTC(2031, 0, 1, 0, 0, 10),
    end: Date.UTC(2031, 0, 1, 0, 0, 30),
  }

  it('prepares one Activity over the complete available range in UTC order', () => {
    const samples = [sample(30, 7), sample(0, 2), sample(20, 5), sample(10, 4)]

    expect(prepareSogTimelinePoints(samples, range)).toEqual([
      { time: range.start, sog: 4 },
      { time: Date.UTC(2031, 0, 1, 0, 0, 20), sog: 5 },
      { time: range.end, sog: 7 },
    ])
    expect(samples.map((item) => item.sog)).toEqual([7, 2, 5, 4])
  })

  it('prepares Primary and Comparison independently on one shared UTC range', () => {
    const primary = prepareSogTimelinePoints([sample(10, 4), sample(20, 5)], range)
    const comparison = prepareSogTimelinePoints([sample(15, 6), sample(25, 7)], range)

    expect(primary.map((point) => point.time)).toEqual([range.start, Date.UTC(2031, 0, 1, 0, 0, 20)])
    expect(comparison.map((point) => point.time)).toEqual([
      Date.UTC(2031, 0, 1, 0, 0, 15),
      Date.UTC(2031, 0, 1, 0, 0, 25),
    ])
  })

  it('keeps missing SOG as a gap without inventing a value', () => {
    const points = prepareSogTimelinePoints([sample(10, 4), sample(20, null), sample(30, 6)], range)

    expect(points[1].sog).toBeNull()
    expect(buildSogTimelinePath(points, range, 6)).toContain(' M')
  })

  it('leaves small inputs intact as a new array', () => {
    const points: SogTimelinePoint[] = [
      { time: 1, sog: 2 },
      { time: 2, sog: null },
      { time: 3, sog: 4 },
    ]
    const reduced = reduceSogTimelinePoints(points, 5)

    expect(reduced).toEqual(points)
    expect(reduced).not.toBe(points)
  })

  it('deterministically bounds output while preserving order, endpoints, extrema and source data', () => {
    const points: SogTimelinePoint[] = [
      { time: 0, sog: 5 },
      { time: 1, sog: 4 },
      { time: 2, sog: 12 },
      { time: 3, sog: 3 },
      { time: 4, sog: 6 },
      { time: 5, sog: 7 },
      { time: 6, sog: 1 },
      { time: 7, sog: 11 },
      { time: 8, sog: 8 },
      { time: 9, sog: 5 },
    ]
    const original = points.map((point) => ({ ...point }))
    const reduced = reduceSogTimelinePoints(points, 8)

    expect(reduced.length).toBeLessThanOrEqual(8)
    expect(reduced[0]).toEqual(points[0])
    expect(reduced[reduced.length - 1]).toEqual(points[points.length - 1])
    expect(reduced.map((point) => point.time)).toEqual(
      [...reduced].sort((first, second) => first.time - second.time).map((point) => point.time),
    )
    expect(reduced.map((point) => point.sog)).toEqual(expect.arrayContaining([12, 1, 11]))
    expect(reduceSogTimelinePoints(points, 8)).toEqual(reduced)
    expect(points).toEqual(original)
  })

  it('preserves a null gap when reducing a bucket that contains missing SOG', () => {
    const points = Array.from({ length: 12 }, (_, index): SogTimelinePoint => ({
      time: index,
      sog: index === 5 ? null : index,
    }))

    expect(reduceSogTimelinePoints(points, 8).some((point) => point.sog === null)).toBe(true)
  })
})
