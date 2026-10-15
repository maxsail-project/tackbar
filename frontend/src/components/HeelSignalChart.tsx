import { useMemo } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { HEEL_SIGNAL_TUNING } from '../config/heelSignal'
import type { TrackSample } from '../types/track'
import {
  buildHeelChartPoints,
  buildHeelBuckets,
  buildHeelStepPath,
  heelSignalXPosition,
  heelSignalYPosition,
  HEEL_SIGNAL_VIEWBOX_HEIGHT,
  HEEL_SIGNAL_VIEWBOX_WIDTH,
  resolveHeelSignalDomain,
  type HeelChartPoint,
  type HeelSignalRange,
} from '../utils/metricChartData'
import { formatGpsTime } from '../utils/replay'

interface HeelSignalChartProps {
  primarySamples: TrackSample[] | null
  comparisonSamples?: TrackSample[] | null
  playbackTime: number | null
  primaryLabel: string
  comparisonLabel?: string
}

const TRACE_STYLE = {
  strokeWidth: HEEL_SIGNAL_TUNING.traceStrokeWidth,
  strokeOpacity: HEEL_SIGNAL_TUNING.traceOpacity,
}

function resolveSignalRange(
  primaryPoints: HeelChartPoint[],
  comparisonPoints: HeelChartPoint[],
): HeelSignalRange | null {
  let start: number | null = null
  let end: number | null = null
  for (const points of [primaryPoints, comparisonPoints]) {
    for (const point of points) {
      if (start === null || point.time < start) start = point.time
      if (end === null || point.time > end) end = point.time
    }
  }
  if (start === null || end === null) return null
  return { start, end }
}

function axisHeel(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}°`
}

export default function HeelSignalChart({
  primarySamples,
  comparisonSamples,
  playbackTime,
  primaryLabel,
  comparisonLabel,
}: HeelSignalChartProps) {
  const primaryPoints = useMemo(
    () => buildHeelChartPoints(primarySamples ?? []),
    [primarySamples],
  )
  const comparisonPoints = useMemo(
    () => buildHeelChartPoints(comparisonSamples ?? []),
    [comparisonSamples],
  )
  const primaryBuckets = useMemo(
    () => buildHeelBuckets(primaryPoints),
    [primaryPoints],
  )
  const comparisonBuckets = useMemo(
    () => buildHeelBuckets(comparisonPoints),
    [comparisonPoints],
  )
  const range = useMemo(
    () => resolveSignalRange(primaryPoints, comparisonPoints),
    [comparisonPoints, primaryPoints],
  )
  const domain = useMemo(
    () => resolveHeelSignalDomain([primaryBuckets, comparisonBuckets]),
    [comparisonBuckets, primaryBuckets],
  )

  if (range === null || domain === null || playbackTime === null) {
    return (
      <section className="metric-chart metric-chart--empty" aria-label="HEEL chart unavailable">
        <strong>No HEEL track data for the selected Activities</strong>
      </section>
    )
  }

  const primaryPath = buildHeelStepPath(primaryBuckets, range, domain)
  const comparisonPath = buildHeelStepPath(comparisonBuckets, range, domain)
  const midpoint = range.start + (range.end - range.start) / 2
  const playbackX = heelSignalXPosition(playbackTime, range)
  const zeroY = heelSignalYPosition(0, domain)
  const zeroPercent = (zeroY / HEEL_SIGNAL_VIEWBOX_HEIGHT) * 100
  const accessibleActivities = comparisonSamples
    ? `${primaryLabel} and ${comparisonLabel ?? 'Compare'}`
    : primaryLabel

  return (
    <section className="metric-chart" aria-label="HEEL time-series chart">
      <div className="metric-chart__heading">
        <div>
          <strong>HEEL over GPS time</strong>
          <span>degrees · UTC</span>
        </div>
      </div>
      <div className="metric-chart__canvas metric-chart__canvas--heel">
        <div className="heel-signal-chart">
          <div className="heel-signal-chart__y-axis" aria-hidden="true">
            <span className="heel-signal-chart__y-axis-maximum">{axisHeel(domain.maximum)}</span>
            {domain.maximum !== 0 && domain.minimum !== 0 && (
              <span
                className="heel-signal-chart__y-axis-zero"
                style={{ top: `${zeroPercent}%` }}
              >
                0°
              </span>
            )}
            <span className="heel-signal-chart__y-axis-minimum">{axisHeel(domain.minimum)}</span>
          </div>
          <div className="heel-signal-chart__plot">
            <svg
              viewBox={`0 0 ${HEEL_SIGNAL_VIEWBOX_WIDTH} ${HEEL_SIGNAL_VIEWBOX_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`HEEL signal for ${accessibleActivities}`}
            >
              <g className="heel-signal-chart__grid" aria-hidden="true">
                <line x1="0" x2="1000" y1="8" y2="8" />
                <line x1="0" x2="1000" y1="192" y2="192" />
                <line x1="0" x2="0" y1="8" y2="192" />
                <line x1="500" x2="500" y1="8" y2="192" />
                <line x1="1000" x2="1000" y1="8" y2="192" />
              </g>
              {comparisonPath && (
                <path
                  data-heel-series="comparison"
                  d={comparisonPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.comparison}
                  {...TRACE_STYLE}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {primaryPath && (
                <path
                  data-heel-series="primary"
                  d={primaryPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.primary}
                  {...TRACE_STYLE}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <line
                data-heel-zero-reference="true"
                x1="0"
                x2="1000"
                y1={zeroY}
                y2={zeroY}
                vectorEffect="non-scaling-stroke"
              />
              <line
                data-heel-playback-cursor="true"
                x1={playbackX}
                x2={playbackX}
                y1="8"
                y2="192"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="heel-signal-chart__x-axis" aria-hidden="true">
            <time dateTime={new Date(range.start).toISOString()}>{formatGpsTime(range.start)}</time>
            <time dateTime={new Date(midpoint).toISOString()}>{formatGpsTime(midpoint)}</time>
            <time dateTime={new Date(range.end).toISOString()}>{formatGpsTime(range.end)}</time>
          </div>
        </div>
      </div>
    </section>
  )
}
