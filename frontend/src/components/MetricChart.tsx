import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { SailingMetric } from '../types/session'
import type { TrackSample } from '../types/track'
import {
  buildCogChartPoints,
  buildScalarChartPoints,
  type ScalarChartMetric,
} from '../utils/metricChartData'
import { formatGpsTime, timestampToMilliseconds } from '../utils/replay'

interface MetricChartProps {
  metric: SailingMetric
  primarySamples: TrackSample[] | null
  comparisonSamples?: TrackSample[] | null
  playbackTime: number | null
  primaryLabel: string
  comparisonLabel?: string
}

function formatAxisTime(timestamp: number) {
  return formatGpsTime(timestamp).slice(0, 5)
}

export default function MetricChart({
  metric,
  primarySamples,
  comparisonSamples,
  playbackTime,
  primaryLabel,
  comparisonLabel,
}: MetricChartProps) {
  const scalarMetric: ScalarChartMetric | null = metric === 'HEEL'
    || metric === 'TRIM'
    ? metric
    : null
  const chartPoints = useMemo(
    () => {
      const pointsByTime = new Map<number, {
        time: number
        primarySog?: number | null
        comparisonSog?: number | null
      }>()

      primarySamples?.forEach((sample) => {
        const time = timestampToMilliseconds(sample.utc)
        pointsByTime.set(time, {
          ...pointsByTime.get(time),
          time,
          primarySog: sample.sog,
        })
      })
      comparisonSamples?.forEach((sample) => {
        const time = timestampToMilliseconds(sample.utc)
        pointsByTime.set(time, {
          ...pointsByTime.get(time),
          time,
          comparisonSog: sample.sog,
        })
      })

      return [...pointsByTime.values()].sort((first, second) => (
        first.time - second.time
      ))
    },
    [comparisonSamples, primarySamples],
  )
  const primaryScalarPoints = useMemo(
    () => scalarMetric
      ? buildScalarChartPoints(primarySamples ?? [], scalarMetric)
      : [],
    [primarySamples, scalarMetric],
  )
  const comparisonScalarPoints = useMemo(
    () => scalarMetric
      ? buildScalarChartPoints(comparisonSamples ?? [], scalarMetric)
      : [],
    [comparisonSamples, scalarMetric],
  )
  const timelinePoints = useMemo(
    () => [...new Set([
      ...primaryScalarPoints.map((point) => point.time),
      ...comparisonScalarPoints.map((point) => point.time),
    ])]
      .sort((first, second) => first - second)
      .map((time) => ({ time })),
    [comparisonScalarPoints, primaryScalarPoints],
  )
  const primaryCogPoints = useMemo(
    () => buildCogChartPoints(primarySamples ?? []),
    [primarySamples],
  )
  const comparisonCogPoints = useMemo(
    () => buildCogChartPoints(comparisonSamples ?? []),
    [comparisonSamples],
  )
  const hasValidCog = primaryCogPoints.some((point) => point.cog !== null)
    || comparisonCogPoints.some((point) => point.cog !== null)
  const hasValidScalar = primaryScalarPoints.some((point) => point.value !== null)
    || comparisonScalarPoints.some((point) => point.value !== null)
  const isCog = metric === 'COG'
  const isSignedOrientation = metric === 'HEEL' || metric === 'TRIM'
  const usesDegrees = metric !== 'SOG'
  const hasChartData = isCog
    ? hasValidCog
    : isSignedOrientation
      ? hasValidScalar
      : chartPoints.length > 0

  if (!hasChartData || playbackTime === null) {
    return (
      <section className="metric-chart metric-chart--empty" aria-label={`${metric} chart unavailable`}>
        <strong>No {metric} track data for the selected Activities</strong>
      </section>
    )
  }

  return (
    <section className="metric-chart" aria-label={`${metric} time-series chart`}>
      <div className="metric-chart__heading">
        <strong>{metric} over GPS time</strong>
        <span>{usesDegrees ? 'degrees' : 'knots'} · UTC</span>
      </div>
      <div className="metric-chart__canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={isSignedOrientation ? timelinePoints : chartPoints}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="#dbe6e8" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatAxisTime}
              minTickGap={28}
              tick={{ fill: '#60777e', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#b9cbcf' }}
            />
            <YAxis
              width={42}
              domain={isCog ? [0, 360] : undefined}
              ticks={isCog ? [0, 90, 180, 270, 360] : undefined}
              tickFormatter={usesDegrees ? (value) => `${value}°` : undefined}
              unit={usesDegrees ? undefined : ' kt'}
              allowDataOverflow={isCog}
              tick={{ fill: '#60777e', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(value) => `${formatGpsTime(Number(value))} UTC`}
              formatter={(value, name) => [
                value === null || value === undefined
                  ? '—'
                  : `${Number(value).toFixed(1)}${usesDegrees ? '°' : ' kt'}`,
                name,
              ]}
            />
            <ReferenceLine
              x={playbackTime}
              stroke="#ed7658"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
            {isSignedOrientation && (
              <ReferenceLine
                y={0}
                stroke="#91a5aa"
                strokeDasharray="3 4"
                ifOverflow="extendDomain"
              />
            )}
            {isCog ? (
              <>
                <Line
                  type="linear"
                  data={primaryCogPoints}
                  dataKey="cog"
                  name={primaryLabel}
                  stroke={ACTIVITY_COLORS.primary}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                {comparisonSamples && (
                  <Line
                    type="linear"
                    data={comparisonCogPoints}
                    dataKey="cog"
                    name={comparisonLabel ?? 'Compare'}
                    stroke={ACTIVITY_COLORS.comparison}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
              </>
            ) : isSignedOrientation ? (
              <Line
                data={primaryScalarPoints}
                type="linear"
                dataKey="value"
                name={primaryLabel}
                stroke={ACTIVITY_COLORS.primary}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ) : (
              <Line
                type="linear"
                dataKey="primarySog"
                name={primaryLabel}
                stroke={ACTIVITY_COLORS.primary}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
            )}
            {isSignedOrientation && comparisonSamples && (
              <Line
                data={comparisonScalarPoints}
                type="linear"
                dataKey="value"
                name={comparisonLabel ?? 'Compare'}
                stroke={ACTIVITY_COLORS.comparison}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {metric === 'SOG' && comparisonSamples && (
              <Line
                type="linear"
                dataKey="comparisonSog"
                name={comparisonLabel ?? 'Compare'}
                stroke={ACTIVITY_COLORS.comparison}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
