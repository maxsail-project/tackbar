import { useMemo } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { TRIM_SIGNAL_TUNING } from '../config/trimSignal'
import type { TrackSample } from '../types/track'
import {
  buildTrimChartPoints,
  buildTrimSignalPath,
  reduceRawTrimChartPoints,
  resolveTrimSignalDomain,
  trimSignalXPosition,
  trimSignalYPosition,
  TRIM_SIGNAL_VIEWBOX_HEIGHT,
  TRIM_SIGNAL_VIEWBOX_WIDTH,
  type TrimChartPoint,
  type TrimSignalRange,
} from '../utils/metricChartData'
import { formatGpsTime } from '../utils/replay'

interface TrimSignalChartProps {
  primarySamples: TrackSample[] | null
  comparisonSamples?: TrackSample[] | null
  playbackTime: number | null
  primaryLabel: string
  comparisonLabel?: string
}

const TRACE_STYLE = {
  strokeWidth: TRIM_SIGNAL_TUNING.traceStrokeWidth,
  strokeOpacity: TRIM_SIGNAL_TUNING.traceOpacity,
}

function resolveSignalRange(
  primaryPoints: TrimChartPoint[],
  comparisonPoints: TrimChartPoint[],
): TrimSignalRange | null {
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

function axisTrim(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}°`
}

export default function TrimSignalChart({
  primarySamples,
  comparisonSamples,
  playbackTime,
  primaryLabel,
  comparisonLabel,
}: TrimSignalChartProps) {
  const primaryPoints = useMemo(
    () => buildTrimChartPoints(primarySamples ?? []),
    [primarySamples],
  )
  const comparisonPoints = useMemo(
    () => buildTrimChartPoints(comparisonSamples ?? []),
    [comparisonSamples],
  )
  const primaryRawPoints = useMemo(
    () => reduceRawTrimChartPoints(primaryPoints),
    [primaryPoints],
  )
  const comparisonRawPoints = useMemo(
    () => reduceRawTrimChartPoints(comparisonPoints),
    [comparisonPoints],
  )
  const range = useMemo(
    () => resolveSignalRange(primaryPoints, comparisonPoints),
    [comparisonPoints, primaryPoints],
  )
  const domain = useMemo(
    () => resolveTrimSignalDomain([primaryPoints, comparisonPoints]),
    [comparisonPoints, primaryPoints],
  )

  if (range === null || domain === null || playbackTime === null) {
    return (
      <section className="metric-chart metric-chart--empty" aria-label="TRIM chart unavailable">
        <strong>No TRIM track data for the selected Activities</strong>
      </section>
    )
  }

  const primaryPath = buildTrimSignalPath(primaryRawPoints, range, domain)
  const comparisonPath = buildTrimSignalPath(comparisonRawPoints, range, domain)
  const midpoint = range.start + (range.end - range.start) / 2
  const playbackX = trimSignalXPosition(playbackTime, range)
  const zeroY = trimSignalYPosition(0, domain)
  const zeroPercent = (zeroY / TRIM_SIGNAL_VIEWBOX_HEIGHT) * 100
  const accessibleActivities = comparisonSamples
    ? `${primaryLabel} and ${comparisonLabel ?? 'Compare'}`
    : primaryLabel

  return (
    <section className="metric-chart" aria-label="TRIM time-series chart">
      <div className="metric-chart__heading">
        <div>
          <strong>TRIM over GPS time</strong>
          <span>degrees · UTC</span>
        </div>
      </div>
      <div className="metric-chart__canvas metric-chart__canvas--trim">
        <div className="trim-signal-chart">
          <div className="trim-signal-chart__y-axis" aria-hidden="true">
            <span className="trim-signal-chart__y-axis-maximum">{axisTrim(domain.maximum)}</span>
            {domain.maximum !== 0 && domain.minimum !== 0 && (
              <span
                className="trim-signal-chart__y-axis-zero"
                style={{ top: `${zeroPercent}%` }}
              >
                0°
              </span>
            )}
            <span className="trim-signal-chart__y-axis-minimum">{axisTrim(domain.minimum)}</span>
          </div>
          <div className="trim-signal-chart__plot">
            <svg
              viewBox={`0 0 ${TRIM_SIGNAL_VIEWBOX_WIDTH} ${TRIM_SIGNAL_VIEWBOX_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`TRIM signal for ${accessibleActivities}`}
            >
              <g className="trim-signal-chart__grid" aria-hidden="true">
                <line x1="0" x2="1000" y1="8" y2="8" />
                <line x1="0" x2="1000" y1="192" y2="192" />
                <line x1="0" x2="0" y1="8" y2="192" />
                <line x1="500" x2="500" y1="8" y2="192" />
                <line x1="1000" x2="1000" y1="8" y2="192" />
              </g>
              {comparisonPath && (
                <path
                  data-trim-series="comparison"
                  d={comparisonPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.comparison}
                  {...TRACE_STYLE}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {primaryPath && (
                <path
                  data-trim-series="primary"
                  d={primaryPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.primary}
                  {...TRACE_STYLE}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <line
                data-trim-zero-reference="true"
                x1="0"
                x2="1000"
                y1={zeroY}
                y2={zeroY}
                vectorEffect="non-scaling-stroke"
              />
              <line
                data-trim-playback-cursor="true"
                x1={playbackX}
                x2={playbackX}
                y1="8"
                y2="192"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="trim-signal-chart__x-axis" aria-hidden="true">
            <time dateTime={new Date(range.start).toISOString()}>{formatGpsTime(range.start)}</time>
            <time dateTime={new Date(midpoint).toISOString()}>{formatGpsTime(midpoint)}</time>
            <time dateTime={new Date(range.end).toISOString()}>{formatGpsTime(range.end)}</time>
          </div>
        </div>
      </div>
    </section>
  )
}
