import { describe, expect, it } from 'vitest'
import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { maneuverCourseReferencesFromEvidence, prepareCourseEvidence, type PreparedCourseRun } from './maneuverCourseChange'
import { extractManeuverProfile, profileValueAtOffset } from './maneuverProfiles'
import { prepareManeuverTrace } from './maneuverTrace'
import { relativeCogProfile } from './typicalCogProfile'
import {
  aggregatePreparedCogPopulation, aggregatePreparedHeelPopulation, aggregatePreparedSogPopulation,
  prepareSogManeuverPopulation, type PreparedSogPopulation,
} from './typicalSogProfile'

const origin = Date.parse('2026-10-25T12:00:00Z')
const utc = (second: number) => new Date(origin + second * 1_000).toISOString()
const window: AnalysisWindowRange = { start: origin + 100_000, end: origin + 900_000 }
const tolerance = 1e-8

function fixture(duplicateUtc: boolean) {
  const samples: TrackSample[] = Array.from({ length: 950 }, (_, index) => ({
    utc: utc(index), lat: 38 + index / 100_000, lon: -0.2 + index / 100_000,
    dist: 2, sog: 5 + Math.sin(index / 11),
    cog: index % 150 < 75 ? 359 + Math.sin(index / 13) : 30 + Math.sin(index / 13),
    heel: -8 + Math.sin(index / 9), hdg: null, trim: null,
  }))
  if (duplicateUtc) {
    for (const index of [240, 530, 720]) {
      samples.splice(index, 0, { ...samples[index], utc: samples[index - 1].utc, sog: 2, cog: 1, heel: 12 })
    }
  }
  const maneuvers: Maneuver[] = [225, 375, 525, 675, 825].map((center) => ({
    start_time: utc(center - 5), center_time: utc(center), end_time: utc(center + 5),
    heading_change_deg: null, course_change_deg: null, peak_turn_rate_deg_s: null,
    peak_turn_rate_time: null, duration_s: 10,
  }))
  return { samples, maneuvers }
}

/** The pre-b355806 per-point circular reduction, with its original run boundary. */
function previousCourseEvidence(samples: readonly TrackSample[], analysisWindow: AnalysisWindowRange): PreparedCourseRun[] {
  const runs: { time: number, cog: number }[][] = []
  let run: { time: number, cog: number }[] = []
  const finish = () => { if (run.length > 0) runs.push(run); run = [] }
  for (const sample of samples) {
    const time = Date.parse(sample.utc)
    if (!Number.isFinite(time) || time < analysisWindow.start || time > analysisWindow.end
      || sample.cog === null || !Number.isFinite(sample.cog)
      || sample.sog === null || !Number.isFinite(sample.sog) || sample.sog < 0) {
      finish()
      continue
    }
    if (run.length > 0 && (time <= run.at(-1)!.time || time - run.at(-1)!.time > 10_000)) finish()
    run.push({ time, cog: ((sample.cog % 360) + 360) % 360 })
  }
  finish()
  return runs.map((points) => ({
    times: points.map((point) => point.time),
    smoothed: points.map((point) => {
      const neighbors = points.filter((candidate) => Math.abs(candidate.time - point.time) <= 2_000)
      const sine = neighbors.reduce((sum, candidate) => sum + Math.sin(candidate.cog * Math.PI / 180), 0)
      const cosine = neighbors.reduce((sum, candidate) => sum + Math.cos(candidate.cog * Math.PI / 180), 0)
      return Math.hypot(sine, cosine) <= 1e-12 * neighbors.length
        ? null : ((Math.atan2(sine, cosine) * 180 / Math.PI) + 360) % 360
    }),
  }))
}

/** The prior population path: full profile traversal and per-point course smoothing. */
function previousPopulation(maneuvers: readonly Maneuver[], samples: readonly TrackSample[]): PreparedSogPopulation {
  const courseEvidence = previousCourseEvidence(samples, window)
  const prepared: PreparedSogPopulation['maneuvers'] = []
  let windowEligibleCount = 0
  let missingCourseCount = 0
  for (const maneuver of maneuvers) {
    const profile = extractManeuverProfile(maneuver, samples, window)
    if (profile === null) continue
    windowEligibleCount += 1
    const references = maneuverCourseReferencesFromEvidence(maneuver, courseEvidence, window)
    const courseChangeDeg = references === null ? null : Math.abs(references.signedChangeDeg)
    if (courseChangeDeg === null) missingCourseCount += 1
    const relativeCog = relativeCogProfile(profile.cog.points, references)
    const absoluteHeel = profile.heel.points.map((point) => ({ ...point, value: Math.abs(point.value) }))
    prepared.push({
      courseChangeDeg,
      nominalCoverage: profile.sog.nominalCoverage,
      grid: Array.from({ length: 51 }, (_, index) => profileValueAtOffset(profile.sog.points, index - 25)),
      cogNominalCoverage: profile.cog.nominalCoverage,
      cogGrid: relativeCog === null ? null : Array.from({ length: 51 }, (_, index) => profileValueAtOffset(relativeCog, index - 25)),
      heelNominalCoverage: profile.heel.nominalCoverage,
      heelGrid: Array.from({ length: 51 }, (_, index) => profileValueAtOffset(absoluteHeel, index - 25)),
      trace: prepareManeuverTrace(profile.position, references),
    })
  }
  return { detectedCount: maneuvers.length, windowEligibleCount, missingCourseCount, maneuvers: prepared }
}

function expectEquivalent(actual: unknown, previous: unknown, path = 'result'): void {
  if (typeof previous === 'number') {
    expect(typeof actual, path).toBe('number')
    const difference = Math.abs((actual as number) - previous)
    // courseChangeDeg is a circularly derived magnitude. cogGrid and the typical
    // COG median are signed relative offsets, so their numeric distance is linear.
    const distance = path.endsWith('.courseChangeDeg')
      ? Math.min(difference % 360, 360 - difference % 360) : difference
    expect(distance, path).toBeLessThanOrEqual(tolerance)
  } else if (Array.isArray(previous)) {
    expect(Array.isArray(actual), path).toBe(true)
    expect((actual as unknown[]).length, path).toBe(previous.length)
    previous.forEach((value, index) => expectEquivalent((actual as unknown[])[index], value, `${path}[${index}]`))
  } else if (previous !== null && typeof previous === 'object') {
    expect(actual !== null && typeof actual === 'object' && !Array.isArray(actual), path).toBe(true)
    const expected = previous as Record<string, unknown>
    const received = actual as Record<string, unknown>
    expect(Object.keys(received).sort(), path).toEqual(Object.keys(expected).sort())
    for (const key of Object.keys(expected)) expectEquivalent(received[key], expected[key], `${path}.${key}`)
  } else {
    expect(actual, path).toBe(previous)
  }
}

describe('b355806 population equivalence on identical input', () => {
  it.each([false, true])('preserves complete profiles and typical SOG/COG/HEEL with duplicate UTC = %s', (duplicateUtc) => {
    const { samples, maneuvers } = fixture(duplicateUtc)
    const previous = previousPopulation(maneuvers, samples)
    const current = prepareSogManeuverPopulation(maneuvers, samples, window)
    expect(previous.maneuvers.length).toBeGreaterThan(0)
    expect(previous.maneuvers.some((maneuver) => maneuver.courseChangeDeg !== null)).toBe(true)
    expectEquivalent(current, previous)

    const oldCourse = previousCourseEvidence(samples, window)
    const newCourse = prepareCourseEvidence(samples, window)
    expect(newCourse.map((run) => run.times)).toEqual(oldCourse.map((run) => run.times))
    for (const [runIndex, run] of oldCourse.entries()) {
      for (const [index, angle] of run.smoothed.entries()) {
        const currentAngle = newCourse[runIndex].smoothed[index]
        if (angle === null) expect(currentAngle).toBeNull()
        else {
          expect(currentAngle).not.toBeNull()
          const difference = Math.abs(currentAngle! - angle) % 360
          expect(Math.min(difference, 360 - difference)).toBeLessThanOrEqual(tolerance)
        }
      }
    }
    for (const aggregate of [aggregatePreparedSogPopulation, aggregatePreparedCogPopulation, aggregatePreparedHeelPopulation]) {
      const expected = aggregate(previous, 0, 180)
      expect(expected.status).toBe('ready')
      expect(expected.grid.some((point) => point.contributorCount >= 3)).toBe(true)
      expectEquivalent(aggregate(current, 0, 180), expected)
    }
  })
})
