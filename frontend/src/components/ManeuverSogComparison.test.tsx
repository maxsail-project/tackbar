import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { angleRangeKeyboard, moveAngleBand, pointerAngleDegrees, updateAngleGesture } from './ManeuverAngleRange'
import ManeuverSogComparison, { supportedSogPoints } from './ManeuverSogComparison'
import { aggregatePreparedSogPopulation, prepareSogManeuverPopulation, type PreparedSogPopulation } from '../utils/typicalSogProfile'
import * as rawProfiles from '../utils/maneuverProfiles'

function population(count: number, course = 60): PreparedSogPopulation {
  return {
    detectedCount: count,
    windowEligibleCount: count,
    missingCourseCount: 0,
    maneuvers: Array.from({ length: count }, (_, index) => ({
      courseChangeDeg: course,
      nominalCoverage: 1,
      grid: Array.from({ length: 51 }, (_, offset) => offset === 25 && index === 0 ? null : index + 3),
    })),
  }
}

describe('maneuver SOG comparison', () => {
  it('supports inclusive angular limits and only draws offsets with three contributors', () => {
    const prepared = population(3, 40)
    prepared.maneuvers[1].courseChangeDeg = 100
    prepared.maneuvers[2].courseChangeDeg = 60
    const selected = aggregatePreparedSogPopulation(prepared, 40, 100)
    expect(selected.angularBandSelectedCount).toBe(3)
    expect(selected.coverageEligibleCount).toBe(3)
    expect(selected.grid[25].contributorCount).toBe(2)
    expect(selected.grid[25].medianSogKn).toBe(4.5)
    expect(supportedSogPoints(selected)[25].sog).toBeNull()
    expect(supportedSogPoints(selected)[24].sog).toBe(4)
    expect(aggregatePreparedSogPopulation(prepared, 45, 95).status).toBe('insufficient_maneuvers')
  })

  it('renders independent P/C curves, counts, and a visible t=0 reference', () => {
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population(3)} comparison={population(4)} />)
    expect(html).toContain('Typical SOG maneuver comparison')
    expect(html).toContain('40°–100°')
    expect(html).toContain('data-maneuver-center="true"')
    expect(html).toContain('data-profile-series="primary-raw"')
    expect(html).toContain('data-profile-series="comparison-smoothed"')
    expect(html).toContain('3 detected')
    expect(html).toContain('4 detected')
    expect(html).toContain('t=0')
  })

  it('leaves the other role functional with insufficient or missing Comparison', () => {
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population(2)} comparison={null} />)
    expect(html).toContain('At least 3 profiles needed')
    expect(html).toContain('C profile data unavailable')
    expect(html).not.toContain('data-profile-series="primary-smoothed"')
  })

  it('reuses prepared profiles when the angular band moves', () => {
    const extract = vi.spyOn(rawProfiles, 'extractManeuverProfile')
    const center = Date.parse('2026-10-25T12:00:50Z')
    const maneuver = { start_time: new Date(center - 2_000).toISOString(), center_time: new Date(center).toISOString(), end_time: new Date(center + 2_000).toISOString() } as Parameters<typeof prepareSogManeuverPopulation>[0][number]
    const samples = Array.from({ length: 51 }, (_, index) => ({
      utc: new Date(center + (index - 25) * 1_000).toISOString(),
      lat: 0, lon: 0, dist: 0, sog: 4, cog: 60, hdg: null, heel: null, trim: null,
    }))
    const prepared = prepareSogManeuverPopulation([maneuver], samples, { start: center - 30_000, end: center + 30_000 })
    const afterPreparation = extract.mock.calls.length
    aggregatePreparedSogPopulation(prepared, 40, 100)
    aggregatePreparedSogPopulation(prepared, 60, 120)
    expect(afterPreparation).toBe(1)
    expect(extract).toHaveBeenCalledTimes(afterPreparation)
    extract.mockRestore()
  })
})

describe('angular band interaction rules', () => {
  const initial = { minimum: 40, maximum: 100 }
  it('moves either endpoint in 5° steps with inclusive limits', () => {
    expect(moveAngleBand(initial, 'minimum', 47)).toEqual({ minimum: 45, maximum: 100 })
    expect(moveAngleBand(initial, 'maximum', 95)).toEqual({ minimum: 40, maximum: 95 })
    expect(moveAngleBand(initial, 'minimum', 120)).toEqual({ minimum: 95, maximum: 100 })
  })
  it('translates the whole band without changing its width', () => {
    expect(moveAngleBand(initial, 'band', 110)).toEqual({ minimum: 110, maximum: 170 })
    expect(moveAngleBand(initial, 'band', 160)).toEqual({ minimum: 120, maximum: 180 })
  })
  it('maps touch pointer positions onto the band and clamps either edge', () => {
    expect(pointerAngleDegrees(100, 100, 360)).toBe(0)
    expect(pointerAngleDegrees(300, 100, 360)).toBe(100)
    expect(moveAngleBand(initial, 'band', initial.minimum + pointerAngleDegrees(320, 100, 360) - pointerAngleDegrees(180, 100, 360))).toEqual({ minimum: 110, maximum: 170 })
    expect(pointerAngleDegrees(500, 100, 360)).toBe(180)
    const touch = { pointerId: 7, part: 'band' as const, startDegrees: 40, startMinimum: 40 }
    expect(updateAngleGesture(initial, touch, 7, 110)).toEqual({ minimum: 110, maximum: 170 })
    expect(updateAngleGesture(initial, touch, 8, 110)).toBeNull()
  })
  it('supports keyboard arrows and bounds for all three draggable parts', () => {
    expect(angleRangeKeyboard(initial, 'minimum', 'ArrowRight')).toEqual({ minimum: 45, maximum: 100 })
    expect(angleRangeKeyboard(initial, 'maximum', 'End')).toEqual({ minimum: 40, maximum: 180 })
    expect(angleRangeKeyboard(initial, 'band', 'Home')).toEqual({ minimum: 0, maximum: 60 })
    expect(angleRangeKeyboard(initial, 'band', 'Escape')).toBeNull()
  })
})
