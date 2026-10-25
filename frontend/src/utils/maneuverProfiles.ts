import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { timestampToMilliseconds } from './replay'

const PROFILE_HALF_SPAN_MS = 25_000
const PROFILE_SPAN_MS = PROFILE_HALF_SPAN_MS * 2
const MAX_CONTINUOUS_INTERVAL_MS = 1_500

export interface ManeuverProfilePoint {
  utc: string
  relativeTimeSeconds: number
  value: number
  connectToPrevious: boolean
}

export interface ManeuverSignalProfile {
  points: ManeuverProfilePoint[]
  representedTimeSeconds: number
  clippedCoverage: number
  nominalCoverage: number
}

export interface ManeuverProfile {
  centerTime: string
  permittedStartSeconds: number
  permittedEndSeconds: number
  permittedDurationSeconds: number
  sog: ManeuverSignalProfile
  cog: ManeuverSignalProfile
  heel: ManeuverSignalProfile
}

type ProfileSignal = 'sog' | 'cog' | 'heel'

function validValue(sample: TrackSample, signal: ProfileSignal): number | null {
  const value = sample[signal]
  return value !== null && Number.isFinite(value) && (signal !== 'sog' || value >= 0)
    ? value
    : null
}

function sampleTime(sample: TrackSample): number | null {
  try {
    return timestampToMilliseconds(sample.utc)
  } catch {
    return null
  }
}

/** Extract raw evidence for one event; null means its center is outside the window. */
export function extractManeuverProfile(
  maneuver: Maneuver,
  samples: readonly TrackSample[],
  analysisWindow: AnalysisWindowRange,
): ManeuverProfile | null {
  let center: number | null
  try {
    center = timestampToMilliseconds(maneuver.center_time)
  } catch {
    center = null
  }
  if (
    center === null
    || !Number.isFinite(analysisWindow.start)
    || !Number.isFinite(analysisWindow.end)
    || analysisWindow.start > analysisWindow.end
    || center < analysisWindow.start
    || center > analysisWindow.end
  ) return null

  const start = Math.max(center - PROFILE_HALF_SPAN_MS, analysisWindow.start)
  const end = Math.min(center + PROFILE_HALF_SPAN_MS, analysisWindow.end)
  const durationMs = end - start
  const signals: ProfileSignal[] = ['sog', 'cog', 'heel']
  const points = { sog: [] as ManeuverProfilePoint[], cog: [] as ManeuverProfilePoint[], heel: [] as ManeuverProfilePoint[] }
  const representedMs = { sog: 0, cog: 0, heel: 0 }
  let previous: TrackSample | null = null
  let previousTime: number | null = null

  for (const sample of samples) {
    const time = sampleTime(sample)
    const sourceIntervalMs = previousTime !== null && time !== null ? time - previousTime : 0
    const continuous = sourceIntervalMs > 0 && sourceIntervalMs <= MAX_CONTINUOUS_INTERVAL_MS
    const clippedIntervalMs = continuous
      ? Math.max(0, Math.min(time!, end) - Math.max(previousTime!, start))
      : 0

    for (const signal of signals) {
      const value = validValue(sample, signal)
      const previousValid = previous !== null && validValue(previous, signal) !== null
      if (previousValid && value !== null) representedMs[signal] += clippedIntervalMs
      if (durationMs > 0 && time !== null && time >= start && time <= end && value !== null) {
        points[signal].push({
          utc: sample.utc,
          relativeTimeSeconds: (time - center) / 1_000,
          value,
          connectToPrevious: continuous && previousValid && previousTime! >= start,
        })
      }
    }

    previous = sample
    previousTime = time
  }

  function profile(signal: ProfileSignal): ManeuverSignalProfile {
    const representedTimeSeconds = representedMs[signal] / 1_000
    return {
      points: points[signal],
      representedTimeSeconds,
      clippedCoverage: durationMs > 0 ? Math.min(1, representedMs[signal] / durationMs) : 0,
      nominalCoverage: Math.min(1, representedMs[signal] / PROFILE_SPAN_MS),
    }
  }

  return {
    centerTime: maneuver.center_time,
    permittedStartSeconds: (start - center) / 1_000,
    permittedEndSeconds: (end - center) / 1_000,
    permittedDurationSeconds: durationMs / 1_000,
    sog: profile('sog'),
    cog: profile('cog'),
    heel: profile('heel'),
  }
}
