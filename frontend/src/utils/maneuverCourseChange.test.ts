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
