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

export interface ManeuverPositionPoint {
  utc: string
  relativeTimeSeconds: number
  lat: number
  lon: number
  connectToPrevious: boolean
}

/** Original valid GPS positions with the same continuity and coverage rules as the signals. */
export interface ManeuverPositionProfile {
  points: ManeuverPositionPoint[]
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
  position: ManeuverPositionProfile
}

type ProfileSignal = 'sog' | 'cog' | 'heel'

function validValue(sample: TrackSample, signal: ProfileSignal): number | null {
  const value = sample[signal]
  return value !== null && Number.isFinite(value) && (signal !== 'sog' || value >= 0)
    ? value
    : null
}

function validPosition(sample: TrackSample): boolean {
  return Number.isFinite(sample.lat) && Number.isFinite(sample.lon)
    && Math.abs(sample.lat) <= 90 && Math.abs(sample.lon) <= 180
}

/** Exact original value, or linear interpolation only between connected adjacent points. */
export function profileValueAtOffset(
  points: readonly Pick<ManeuverProfilePoint, 'relativeTimeSeconds' | 'value' | 'connectToPrevious'>[],
  offsetSeconds: number,
): number | null {
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

function sampleTime(sample: TrackSample): number | null {
  try {
    return timestampToMilliseconds(sample.utc)
  } catch {
    return null
  }
}

/** Parse UTC once for a population; unordered evidence retains the original full-scan path. */
export interface ManeuverSampleIndex {
  readonly samples: readonly TrackSample[]
  readonly times: readonly (number | null)[]
  readonly ordered: boolean
}

export function prepareManeuverSampleIndex(samples: readonly TrackSample[]): ManeuverSampleIndex {
  const times = samples.map(sampleTime)
  const ordered = times.every((time, index) => time !== null && Number.isFinite(time)
    && (index === 0 || (times[index - 1] !== null && time > times[index - 1]!)))
  return { samples, times, ordered }
}

function firstAtOrAfter(times: readonly (number | null)[], target: number, strict: boolean): number {
  let low = 0
  let high = times.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (strict ? times[middle]! <= target : times[middle]! < target) low = middle + 1
    else high = middle
  }
  return low
}

/** Extract raw evidence for one event; null means its center is outside the window. */
export function extractManeuverProfile(
  maneuver: Maneuver,
  samples: readonly TrackSample[],
  analysisWindow: AnalysisWindowRange,
  sampleIndex?: ManeuverSampleIndex,
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
  const positionPoints: ManeuverPositionPoint[] = []
  let positionRepresentedMs = 0
  let previous: TrackSample | null = null
  let previousTime: number | null = null

  const indexed = sampleIndex?.samples === samples ? sampleIndex : undefined
  const first = indexed?.ordered && samples.length > 0
    ? Math.max(0, firstAtOrAfter(indexed.times, start, false) - 1) : 0
  const last = indexed?.ordered && samples.length > 0
    ? Math.min(samples.length - 1, firstAtOrAfter(indexed.times, end, true)) : samples.length - 1
  if (first > 0) {
    previous = samples[first - 1]
    previousTime = indexed!.times[first - 1]
  }

  for (let index = first; index <= last; index += 1) {
    const sample = samples[index]
    const time = indexed ? indexed.times[index] : sampleTime(sample)
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

    const positionValid = validPosition(sample)
    const previousPositionValid = previous !== null && validPosition(previous)
    if (previousPositionValid && positionValid) positionRepresentedMs += clippedIntervalMs
    if (durationMs > 0 && time !== null && time >= start && time <= end && positionValid) {
      positionPoints.push({
        utc: sample.utc,
        relativeTimeSeconds: (time - center) / 1_000,
        lat: sample.lat,
        lon: sample.lon,
        connectToPrevious: continuous && previousPositionValid && previousTime! >= start,
      })
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
    position: {
      points: positionPoints,
      representedTimeSeconds: positionRepresentedMs / 1_000,
      clippedCoverage: durationMs > 0 ? Math.min(1, positionRepresentedMs / durationMs) : 0,
      nominalCoverage: Math.min(1, positionRepresentedMs / PROFILE_SPAN_MS),
    },
  }
}
