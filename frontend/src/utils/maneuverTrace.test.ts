import { describe, expect, it, vi } from 'vitest'
import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import * as rawProfiles from './maneuverProfiles'
import {
  aggregatePreparedTracePopulation,
  maneuverBisector,
  prepareManeuverTrace,
  projectLocalMetres,
  rotateToBisector,
  traceCenterAnchor,
  type PreparedManeuverTrace,
  type TracePoint,
} from './maneuverTrace'
import { aggregatePreparedSogPopulation, prepareSogManeuverPopulation, type PreparedSogPopulation } from './typicalSogProfile'

const EARTH_RADIUS_M = 6_371_008.8
const origin = Date.parse('2026-10-25T12:00:00Z')
const stamp = (seconds: number) => new Date(origin + seconds * 1000).toISOString()
const fullWindow = { start: origin, end: origin + 3_600_000 }

interface TrackOptions {
  center: number
  entry: number
  exit: number
  step?: number
  speed?: number
  lat0?: number
  lon0?: number
  span?: number
  keep?: (relativeSeconds: number) => boolean
}

/** Straight entry leg into t=0, straight exit leg after; positions follow the given courses. */
function turnTrack({ center, entry, exit, step = 1, speed = 5, lat0 = 43, lon0 = -8, span = 40, keep = () => true }: TrackOptions): TrackSample[] {
  const samples: TrackSample[] = []
  const count = Math.round((2 * span) / step)
  for (let index = 0; index <= count; index += 1) {
    const relative = -span + index * step
    if (!keep(relative)) continue
    const course = relative < 0 ? entry : exit
    const radians = course * Math.PI / 180
    const east = speed * relative * Math.sin(radians)
    const north = speed * relative * Math.cos(radians)
    samples.push({
      utc: stamp(center + relative),
      lat: lat0 + (north / EARTH_RADIUS_M) * 180 / Math.PI,
      lon: ((lon0 + (east / (EARTH_RADIUS_M * Math.cos(lat0 * Math.PI / 180))) * 180 / Math.PI + 540) % 360) - 180,
      dist: 0, sog: speed * 1.94384, cog: course, hdg: null, heel: null, trim: null,
    })
  }
  return samples
}

const event = (center: number): Maneuver => ({
  start_time: stamp(center - 3), center_time: stamp(center), end_time: stamp(center + 3),
  heading_change_deg: null, course_change_deg: null, peak_turn_rate_deg_s: null, peak_turn_rate_time: null, duration_s: 6,
})

function traced(population: PreparedSogPopulation, index = 0): PreparedManeuverTrace {
  const trace = population.maneuvers[index].trace
  if (trace?.status !== 'traced') throw new Error(`expected traced, got ${trace?.status}`)
  return trace
}

function prepareOne(options: TrackOptions, window = fullWindow) {
  return prepareSogManeuverPopulation([event(options.center)], turnTrack(options), window)
}

const close = (point: TracePoint | null | undefined, x: number, y: number, digits = 6) => {
  expect(point).not.toBeNull()
  expect(point!.x).toBeCloseTo(x, digits)
  expect(point!.y).toBeCloseTo(y, digits)
}

describe('bisector from existing course references (D1)', () => {
  it('uses entry + signedChange/2 circularly across 0°/360° and keeps the turn side', () => {
    expect(maneuverBisector({ entryDeg: 350, exitDeg: 30, signedChangeDeg: 40 })).toEqual({ bisectorDeg: 10, side: 'right' })
    expect(maneuverBisector({ entryDeg: 10, exitDeg: 330, signedChangeDeg: -40 })).toEqual({ bisectorDeg: 350, side: 'left' })
    expect(maneuverBisector({ entryDeg: 359, exitDeg: 1, signedChangeDeg: 2 })!.bisectorDeg).toBeCloseTo(0, 9)
    expect(maneuverBisector({ entryDeg: 1, exitDeg: 359, signedChangeDeg: -2 })!.bisectorDeg).toBeCloseTo(0, 9)
    expect(maneuverBisector({ entryDeg: 270, exitDeg: 80, signedChangeDeg: 170 })).toEqual({ bisectorDeg: 355, side: 'right' })
  })

  it('excludes unavailable references and exactly 0° or ±180° turns', () => {
    expect(maneuverBisector(null)).toBeNull()
    expect(maneuverBisector({ entryDeg: 90, exitDeg: 90, signedChangeDeg: 0 })).toBeNull()
    expect(maneuverBisector({ entryDeg: 0, exitDeg: 180, signedChangeDeg: 180 })).toBeNull()
    expect(maneuverBisector({ entryDeg: 0, exitDeg: 180, signedChangeDeg: -180 })).toBeNull()
    expect(maneuverBisector({ entryDeg: Number.NaN, exitDeg: 0, signedChangeDeg: 20 })).toBeNull()
    const position = { points: [], representedTimeSeconds: 0, clippedCoverage: 0, nominalCoverage: 0 }
    expect(prepareManeuverTrace(position, null)).toEqual({ status: 'missing_course' })
    expect(prepareManeuverTrace(position, { entryDeg: 0, exitDeg: 180, signedChangeDeg: 180 })).toEqual({ status: 'ambiguous_turn' })
    expect(prepareManeuverTrace(position, { entryDeg: 0, exitDeg: 40, signedChangeDeg: 40 })).toEqual({ status: 'missing_center' })
  })

  it('counts ambiguous 180° turns visibly through the population aggregate', () => {
    const population = prepareOne({ center: 100, entry: 0, exit: 180 })
    expect(population.maneuvers[0].courseChangeDeg).toBeCloseTo(180, 6)
    const aggregate = aggregatePreparedTracePopulation(population, 0, 180)
    expect(aggregate).toMatchObject({ windowEligibleCount: 1, tracedCount: 0, ambiguousTurnCount: 1 })
  })
})

describe('local projection and orientation (D2)', () => {
  it('converts small latitude/longitude offsets to east/north metres around the origin', () => {
    const north = projectLocalMetres(43.001, -8, 43, -8)
    expect(north.x).toBeCloseTo(0, 9)
    expect(north.y).toBeCloseTo(111.195, 2)
    const east = projectLocalMetres(60, 10.001, 60, 10)
    expect(east.x).toBeCloseTo(111.195 * 0.5, 2)
    expect(east.y).toBeCloseTo(0, 9)
  })

  it('wraps longitude differences across the antimeridian', () => {
    const across = projectLocalMetres(0, -179.9999, 0, 179.9999)
    expect(across.x).toBeCloseTo(22.239, 2)
    const back = projectLocalMetres(0, 179.9999, 0, -179.9999)
    expect(back.x).toBeCloseTo(-22.239, 2)
  })

  it('rotates the geographic bisector bearing to forward-up', () => {
    close(rotateToBisector({ x: 1, y: 0 }, 90), 0, 1)
    close(rotateToBisector({ x: 0, y: 1 }, 90), -1, 0)
    close(rotateToBisector({ x: -1, y: 0 }, 270), 0, 1)
    close(rotateToBisector({ x: 0, y: 1 }, 0), 0, 1)
  })

  it('places right turns on the right and left turns on the left, independent of geographic course', () => {
    const right = traced(prepareOne({ center: 100, entry: 45, exit: 135 }))
    expect(right.side).toBe('right')
    close(right.grid[15], 50 * Math.sin(Math.PI / 4), -50 * Math.cos(Math.PI / 4), 3)
    close(right.grid[35], 50 * Math.sin(Math.PI / 4), 50 * Math.cos(Math.PI / 4), 3)
    const left = traced(prepareOne({ center: 100, entry: 135, exit: 45 }))
    expect(left.side).toBe('left')
    close(left.grid[15], -50 * Math.sin(Math.PI / 4), -50 * Math.cos(Math.PI / 4), 3)
    close(left.grid[35], -50 * Math.sin(Math.PI / 4), 50 * Math.cos(Math.PI / 4), 3)
  })

  it('aligns a 350°→10° turn across north identically to a 80°→100° turn', () => {
    const acrossNorth = traced(prepareOne({ center: 100, entry: 350, exit: 10 }))
    const east = traced(prepareOne({ center: 100, entry: 80, exit: 100 }))
    expect(acrossNorth.side).toBe('right')
    acrossNorth.grid.forEach((point, index) => close(point, east.grid[index]!.x, east.grid[index]!.y, 2))
  })

  it('handles a maneuver that crosses the antimeridian', () => {
    const trace = traced(prepareOne({ center: 100, entry: 45, exit: 135, lat0: -17, lon0: 179.9995 }))
    close(trace.grid[25], 0, 0, 6)
    close(trace.grid[35], 50 * Math.sin(Math.PI / 4), 50 * Math.cos(Math.PI / 4), 2)
    close(trace.grid[15], 50 * Math.sin(Math.PI / 4), -50 * Math.cos(Math.PI / 4), 2)
    expect(Math.max(...trace.segments.flat().map((point) => Math.abs(point.x)))).toBeLessThan(400)
  })

  it('does not modify canonical samples', () => {
    const samples = turnTrack({ center: 100, entry: 45, exit: 135 })
    const copy = structuredClone(samples)
    prepareSogManeuverPopulation([event(100)], samples, fullWindow)
    expect(samples).toEqual(copy)
  })
})

describe('evidence, continuity and anchors (D3)', () => {
  it('gives comparable geometry at different sampling rates', () => {
    const oneHz = traced(prepareOne({ center: 100, entry: 30, exit: 120, step: 1 }))
    const fourHz = traced(prepareOne({ center: 100, entry: 30, exit: 120, step: 0.25 }))
    oneHz.grid.forEach((point, index) => close(point, fourHz.grid[index]!.x, fourHz.grid[index]!.y, 3))
    expect(fourHz.segments[0].length).toBeGreaterThan(oneHz.segments[0].length * 3)
  })

  it('anchors t=0 on an exact original sample', () => {
    const trace = traced(prepareOne({ center: 100, entry: 30, exit: 120 }))
    close(trace.grid[25], 0, 0, 9)
    expect(trace.segments.flat().some((point) => Math.hypot(point.x, point.y) < 1e-9)).toBe(true)
  })

  it('interpolates the t=0 anchor within a ≤1.5s bracket without drawing it as a sample', () => {
    const samples = turnTrack({ center: 100, entry: 30, exit: 30, step: 0.5, keep: (t) => t !== 0 })
    const population = prepareSogManeuverPopulation([event(100)], samples, fullWindow)
    // A straight line has no turn (0° change); use explicit references to test the anchor.
    const profile = rawProfiles.extractManeuverProfile(event(100), samples, fullWindow)!
    expect(traceCenterAnchor(profile.position)).not.toBeNull()
    const trace = prepareManeuverTrace(profile.position, { entryDeg: 30, exitDeg: 50, signedChangeDeg: 20 })
    if (trace.status !== 'traced') throw new Error(trace.status)
    close(trace.grid[25], 0, 0, 6)
    expect(trace.segments.flat().some((point) => Math.hypot(point.x, point.y) < 1e-6)).toBe(false)
    expect(trace.segments).toHaveLength(1)
    expect(population.maneuvers[0].trace?.status).toBe('ambiguous_turn')
  })

  it('rejects a t=0 anchor across a gap longer than 1.5 seconds', () => {
    const population = prepareOne({ center: 100, entry: 30, exit: 120, step: 1, keep: (t) => t !== 0 && t !== 1 })
    expect(population.maneuvers[0].trace).toEqual({ status: 'missing_center' })
    const aggregate = aggregatePreparedTracePopulation(population, 0, 180)
    expect(aggregate).toMatchObject({ tracedCount: 0, missingCenterCount: 1 })
  })

  it('never bridges gaps over 1.5 seconds or invalid positions', () => {
    const samples = turnTrack({ center: 100, entry: 30, exit: 120, keep: (t) => t !== 8 && t !== 9 })
    const invalid = samples.findIndex((sample) => sample.utc === stamp(115))
    samples[invalid] = { ...samples[invalid], lat: Number.NaN }
    const trace = traced(prepareSogManeuverPopulation([event(100)], samples, fullWindow))
    // Segments: −25…7, 10…14, 16…25.
    expect(trace.segments.map((segment) => segment.length)).toEqual([33, 5, 10])
    expect(trace.grid[25 + 8]).toBeNull()
    expect(trace.grid[25 + 9]).toBeNull()
    expect(trace.grid[25 + 15]).toBeNull()
    expect(trace.grid[25 + 7]).not.toBeNull()
    expect(trace.grid[25 + 10]).not.toBeNull()
  })

  it('clips to the Analysis Window and reports nominal 50-second position coverage', () => {
    const options = { center: 100, entry: 30, exit: 120 }
    const full = traced(prepareOne(options))
    expect(full.nominalCoverage).toBe(1)
    const clipped = traced(prepareOne(options, { start: origin + 90_000, end: fullWindow.end }))
    expect(clipped.nominalCoverage).toBeCloseTo(35 / 50, 9)
    expect(clipped.grid.slice(0, 15).every((point) => point === null)).toBe(true)
    expect(clipped.grid[15]).not.toBeNull()
    expect(Math.min(...clipped.segments.flat().map((point) => point.y))).toBeGreaterThan(-10 * 5 - 1e-6)
  })
})

describe('time-aligned median and support (D2/D3)', () => {
  const window = fullWindow
  function population(specs: { entry: number, exit: number, speed?: number, keep?: (t: number) => boolean }[]) {
    const centers = specs.map((_, index) => 100 + index * 100)
    const samples = specs.flatMap((spec, index) => turnTrack({ center: centers[index], ...spec }))
    return prepareSogManeuverPopulation(centers.map(event), samples, window)
  }

  it('computes coordinate-wise X/Y medians separately per turn side and never pools sides', () => {
    const prepared = population([
      { entry: 30, exit: 120, speed: 4 }, { entry: 200, exit: 290, speed: 5 }, { entry: 300, exit: 30, speed: 6 },
      { entry: 120, exit: 30, speed: 4 }, { entry: 290, exit: 200, speed: 5 }, { entry: 30, exit: 300, speed: 6 },
    ])
    const aggregate = aggregatePreparedTracePopulation(prepared, 40, 100)
    expect(aggregate).toMatchObject({ windowEligibleCount: 6, tracedCount: 6 })
    expect(aggregate.right).toMatchObject({ tracedCount: 3, medianEligibleCount: 3, status: 'ready' })
    expect(aggregate.left).toMatchObject({ tracedCount: 3, medianEligibleCount: 3, status: 'ready' })
    const offset = Math.sin(Math.PI / 4) * 10
    close(aggregate.right.median[35].point, 5 * offset, 5 * offset, 2)
    close(aggregate.left.median[35].point, -5 * offset, 5 * offset, 2)
    close(aggregate.right.median[25].point, 0, 0, 6)
    expect(aggregate.right.median[35].contributorCount).toBe(3)
  })

  it('uses independent X and Y medians, not a geometric median', () => {
    const trace = (x: number, y: number): PreparedManeuverTrace => ({
      status: 'traced', side: 'right', nominalCoverage: 1, segments: [],
      grid: Array.from({ length: 51 }, () => ({ x, y })),
    })
    const prepared: PreparedSogPopulation = { detectedCount: 3, windowEligibleCount: 3, missingCourseCount: 0,
      maneuvers: [trace(0, 10), trace(10, 0), trace(4, 4)].map((value) => ({ courseChangeDeg: 60, nominalCoverage: 1, grid: [], trace: value })) }
    close(aggregatePreparedTracePopulation(prepared, 40, 100).right.median[0].point, 4, 4)
  })

  it('requires three ≥65%-coverage maneuvers per side and keeps individual traces when unsupported', () => {
    const prepared = population([
      { entry: 30, exit: 120 }, { entry: 30, exit: 120 }, { entry: 30, exit: 120, keep: (t) => t >= -14 && t <= 19 },
      { entry: 120, exit: 30 },
    ])
    expect(traced(prepared, 2).nominalCoverage).toBeCloseTo(33 / 50, 9)
    const aggregate = aggregatePreparedTracePopulation(prepared, 40, 100)
    expect(aggregate.right).toMatchObject({ tracedCount: 3, medianEligibleCount: 3, status: 'ready' })
    expect(aggregate.left).toMatchObject({ tracedCount: 1, medianEligibleCount: 1, status: 'insufficient_maneuvers' })
    expect(aggregate.left.median.every((point) => point.point === null)).toBe(true)
    expect(aggregate.left.traces).toHaveLength(1)

    const lowCoverage = population([
      { entry: 30, exit: 120 }, { entry: 30, exit: 120 }, { entry: 30, exit: 120, keep: (t) => t >= -14 && t <= 18 },
    ])
    expect(traced(lowCoverage, 2).nominalCoverage).toBeCloseTo(32 / 50, 9)
    const insufficient = aggregatePreparedTracePopulation(lowCoverage, 40, 100).right
    expect(insufficient).toMatchObject({ tracedCount: 3, medianEligibleCount: 2, status: 'insufficient_maneuvers' })
    expect(insufficient.traces).toHaveLength(3)
    expect(insufficient.median.every((point) => point.point === null)).toBe(true)
  })

  it('draws a median offset only with three contributors', () => {
    const prepared = population([
      { entry: 30, exit: 120 }, { entry: 30, exit: 120 }, { entry: 30, exit: 120 },
      { entry: 30, exit: 120, keep: (t) => t <= 14 || t >= 17 },
    ])
    const right = aggregatePreparedTracePopulation(prepared, 40, 100).right
    expect(right.status).toBe('ready')
    expect(right.median[25 + 15].contributorCount).toBe(3)
    expect(right.median[25 + 15].point).not.toBeNull()

    const sparse = population([
      { entry: 30, exit: 120 }, { entry: 30, exit: 120, keep: (t) => t <= 14 || t >= 17 },
      { entry: 30, exit: 120, keep: (t) => t <= 14 || t >= 17 },
    ])
    const gapped = aggregatePreparedTracePopulation(sparse, 40, 100).right
    expect(gapped.median[25 + 15].contributorCount).toBe(1)
    expect(gapped.median[25 + 15].point).toBeNull()
    expect(gapped.median[25 + 14].point).not.toBeNull()
  })

  it('applies the common |ΔCOG| band and counts exclusions', () => {
    const prepared = population([{ entry: 30, exit: 120 }, { entry: 30, exit: 50 }, { entry: 30, exit: 120 }])
    const aggregate = aggregatePreparedTracePopulation(prepared, 40, 100)
    expect(aggregate).toMatchObject({ windowEligibleCount: 3, outsideBandCount: 1, tracedCount: 2 })
  })

  it('prepares traces inside the existing single extraction per maneuver', () => {
    const extract = vi.spyOn(rawProfiles, 'extractManeuverProfile')
    const index = vi.spyOn(rawProfiles, 'prepareManeuverSampleIndex')
    try {
      const prepared = population([{ entry: 30, exit: 120 }, { entry: 120, exit: 30 }, { entry: 30, exit: 120 }])
      expect(extract).toHaveBeenCalledTimes(3)
      expect(index).toHaveBeenCalledTimes(1)
      aggregatePreparedTracePopulation(prepared, 40, 100)
      aggregatePreparedTracePopulation(prepared, 60, 120)
      aggregatePreparedSogPopulation(prepared, 40, 100)
      expect(extract).toHaveBeenCalledTimes(3)
      expect(index).toHaveBeenCalledTimes(1)
    } finally {
      extract.mockRestore()
      index.mockRestore()
    }
  })
})

describe('median event |ΔCOG| per turn side (#202)', () => {
  function stub(side: 'left' | 'right', coverage = 1): PreparedManeuverTrace {
    return { status: 'traced', side, nominalCoverage: coverage, segments: [], grid: Array(51).fill(null) }
  }
  function angles(entries: { side: 'left' | 'right', deg: number, coverage?: number }[],
    extra: PreparedSogPopulation['maneuvers'] = []): PreparedSogPopulation {
    const maneuvers = [...entries.map(({ side, deg, coverage }) => ({ courseChangeDeg: deg, nominalCoverage: 1, grid: [], trace: stub(side, coverage) })), ...extra]
    return { detectedCount: maneuvers.length, windowEligibleCount: maneuvers.length, missingCourseCount: 0, maneuvers }
  }

  it('takes the median of all traced maneuvers per side, for odd and even counts', () => {
    const aggregate = aggregatePreparedTracePopulation(angles([
      { side: 'right', deg: 100 }, { side: 'right', deg: 80 }, { side: 'right', deg: 90 },
      { side: 'left', deg: 110 }, { side: 'left', deg: 80 }, { side: 'left', deg: 100 }, { side: 'left', deg: 90 },
    ]), 0, 180)
    expect(aggregate.right.turnAngle).toEqual({ medianDeg: 90, count: 3 })
    expect(aggregate.left.turnAngle).toEqual({ medianDeg: 95, count: 4 })
  })

  it('includes traced maneuvers below the spatial-median coverage rule, but never untraced ones', () => {
    const aggregate = aggregatePreparedTracePopulation(angles(
      [{ side: 'right', deg: 60, coverage: 0.2 }, { side: 'right', deg: 70, coverage: 0.5 }, { side: 'right', deg: 80 }],
      [{ courseChangeDeg: 75, nominalCoverage: 1, grid: [], trace: { status: 'missing_center' } },
        { courseChangeDeg: 75, nominalCoverage: 1, grid: [], trace: { status: 'ambiguous_turn' } }],
    ), 0, 180)
    expect(aggregate.right.medianEligibleCount).toBe(1)
    expect(aggregate.right.status).toBe('insufficient_maneuvers')
    expect(aggregate.right.turnAngle).toEqual({ medianDeg: 70, count: 3 })
  })

  it('withholds the value below three traced maneuvers but keeps the count', () => {
    const aggregate = aggregatePreparedTracePopulation(angles([{ side: 'left', deg: 90 }, { side: 'left', deg: 95 }]), 0, 180)
    expect(aggregate.left.turnAngle).toEqual({ medianDeg: null, count: 2 })
    expect(aggregate.right.turnAngle).toEqual({ medianDeg: null, count: 0 })
  })

  it('responds to the shared |ΔCOG| band', () => {
    const population = angles([50, 70, 90, 110].map((deg) => ({ side: 'right' as const, deg })))
    expect(aggregatePreparedTracePopulation(population, 40, 100).right.turnAngle).toEqual({ medianDeg: 70, count: 3 })
    expect(aggregatePreparedTracePopulation(population, 60, 120).right.turnAngle).toEqual({ medianDeg: 90, count: 3 })
    expect(aggregatePreparedTracePopulation(population, 60, 100).right.turnAngle).toEqual({ medianDeg: null, count: 2 })
  })

  it('uses the prepared |signedChangeDeg| from real course references', () => {
    const centers = [100, 200, 300]
    const samples = [
      ...turnTrack({ center: 100, entry: 350, exit: 70 }), ...turnTrack({ center: 200, entry: 10, exit: 100 }),
      ...turnTrack({ center: 300, entry: 300, exit: 30 }),
    ]
    const aggregate = aggregatePreparedTracePopulation(prepareSogManeuverPopulation(centers.map(event), samples, fullWindow), 0, 180)
    expect(aggregate.right.turnAngle.count).toBe(3)
    expect(aggregate.right.turnAngle.medianDeg).toBeCloseTo(90, 6)
  })
})
