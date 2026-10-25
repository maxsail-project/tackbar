import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { extractManeuverProfile, type ManeuverProfilePoint } from './maneuverProfiles'

export interface TypicalSogGridPoint {
  offsetSeconds: number
  medianSogKn: number | null
  contributorCount: number
}

export interface TypicalSogProfile {
  status: 'ready' | 'no_eligible_maneuvers' | 'insufficient_maneuvers'
  detectedCount: number
  windowEligibleCount: number
  /** Angular filtering belongs to a later increment. */
  angularBandSelectedCount: null
  coverageEligibleCount: number
  grid: TypicalSogGridPoint[]
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

/** Build one Activity's unsmoothed SOG median; call independently for P and C. */
export function aggregateTypicalSogProfile(
  maneuvers: readonly Maneuver[],
  samples: readonly TrackSample[],
  analysisWindow: AnalysisWindowRange,
): TypicalSogProfile {
  const contributors: number[][] = Array.from({ length: 51 }, () => [])
  let windowEligibleCount = 0
  let coverageEligibleCount = 0

  for (const maneuver of maneuvers) {
    const profile = extractManeuverProfile(maneuver, samples, analysisWindow)
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
