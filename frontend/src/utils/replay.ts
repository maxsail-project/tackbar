import type { TrackSample } from '../types/track'

export const PLAYBACK_SPEEDS = [1, 2, 5, 10] as const

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export interface SurroundingSamples {
  before: TrackSample
  after: TrackSample
}

export interface TrackPosition {
  lat: number
  lon: number
}

export function timestampToMilliseconds(utc: string) {
  const timestamp = Date.parse(utc)
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid UTC timestamp: ${utc}`)
  }
  return timestamp
}

export function clampPlaybackTime(
  playbackTime: number,
  replayStart: number,
  replayEnd: number,
) {
  return Math.min(Math.max(playbackTime, replayStart), replayEnd)
}

export function advancePlaybackTime(
  playbackTime: number,
  realElapsedMilliseconds: number,
  speed: PlaybackSpeed,
  replayStart: number,
  replayEnd: number,
) {
  const elapsed = Math.max(realElapsedMilliseconds, 0)
  return clampPlaybackTime(
    playbackTime + elapsed * speed,
    replayStart,
    replayEnd,
  )
}

export function findSurroundingSamples(
  samples: TrackSample[],
  playbackTime: number,
): SurroundingSamples {
  if (samples.length === 0) {
    throw new Error('Cannot find replay samples in an empty track')
  }

  const first = samples[0]
  const last = samples[samples.length - 1]
  const firstTime = timestampToMilliseconds(first.utc)
  const lastTime = timestampToMilliseconds(last.utc)

  if (playbackTime <= firstTime) return { before: first, after: first }
  if (playbackTime >= lastTime) return { before: last, after: last }

  let low = 0
  let high = samples.length - 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const middleTime = timestampToMilliseconds(samples[middle].utc)

    if (middleTime === playbackTime) {
      return { before: samples[middle], after: samples[middle] }
    }
    if (middleTime < playbackTime) low = middle + 1
    else high = middle - 1
  }

  return { before: samples[high], after: samples[low] }
}

export function interpolationFraction(
  playbackTime: number,
  beforeTime: number,
  afterTime: number,
) {
  if (afterTime <= beforeTime) return 0
  return Math.min(Math.max(
    (playbackTime - beforeTime) / (afterTime - beforeTime),
    0,
  ), 1)
}

export function interpolatePosition(
  samples: TrackSample[],
  playbackTime: number,
): TrackPosition {
  const { before, after } = findSurroundingSamples(samples, playbackTime)
  const fraction = interpolationFraction(
    playbackTime,
    timestampToMilliseconds(before.utc),
    timestampToMilliseconds(after.utc),
  )

  return {
    lat: before.lat + (after.lat - before.lat) * fraction,
    lon: before.lon + (after.lon - before.lon) * fraction,
  }
}

export function nearestSample(samples: TrackSample[], playbackTime: number) {
  const { before, after } = findSurroundingSamples(samples, playbackTime)
  const beforeDistance = Math.abs(
    playbackTime - timestampToMilliseconds(before.utc),
  )
  const afterDistance = Math.abs(
    timestampToMilliseconds(after.utc) - playbackTime,
  )

  return beforeDistance <= afterDistance ? before : after
}

export function formatGpsTime(playbackTime: number) {
  return new Date(playbackTime).toISOString().slice(11, 19)
}
