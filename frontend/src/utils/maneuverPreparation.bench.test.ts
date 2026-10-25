/// <reference types="node" />
import { describe, it } from 'vitest'
import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import { maneuverCourseChangeFromEvidence, prepareCourseEvidence } from './maneuverCourseChange'
import { extractManeuverProfile, prepareManeuverSampleIndex } from './maneuverProfiles'
import { aggregatePreparedSogPopulation, prepareSogManeuverPopulation } from './typicalSogProfile'

const origin = Date.parse('2026-10-25T12:00:00Z')
const stamp = (seconds: number) => new Date(origin + seconds * 1000).toISOString()

function fixture(sampleCount: number, maneuverCount: number) {
  const samples: TrackSample[] = Array.from({ length: sampleCount }, (_, index) => ({
    utc: stamp(index), lat: 0, lon: 0, dist: index * 2,
    sog: 5 + Math.sin(index / 30), cog: (index / 20) % 360,
    heel: Math.sin(index / 8), hdg: null, trim: null,
  }))
  const maneuvers: Maneuver[] = Array.from({ length: maneuverCount }, (_, index) => {
    const center = Math.round((index + 1) * (sampleCount - 1) / (maneuverCount + 1))
    return {
      start_time: stamp(center - 5), center_time: stamp(center), end_time: stamp(center + 5),
      heading_change_deg: null, course_change_deg: null, peak_turn_rate_deg_s: null,
      peak_turn_rate_time: null, duration_s: 10,
    }
  })
  return { samples, maneuvers, window: { start: origin, end: origin + (sampleCount - 1) * 1000 } }
}

function medianDuration(action: () => void): number {
  action()
  const durations = Array.from({ length: 3 }, () => {
    const start = performance.now()
    action()
    return performance.now() - start
  })
  return durations.sort((a, b) => a - b)[1]
}

describe.skipIf(process.env.MANEUVER_BENCH !== '1')('maneuver preparation benchmark', () => {
  it.each([[6_000, 12], [30_000, 90]])('%i samples / %i maneuvers', (sampleCount, maneuverCount) => {
    const { samples, maneuvers, window } = fixture(sampleCount, maneuverCount)
    const extraction = medianDuration(() => {
      for (const maneuver of maneuvers) extractManeuverProfile(maneuver, samples, window)
    })
    const indexing = medianDuration(() => { prepareManeuverSampleIndex(samples) })
    const sampleIndex = prepareManeuverSampleIndex(samples)
    const indexedExtraction = medianDuration(() => {
      for (const maneuver of maneuvers) extractManeuverProfile(maneuver, samples, window, sampleIndex)
    })
    const course = medianDuration(() => { prepareCourseEvidence(samples, window) })
    const courseEvidence = prepareCourseEvidence(samples, window)
    const courseLookup = medianDuration(() => {
      for (const maneuver of maneuvers) maneuverCourseChangeFromEvidence(maneuver, courseEvidence, window)
    })
    const population = prepareSogManeuverPopulation(maneuvers, samples, window)
    const aggregation = medianDuration(() => { aggregatePreparedSogPopulation(population, 0, 180) })
    const total = medianDuration(() => { prepareSogManeuverPopulation(maneuvers, samples, window) })
    console.log(`BENCH ${sampleCount}/${maneuverCount}: extraction=${extraction.toFixed(1)}ms indexing=${indexing.toFixed(1)}ms indexed_extraction=${indexedExtraction.toFixed(1)}ms course=${course.toFixed(1)}ms course_lookup=${courseLookup.toFixed(1)}ms aggregation=${aggregation.toFixed(1)}ms total=${total.toFixed(1)}ms`)
  }, 30_000)
})
