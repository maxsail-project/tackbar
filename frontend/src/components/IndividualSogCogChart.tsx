import { useMemo } from 'react'

import { COG_SIGNAL_TUNING } from '../config/cogSignal'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import type { TrackSample } from '../types/track'
import { formatGpsTime } from '../utils/replay'
import {
  COG_SIGNAL_VIEWBOX_HEIGHT,
  COG_SIGNAL_VIEWBOX_WIDTH,
  buildCanonicalCogChartPoints,
  buildCogSignalPath,
  buildSmoothedCogChartPoints,
  buildSogChartPoints,
  buildSogSignalPath,
  buildSogTrendPoints,
  cogSignalXPosition,
  insertCogWrapBreaks,
  reduceRawCogChartPoints,
  reduceRawSogChartPoints,
  type CogChartPoint,
  type CogSignalRange,
  type SogChartPoint,
} from '../utils/metricChartData'

type IndividualSogCogChartProps = {
  samples: TrackSample[] | null
  playbackTime: number | null
  activityLabel: string
  sogColor: string
}

export const INDIVIDUAL_SOG_COG_CHART_CONFIG = {
  cogDomain: [0, 360] as const,
  cogTicks: [0, 90, 180, 270, 360] as const,
  cogColor: '#60777e',
} as const

type IndividualSignalRange = CogSignalRange

function resolveRange(sogPoints: SogChartPoint[], cogPoints: CogChartPoint[]): IndividualSignalRange | null {
  const timestamps = [...sogPoints, ...cogPoints].map((point) => point.time)
  if (timestamps.length === 0) {
    return null
  }

  return {
    start: Math.min(...timestamps),
    end: Math.max(...timestamps),
  }
}

function resolveSogMaximum(sogPoints: SogChartPoint[]) {
  const maximum = sogPoints.reduce(
    (currentMaximum, point) =>
      point.sog === null ? currentMaximum : Math.max(currentMaximum, point.sog),
    0,
  )
  return Math.max(1, Math.ceil(maximum))
}

function IndividualSogCogLegend() {
  return (
    <div className="individual-sog-cog-signal__legend" aria-label="Signal role legend">
      <span className="individual-sog-cog-signal__legend-item">
        <span
          className="individual-sog-cog-signal__legend-line"
          style={{
            opacity: SOG_SIGNAL_TUNING.rawOpacity,
            borderTopWidth: SOG_SIGNAL_TUNING.rawStrokeWidth,
          }}
        />
        Raw
      </span>
      <span className="individual-sog-cog-signal__legend-item">
        <span
          className="individual-sog-cog-signal__legend-line"
          style={{
            opacity: SOG_SIGNAL_TUNING.smoothedOpacity,
            borderTopWidth: SOG_SIGNAL_TUNING.smoothedStrokeWidth,
          }}
        />
        Smoothed
      </span>
    </div>
  )
}

function IndividualSogCogYAxis({
  side,
  label,
  ticks,
}: {
  side: 'left' | 'right'
  label: string
  ticks: readonly string[]
}) {
  return (
    <div
      className={`individual-sog-cog-signal__y-axis individual-sog-cog-signal__y-axis--${side}`}
      aria-label={label}
    >
      <div className="individual-sog-cog-signal__y-ticks" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  )
}

export default function IndividualSogCogChart({
  samples,
  playbackTime,
  activityLabel,
  sogColor,
}: IndividualSogCogChartProps) {
  const chart = useMemo(() => {
    const sogPoints = buildSogChartPoints(samples ?? [])
    const cogPoints = buildCanonicalCogChartPoints(samples ?? [])
    const range = resolveRange(sogPoints, cogPoints)
    const sogMaximum = resolveSogMaximum(sogPoints)

    if (range === null) {
      return null
    }

    const rawSogPoints = reduceRawSogChartPoints(sogPoints, SOG_SIGNAL_TUNING.rawPointBudget)
    const rawCogPoints = reduceRawCogChartPoints(
      insertCogWrapBreaks(cogPoints),
      COG_SIGNAL_TUNING.rawPointBudget,
    )
    const smoothedSogPoints = buildSogTrendPoints(sogPoints)
    const smoothedCogPoints = buildSmoothedCogChartPoints(cogPoints)

    return {
      range,
      sogMaximum,
      hasSog: sogPoints.some((point) => point.sog !== null),
      hasCog: cogPoints.some((point) => point.cog !== null),
      rawSogPath: buildSogSignalPath(rawSogPoints, range, sogMaximum),
      rawCogPath: buildCogSignalPath(rawCogPoints, range),
      smoothedSogPath: buildSogSignalPath(smoothedSogPoints, range, sogMaximum),
      smoothedCogPath: buildCogSignalPath(smoothedCogPoints, range),
    }
  }, [samples])

  const playbackX =
    chart === null || playbackTime === null
      ? null
      : cogSignalXPosition(playbackTime, chart.range)

  const xTicks =
    chart === null
      ? []
      : [
          chart.range.start,
          (chart.range.start + chart.range.end) / 2,
          chart.range.end,
        ]

  if (chart === null || (!chart.hasSog && !chart.hasCog) || playbackTime === null) {
    return (
      <section
        className="individual-sog-cog-chart individual-sog-cog-chart--empty"
        aria-label="SOG and COG chart unavailable"
      >
        <strong>No SOG or COG track data for this Activity</strong>
      </section>
    )
  }

  return (
    <section
      className="metric-chart metric-chart--individual individual-sog-cog-chart"
      aria-label={`${activityLabel} SOG and COG time-series chart`}
    >
      <div className="metric-chart__heading metric-chart__heading--signal">
        <div>
          <strong>SOG + COG over GPS time</strong>
          <span>knots · degrees · UTC</span>
        </div>
        <IndividualSogCogLegend />
      </div>

      <div className="metric-chart__canvas metric-chart__canvas--individual-sog-cog">
        <div className="individual-sog-cog-signal">
            <IndividualSogCogYAxis
              side="left"
              label="SOG (kn)"
              ticks={[
                `${chart.sogMaximum} kn`,
                `${Number.isInteger(chart.sogMaximum / 2) ? chart.sogMaximum / 2 : (chart.sogMaximum / 2).toFixed(1)} kn`,
                '0 kn',
              ]}
            />
            <div className="individual-sog-cog-signal__plot">
              <svg
                viewBox={`0 0 ${COG_SIGNAL_VIEWBOX_WIDTH} ${COG_SIGNAL_VIEWBOX_HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${activityLabel} SOG and COG signals`}
              >
                <g className="individual-sog-cog-signal__grid" aria-hidden="true">
                  {[8, 54, 100, 146, 192].map((y) => (
                    <line key={`horizontal-${y}`} x1="0" x2="1000" y1={y} y2={y} />
                  ))}
                  {[0, 500, 1000].map((x) => (
                    <line key={`vertical-${x}`} x1={x} x2={x} y1="8" y2="192" />
                  ))}
                </g>

                {chart.rawSogPath ? (
                  <path
                    data-individual-signal-series="sog-raw"
                    d={chart.rawSogPath}
                    fill="none"
                    stroke={sogColor}
                    strokeOpacity={SOG_SIGNAL_TUNING.rawOpacity}
                    strokeWidth={SOG_SIGNAL_TUNING.rawStrokeWidth}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {chart.rawCogPath ? (
                  <path
                    data-individual-signal-series="cog-raw"
                    d={chart.rawCogPath}
                    fill="none"
                    stroke={INDIVIDUAL_SOG_COG_CHART_CONFIG.cogColor}
                    strokeOpacity={COG_SIGNAL_TUNING.rawOpacity}
                    strokeWidth={COG_SIGNAL_TUNING.rawStrokeWidth}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {chart.smoothedSogPath ? (
                  <path
                    data-individual-signal-series="sog-smoothed"
                    d={chart.smoothedSogPath}
                    fill="none"
                    stroke={sogColor}
                    strokeOpacity={SOG_SIGNAL_TUNING.smoothedOpacity}
                    strokeWidth={SOG_SIGNAL_TUNING.smoothedStrokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {chart.smoothedCogPath ? (
                  <path
                    data-individual-signal-series="cog-smoothed"
                    d={chart.smoothedCogPath}
                    fill="none"
                    stroke={INDIVIDUAL_SOG_COG_CHART_CONFIG.cogColor}
                    strokeOpacity={COG_SIGNAL_TUNING.smoothedOpacity}
                    strokeWidth={COG_SIGNAL_TUNING.smoothedStrokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}

                {playbackX === null ? null : (
                  <line
                    data-individual-signal-playback-cursor="true"
                    className="individual-sog-cog-signal__playback-cursor"
                    x1={playbackX}
                    x2={playbackX}
                    y1="8"
                    y2="192"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
            </div>
            <IndividualSogCogYAxis
              side="right"
              label="COG (°)"
              ticks={[...INDIVIDUAL_SOG_COG_CHART_CONFIG.cogTicks].reverse().map((tick) => `${tick}°`)}
            />
            <div className="individual-sog-cog-signal__x-axis" aria-hidden="true">
              {xTicks.map((tick, index) => (
                <time key={`${tick}-${index}`} dateTime={new Date(tick).toISOString()}>{formatGpsTime(tick)}</time>
              ))}
            </div>
        </div>
      </div>
    </section>
  )
}
