import { describe, expect, it } from 'vitest'
import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import { extractManeuverProfile, prepareManeuverSampleIndex } from './maneuverProfiles'

const origin = Date.parse('2026-10-25T12:00:00.000Z')
const utc = (seconds: number) => new Date(origin + seconds * 1_000).toISOString()
const maneuver = { center_time: utc(30) } as Maneuver
const window = { start: origin, end: origin + 60_000 }

function sample(seconds: number, values: Partial<Pick<TrackSample, 'sog' | 'cog' | 'heel'>> = {}): TrackSample {
  return {
    utc: utc(seconds), lat: 0, lon: 0, dist: 0, hdg: null, trim: null,
    sog: 5, cog: 359, heel: -7, ...values,
  }
}

describe('extractManeuverProfile', () => {
  it('matches the full traversal across long irregular tracks, missing signals, gaps and window edges', () => {
    const samples = Array.from({ length: 12_000 }, (_, index) => sample(index + (index % 7) * 0.05, {
      sog: index % 13 === 0 ? null : 3 + index % 5,
      cog: index % 17 === 0 ? null : index % 2 ? 359 : 1,
      heel: index % 19 === 0 ? null : index % 11,
    }))
    const analysisWindow = { start: origin + 2_017_250, end: origin + 9_503_750 }
    const index = prepareManeuverSampleIndex(samples)
    expect(index.ordered).toBe(true)
    for (const second of [2_017.25, 2_018, 2_040, 5_500.5, 9_480, 9_503.75]) {
      const event = { center_time: utc(second) } as Maneuver
      expect(extractManeuverProfile(event, samples, analysisWindow, index))
        .toEqual(extractManeuverProfile(event, samples, analysisWindow))
    }
  })

  it.each(['invalid', 'duplicate', 'nonmonotonic'])('uses full traversal for %s UTC evidence', (kind) => {
    const samples = Array.from({ length: 100 }, (_, index) => sample(index))
    samples[50] = kind === 'invalid' ? { ...samples[50], utc: 'invalid' }
      : kind === 'duplicate' ? sample(49) : sample(48)
    const index = prepareManeuverSampleIndex(samples)
    expect(index.ordered).toBe(false)
    for (const analysisWindow of [window, { start: origin + 30_250, end: origin + 70_750 }]) {
      for (const second of [30, 49, 50, 70]) {
        const event = { center_time: utc(second) } as Maneuver
        expect(extractManeuverProfile(event, samples, analysisWindow, index))
          .toEqual(extractManeuverProfile(event, samples, analysisWindow))
      }
    }
  })

  it('preserves a full 50-second raw profile and original circular COG values', () => {
    const samples = Array.from({ length: 51 }, (_, index) => sample(index + 5, {
      sog: index === 25 ? 2.25 : 5,
      cog: index === 26 ? 1 : 359,
      heel: index === 25 ? 4 : -7,
    }))
    const original = structuredClone(samples)
    const result = extractManeuverProfile(maneuver, samples, window)!

    expect(result.permittedStartSeconds).toBe(-25)
    expect(result.permittedEndSeconds).toBe(25)
    expect(result.permittedDurationSeconds).toBe(50)
    expect(result.sog.points).toHaveLength(51)
    expect(result.sog.points[25]).toMatchObject({ utc: utc(30), relativeTimeSeconds: 0, value: 2.25, connectToPrevious: true })
    expect(result.cog.points.slice(25, 27).map((point) => point.value)).toEqual([359, 1])
    expect(result.heel.points[25].value).toBe(4)
    expect(result.sog).toMatchObject({ representedTimeSeconds: 50, clippedCoverage: 1, nominalCoverage: 1 })
    expect(samples).toEqual(original)
  })

  it.each([
    [{ start: origin + 30_000, end: origin + 60_000 }, 0, 25, 25],
    [{ start: origin, end: origin + 30_000 }, -25, 0, 25],
  ])('clips at either Analysis Window edge without adding endpoints', (analysisWindow, first, last, duration) => {
    const samples = Array.from({ length: 51 }, (_, index) => sample(index + 5))
    const result = extractManeuverProfile(maneuver, samples, analysisWindow)!
    expect(result.permittedStartSeconds).toBe(first)
    expect(result.permittedEndSeconds).toBe(last)
    expect(result.permittedDurationSeconds).toBe(duration)
    expect(result.sog.points[0].relativeTimeSeconds).toBe(first)
    expect(result.sog.points.at(-1)?.relativeTimeSeconds).toBe(last)
    expect(result.sog.points[0].connectToPrevious).toBe(false)
    expect(result.sog).toMatchObject({ representedTimeSeconds: 25, clippedCoverage: 1, nominalCoverage: 0.5 })
  })

  it('retains irregular source cadence and applies the exact 1.5-second continuity boundary', () => {
    const result = extractManeuverProfile(maneuver, [
      sample(29), sample(29.4), sample(30.9), sample(32.401), sample(33),
    ], window)!
    expect(result.sog.points.map((point) => point.relativeTimeSeconds)).toEqual([-1, -0.6, 0.9, 2.401, 3])
    expect(result.sog.points.map((point) => point.connectToPrevious)).toEqual([false, true, true, false, true])
    expect(result.sog.representedTimeSeconds).toBeCloseTo(2.499)
    expect(result.sog.clippedCoverage).toBeCloseTo(2.499 / 50)
  })

  it('keeps independent available portions when signals are missing or non-finite', () => {
    const result = extractManeuverProfile(maneuver, [
      sample(28, { cog: 359, heel: -8 }),
      sample(29, { cog: null, heel: -7 }),
      sample(30, { sog: null, cog: 1, heel: Number.NaN }),
      sample(31, { sog: 3, cog: 2, heel: 5 }),
      sample(32, { sog: 4, cog: 3, heel: 6 }),
    ], window)!
    expect(result.sog.points.map((point) => point.connectToPrevious)).toEqual([false, true, false, true])
    expect(result.cog.points.map((point) => point.value)).toEqual([359, 1, 2, 3])
    expect(result.cog.points.map((point) => point.connectToPrevious)).toEqual([false, false, true, true])
    expect(result.heel.points.map((point) => point.connectToPrevious)).toEqual([false, true, false, true])
    expect(result.sog.representedTimeSeconds).toBe(2)
    expect(result.cog.representedTimeSeconds).toBe(2)
    expect(result.heel.representedTimeSeconds).toBe(2)
  })

  it('breaks at invalid and non-increasing UTC without joining the remaining points', () => {
    const invalid = { ...sample(30), utc: 'invalid' }
    const result = extractManeuverProfile(maneuver, [
      sample(28), invalid, sample(29), sample(29), sample(30),
    ], window)!
    expect(result.sog.points.map((point) => point.connectToPrevious)).toEqual([false, false, false, true])
    expect(result.sog.representedTimeSeconds).toBe(1)
  })

  it('clips represented intervals crossing a boundary without inventing profile points', () => {
    const samples = [sample(29.5), sample(30.5)]
    const analysisWindow = {
      start: origin + 30_000, end: origin + 30_250,
    }
    const result = extractManeuverProfile(maneuver, samples, analysisWindow)!
    expect(result.sog.points).toEqual([])
    expect(result.sog).toMatchObject({ representedTimeSeconds: 0.25, clippedCoverage: 1, nominalCoverage: 0.005 })
    expect(extractManeuverProfile(maneuver, samples, analysisWindow, prepareManeuverSampleIndex(samples)))
      .toEqual(result)
  })

  it('returns zero coverage for unavailable signals and a zero-duration permitted interval', () => {
    const result = extractManeuverProfile(maneuver, [sample(30, { sog: null, cog: Number.POSITIVE_INFINITY, heel: null })], {
      start: origin + 30_000, end: origin + 30_000,
    })!
    expect(result.permittedDurationSeconds).toBe(0)
    for (const signal of [result.sog, result.cog, result.heel]) {
      expect(signal.points).toEqual([])
      expect(signal).toMatchObject({ representedTimeSeconds: 0, clippedCoverage: 0, nominalCoverage: 0 })
    }
  })

  it('requires an inclusive center in the Analysis Window', () => {
    expect(extractManeuverProfile(maneuver, [sample(30)], { start: origin + 30_001, end: origin + 60_000 })).toBeNull()
    expect(extractManeuverProfile(maneuver, [sample(30)], { start: origin, end: origin + 29_999 })).toBeNull()
    expect(extractManeuverProfile(maneuver, [sample(30)], { start: origin + 30_000, end: origin + 60_000 })).not.toBeNull()
  })
})
