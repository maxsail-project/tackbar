import { describe, expect, it } from 'vitest'

import { HEEL_SOG_DENSITY_CONFIG } from '../config/heelSogDensity'
import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import {
  buildHeelSogDensityPresentation,
  calculateHeelSogDensity,
  resolveHeelSogDensityGeometry,
} from './heelSogDensity'

const BASE_TIME = Date.parse('2026-09-05T12:00:00Z')

function sample(
  seconds: number,
  heel: number | null,
  sog: number | null,
): TrackSample {
  return {
    utc: new Date(BASE_TIME + seconds * 1_000).toISOString(),
    lat: 39,
    lon: 2,
    dist: seconds,
    sog,
    cog: null,
    hdg: null,
    heel,
    trim: null,
  }
}

function window(startSeconds: number, endSeconds: number) {
  return {
    start: BASE_TIME + startSeconds * 1_000,
    end: BASE_TIME + endSeconds * 1_000,
  }
}

describe('HEEL versus SOG density calculation', () => {
  it('time-weights irregular intervals and clips both Analysis Window boundaries', () => {
    const samples = [
      sample(-0.5, -1, 1),
      sample(0.5, 0, 1.25),
      sample(1.5, 2, 1.5),
      sample(3.0, 4, 1.75),
    ]
    const range = window(0, 3)
    const geometry = resolveHeelSogDensityGeometry([samples], range)
    const result = calculateHeelSogDensity(samples, range, geometry)

    expect(result.validRepresentedTimeSeconds).toBe(3)
    expect(result.coverage).toBe(1)
    expect(result.cells.map((cell) => cell.representedTimeSeconds)).toEqual([0.5, 1, 1.5])
    expect(result.cells[0].percentage).toBeCloseTo(100 / 6)
    expect(result.cells[1].percentage).toBeCloseTo(100 / 3)
    expect(result.cells[2].percentage).toBe(50)
  })

  it('does not bridge gaps over 1.5 seconds or use missing/non-finite telemetry', () => {
    const samples = [
      sample(0, 5, 4),
      sample(1, null, 4),
      sample(2, Number.NaN, 4),
      sample(3, 5, Number.NaN),
      sample(4, 5, 4),
      sample(6, 5, 4),
    ]
    const range = window(0, 6)
    const geometry = resolveHeelSogDensityGeometry([samples], range)
    const result = calculateHeelSogDensity(samples, range, geometry)

    expect(result.validRepresentedTimeSeconds).toBe(1)
    expect(result.coverage).toBeCloseTo(1 / 6)
    expect(result.cells).toHaveLength(1)
  })

  it('ignores nonpositive and out-of-order source intervals', () => {
    const samples = [
      sample(0, 5, 4),
      sample(1, 5, 4),
      sample(1, 5, 4),
      sample(0.5, 5, 4),
    ]
    const range = window(0, 2)
    const geometry = resolveHeelSogDensityGeometry([samples], range)
    const result = calculateHeelSogDensity(samples, range, geometry)

    expect(result.validRepresentedTimeSeconds).toBe(1)
    expect(result.coverage).toBe(0.5)
  })

  it.each([1, 2, 10])(
    'produces equivalent represented density at %s Hz',
    (frequency) => {
      const samples = Array.from(
        { length: 4 * frequency + 1 },
        (_, index) => {
          const seconds = index / frequency
          return sample(
            seconds,
            seconds < 2 ? -6 : 6,
            seconds < 2 ? 4 : 5,
          )
        },
      )
      const range = window(0, 4)
      const geometry = resolveHeelSogDensityGeometry([samples], range)
      const result = calculateHeelSogDensity(samples, range, geometry)

      expect(result.validRepresentedTimeSeconds).toBeCloseTo(4)
      expect(result.coverage).toBeCloseTo(1)
      expect(result.cells).toHaveLength(2)
      expect(result.cells[0].percentage).toBeCloseTo(50)
      expect(result.cells[1].percentage).toBeCloseTo(50)
    },
  )

  it('uses fixed signed ±40° geometry with 2° bins and keeps zero identifiable', () => {
    const samples = [
      sample(0, -40, 4),
      sample(1, -1, 4),
      sample(2, 0, 4),
      sample(3, 40, 4),
      sample(4, 0, 4),
    ]
    const range = window(0, 4)
    const geometry = resolveHeelSogDensityGeometry([samples], range)
    const result = calculateHeelSogDensity(samples, range, geometry)

    expect(geometry).toMatchObject({
      heelMinimumDegrees: -40,
      heelMaximumDegrees: 40,
      heelBinDegrees: 2,
      heelBinCount: 40,
    })
    expect(result.cells.map((cell) => cell.heelBinIndex)).toEqual([0, 19, 20, 39])
  })

  it('excludes out-of-domain HEEL from cells and reduces coverage', () => {
    const samples = [
      sample(0, 40, 4),
      sample(1, 41, 20),
      sample(2, -40, 4),
      sample(3, -41, 30),
      sample(4, 0, 4),
    ]
    const range = window(0, 4)
    const geometry = resolveHeelSogDensityGeometry([samples], range)
    const result = calculateHeelSogDensity(samples, range, geometry)

    expect(result.validRepresentedTimeSeconds).toBe(2)
    expect(result.coverage).toBe(0.5)
    expect(geometry.sogMaximumKnots).toBe(4)
    expect(result.cells.map((cell) => cell.heelBinIndex)).toEqual([0, 39])
  })

  it('uses 0.25 kt bins and one shared aligned 0-based SOG domain for P/C', () => {
    const primary = [
      sample(0, 0, 0),
      sample(1, 0, 0.25),
      sample(2, 0, 4.1),
      sample(3, 0, 4.1),
    ]
    const comparison = [
      sample(0, 0, 5),
      sample(1, 0, 5),
      sample(2, 0, 5),
      sample(3, 0, 5),
    ]
    const range = window(0, 3)
    const presentation = buildHeelSogDensityPresentation(
      [primary, comparison],
      range,
    )

    expect(presentation.geometry).toMatchObject({
      sogMinimumKnots: 0,
      sogMaximumKnots: 5,
      sogBinKnots: 0.25,
      sogBinCount: 20,
    })
    expect(presentation.activities[0].cells.map((cell) => cell.sogBinIndex))
      .toEqual([0, 1, 16])
    expect(presentation.activities[1].cells[0].sogBinIndex).toBe(19)
  })

  it('normalizes each Activity independently and shares the largest intensity maximum', () => {
    const primary = [
      sample(0, 0, 4),
      sample(1, 0, 5),
      sample(2.5, 0, 5),
      sample(4, 0, 5),
    ]
    const comparison = [
      sample(0, 0, 4),
      sample(1, 0, 5),
      sample(2, 0, 4),
      sample(3, 0, 5),
      sample(4, 0, 5),
    ]
    const result = buildHeelSogDensityPresentation(
      [primary, comparison],
      window(0, 4),
    )

    expect(result.activities[0].cells.map((cell) => cell.percentage)).toEqual([25, 75])
    expect(result.activities[1].cells.map((cell) => cell.percentage)).toEqual([50, 50])
    expect(result.sharedMaximumCellPercentage).toBe(75)
  })

  it('uses VS minimum coverage only as the low-coverage warning threshold', () => {
    const exactSamples = [
      sample(0, 0, 4),
      sample(VS_CONFIG.minCoverage, null, null),
      sample(1, null, null),
    ]
    const belowSamples = [
      sample(0, 0, 4),
      sample(0.7, null, null),
      sample(1, null, null),
    ]
    const range = window(0, 1)
    const geometry = resolveHeelSogDensityGeometry(
      [exactSamples, belowSamples],
      range,
    )

    expect(calculateHeelSogDensity(exactSamples, range, geometry).lowCoverage).toBe(false)
    expect(calculateHeelSogDensity(belowSamples, range, geometry).lowCoverage).toBe(true)
    expect(HEEL_SOG_DENSITY_CONFIG.maxGapSeconds).toBe(1.5)
  })
})
