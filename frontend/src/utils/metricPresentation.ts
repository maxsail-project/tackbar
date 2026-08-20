import type { EnabledReplayMetric, SailingMetric } from '../types/session'
import type { ActivityTrack } from '../types/track'
import { interpolatePosition, nearestSample, type TrackPosition } from './replay'

export interface ReplayPresentation {
  position: TrackPosition | null
  metricValue: number | null
}

export function isEnabledReplayMetric(
  metric: SailingMetric,
): metric is EnabledReplayMetric {
  return metric === 'SOG' || metric === 'COG'
}

export function resolveReplayPresentation(
  samples: ActivityTrack['samples'],
  playbackTime: number,
  metric: EnabledReplayMetric,
): ReplayPresentation {
  if (samples.length === 0) {
    return { position: null, metricValue: null }
  }

  const sample = nearestSample(samples, playbackTime)
  const value = metric === 'SOG' ? sample.sog : sample.cog

  return {
    position: interpolatePosition(samples, playbackTime),
    metricValue: value !== null && Number.isFinite(value) ? value : null,
  }
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
