import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createStartLineFrame, deriveStartActivityMetrics, prepareStartSamples } from './startAnalysis'

// Shared with backend/tests/test_session_courses.py (gun suggestion): both
// implementations of the start-line crossing rule must read the same results.
interface Point { lat: number, lon: number }
interface Vectors {
  gun_utc: string
  line: { pin: Point, boat: Point }
  cases: { name: string, samples: (Point & { t: number })[], expected_crossing_s: number | null }[]
}
const vectors = JSON.parse(readFileSync('../test-vectors/start-line-crossing.json', 'utf8')) as Vectors
const gun = Date.parse(vectors.gun_utc)
const endpoint = ({ lat, lon }: Point) => ({ latitude: lat, longitude: lon })

describe('shared start-line crossing vectors (#38 D7/D24, #242)', () => {
  const frame = createStartLineFrame({ pin: endpoint(vectors.line.pin), boat: endpoint(vectors.line.boat) })

  it.each(vectors.cases)('$name', ({ samples, expected_crossing_s: expected }) => {
    const metrics = deriveStartActivityMetrics(prepareStartSamples(samples.map(({ t, lat, lon }) => ({
      utc: new Date(gun + Math.round(t * 1_000)).toISOString(), lat, lon, dist: 0, sog: 5, cog: 0, hdg: null, heel: null, trim: null,
    }))), frame, gun)
    // Every case starts behind the line at the gun, so the forward search applies.
    expect(metrics.distanceAtGunMeters).toBeGreaterThan(0)
    if (expected === null) expect(metrics.crossSeconds).toBeNull()
    else expect(metrics.crossSeconds).toBeCloseTo(expected, 3)
  })
})
