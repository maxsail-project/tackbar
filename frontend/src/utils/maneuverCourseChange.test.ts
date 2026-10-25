import { describe, expect, it } from 'vitest'
import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import { maneuverCourseChangeFromEvidence, maneuverCourseChangeMagnitude, prepareCourseEvidence } from './maneuverCourseChange'

const origin = Date.parse('2026-10-25T12:00:00Z')
const utc = (second: number) => new Date(origin + second * 1000).toISOString()
const event = { start_time: utc(30), center_time: utc(32), end_time: utc(35), heading_change_deg: 90, course_change_deg: null } as Maneuver
const window = { start: origin, end: origin + 60_000 }
const sample = (second: number, cog: number | null, sog: number | null = 5): TrackSample => ({
  utc: utc(second), lat: 0, lon: 0, dist: 0, sog, cog, hdg: null, heel: null, trim: null,
})
const trace = (pre: number, post: number) => Array.from({ length: 26 }, (_, index) => sample(index + 20, index + 20 < 32 ? pre : post))

it('matches the original full-run contextual filters on long irregular and gapped evidence', () => {
  const samples = Array.from({ length: 12_000 }, (_, index) => sample(index + (index % 7) * 0.05,
    index % 211 === 0 ? null : index % 2 ? 359 : 1,
    index % 307 === 0 ? null : 5))
  const longWindow = { start: origin + 100_000, end: origin + 11_900_000 }
  const runs = prepareCourseEvidence(samples, longWindow)
  const circularMean = (values: number[]): number | null => {
    if (values.length === 0) return null
    const sine = values.reduce((sum, value) => sum + Math.sin(value * Math.PI / 180), 0)
    const cosine = values.reduce((sum, value) => sum + Math.cos(value * Math.PI / 180), 0)
    if (Math.hypot(sine, cosine) <= 1e-12 * values.length) return null
    return ((Math.atan2(sine, cosine) * 180 / Math.PI) + 360) % 360
  }
  for (const second of [101, 210, 306, 5_000, 11_885]) {
    const candidate = { ...event, start_time: utc(second), end_time: utc(second + 5) }
    let expected: number | null = null
    for (const run of runs) {
      const start = Date.parse(candidate.start_time)
      const end = Date.parse(candidate.end_time)
      if (run.times[0] > start || run.times.at(-1)! < end) continue
      const pre = run.smoothed.filter((value, index) => value !== null
        && run.times[index] >= start - 10_000 && run.times[index] < start - 2_000) as number[]
      const post = run.smoothed.filter((value, index) => value !== null
        && run.times[index] > end + 2_000 && run.times[index] <= end + 10_000) as number[]
      if (pre.length < 3 || post.length < 3) continue
      const before = circularMean(pre)
      const after = circularMean(post)
      if (before === null || after === null) continue
      expected = Math.abs(((after - before + 540) % 360) - 180)
      break
    }
    expect(maneuverCourseChangeFromEvidence(candidate, runs, longWindow)).toEqual(expected)
  }
})

describe('common maneuver ΔCOG', () => {
  it('uses the same circular course evidence for HIGH and LOW, across 359°/1°', () => {
    const samples = trace(359, 1)
    const high = maneuverCourseChangeMagnitude(event, samples, window)
    const low = maneuverCourseChangeMagnitude({ ...event, heading_change_deg: null, course_change_deg: 80 }, samples, window)
    expect(high).toBeCloseTo(2)
    expect(low).toBeCloseTo(high!)
    expect(maneuverCourseChangeFromEvidence(event, prepareCourseEvidence(samples, window), window)).toBeCloseTo(high!)
  })

  it('excludes missing or insufficient contextual evidence and does not use out-of-window samples', () => {
    const samples = trace(0, 60)
    expect(maneuverCourseChangeMagnitude(event, samples, { start: origin + 27_000, end: window.end })).toBeNull()
    expect(maneuverCourseChangeMagnitude(event, samples.map((point) => ({ ...point, cog: null })), window)).toBeNull()
    expect(maneuverCourseChangeMagnitude(event, samples.filter((point) => ![22, 23, 24, 25, 26, 27].includes((Date.parse(point.utc) - origin) / 1000)), window)).toBeNull()
  })

  it('splits contextual evidence at invalid SOG and source gaps over 10 seconds', () => {
    const invalid = trace(0, 60)
    invalid.find((point) => point.utc === utc(32))!.sog = null
    expect(maneuverCourseChangeMagnitude(event, invalid, window)).toBeNull()
    const gapped = trace(0, 60).filter((point) => !Array.from({ length: 12 }, (_, index) => index + 28).includes((Date.parse(point.utc) - origin) / 1000))
    expect(maneuverCourseChangeMagnitude(event, gapped, window)).toBeNull()
  })
})
