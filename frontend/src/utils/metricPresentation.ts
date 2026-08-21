import type { EnabledReplayMetric, SailingMetric } from '../types/session'
import type { ActivityTrack } from '../types/track'
import { interpolatePosition, nearestSample, type TrackPosition } from './replay'

export interface ReplayPresentation {
  position: TrackPosition | null
  sog: number | null
  cog: number | null
}

export function isEnabledReplayMetric(
  metric: SailingMetric,
): metric is EnabledReplayMetric {
  return metric === 'SOG' || metric === 'COG'
}

export function resolveReplayPresentation(
  samples: ActivityTrack['samples'],
  playbackTime: number,
): ReplayPresentation {
  if (samples.length === 0) {
    return { position: null, sog: null, cog: null }
  }

  const sample = nearestSample(samples, playbackTime)

  return {
    position: interpolatePosition(samples, playbackTime),
    sog: sample.sog !== null && Number.isFinite(sample.sog) ? sample.sog : null,
    cog: sample.cog !== null && Number.isFinite(sample.cog) ? sample.cog : null,
  }
}

export function selectedReplayMetricValue(
  presentation: ReplayPresentation,
  metric: EnabledReplayMetric,
) {
  return metric === 'SOG' ? presentation.sog : presentation.cog
}

export function formatMetricValue(
  metric: EnabledReplayMetric,
  value: number | null,
): string {
  if (value === null) {
    return '—'
  }

  return metric === 'SOG' ? `${value.toFixed(1)} kt` : `${value.toFixed(1)}°`
}

export function formatReplayMetric(
  metric: EnabledReplayMetric,
  value: number | null,
): string {
  return `${metric} ${formatMetricValue(metric, value)}`
}

export function formatAverageSog(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)} kt`
}
