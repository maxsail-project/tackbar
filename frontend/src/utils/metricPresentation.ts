import type { EnabledReplayMetric } from '../types/session'
import type { ActivityTrack, TrackSample } from '../types/track'
import { formatFixed, formatSog } from './numberFormat'
import {
  findReplayGap,
  interpolatePosition,
  nearestSample,
  type TrackPosition,
} from './replay'

/**
 * Replay state while `playbackTime` is strictly inside a gap of the Activity (#218 D7): the
 * marker stays at the last recorded sample, greyed, while current telemetry is unavailable.
 */
export interface ReplayNoGpsData {
  lastSample: TrackSample
  position: TrackPosition
  /** Course of that recorded sample, only to orient the greyed marker. */
  lastRecordedCog: number | null
}

export interface ReplayPresentation {
  /** Interpolated position; null inside a gap. */
  position: TrackPosition | null
  sog: number | null
  cog: number | null
  heel: number | null
  trim: number | null
  noGpsData: ReplayNoGpsData | null
}

function finiteOrNull(value: number | null) {
  return value !== null && Number.isFinite(value) ? value : null
}

const UNAVAILABLE_REPLAY_PRESENTATION: ReplayPresentation = {
  position: null,
  sog: null,
  cog: null,
  heel: null,
  trim: null,
  noGpsData: null,
}

/**
 * Replay position and telemetry from `samples` (normally the Analysis Window samples). Gaps
 * are detected on `canonicalSamples`, the full canonical track, so a window boundary inside
 * a gap still reports the gap.
 */
export function resolveReplayPresentation(
  samples: ActivityTrack['samples'],
  playbackTime: number,
  canonicalSamples: ActivityTrack['samples'] = samples,
): ReplayPresentation {
  if (samples.length === 0) return { ...UNAVAILABLE_REPLAY_PRESENTATION }

  const gap = findReplayGap(canonicalSamples, playbackTime)
  if (gap !== null) {
    const lastSample = gap.before
    return {
      ...UNAVAILABLE_REPLAY_PRESENTATION,
      noGpsData: {
        lastSample,
        position: { lat: lastSample.lat, lon: lastSample.lon },
        lastRecordedCog: finiteOrNull(lastSample.cog),
      },
    }
  }

  const sample = nearestSample(samples, playbackTime)

  return {
    position: interpolatePosition(samples, playbackTime),
    sog: finiteOrNull(sample.sog),
    cog: finiteOrNull(sample.cog),
    heel: finiteOrNull(sample.heel),
    trim: finiteOrNull(sample.trim),
    noGpsData: null,
  }
}

export function formatMetricValue(
  metric: EnabledReplayMetric,
  value: number | null,
): string {
  if (value === null) {
    return '—'
  }

  return metric === 'SOG' ? formatSog(value) : `${formatFixed(value, 1)}°`
}

export function formatSignedDegreeValue(value: number | null): string {
  return value === null ? '—' : `${formatFixed(value, 1)}°`
}

export function formatAverageSog(value: number | null): string {
  return formatSog(value)
}
