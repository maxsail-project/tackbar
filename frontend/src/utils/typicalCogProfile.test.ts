import { describe, expect, it, vi } from 'vitest'
import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import type { ManeuverProfilePoint } from './maneuverProfiles'
import { supportedCogPoints } from '../components/ManeuverSogComparison'
import { aggregatePreparedCogPopulation, aggregatePreparedSogPopulation, prepareSogManeuverPopulation } from './typicalSogProfile'
import { relativeCogProfile } from './typicalCogProfile'
import * as rawProfiles from './maneuverProfiles'

const origin = Date.parse('2026-10-25T12:00:00Z')
const utc = (seconds: number) => new Date(origin + seconds * 1000).toISOString()
const point = (offset: number, value: number, connected = true): ManeuverProfilePoint => ({
  utc: utc(offset + 100), relativeTimeSeconds: offset, value, connectToPrevious: connected,
})

function event(center: number): Maneuver {
  return { start_time: utc(center - 2), center_time: utc(center), end_time: utc(center + 2),
    heading_change_deg: null, course_change_deg: null, peak_turn_rate_deg_s: null,
    peak_turn_rate_time: null, duration_s: 4 }
}

function trace(center: number, entry: number, change: number): TrackSample[] {
  return Array.from({ length: 51 }, (_, index) => {
    const offset = index - 25
    const fraction = offset <= -2 ? 0 : offset >= 2 ? 1 : (offset + 2) / 4
    return { utc: utc(center + offset), lat: 0, lon: 0, dist: 0,
      sog: 5, cog: (entry + change * fraction + 360) % 360, hdg: null, heel: null, trim: null }
  })
}

describe('relative COG maneuver profile', () => {
  it('unwraps 359/0 and keeps event t=0 away from angular zero when evidence says so', () => {
    const input = [point(-20, 359, false), point(-10, 0), point(0, 20), point(10, 59)]
    const result = relativeCogProfile(input, { entryDeg: 359, exitDeg: 59, signedChangeDeg: 60 })!
    expect(result.map((item) => item.value)).toEqual([-30, -29, -9, 30])
    expect(result[2].relativeTimeSeconds).toBe(0)
    expect(input[1].value).toBe(0)
  })

  it('orients opposite directions alike while preserving unequal turn magnitudes', () => {
    const forward = relativeCogProfile([point(-20, 10, false), point(20, 50)],
      { entryDeg: 10, exitDeg: 50, signedChangeDeg: 40 })!
    const reverse = relativeCogProfile([point(-20, 50, false), point(20, 10)],
      { entryDeg: 50, exitDeg: 10, signedChangeDeg: -40 })!
    const large = relativeCogProfile([point(-20, 359, false), point(20, 99)],
      { entryDeg: 359, exitDeg: 99, signedChangeDeg: 100 })!
    expect(forward.map((item) => item.value)).toEqual([-20, 20])
    expect(reverse.map((item) => item.value)).toEqual([-20, 20])
    expect(large.map((item) => item.value)).toEqual([-50, 50])
  })

  it('does not connect a gap or invent a direction without unambiguous context', () => {
    const result = relativeCogProfile([point(-2, 359, false), point(-1, 0), point(2, 40, false)],
      { entryDeg: 359, exitDeg: 59, signedChangeDeg: 60 })!
    expect(result.map((item) => item.connectToPrevious)).toEqual([false, true, false])
    expect(relativeCogProfile([point(0, 20)], null)).toBeNull()
    expect(relativeCogProfile([point(0, 20)], { entryDeg: 0, exitDeg: 180, signedChangeDeg: -180 })).toBeNull()
    expect(relativeCogProfile([point(0, 20)], { entryDeg: 20, exitDeg: 20, signedChangeDeg: 0 })).toBeNull()
  })

  it('uses independent P/C grids, coverage, angular filtering and per-offset support', () => {
    const maneuvers = [event(50), event(150), event(250)]
    const samples = [...trace(50, 359, 60), ...trace(150, 70, -80), ...trace(250, 10, 40)]
    const original = structuredClone(samples)
    const prepared = prepareSogManeuverPopulation(maneuvers, samples, { start: origin, end: origin + 300_000 })
    const cog = aggregatePreparedCogPopulation(prepared, 40, 100)
    expect(cog).toMatchObject({ status: 'ready', windowEligibleCount: 3, coverageEligibleCount: 3 })
    expect(cog.grid[0].medianCogDeg).toBeCloseTo(-30)
    expect(cog.grid[50].medianCogDeg).toBeCloseTo(30)
    expect(cog.grid[25].contributorCount).toBe(3)
    expect(aggregatePreparedCogPopulation(prepared, 61, 100).status).toBe('insufficient_maneuvers')
    expect(aggregatePreparedSogPopulation(prepared, 40, 100).grid[25].medianSogKn).toBe(5)
    expect(samples).toEqual(original)
  })

  it('excludes missing context and weak COG coverage without discarding SOG', () => {
    const maneuvers = [event(50), event(150), event(250)]
    const samples = [...trace(50, 359, 60), ...trace(150, 70, -60), ...trace(250, 10, 60)]
    for (const item of samples) {
      const second = (Date.parse(item.utc) - origin) / 1000
      if ((second >= 125 && second <= 136) || (second >= 164 && second <= 175)) item.cog = null
    }
    const prepared = prepareSogManeuverPopulation(maneuvers, samples, { start: origin + 30_000, end: origin + 270_000 })
    expect(aggregatePreparedCogPopulation(prepared, 40, 100).coverageEligibleCount).toBe(2)
    expect(aggregatePreparedSogPopulation(prepared, 40, 100).coverageEligibleCount).toBe(3)
    const clipped = prepareSogManeuverPopulation(maneuvers, samples, { start: origin + 45_000, end: origin + 270_000 })
    expect(clipped.maneuvers[0].courseChangeDeg).toBeNull()
    expect(clipped.maneuvers[0].cogGrid).toBeNull()
  })

  it('leaves unsupported grid offsets open when one COG trace has a center gap', () => {
    const maneuvers = [event(50), event(150), event(250)]
    const samples = [...trace(50, 359, 60), ...trace(150, 70, -60), ...trace(250, 10, 60)]
    samples.find((item) => item.utc === utc(165))!.cog = null
    const prepared = prepareSogManeuverPopulation(maneuvers, samples, { start: origin, end: origin + 300_000 })
    const cog = aggregatePreparedCogPopulation(prepared, 40, 100)
    expect(cog.coverageEligibleCount).toBe(3)
    expect(cog.grid[40]).toMatchObject({ contributorCount: 2 })
    expect(cog.grid[40].medianCogDeg).not.toBeNull()
    expect(supportedCogPoints(cog)[40].sog).toBeNull()
    expect(cog.grid[25].contributorCount).toBe(3)
  })

  it('reuses one indexed extraction for SOG/COG selection and repeated angular bands', () => {
    const extract = vi.spyOn(rawProfiles, 'extractManeuverProfile')
    try {
      const prepared = prepareSogManeuverPopulation([event(50), event(150), event(250)],
        [...trace(50, 359, 60), ...trace(150, 70, -60), ...trace(250, 10, 60)],
        { start: origin, end: origin + 300_000 })
      const afterPreparation = extract.mock.calls.length
      aggregatePreparedCogPopulation(prepared, 40, 100)
      aggregatePreparedCogPopulation(prepared, 50, 90)
      aggregatePreparedSogPopulation(prepared, 40, 100)
      expect(afterPreparation).toBe(3)
      expect(extract).toHaveBeenCalledTimes(afterPreparation)
    } finally {
      extract.mockRestore()
    }
  })
})
