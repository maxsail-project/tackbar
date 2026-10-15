import { useMemo } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import type { TrackSample } from '../types/track'
import {
  buildSogChartPoints,
  buildSogSignalPath,
  buildSogTrendPoints,
  reduceRawSogChartPoints,
  sogSignalXPosition,
  SOG_SIGNAL_VIEWBOX_HEIGHT,
  SOG_SIGNAL_VIEWBOX_WIDTH,
  type SogChartPoint,
  type SogSignalRange,
} from '../utils/metricChartData'
import { formatGpsTime } from '../utils/replay'

interface SogSignalChartProps {
  primarySamples: TrackSample[] | null
  comparisonSamples?: TrackSample[] | null
  playbackTime: number | null
  primaryLabel: string
  comparisonLabel?: string
}

const RAW_STYLE = {
  strokeWidth: SOG_SIGNAL_TUNING.rawStrokeWidth,
  strokeOpacity: SOG_SIGNAL_TUNING.rawOpacity,
}
const SMOOTHED_STYLE = {
  strokeWidth: SOG_SIGNAL_TUNING.smoothedStrokeWidth,
  strokeOpacity: SOG_SIGNAL_TUNING.smoothedOpacity,
}

function resolveSignalRange(
  primaryPoints: SogChartPoint[],
  comparisonPoints: SogChartPoint[],
): SogSignalRange | null {
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

function resolveMaximumSog(
  primaryPoints: SogChartPoint[],
  comparisonPoints: SogChartPoint[],
) {
  let maximumSog = 0
  for (const points of [primaryPoints, comparisonPoints]) {
    for (const point of points) {
      if (point.sog !== null) maximumSog = Math.max(maximumSog, point.sog)
    }
  }
  return Math.max(1, Math.ceil(maximumSog))
}

function axisSog(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} kt`
}

export default function SogSignalChart({
  primarySamples,
  comparisonSamples,
  playbackTime,
  primaryLabel,
  comparisonLabel,
}: SogSignalChartProps) {
  const primaryPoints = useMemo(
    () => buildSogChartPoints(primarySamples ?? []),
    [primarySamples],
  )
  const comparisonPoints = useMemo(
    () => buildSogChartPoints(comparisonSamples ?? []),
    [comparisonSamples],
  )
  const primaryRawPoints = useMemo(
    () => reduceRawSogChartPoints(primaryPoints, SOG_SIGNAL_TUNING.rawPointBudget),
    [primaryPoints],
  )
  const comparisonRawPoints = useMemo(
    () => reduceRawSogChartPoints(comparisonPoints, SOG_SIGNAL_TUNING.rawPointBudget),
    [comparisonPoints],
  )
  const primarySmoothedPoints = useMemo(
    () => buildSogTrendPoints(primaryPoints),
    [primaryPoints],
  )
  const comparisonSmoothedPoints = useMemo(
    () => buildSogTrendPoints(comparisonPoints),
    [comparisonPoints],
  )
  const range = useMemo(
    () => resolveSignalRange(primaryPoints, comparisonPoints),
    [comparisonPoints, primaryPoints],
  )
  const maximumSog = useMemo(
    () => resolveMaximumSog(primaryPoints, comparisonPoints),
    [comparisonPoints, primaryPoints],
  )

  if (range === null || playbackTime === null) {
    return (
      <section className="metric-chart metric-chart--empty" aria-label="SOG chart unavailable">
        <strong>No SOG track data for the selected Activities</strong>
      </section>
    )
  }

  const primaryRawPath = buildSogSignalPath(primaryRawPoints, range, maximumSog)
  const comparisonRawPath = buildSogSignalPath(comparisonRawPoints, range, maximumSog)
  const primarySmoothedPath = buildSogSignalPath(primarySmoothedPoints, range, maximumSog)
  const comparisonSmoothedPath = buildSogSignalPath(comparisonSmoothedPoints, range, maximumSog)
  const midpoint = range.start + (range.end - range.start) / 2
  const playbackX = sogSignalXPosition(playbackTime, range)
  const accessibleActivities = comparisonSamples
    ? `${primaryLabel} and ${comparisonLabel ?? 'Compare'}`
    : primaryLabel

  return (
    <section className="metric-chart" aria-label="SOG time-series chart">
      <div className="metric-chart__heading">
        <div>
          <strong>SOG over GPS time</strong>
          <span>knots · UTC</span>
        </div>
        <ul className="sog-signal-chart__legend" aria-label="SOG line roles">
          <li>
            <svg viewBox="0 0 24 8" aria-hidden="true">
              <line
                data-sog-legend-role="raw"
                x1="1"
                x2="23"
                y1="4"
                y2="4"
                stroke="currentColor"
                {...RAW_STYLE}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            Raw
          </li>
          <li>
            <svg viewBox="0 0 24 8" aria-hidden="true">
              <line
                data-sog-legend-role="smoothed"
                x1="1"
                x2="23"
                y1="4"
                y2="4"
                stroke="currentColor"
                {...SMOOTHED_STYLE}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            Smoothed
          </li>
        </ul>
      </div>
      <div className="metric-chart__canvas metric-chart__canvas--sog">
        <div className="sog-signal-chart">
          <div className="sog-signal-chart__y-axis" aria-hidden="true">
            <span>{axisSog(maximumSog)}</span>
            <span>{axisSog(maximumSog / 2)}</span>
            <span>0 kt</span>
          </div>
          <div className="sog-signal-chart__plot">
            <svg
              viewBox={`0 0 ${SOG_SIGNAL_VIEWBOX_WIDTH} ${SOG_SIGNAL_VIEWBOX_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`SOG signal for ${accessibleActivities}`}
            >
              <g className="sog-signal-chart__grid" aria-hidden="true">
                <line x1="0" x2="1000" y1="8" y2="8" />
                <line x1="0" x2="1000" y1="100" y2="100" />
                <line x1="0" x2="1000" y1="192" y2="192" />
                <line x1="0" x2="0" y1="8" y2="192" />
                <line x1="500" x2="500" y1="8" y2="192" />
                <line x1="1000" x2="1000" y1="8" y2="192" />
              </g>
              {comparisonRawPath && (
                <path
                  data-sog-series="comparison-raw"
                  d={comparisonRawPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.comparison}
                  {...RAW_STYLE}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {primaryRawPath && (
                <path
                  data-sog-series="primary-raw"
                  d={primaryRawPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.primary}
                  {...RAW_STYLE}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {comparisonSmoothedPath && (
                <path
                  data-sog-series="comparison-smoothed"
                  d={comparisonSmoothedPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.comparison}
                  {...SMOOTHED_STYLE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {primarySmoothedPath && (
                <path
                  data-sog-series="primary-smoothed"
                  d={primarySmoothedPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.primary}
                  {...SMOOTHED_STYLE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <line
                data-sog-playback-cursor="true"
                x1={playbackX}
                x2={playbackX}
                y1="8"
                y2="192"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="sog-signal-chart__x-axis" aria-hidden="true">
            <time dateTime={new Date(range.start).toISOString()}>{formatGpsTime(range.start)}</time>
            <time dateTime={new Date(midpoint).toISOString()}>{formatGpsTime(midpoint)}</time>
            <time dateTime={new Date(range.end).toISOString()}>{formatGpsTime(range.end)}</time>
          </div>
        </div>
      </div>
    </section>
  )
}
