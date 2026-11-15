import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import type { EffectiveTwd } from './windContext'
import { detectWindSegments, formatWindSegmentKind, windSegmentMatchesWindow, type WindSegment } from './windSegments'

const start = Date.UTC(2025, 5, 21, 11, 30)
const twd = (degrees: number): EffectiveTwd => ({ degrees, source: 'manual' })

interface Leg {
  seconds: number
  cog: number | null
  sog?: number | null
  /** Seconds of uncovered gap before this leg's first sample. */
  gapBefore?: number
}

/** One sample per second per leg, plus a closing sample; returns samples and the covered range. */
function track(legs: Leg[]) {
  const samples: TrackSample[] = []
  let time = start
  for (const leg of legs) {
    if (leg.gapBefore) time += leg.gapBefore * 1_000
    for (let second = 0; second < leg.seconds; second += 1) {
      samples.push({
        utc: new Date(time).toISOString(), lat: 0, lon: 0, dist: 0,
        sog: leg.sog === undefined ? 5 : leg.sog, cog: leg.cog, hdg: null, heel: null, trim: null,
      })
      time += 1_000
    }
  }
  samples.push({ utc: new Date(time).toISOString(), lat: 0, lon: 0, dist: 0, sog: 5, cog: 0, hdg: null, heel: null, trim: null })
  return { samples, range: { start, end: time } }
}

const at = (seconds: number) => start + seconds * 1_000

function summary(segments: WindSegment[]) {
  return segments.map(({ kind, start: from, end }) => [kind, (from - start) / 1_000, (end - start) / 1_000])
}

describe('wind segment partition', () => {
  it('keeps a full beat with several tacks as one Upwind segment', () => {
    const { samples, range } = track([
      { seconds: 120, cog: 315 },
      { seconds: 8, cog: 0, sog: 1 },
      { seconds: 120, cog: 45 },
      { seconds: 8, cog: 0, sog: 1 },
      { seconds: 120, cog: 315 },
      { seconds: 8, cog: 0, sog: 1 },
      { seconds: 120, cog: 45 },
    ])
    expect(summary(detectWindSegments(samples, range, twd(0)))).toEqual([['upwind', 0, 504]])
  })

  it('splits beat + mark rounding + run into Upwind, Unclassified and Downwind', () => {
    const { samples, range } = track([
      { seconds: 200, cog: 315 },
      { seconds: 15, cog: 90 },
      { seconds: 15, cog: 120 },
      { seconds: 10, cog: 140, sog: 1 },
      { seconds: 200, cog: 170 },
    ])
    expect(summary(detectWindSegments(samples, range, twd(0)))).toEqual([
      ['upwind', 0, 200],
      ['unclassified', 200, 240],
      ['downwind', 240, 440],
    ])
  })

  it('labels a long reach Reaching', () => {
    const { samples, range } = track([{ seconds: 100, cog: 90 }])
    const segments = detectWindSegments(samples, range, twd(0))
    expect(summary(segments)).toEqual([['reaching', 0, 100]])
    expect(formatWindSegmentKind(segments[0].kind)).toBe('Reaching')
  })

  it('absorbs interruptions below 60 s and not at 60 s', () => {
    const absorbed = track([{ seconds: 50, cog: 315 }, { seconds: 59, cog: 90 }, { seconds: 50, cog: 45 }])
    expect(summary(detectWindSegments(absorbed.samples, absorbed.range, twd(0)))).toEqual([['upwind', 0, 159]])
    const split = track([{ seconds: 50, cog: 315 }, { seconds: 60, cog: 90 }, { seconds: 50, cog: 45 }])
    expect(summary(detectWindSegments(split.samples, split.range, twd(0)))).toEqual([['unclassified', 0, 160]])
  })

  it('requires 90 s for a classified segment', () => {
    const short = track([{ seconds: 89, cog: 315 }])
    expect(summary(detectWindSegments(short.samples, short.range, twd(0)))).toEqual([['unclassified', 0, 89]])
    const enough = track([{ seconds: 90, cog: 315 }])
    expect(summary(detectWindSegments(enough.samples, enough.range, twd(0)))).toEqual([['upwind', 0, 90]])
  })

  it('lets a later sector claim time a failed earlier candidate started on', () => {
    // Upwind 10+10 s cannot reach 90 s, but the reaching runs merge across the 10 s upwind gap.
    const { samples, range } = track([
      { seconds: 10, cog: 315 },
      { seconds: 50, cog: 90 },
      { seconds: 10, cog: 45 },
      { seconds: 50, cog: 90 },
    ])
    expect(summary(detectWindSegments(samples, range, twd(0)))).toEqual([
      ['unclassified', 0, 10],
      ['reaching', 10, 120],
    ])
  })

  it('merges consecutive Unclassified time into one segment', () => {
    const { samples, range } = track([
      { seconds: 30, cog: 315, sog: 1 },
      { seconds: 30, cog: 90 },
      { seconds: 20, cog: 315 },
      { seconds: 100, cog: 180 },
    ])
    expect(summary(detectWindSegments(samples, range, twd(0)))).toEqual([
      ['unclassified', 0, 80],
      ['downwind', 80, 180],
    ])
  })

  it('splits at data gaps over 10 s without covering them, and keeps a 10 s gap covered', () => {
    const split = track([{ seconds: 100, cog: 315 }, { seconds: 100, cog: 45, gapBefore: 10 }])
    // Last sample of the first leg is followed by an 11 s interval.
    expect(summary(detectWindSegments(split.samples, split.range, twd(0)))).toEqual([
      ['upwind', 0, 99],
      ['upwind', 110, 210],
    ])
    const covered = track([{ seconds: 100, cog: 315 }, { seconds: 100, cog: 45, gapBefore: 9 }])
    expect(summary(detectWindSegments(covered.samples, covered.range, twd(0)))).toEqual([['upwind', 0, 209]])
  })

  it('treats missing or non-finite COG/SOG as non-moving time without reconstructing it', () => {
    const { samples, range } = track([
      { seconds: 100, cog: 315 },
      { seconds: 10, cog: null },
      { seconds: 10, cog: Number.NaN },
      { seconds: 10, cog: 315, sog: null },
      { seconds: 100, cog: 45 },
    ])
    expect(summary(detectWindSegments(samples, range, twd(0)))).toEqual([['upwind', 0, 230]])
  })

  it('handles TWD near 0°/360° circularly', () => {
    const { samples, range } = track([{ seconds: 100, cog: 330 }, { seconds: 100, cog: 20 }])
    expect(summary(detectWindSegments(samples, range, twd(355)))).toEqual([['upwind', 0, 200]])
  })

  it('stays within the available range: earlier samples excluded, last interval clipped', () => {
    const { samples } = track([{ seconds: 300, cog: 315 }])
    expect(summary(detectWindSegments(samples, { start: at(10.5), end: at(150.5) }, twd(0)))).toEqual([['upwind', 11, 150.5]])
  })

  it('recomputes from effective TWD and is empty without it', () => {
    const { samples, range } = track([{ seconds: 200, cog: 0 }])
    expect(summary(detectWindSegments(samples, range, twd(0)))).toEqual([['upwind', 0, 200]])
    expect(summary(detectWindSegments(samples, range, twd(90)))).toEqual([['reaching', 0, 200]])
    expect(detectWindSegments(samples, range, null)).toEqual([])
    expect(detectWindSegments(samples, null, twd(0))).toEqual([])
  })

  it('returns ordered, non-overlapping, contiguous segments except across gaps', () => {
    const { samples, range } = track([
      { seconds: 40, cog: 90, sog: 0.5 },
      { seconds: 150, cog: 315 },
      { seconds: 30, cog: 100 },
      { seconds: 120, cog: 180, gapBefore: 20 },
      { seconds: 70, cog: 90 },
    ])
    const segments = detectWindSegments(samples, range, twd(0), [at(40)])
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index].start).toBeGreaterThanOrEqual(segments[index - 1].end)
      expect(segments[index].end).toBeGreaterThan(segments[index].start)
    }
    expect(summary(segments)).toEqual([
      ['pre-start', 0, 40],
      ['upwind', 40, 190],
      ['unclassified', 190, 219],
      ['downwind', 240, 360],
      ['unclassified', 360, 430],
    ])
  })
})

describe('Session Start boundaries and Pre-start', () => {
  it('labels the Unclassified segment ending at a Start as Pre-start', () => {
    const { samples, range } = track([{ seconds: 300, cog: 90, sog: 0.5 }, { seconds: 200, cog: 315 }])
    expect(summary(detectWindSegments(samples, range, twd(0), [at(300)]))).toEqual([
      ['pre-start', 0, 300],
      ['upwind', 300, 500],
    ])
    expect(summary(detectWindSegments(samples, range, twd(0)))).toEqual([
      ['unclassified', 0, 300],
      ['upwind', 300, 500],
    ])
  })

  it('forces a boundary at a Start inside a classified run', () => {
    const { samples, range } = track([{ seconds: 200, cog: 315 }])
    expect(summary(detectWindSegments(samples, range, twd(0), [at(100)]))).toEqual([
      ['upwind', 0, 100],
      ['upwind', 100, 200],
    ])
    // A side below 90 s is Unclassified; it ends at the Start, so it is Pre-start.
    expect(summary(detectWindSegments(samples, range, twd(0), [at(50)]))).toEqual([
      ['pre-start', 0, 50],
      ['upwind', 50, 200],
    ])
  })

  it('lets each Start close its own Pre-start and ignores Starts outside the range', () => {
    const { samples, range } = track([{ seconds: 300, cog: 90, sog: 0.5 }, { seconds: 100, cog: 315 }])
    expect(summary(detectWindSegments(samples, range, twd(0), [at(100), at(250), at(-30), at(900), at(100)]))).toEqual([
      ['pre-start', 0, 100],
      ['pre-start', 100, 250],
      ['unclassified', 250, 300],
      ['upwind', 300, 400],
    ])
  })

  it('does not label Pre-start when a data gap precedes the Start', () => {
    const { samples, range } = track([{ seconds: 100, cog: 90, sog: 0.5 }, { seconds: 100, cog: 315, gapBefore: 30 }])
    expect(summary(detectWindSegments(samples, range, twd(0), [at(130)]))).toEqual([
      ['unclassified', 0, 99],
      ['upwind', 130, 230],
    ])
  })
})

describe('segment window matching', () => {
  it('matches only identical UTC bounds', () => {
    const segment: WindSegment = { kind: 'upwind', start: at(0), end: at(100) }
    expect(windSegmentMatchesWindow(segment, { start: at(0), end: at(100) })).toBe(true)
    expect(windSegmentMatchesWindow(segment, { start: at(0), end: at(101) })).toBe(false)
    expect(windSegmentMatchesWindow(segment, null)).toBe(false)
  })
})
