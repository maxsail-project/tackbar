import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import type { EffectiveTwd } from './windContext'
import {
  calculateProgressDifference,
  calculateWindProgress,
  formatProgressDifference,
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

  it('reports insufficient position data and uses only valid in-window positions', () => {
    const one = track([{ seconds: 10, north: 0, east: 0 }])
    expect(calculateWindProgress(one, window370, manual(0), 'upwind', 10)).toMatchObject({ reason: 'insufficient-positions' })
    const stationary = track([{ seconds: 0, north: 0, east: 0 }, { seconds: 100, north: 0, east: 0 }])
    expect(calculateWindProgress(stationary, window370, manual(0), 'upwind', 10)).toMatchObject({ reason: 'insufficient-positions' })
    const invalid = track([
      { seconds: 0, north: 0, east: 0, lat: Number.NaN },
      { seconds: 100, north: 0, east: 0, lat: 91 },
    ])
    expect(calculateWindProgress(invalid, window370, manual(0), 'upwind', 10)).toMatchObject({ reason: 'insufficient-positions' })
    expect(calculateWindProgress(straight(300, 0), null, manual(0), 'upwind', 10)).toMatchObject({ reason: 'sector-unavailable' })
    expect(calculateWindProgress(straight(300, 0), window370, null, 'upwind', 10)).toMatchObject({ reason: 'sector-unavailable' })

    // Leading invalid position and out-of-window samples are skipped; gaps are irrelevant to net displacement.
    const gapped = track([
      { seconds: -50, north: -900, east: 0 },
      { seconds: 0, north: 0, east: 0, lat: Number.NaN },
      { seconds: 20, north: 100, east: 0 },
      { seconds: 300, north: 350, east: 0 },
      { seconds: 400, north: 2_000, east: 0 },
    ])
    const result = available(calculateWindProgress(gapped, window370, manual(0), 'upwind', 300))
    expect(result.progressMeters).toBeCloseTo(250, 0)
    expect(result.durationSeconds).toBe(280)
  })

  it('leaves efficiency unavailable without Summary distance', () => {
    expect(available(calculateWindProgress(straight(300, 0), window370, manual(0), 'upwind', null)).efficiency).toBeNull()
    expect(available(calculateWindProgress(straight(300, 0), window370, manual(0), 'upwind', 0)).efficiency).toBeNull()
  })
})

describe('neutral P−C progress difference', () => {
  const eligible = (sector: 'upwind' | 'downwind', progressMeters: number, speed: number): WindProgress => ({
    status: 'available', sector, progressMeters, distanceMeters: progressMeters * 1.4, efficiency: 0.7,
    durationSeconds: progressMeters / speed, progressSpeedMetersPerSecond: speed, netBearingDegrees: 0,
  })

  it('reports metres and equivalent seconds from the mean progress speed', () => {
    const difference = calculateProgressDifference(eligible('upwind', 609, 1.65), eligible('upwind', 569, 1.54))!
    expect(difference.status).toBe('difference')
    expect(difference.meters).toBe(40)
    expect(difference.seconds).toBeCloseTo(40 / 1.595)
    expect(formatProgressDifference(difference)).toBe('P made 40 m more progress to windward than C — equivalent to about 25 s of sailing.')
    const negative = calculateProgressDifference(eligible('downwind', 626, 2.4), eligible('downwind', 679, 2.6))!
    expect(formatProgressDifference(negative)).toBe('C made 53 m more progress to leeward than P — equivalent to about 21 s of sailing.')
  })

  it('words P more, C more and Similar for both sectors', () => {
    const words = (sector: 'upwind' | 'downwind', p: number, c: number) =>
      formatProgressDifference(calculateProgressDifference(eligible(sector, p, 2), eligible(sector, c, 2))!)
    expect(words('upwind', 200, 100)).toBe('P made 100 m more progress to windward than C — equivalent to about 50 s of sailing.')
    expect(words('upwind', 100, 200)).toBe('C made 100 m more progress to windward than P — equivalent to about 50 s of sailing.')
    expect(words('downwind', 200, 100)).toBe('P made 100 m more progress to leeward than C — equivalent to about 50 s of sailing.')
    expect(words('downwind', 100, 200)).toBe('C made 100 m more progress to leeward than P — equivalent to about 50 s of sailing.')
    expect(words('downwind', 100, 105)).toBe('P and C made similar progress to leeward (within 5 s).')
  })

  it('is Similar at exactly ±5 s and not beyond', () => {
    expect(calculateProgressDifference(eligible('upwind', 110, 2), eligible('upwind', 100, 2))!.status).toBe('similar')
    expect(calculateProgressDifference(eligible('upwind', 100, 2), eligible('upwind', 110, 2))!.status).toBe('similar')
    expect(formatProgressDifference(calculateProgressDifference(eligible('upwind', 110, 2), eligible('upwind', 100, 2))!))
      .toBe('P and C made similar progress to windward (within 5 s).')
    expect(calculateProgressDifference(eligible('upwind', 110.2, 2), eligible('upwind', 100, 2))!.status).toBe('difference')
  })

  it('is absent when sectors differ, one Activity is ineligible or Comparison is missing', () => {
    expect(calculateProgressDifference(eligible('upwind', 100, 2), eligible('downwind', 100, 2))).toBeNull()
    expect(calculateProgressDifference(eligible('upwind', 100, 2), {
      status: 'unavailable', reason: 'course-off-axis', distanceMeters: 100,
    })).toBeNull()
    expect(calculateProgressDifference({ status: 'unavailable', reason: 'mixed', distanceMeters: 1 }, eligible('upwind', 100, 2))).toBeNull()
    expect(calculateProgressDifference(eligible('upwind', 100, 2), undefined)).toBeNull()
  })
})
