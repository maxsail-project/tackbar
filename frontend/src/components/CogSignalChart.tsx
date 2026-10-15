import { useMemo } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { COG_SIGNAL_TUNING } from '../config/cogSignal'
import type { TrackSample } from '../types/track'
import {
  buildCanonicalCogChartPoints,
  buildCogSignalPath,
  buildSmoothedCogChartPoints,
  cogSignalXPosition,
  COG_SIGNAL_VIEWBOX_HEIGHT,
  COG_SIGNAL_VIEWBOX_WIDTH,
  insertCogWrapBreaks,
  reduceRawCogChartPoints,
  type CogChartPoint,
  type CogSignalRange,
} from '../utils/metricChartData'
import { formatGpsTime } from '../utils/replay'

interface CogSignalChartProps {
  primarySamples: TrackSample[] | null
  comparisonSamples?: TrackSample[] | null
  playbackTime: number | null
  primaryLabel: string
  comparisonLabel?: string
}

const RAW_STYLE = {
  strokeWidth: COG_SIGNAL_TUNING.rawStrokeWidth,
  strokeOpacity: COG_SIGNAL_TUNING.rawOpacity,
}
const SMOOTHED_STYLE = {
  strokeWidth: COG_SIGNAL_TUNING.smoothedStrokeWidth,
  strokeOpacity: COG_SIGNAL_TUNING.smoothedOpacity,
}

function resolveSignalRange(
  primaryPoints: CogChartPoint[],
  comparisonPoints: CogChartPoint[],
): CogSignalRange | null {
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

export default function CogSignalChart({
  primarySamples,
  comparisonSamples,
  playbackTime,
  primaryLabel,
  comparisonLabel,
}: CogSignalChartProps) {
  const primaryPoints = useMemo(
    () => buildCanonicalCogChartPoints(primarySamples ?? []),
    [primarySamples],
  )
  const comparisonPoints = useMemo(
    () => buildCanonicalCogChartPoints(comparisonSamples ?? []),
    [comparisonSamples],
  )
  const primaryRawPoints = useMemo(
    () => reduceRawCogChartPoints(
      insertCogWrapBreaks(primaryPoints),
      COG_SIGNAL_TUNING.rawPointBudget,
    ),
    [primaryPoints],
  )
  const comparisonRawPoints = useMemo(
    () => reduceRawCogChartPoints(
      insertCogWrapBreaks(comparisonPoints),
      COG_SIGNAL_TUNING.rawPointBudget,
    ),
    [comparisonPoints],
  )
  const primarySmoothedPoints = useMemo(
    () => buildSmoothedCogChartPoints(primaryPoints),
    [primaryPoints],
  )
  const comparisonSmoothedPoints = useMemo(
    () => buildSmoothedCogChartPoints(comparisonPoints),
    [comparisonPoints],
  )
  const range = useMemo(
    () => resolveSignalRange(primaryPoints, comparisonPoints),
    [comparisonPoints, primaryPoints],
  )
  const hasCog = primaryPoints.some((point) => point.cog !== null)
    || comparisonPoints.some((point) => point.cog !== null)

  if (range === null || !hasCog || playbackTime === null) {
    return (
      <section className="metric-chart metric-chart--empty" aria-label="COG chart unavailable">
        <strong>No COG track data for the selected Activities</strong>
      </section>
    )
  }

  const primaryRawPath = buildCogSignalPath(primaryRawPoints, range)
  const comparisonRawPath = buildCogSignalPath(comparisonRawPoints, range)
  const primarySmoothedPath = buildCogSignalPath(primarySmoothedPoints, range)
  const comparisonSmoothedPath = buildCogSignalPath(comparisonSmoothedPoints, range)
  const midpoint = range.start + (range.end - range.start) / 2
  const playbackX = cogSignalXPosition(playbackTime, range)
  const accessibleActivities = comparisonSamples
    ? `${primaryLabel} and ${comparisonLabel ?? 'Compare'}`
    : primaryLabel

  return (
    <section className="metric-chart" aria-label="COG time-series chart">
      <div className="metric-chart__heading">
        <div>
          <strong>COG over GPS time</strong>
          <span>degrees · UTC</span>
        </div>
        <ul className="cog-signal-chart__legend" aria-label="COG line roles">
          <li>
            <svg viewBox="0 0 24 8" aria-hidden="true">
              <line
                data-cog-legend-role="raw"
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
                data-cog-legend-role="smoothed"
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
      <div className="metric-chart__canvas metric-chart__canvas--cog">
        <div className="cog-signal-chart">
          <div className="cog-signal-chart__y-axis" aria-hidden="true">
            <span>360°</span>
            <span>270°</span>
            <span>180°</span>
            <span>90°</span>
            <span>0°</span>
          </div>
          <div className="cog-signal-chart__plot">
            <svg
              viewBox={`0 0 ${COG_SIGNAL_VIEWBOX_WIDTH} ${COG_SIGNAL_VIEWBOX_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`COG signal for ${accessibleActivities}`}
            >
              <g className="cog-signal-chart__grid" aria-hidden="true">
                <line x1="0" x2="1000" y1="8" y2="8" />
                <line x1="0" x2="1000" y1="54" y2="54" />
                <line x1="0" x2="1000" y1="100" y2="100" />
                <line x1="0" x2="1000" y1="146" y2="146" />
                <line x1="0" x2="1000" y1="192" y2="192" />
                <line x1="0" x2="0" y1="8" y2="192" />
                <line x1="500" x2="500" y1="8" y2="192" />
                <line x1="1000" x2="1000" y1="8" y2="192" />
              </g>
              {comparisonRawPath && (
                <path
                  data-cog-series="comparison-raw"
                  d={comparisonRawPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.comparison}
                  {...RAW_STYLE}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {primaryRawPath && (
                <path
                  data-cog-series="primary-raw"
                  d={primaryRawPath}
                  fill="none"
                  stroke={ACTIVITY_COLORS.primary}
                  {...RAW_STYLE}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {comparisonSmoothedPath && (
                <path
                  data-cog-series="comparison-smoothed"
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
                  data-cog-series="primary-smoothed"
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
                data-cog-playback-cursor="true"
                x1={playbackX}
                x2={playbackX}
                y1="8"
                y2="192"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="cog-signal-chart__x-axis" aria-hidden="true">
            <time dateTime={new Date(range.start).toISOString()}>{formatGpsTime(range.start)}</time>
            <time dateTime={new Date(midpoint).toISOString()}>{formatGpsTime(midpoint)}</time>
            <time dateTime={new Date(range.end).toISOString()}>{formatGpsTime(range.end)}</time>
          </div>
        </div>
      </div>
    </section>
  )
}
