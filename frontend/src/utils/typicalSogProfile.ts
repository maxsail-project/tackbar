import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { maneuverCourseReferencesFromEvidence, prepareCourseEvidence } from './maneuverCourseChange'
import { extractManeuverProfile, prepareManeuverSampleIndex, type ManeuverProfilePoint } from './maneuverProfiles'
import { relativeCogProfile } from './typicalCogProfile'

export interface TypicalSogGridPoint {
  offsetSeconds: number
  medianSogKn: number | null
  contributorCount: number
}

export interface TypicalSogProfile {
  status: 'ready' | 'no_eligible_maneuvers' | 'insufficient_maneuvers'
  detectedCount: number
  windowEligibleCount: number
  angularBandSelectedCount: number | null
  coverageEligibleCount: number
  grid: TypicalSogGridPoint[]
}

export interface PreparedSogManeuver {
  courseChangeDeg: number | null
  nominalCoverage: number
  grid: (number | null)[]
  cogNominalCoverage?: number
  cogGrid?: (number | null)[] | null
}

export interface PreparedSogPopulation {
  detectedCount: number
  windowEligibleCount: number
  missingCourseCount: number
  maneuvers: PreparedSogManeuver[]
}

export interface TypicalCogProfile extends Omit<TypicalSogProfile, 'grid'> {
  grid: { offsetSeconds: number, medianCogDeg: number | null, contributorCount: number }[]
}

function sogAtOffset(points: readonly ManeuverProfilePoint[], offsetSeconds: number): number | null {
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.relativeTimeSeconds === offsetSeconds) return point.value

    const previous = points[index - 1]
    if (
      previous
      && point.connectToPrevious
      && previous.relativeTimeSeconds < offsetSeconds
      && offsetSeconds < point.relativeTimeSeconds
    ) {
      const fraction = (offsetSeconds - previous.relativeTimeSeconds)
        / (point.relativeTimeSeconds - previous.relativeTimeSeconds)
      return previous.value + fraction * (point.value - previous.value)
    }
  }
  return null
}

function median(values: number[]): number {
  values.sort((first, second) => first - second)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2
}

/** Recompute only when the Activity, event set or Analysis Window changes. */
export function prepareSogManeuverPopulation(
  maneuvers: readonly Maneuver[],
  samples: readonly TrackSample[],
  analysisWindow: AnalysisWindowRange,
): PreparedSogPopulation {
  const prepared: PreparedSogManeuver[] = []
  const courseEvidence = maneuvers.length > 0 ? prepareCourseEvidence(samples, analysisWindow) : []
  const sampleIndex = maneuvers.length > 0 ? prepareManeuverSampleIndex(samples) : undefined
  let windowEligibleCount = 0
  let missingCourseCount = 0
  for (const maneuver of maneuvers) {
    const profile = extractManeuverProfile(maneuver, samples, analysisWindow, sampleIndex)
    if (profile === null) continue
    windowEligibleCount += 1
    const references = maneuverCourseReferencesFromEvidence(maneuver, courseEvidence, analysisWindow)
    const courseChangeDeg = references === null ? null : Math.abs(references.signedChangeDeg)
    if (courseChangeDeg === null) missingCourseCount += 1
    const relativeCog = relativeCogProfile(profile.cog.points, references)
    prepared.push({
      courseChangeDeg,
      nominalCoverage: profile.sog.nominalCoverage,
      grid: Array.from({ length: 51 }, (_, index) => sogAtOffset(profile.sog.points, index - 25)),
      cogNominalCoverage: profile.cog.nominalCoverage,
      cogGrid: relativeCog === null ? null : Array.from({ length: 51 }, (_, index) => sogAtOffset(relativeCog, index - 25)),
    })
  }
  return { detectedCount: maneuvers.length, windowEligibleCount, missingCourseCount, maneuvers: prepared }
}

export function aggregatePreparedSogPopulation(
  population: PreparedSogPopulation,
  minimumDegrees: number,
  maximumDegrees: number,
): TypicalSogProfile {
  const aggregate = aggregatePreparedSignalPopulation(population, minimumDegrees, maximumDegrees, 'sog')
  return { ...aggregate, grid: aggregate.grid.map((point) => ({
    offsetSeconds: point.offsetSeconds, medianSogKn: point.median, contributorCount: point.contributorCount,
  })) }
}

export function aggregatePreparedCogPopulation(
  population: PreparedSogPopulation,
  minimumDegrees: number,
  maximumDegrees: number,
): TypicalCogProfile {
  const aggregate = aggregatePreparedSignalPopulation(population, minimumDegrees, maximumDegrees, 'cog')
  return { ...aggregate, grid: aggregate.grid.map((point) => ({
    offsetSeconds: point.offsetSeconds, medianCogDeg: point.median, contributorCount: point.contributorCount,
  })) }
}

function aggregatePreparedSignalPopulation(
  population: PreparedSogPopulation,
  minimumDegrees: number,
  maximumDegrees: number,
  signal: 'sog' | 'cog',
) {
  const selected = population.maneuvers.filter((maneuver) => maneuver.courseChangeDeg !== null
    && maneuver.courseChangeDeg >= minimumDegrees - 1e-9
    && maneuver.courseChangeDeg <= maximumDegrees + 1e-9)
  const eligible = selected.filter((maneuver) => signal === 'sog'
    ? maneuver.nominalCoverage >= 0.65
    : maneuver.cogGrid !== null && maneuver.cogGrid !== undefined && (maneuver.cogNominalCoverage ?? 0) >= 0.65)
  const status: TypicalSogProfile['status'] = eligible.length >= 3 ? 'ready'
    : eligible.length === 0 ? 'no_eligible_maneuvers' : 'insufficient_maneuvers'
  const grid = Array.from({ length: 51 }, (_, index) => {
    const values = eligible.flatMap((maneuver) => {
      const value = signal === 'sog' ? maneuver.grid[index] : maneuver.cogGrid![index]
      return value === null ? [] : [value]
    })
    return {
      offsetSeconds: index - 25,
      median: status === 'ready' && values.length > 0 ? median(values) : null,
      contributorCount: values.length,
    }
  })
  return {
    status,
    detectedCount: population.detectedCount,
    windowEligibleCount: population.windowEligibleCount,
    angularBandSelectedCount: selected.length,
    coverageEligibleCount: eligible.length,
    grid,
  }
}

/** Build one Activity's unsmoothed SOG median; call independently for P and C. */
export function aggregateTypicalSogProfile(
  maneuvers: readonly Maneuver[],
  samples: readonly TrackSample[],
  analysisWindow: AnalysisWindowRange,
): TypicalSogProfile {
  const contributors: number[][] = Array.from({ length: 51 }, () => [])
  let windowEligibleCount = 0
  let coverageEligibleCount = 0
  const sampleIndex = maneuvers.length > 0 ? prepareManeuverSampleIndex(samples) : undefined

  for (const maneuver of maneuvers) {
    const profile = extractManeuverProfile(maneuver, samples, analysisWindow, sampleIndex)
    if (profile === null) continue
    windowEligibleCount += 1
    if (profile.sog.nominalCoverage < 0.65) continue
    coverageEligibleCount += 1

    for (let index = 0; index < contributors.length; index += 1) {
      const value = sogAtOffset(profile.sog.points, index - 25)
      if (value !== null) contributors[index].push(value)
    }
  }

  const status = coverageEligibleCount >= 3
    ? 'ready'
    : coverageEligibleCount === 0 ? 'no_eligible_maneuvers' : 'insufficient_maneuvers'

  return {
    status,
    detectedCount: maneuvers.length,
    windowEligibleCount,
    angularBandSelectedCount: null,
    coverageEligibleCount,
    grid: contributors.map((values, index) => ({
      offsetSeconds: index - 25,
      medianSogKn: status === 'ready' && values.length > 0 ? median(values) : null,
      contributorCount: values.length,
    })),
  }
}
