import { describe, expect, it, vi } from 'vitest'
import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import { supportedHeelPoints } from '../components/ManeuverSogComparison'
import { aggregatePreparedHeelPopulation, prepareSogManeuverPopulation } from './typicalSogProfile'
import * as rawProfiles from './maneuverProfiles'

const origin = Date.parse('2026-10-25T12:00:00Z')
const utc = (seconds: number) => new Date(origin + seconds * 1000).toISOString()
const event = (center: number) => ({ start_time: utc(center - 2), center_time: utc(center), end_time: utc(center + 2) }) as Maneuver
const window = { start: origin, end: origin + 400_000 }

function trace(center: number, heel: number, turn = 60, step = 1): TrackSample[] {
  return Array.from({ length: Math.round(50 / step) + 1 }, (_, index) => {
    const offset = -25 + index * step
    const fraction = Math.max(0, Math.min(1, (offset + 2) / 4))
    return { utc: utc(center + offset), lat: 0, lon: 0, dist: 0,
      sog: 5, cog: 40 + fraction * turn, hdg: null, heel, trim: null }
  })
}

describe('typical absolute HEEL maneuver profile', () => {
  it('aggregates positive and negative inclination magnitudes without changing canonical samples', () => {
    const samples = [...trace(50, 4), ...trace(150, -6, -60), ...trace(250, 8)]
    const original = structuredClone(samples)
    const prepared = prepareSogManeuverPopulation([event(50), event(150), event(250)], samples, window)
    const heel = aggregatePreparedHeelPopulation(prepared, 40, 100)
    expect(heel).toMatchObject({ status: 'ready', coverageEligibleCount: 3 })
    expect(heel.grid[25]).toEqual({ offsetSeconds: 0, medianHeelDeg: 6, contributorCount: 3 })
    expect(prepared.maneuvers[1].heelGrid?.[25]).toBe(6)
    expect(samples).toEqual(original)
  })

  it('gives equal magnitude grids for otherwise identical positive and negative HEEL', () => {
    const prepared = prepareSogManeuverPopulation([event(50), event(150)],
      [...trace(50, 6), ...trace(150, -6)], window)
    expect(prepared.maneuvers[0].heelGrid).toEqual(prepared.maneuvers[1].heelGrid)
    expect(prepared.maneuvers[0].heelNominalCoverage).toBe(prepared.maneuvers[1].heelNominalCoverage)
  })

  it('retains zero and interpolates magnitudes only across valid brackets', () => {
    const first = trace(50, 0)
    const second = trace(150, -6).filter((sample) => sample.utc !== utc(150))
    second.push({ ...second[24], utc: utc(149.25), heel: -2 }, { ...second[24], utc: utc(150.75), heel: -6 })
    second.sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc))
    const third = trace(250, 8)
    const prepared = prepareSogManeuverPopulation([event(50), event(150), event(250)], [...first, ...second, ...third], window)
    expect(prepared.maneuvers[1].heelGrid?.[25]).toBe(4)
    expect(aggregatePreparedHeelPopulation(prepared, 40, 100).grid[25].medianHeelDeg).toBe(4)
    expect(prepared.maneuvers[0].heelGrid?.[25]).toBe(0)
  })

  it('keeps missing, non-finite and long-gap offsets unsupported without joining them', () => {
    const first = trace(50, 4)
    const second = trace(150, 6)
    second[25].heel = null
    const third = trace(250, 8)
    third[25].heel = Number.NaN
    const fourth = trace(350, 10).filter((sample) => sample.utc !== utc(350))
    const prepared = prepareSogManeuverPopulation([event(50), event(150), event(250), event(350)],
      [...first, ...second, ...third, ...fourth], window)
    const heel = aggregatePreparedHeelPopulation(prepared, 40, 100)
    expect(heel.grid[25]).toMatchObject({ contributorCount: 1, medianHeelDeg: 4 })
    expect(supportedHeelPoints(heel)[25].sog).toBeNull()
    expect(heel.grid[26].contributorCount).toBe(4)
  })

  it('uses nominal HEEL coverage and the common inclusive angular band', () => {
    const first = trace(50, 4)
    const second = trace(150, -6, -60)
    const third = trace(250, 8)
    for (const sample of second) {
      if (Date.parse(sample.utc) < origin + 150_000) sample.heel = null
    }
    const prepared = prepareSogManeuverPopulation([event(50), event(150), event(250)],
      [...first, ...second, ...third], window)
    expect(aggregatePreparedHeelPopulation(prepared, 40, 100)).toMatchObject({
      status: 'insufficient_maneuvers', angularBandSelectedCount: 3, coverageEligibleCount: 2,
    })
    expect(aggregatePreparedHeelPopulation(prepared, 61, 100).coverageEligibleCount).toBe(0)
    expect(aggregatePreparedHeelPopulation(prepared, 60, 100).coverageEligibleCount).toBe(2)
  })

  it('includes exactly 65% nominal HEEL coverage and excludes just below it', () => {
    const exact = trace(50, 4, 60, 0.5)
    const below = trace(150, 6, 60, 0.5)
    for (const sample of exact) {
      if (Date.parse(sample.utc) > origin + 57_500) sample.heel = null
    }
    for (const sample of below) {
      if (Date.parse(sample.utc) > origin + 157_000) sample.heel = null
    }
    const prepared = prepareSogManeuverPopulation([event(50), event(150), event(250)],
      [...exact, ...below, ...trace(250, 8)], window)
    expect(prepared.maneuvers[0].heelNominalCoverage).toBe(0.65)
    expect(prepared.maneuvers[1].heelNominalCoverage).toBe(0.64)
    expect(aggregatePreparedHeelPopulation(prepared, 40, 100)).toMatchObject({
      status: 'insufficient_maneuvers', angularBandSelectedCount: 3, coverageEligibleCount: 2,
    })
  })

  it('honors Analysis Window clipping and independently aggregates P and C', () => {
    const samples = [...trace(50, 4), ...trace(150, 6), ...trace(250, 8)]
    const maneuvers = [event(50), event(150), event(250)]
    const clipped = prepareSogManeuverPopulation(maneuvers, samples,
      { start: origin + 30_000, end: origin + 300_000 })
    expect(clipped.maneuvers[0].heelGrid?.[0]).toBeNull()
    const primary = aggregatePreparedHeelPopulation(clipped, 40, 100)
    const comparison = aggregatePreparedHeelPopulation(prepareSogManeuverPopulation(maneuvers,
      [...trace(50, -10), ...trace(150, -12), ...trace(250, -14)], window), 40, 100)
    expect(primary.grid[25].medianHeelDeg).toBe(6)
    expect(comparison.grid[25].medianHeelDeg).toBe(12)
  })

  it('reuses indexed extraction when the angular band changes', () => {
    const extract = vi.spyOn(rawProfiles, 'extractManeuverProfile')
    try {
      const prepared = prepareSogManeuverPopulation([event(50), event(150), event(250)],
        [...trace(50, 4), ...trace(150, -6), ...trace(250, 8)], window)
      const count = extract.mock.calls.length
      aggregatePreparedHeelPopulation(prepared, 40, 100)
      aggregatePreparedHeelPopulation(prepared, 50, 90)
      expect(count).toBe(3)
      expect(extract).toHaveBeenCalledTimes(count)
    } finally {
      extract.mockRestore()
    }
  })
})
