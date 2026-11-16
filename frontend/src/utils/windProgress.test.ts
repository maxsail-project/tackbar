import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import type { EffectiveTwd } from './windContext'
import {
  calculateProgressDifference,
  calculateWindProgress,
  formatProgressDifference,
  formatProgressGaps,
  type WindProgress,
} from './windProgress'

const start = Date.UTC(2025, 5, 21, 11, 37, 35)
const EARTH_RADIUS = 6_371_000
const LAT0 = 40
const LON0 = 1

/** Position offset by local north/east metres from a fixed origin. */
function position(northMeters: number, eastMeters: number) {
  return {
    lat: LAT0 + (northMeters / EARTH_RADIUS) * 180 / Math.PI,
    lon: LON0 + (eastMeters / (EARTH_RADIUS * Math.cos(LAT0 * Math.PI / 180))) * 180 / Math.PI,
  }
}

function track(points: { seconds: number, north: number, east: number, lat?: number }[]): TrackSample[] {
  return points.map(({ seconds, north, east, lat }) => ({
    utc: new Date(start + seconds * 1_000).toISOString(),
    ...position(north, east),
    ...(lat === undefined ? {} : { lat }),
    dist: 0, sog: 5, cog: 0, hdg: null, heel: null, trim: null,
  }))
}

/** Straight displacement of `meters` along `bearingDegrees` over `seconds`. */
function straight(meters: number, bearingDegrees: number, seconds = 370) {
  const radians = bearingDegrees * Math.PI / 180
  return track([
    { seconds: 0, north: 0, east: 0 },
    { seconds: seconds / 2, north: Math.cos(radians) * meters / 2, east: Math.sin(radians) * meters / 2 },
    { seconds, north: Math.cos(radians) * meters, east: Math.sin(radians) * meters },
  ])
}

const window370 = { start, end: start + 370_000 }
const midpoint = start + 185_000
const manual = (degrees: number): EffectiveTwd => ({ degrees, source: 'manual' })
const modelled = (degrees: number, sourceTimeMs = midpoint): EffectiveTwd => ({
  degrees, source: 'modelled', sourceTimeUtc: new Date(sourceTimeMs).toISOString(),
})

function available(result: WindProgress) {
  expect(result.status).toBe('available')
  return result as Extract<WindProgress, { status: 'available' }>
}

describe('progress along the wind axis', () => {
  it('reproduces the fixture-like example: 893 m sailed, 609 m to windward → 68%', () => {
    const result = available(calculateWindProgress(straight(609, 105), window370, modelled(105), 'upwind', 893))
    expect(result.sector).toBe('upwind')
    expect(result.progressMeters).toBeCloseTo(609, 0)
    expect(result.distanceMeters).toBe(893)
    expect(Math.round(result.efficiency! * 100)).toBe(68)
    expect(result.durationSeconds).toBe(370)
    expect(result.progressSpeedMetersPerSecond).toBeCloseTo(609 / 370, 2)
  })

  it('is positive towards windward upwind and towards leeward downwind', () => {
    expect(available(calculateWindProgress(straight(500, 0), window370, manual(0), 'upwind', 600)).progressMeters).toBeCloseTo(500, 0)
    const downwind = available(calculateWindProgress(straight(500, 180), window370, manual(0), 'downwind', 600))
    expect(downwind.sector).toBe('downwind')
    expect(downwind.progressMeters).toBeCloseTo(500, 0)
    // Sailing away from the wind is not along the upwind axis.
    expect(calculateWindProgress(straight(500, 180), window370, manual(0), 'upwind', 600)).toMatchObject({
      status: 'unavailable', reason: 'course-off-axis',
    })
  })

  it('projects across 0°/360° (TWD 355°)', () => {
    // Net bearing 010° is 15° from TWD 355°.
    const upwind = available(calculateWindProgress(straight(400, 10), window370, manual(355), 'upwind', 500))
    expect(upwind.progressMeters).toBeCloseTo(400 * Math.cos(15 * Math.PI / 180), 0)
    // Downwind axis 175°: net bearing 160° is 15° away.
    const downwind = available(calculateWindProgress(straight(400, 160), window370, manual(355), 'downwind', 500))
    expect(downwind.progressMeters).toBeCloseTo(400 * Math.cos(15 * Math.PI / 180), 0)
  })

  it('accepts a net bearing exactly 30° from the axis and rejects beyond it', () => {
    // Due north is bearing exactly 000°.
    const north = straight(300, 0)
    const atLimit = available(calculateWindProgress(north, window370, manual(30), 'upwind', 400))
    expect(atLimit.progressMeters).toBeCloseTo(300 * Math.cos(Math.PI / 6), 0)
    expect(available(calculateWindProgress(north, window370, manual(330), 'upwind', 400)).progressMeters).toBeGreaterThan(0)
    expect(calculateWindProgress(north, window370, manual(30.01), 'upwind', 400)).toEqual({
      status: 'unavailable', reason: 'course-off-axis', distanceMeters: 400,
    })
  })

  it('requires the modelled TWD sample within 60 min of the window midpoint; manual has no age limit', () => {
    const north = straight(300, 0)
    expect(calculateWindProgress(north, window370, modelled(0, midpoint + 3_600_000), 'upwind', 400).status).toBe('available')
    expect(calculateWindProgress(north, window370, modelled(0, midpoint - 3_600_000), 'upwind', 400).status).toBe('available')
    expect(calculateWindProgress(north, window370, modelled(0, midpoint + 3_600_001), 'upwind', 400)).toEqual({
      status: 'unavailable', reason: 'wind-reference-age', distanceMeters: 400,
    })
    expect(calculateWindProgress(north, window370, { degrees: 0, source: 'modelled' }, 'upwind', 400)).toMatchObject({
      reason: 'wind-reference-age',
    })
    expect(calculateWindProgress(north, window370, manual(0), 'upwind', 400).status).toBe('available')
  })

  it.each([
    ['reaching', 'reaching'],
    ['mixed', 'mixed'],
    ['unavailable', 'sector-unavailable'],
  ] as const)('reports a %s window without progress but keeps distance', (classification, reason) => {
    expect(calculateWindProgress(straight(300, 0), window370, manual(0), classification, 412)).toEqual({
      status: 'unavailable', reason, distanceMeters: 412,
    })
  })

  it('reports missing or insufficient position data', () => {
    const one = track([{ seconds: 10, north: 0, east: 0 }])
    expect(calculateWindProgress(one, window370, manual(0), 'upwind', 10)).toMatchObject({ reason: 'no-end-position' })
    const stationary = track([{ seconds: 0, north: 0, east: 0 }, { seconds: 370, north: 0, east: 0 }])
    expect(calculateWindProgress(stationary, window370, manual(0), 'upwind', 10)).toMatchObject({ reason: 'insufficient-positions' })
    const invalid = track([
      { seconds: 0, north: 0, east: 0, lat: Number.NaN },
      { seconds: 370, north: 0, east: 0, lat: 91 },
    ])
    expect(calculateWindProgress(invalid, window370, manual(0), 'upwind', 10)).toMatchObject({ reason: 'no-start-position' })
    expect(calculateWindProgress(straight(300, 0), null, manual(0), 'upwind', 10)).toMatchObject({ reason: 'sector-unavailable' })
    expect(calculateWindProgress(straight(300, 0), window370, null, 'upwind', 10)).toMatchObject({ reason: 'sector-unavailable' })
  })

  it('takes the nearest valid sample to the window start and end instants, outside the window if needed', () => {
    const result = available(calculateWindProgress(track([
      { seconds: -8, north: -50, east: 0 },
      { seconds: 0, north: 0, east: 0, lat: Number.NaN },
      { seconds: 6, north: 30, east: 0 },
      { seconds: 366, north: 330, east: 0 },
      { seconds: 372, north: 400, east: 0 },
    ]), window370, manual(0), 'upwind', 500))
    // Start: +6 s beats −8 s and the invalid sample at 0 s; end: 372 s (2 s away) beats 366 s.
    expect(result.progressMeters).toBeCloseTo(370, 0)
    expect(result.durationSeconds).toBe(370)
    expect(result.startTimeMs).toBe(start)
    expect(result.endTimeMs).toBe(start + 370_000)
  })

  it('accepts a sample exactly 10 s away and reports a missing start or end beyond that', () => {
    const edge = track([{ seconds: 10, north: 0, east: 0 }, { seconds: 360, north: 300, east: 0 }])
    expect(available(calculateWindProgress(edge, window370, manual(0), 'upwind', 400)).progressMeters).toBeCloseTo(300, 0)
    const lateStart = track([{ seconds: 10.001, north: 0, east: 0 }, { seconds: 370, north: 300, east: 0 }])
    expect(calculateWindProgress(lateStart, window370, manual(0), 'upwind', 400)).toMatchObject({ reason: 'no-start-position' })
    const earlyEnd = track([{ seconds: 0, north: 0, east: 0 }, { seconds: 359.999, north: 300, east: 0 }])
    expect(calculateWindProgress(earlyEnd, window370, manual(0), 'upwind', 400)).toMatchObject({ reason: 'no-end-position' })
  })

  it('leaves efficiency unavailable without Summary distance', () => {
    expect(available(calculateWindProgress(straight(300, 0), window370, manual(0), 'upwind', null)).efficiency).toBeNull()
    expect(available(calculateWindProgress(straight(300, 0), window370, manual(0), 'upwind', 0)).efficiency).toBeNull()
  })
})

describe('P-perspective gain and gaps at the same instants', () => {
  /** Straight two-sample track in the wind-axis frame (along towards the axis bearing, lateral to its right). */
  function axisTrack(axisBearing: number, from: [number, number], to: [number, number]) {
    const radians = axisBearing * Math.PI / 180
    const toNorthEast = ([along, lateral]: [number, number]) => ({
      north: along * Math.cos(radians) - lateral * Math.sin(radians),
      east: along * Math.sin(radians) + lateral * Math.cos(radians),
    })
    return track([
      { seconds: 0, ...toNorthEast(from) },
      { seconds: 370, ...toNorthEast(to) },
    ])
  }

  function pair(
    twd: number,
    sector: 'upwind' | 'downwind',
    p: { from: [number, number], to: [number, number] },
    c: { from: [number, number], to: [number, number] },
  ) {
    const axis = sector === 'upwind' ? twd : twd + 180
    const progress = (t: { from: [number, number], to: [number, number] }) => available(calculateWindProgress(
      axisTrack(axis, t.from, t.to), window370, manual(twd), sector, 500,
    ))
    return calculateProgressDifference(progress(p), progress(c))!
  }

  it('states P gained windward on C and the gap line, with gain = end gap − start gap', () => {
    const difference = pair(0, 'upwind', { from: [-20, 0], to: [380, 0] }, { from: [0, 0], to: [340, 0] })
    expect(difference.startGap.alongMeters).toBeCloseTo(-20, 1)
    expect(difference.endGap.alongMeters).toBeCloseTo(40, 1)
    expect(difference.gainMeters).toBeCloseTo(difference.endGap.alongMeters - difference.startGap.alongMeters, 9)
    expect(difference.status).toBe('difference')
    expect(formatProgressDifference(difference))
      .toBe('P gained 60 m to windward on C — equivalent to about 60 s of sailing.')
    expect(formatProgressGaps(difference))
      .toBe('At 11:37:35 P 20 m to leeward of C → at 11:43:45 40 m to windward of C')
  })

  it('states P lost windward on C', () => {
    const difference = pair(0, 'upwind', { from: [0, 0], to: [340, 0] }, { from: [-20, 0], to: [380, 0] })
    expect(difference.gainMeters).toBeCloseTo(-60, 1)
    expect(formatProgressDifference(difference))
      .toBe('P lost 60 m to windward on C — equivalent to about 60 s of sailing.')
    expect(formatProgressGaps(difference))
      .toBe('At 11:37:35 P 20 m to windward of C → at 11:43:45 40 m to leeward of C')
  })

  it('states downwind gain and loss with downwind/upwind-of-C gaps', () => {
    const gained = pair(0, 'downwind', { from: [-20, 0], to: [380, 0] }, { from: [0, 0], to: [340, 0] })
    expect(formatProgressDifference(gained))
      .toBe('P gained 60 m to leeward on C — equivalent to about 60 s of sailing.')
    expect(formatProgressGaps(gained))
      .toBe('At 11:37:35 P 20 m upwind of C → at 11:43:45 40 m downwind of C')
    const lost = pair(0, 'downwind', { from: [0, 0], to: [340, 0] }, { from: [-20, 0], to: [380, 0] })
    expect(formatProgressDifference(lost))
      .toBe('P lost 60 m to leeward on C — equivalent to about 60 s of sailing.')
    expect(formatProgressGaps(lost))
      .toBe('At 11:37:35 P 20 m downwind of C → at 11:43:45 40 m upwind of C')
  })

  it('is Similar within 5 s regardless of direction', () => {
    const upwind = pair(0, 'upwind', { from: [0, 0], to: [400, 0] }, { from: [0, 0], to: [396, 0] })
    expect(upwind.status).toBe('similar')
    expect(formatProgressDifference(upwind)).toBe('P and C made similar progress to windward (within 5 s).')
    const downwind = pair(0, 'downwind', { from: [0, 0], to: [396, 0] }, { from: [0, 0], to: [400, 0] })
    expect(formatProgressDifference(downwind)).toBe('P and C made similar progress to leeward (within 5 s).')
    const beyond = pair(0, 'upwind', { from: [0, 0], to: [410, 0] }, { from: [0, 0], to: [400, 0] })
    expect(beyond.seconds).toBeGreaterThan(5)
    expect(beyond.status).toBe('difference')
  })

  it('reads level with C below 10 m and states the gap from 10 m', () => {
    const startLevel = pair(0, 'upwind', { from: [9.9, 0], to: [400, 0] }, { from: [0, 0], to: [389.8, 0] })
    expect(formatProgressGaps(startLevel)).toBe('At 11:37:35 P level with C → at 11:43:45 10 m to windward of C')
    const endLevel = pair(0, 'upwind', { from: [10.2, 0], to: [399.9, 0] }, { from: [0, 0], to: [400, 0] })
    expect(formatProgressGaps(endLevel)).toBe('At 11:37:35 P 10 m to windward of C → at 11:43:45 level with C')
    const negative = pair(0, 'upwind', { from: [-9.9, 0], to: [400, 0] }, { from: [0, 0], to: [410.2, 0] })
    expect(formatProgressGaps(negative)).toBe('At 11:37:35 P level with C → at 11:43:45 10 m to leeward of C')
  })

  it('adds the wide lateral separation caution above 150 m at either instant', () => {
    const narrow = pair(0, 'upwind', { from: [0, 0], to: [400, 0] }, { from: [0, 149], to: [400, 149] })
    expect(narrow.wideLateralSeparation).toBe(false)
    expect(formatProgressGaps(narrow)).not.toContain('wide lateral separation')
    const wideAtEnd = pair(0, 'upwind', { from: [0, 0], to: [400, 0] }, { from: [0, 100], to: [400, 151] })
    expect(wideAtEnd.wideLateralSeparation).toBe(true)
    expect(formatProgressGaps(wideAtEnd)).toMatch(/ · wide lateral separation$/)
    const wideAtStart = pair(0, 'upwind', { from: [0, 151], to: [400, 0] }, { from: [0, 0], to: [400, 0] })
    expect(wideAtStart.wideLateralSeparation).toBe(true)
  })

  it('is circular-safe near 0°/360° for both sectors', () => {
    for (const twd of [355, 5, 0, 180, 359.5]) {
      const up = pair(twd, 'upwind', { from: [-20, 0], to: [380, 0] }, { from: [0, 0], to: [340, 0] })
      expect(up.startGap.alongMeters).toBeCloseTo(-20, 0)
      expect(up.endGap.alongMeters).toBeCloseTo(40, 0)
      expect(up.gainMeters).toBeCloseTo(60, 0)
      const down = pair(twd, 'downwind', { from: [-20, 0], to: [380, 0] }, { from: [0, 0], to: [340, 0] })
      expect(down.startGap.alongMeters).toBeCloseTo(-20, 0)
      expect(down.gainMeters).toBeCloseTo(60, 0)
    }
  })

  it('is absent when sectors differ, one Activity is unavailable or Comparison is missing', () => {
    const up = available(calculateWindProgress(straight(300, 0), window370, manual(0), 'upwind', 400))
    const down = available(calculateWindProgress(straight(300, 180), window370, manual(0), 'downwind', 400))
    expect(calculateProgressDifference(up, down)).toBeNull()
    expect(calculateProgressDifference(up, { status: 'unavailable', reason: 'course-off-axis', distanceMeters: 100 })).toBeNull()
    expect(calculateProgressDifference({ status: 'unavailable', reason: 'mixed', distanceMeters: 1 }, up)).toBeNull()
    expect(calculateProgressDifference(up, undefined)).toBeNull()
  })
})
