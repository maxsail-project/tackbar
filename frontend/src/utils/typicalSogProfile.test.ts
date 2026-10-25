import { describe, expect, it } from 'vitest'
import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import { aggregateTypicalSogProfile } from './typicalSogProfile'

const origin = Date.parse('2026-10-25T12:00:00.000Z')
const utc = (seconds: number) => new Date(origin + seconds * 1_000).toISOString()
const window = { start: origin, end: origin + 500_000 }
const event = (centerSeconds: number) => ({ center_time: utc(centerSeconds) }) as Maneuver

function sample(seconds: number, sog: number | null): TrackSample {
  return {
    utc: utc(seconds), lat: 0, lon: 0, dist: 0,
    sog, cog: null, hdg: null, heel: null, trim: null,
  }
}

function trace(center: number, sog: number, step = 1) {
  const samples: TrackSample[] = []
  for (let offset = -25; offset <= 25; offset += step) samples.push(sample(center + offset, sog))
  return samples
}

const at = (result: ReturnType<typeof aggregateTypicalSogProfile>, offset: number) => result.grid[offset + 25]

describe('aggregateTypicalSogProfile', () => {
  it('aligns 1 Hz maneuvers to 51 positions and takes one unnormalized value per event', () => {
    const samples = [
      ...trace(50, 4), ...trace(150, 6), ...trace(250, 10),
    ]
    samples.find((point) => point.utc === utc(50))!.sog = 2
    samples.find((point) => point.utc === utc(150))!.sog = 3
    samples.find((point) => point.utc === utc(250))!.sog = 8
    const original = structuredClone(samples)
    const maneuvers = [event(50), event(150), event(250)]
    const result = aggregateTypicalSogProfile(maneuvers, samples, window)

    expect(result).toMatchObject({
      status: 'ready', detectedCount: 3, windowEligibleCount: 3,
      angularBandSelectedCount: null, coverageEligibleCount: 3,
    })
    expect(result.grid).toHaveLength(51)
    expect(result.grid.map((point) => point.offsetSeconds)).toEqual(Array.from({ length: 51 }, (_, index) => index - 25))
    expect(at(result, -25)).toEqual({ offsetSeconds: -25, medianSogKn: 6, contributorCount: 3 })
    expect(at(result, 0)).toEqual({ offsetSeconds: 0, medianSogKn: 3, contributorCount: 3 })
    expect(at(result, 25)).toEqual({ offsetSeconds: 25, medianSogKn: 6, contributorCount: 3 })
    expect(samples).toEqual(original)
  })

  it('uses exact high-cadence points or interpolation across valid irregular brackets only', () => {
    const highCadence = trace(50, 4, 0.5)
    highCadence.find((point) => point.utc === utc(50))!.sog = 2
    const irregular = trace(150, 6).filter((point) => point.utc !== utc(150))
    irregular.push(sample(149.25, 2), sample(150.25, 6))
    irregular.sort((first, second) => Date.parse(first.utc) - Date.parse(second.utc))
    const equality = trace(250, 10).filter((point) => point.utc !== utc(250))
    equality.push(sample(249.25, 4), sample(250.75, 8))
    equality.sort((first, second) => Date.parse(first.utc) - Date.parse(second.utc))

    const result = aggregateTypicalSogProfile(
      [event(50), event(150), event(250)],
      [...highCadence, ...irregular, ...equality],
      window,
    )
    // 2 exact, 5 interpolated at 0.75 of an irregular second, 6 across exactly 1.5 s.
    expect(at(result, 0)).toEqual({ offsetSeconds: 0, medianSogKn: 5, contributorCount: 3 })
    expect(result.coverageEligibleCount).toBe(3)
  })

  it('does not interpolate over missing, invalid, nonmonotonic or >1.5 s gaps', () => {
    const normal = trace(50, 4)
    const missing = trace(150, 6)
    missing.find((point) => point.utc === utc(150))!.sog = null
    const longGap = trace(250, 8).filter((point) => point.utc !== utc(250))
    const invalid = trace(350, 10)
    invalid.find((point) => point.utc === utc(350))!.sog = Number.NaN
    const result = aggregateTypicalSogProfile(
      [event(50), event(150), event(250), event(350)],
      [...normal, ...missing, ...longGap, ...invalid],
      window,
    )
    expect(result.status).toBe('ready')
    expect(at(result, 0)).toEqual({ offsetSeconds: 0, medianSogKn: 4, contributorCount: 1 })
    expect(at(result, 2)).toEqual({ offsetSeconds: 2, medianSogKn: 7, contributorCount: 4 })

    const reversed = trace(150, 6).filter((point) => ![149, 150, 151].some((seconds) => point.utc === utc(seconds)))
    reversed.splice(24, 0, sample(150.5, 2), sample(149.5, 10))
    const reversedResult = aggregateTypicalSogProfile(
      [event(50), event(150), event(250)],
      [...normal, ...reversed, ...trace(250, 8)],
      window,
    )
    expect(at(reversedResult, 0).contributorCount).toBe(2)

    const justOver = trace(150, 6).filter((point) => point.utc !== utc(150))
    justOver.push(sample(149.249, 2), sample(150.75, 10))
    justOver.sort((first, second) => Date.parse(first.utc) - Date.parse(second.utc))
    const breachResult = aggregateTypicalSogProfile(
      [event(50), event(150), event(250)],
      [...normal, ...justOver, ...trace(250, 8)],
      window,
    )
    expect(at(breachResult, 0).contributorCount).toBe(2)
  })

  it('excludes outside-window source points from interpolation while keeping eligible clipped profiles', () => {
    const edge = trace(50, 4, 0.5).filter((point) => point.utc !== utc(30))
    const result = aggregateTypicalSogProfile(
      [event(50), event(150), event(250), event(350), event(550)],
      [...edge, ...trace(150, 6), ...trace(250, 8), ...trace(350, 10)],
      { start: origin + 30_000, end: origin + 400_000 },
    )
    expect(result.coverageEligibleCount).toBe(4)
    expect(at(result, -20)).toEqual({ offsetSeconds: -20, medianSogKn: 8, contributorCount: 3 })
    expect(at(result, -21).contributorCount).toBe(3)
    expect(at(result, -19).contributorCount).toBe(4)
  })

  it('applies nominal 65% coverage at the exact boundary and reports each count separately', () => {
    const exactly = Array.from({ length: 66 }, (_, index) => sample(25 + index * 0.5, 4))
    const below = [...exactly.slice(0, -1), sample(57.499, 6)]
    const result = aggregateTypicalSogProfile(
      [event(50), event(150), event(250), event(350), event(550)],
      [...exactly, ...below.map((point) => ({ ...point, utc: utc((Date.parse(point.utc) - origin) / 1_000 + 100) })), ...trace(250, 8)],
      window,
    )
    expect(result).toMatchObject({
      detectedCount: 5, windowEligibleCount: 4,
      angularBandSelectedCount: null, coverageEligibleCount: 2,
      status: 'insufficient_maneuvers',
    })
    expect(at(result, 0)).toEqual({ offsetSeconds: 0, medianSogKn: null, contributorCount: 2 })
  })

  it('returns explicit 0, 1, 2 and 3 eligible population states with per-offset support', () => {
    const samples = [...trace(50, 4), ...trace(150, 6), ...trace(250, 8)]
    const events = [event(50), event(150), event(250)]
    const expected = [
      ['no_eligible_maneuvers', null],
      ['insufficient_maneuvers', null],
      ['insufficient_maneuvers', null],
      ['ready', 6],
    ] as const
    for (let count = 0; count <= 3; count += 1) {
      const result = aggregateTypicalSogProfile(events.slice(0, count), samples, window)
      expect(result.status).toBe(expected[count][0])
      expect(result.coverageEligibleCount).toBe(count)
      expect(at(result, 0).contributorCount).toBe(count)
      expect(at(result, 0).medianSogKn).toBe(expected[count][1])
    }
  })

  it('returns null grid values where no eligible maneuver has a sample or valid bracket', () => {
    const traces = [50, 150, 250].flatMap((center) => trace(center, center / 10)
      .filter((point) => Math.abs((Date.parse(point.utc) - origin) / 1_000 - center) !== 25))
    const result = aggregateTypicalSogProfile([event(50), event(150), event(250)], traces, window)
    expect(result.status).toBe('ready')
    expect(at(result, -25)).toEqual({ offsetSeconds: -25, medianSogKn: null, contributorCount: 0 })
    expect(at(result, 0).contributorCount).toBe(3)
  })
})
