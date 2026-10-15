import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
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
  buildScalarChartPoints,
  type ScalarChartMetric,
} from '../utils/metricChartData'
import {
  createTemporalRange,
  finishTemporalPointerSelection,
  resolveTemporalPointerTimestamp,
  resolveTemporalZoomChartPresentation,
  startTemporalPointerSelection,
  type TemporalRange,
  type TemporalPointerSelection,
  updateTemporalPointerSelection,
} from '../utils/metricChartZoom'
import { formatGpsTime, timestampToMilliseconds } from '../utils/replay'
import CogSignalChart from './CogSignalChart'
import HeelSignalChart from './HeelSignalChart'
import SogSignalChart from './SogSignalChart'

interface MetricChartProps {
  metric: SailingMetric
  primarySamples: TrackSample[] | null
  comparisonSamples?: TrackSample[] | null
  playbackTime: number | null
  primaryLabel: string
  comparisonLabel?: string
}

interface RechartsMetricChartProps extends Omit<MetricChartProps, 'metric'> {
  metric: Extract<SailingMetric, 'TRIM'>
}

function formatAxisTime(timestamp: number) {
  return formatGpsTime(timestamp).slice(0, 5)
}

function RechartsMetricChart({
  metric,
  primarySamples,
  comparisonSamples,
  playbackTime,
  primaryLabel,
  comparisonLabel,
}: RechartsMetricChartProps) {
  const [zoomRange, setZoomRange] = useState<TemporalRange | null>(null)
  const [pointerSelection, setPointerSelection] = useState<TemporalPointerSelection | null>(null)
  const pointerSelectionRef = useRef<TemporalPointerSelection | null>(null)
  const scalarMetric: ScalarChartMetric = metric
  const primaryScalarPoints = useMemo(
    () => buildScalarChartPoints(primarySamples ?? [], scalarMetric),
    [primarySamples, scalarMetric],
  )
  const comparisonScalarPoints = useMemo(
    () => buildScalarChartPoints(comparisonSamples ?? [], scalarMetric),
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
  const hasValidScalar = primaryScalarPoints.some((point) => point.value !== null)
    || comparisonScalarPoints.some((point) => point.value !== null)
  const originalRange = useMemo(
    () => createTemporalRange([
      ...(primarySamples ?? []).map((sample) => timestampToMilliseconds(sample.utc)),
      ...(comparisonSamples ?? []).map((sample) => timestampToMilliseconds(sample.utc)),
    ]),
    [comparisonSamples, primarySamples],
  )
  const zoomPresentation = resolveTemporalZoomChartPresentation(zoomRange)

  // Chart zoom is local presentation state. A new filtered sample interval
  // (from an Activity or Analysis Window change) always starts unzoomed.
  useEffect(() => {
    setZoomRange(null)
    pointerSelectionRef.current = null
    setPointerSelection(null)
  }, [originalRange?.end, originalRange?.start])

  function updatePointerSelection(nextSelection: TemporalPointerSelection | null) {
    pointerSelectionRef.current = nextSelection
    setPointerSelection(nextSelection)
  }

  function pointerTimestamp(event: ReactPointerEvent<HTMLDivElement>) {
    const axisLine = event.currentTarget.querySelector('.recharts-xAxis .recharts-cartesian-axis-line')
    const bounds = (axisLine ?? event.currentTarget).getBoundingClientRect()
    return resolveTemporalPointerTimestamp(zoomRange ?? originalRange, event.clientX, bounds)
  }

  function clearPointerSelection() {
    updatePointerSelection(null)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return

    const nextSelection = startTemporalPointerSelection(event.pointerId, pointerTimestamp(event))
    if (nextSelection === null) return

    event.currentTarget.setPointerCapture(event.pointerId)
    updatePointerSelection(nextSelection)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerSelectionRef.current?.pointerId !== event.pointerId) return

    updatePointerSelection(updateTemporalPointerSelection(
      pointerSelectionRef.current,
      event.pointerId,
      pointerTimestamp(event),
    ))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerSelectionRef.current?.pointerId !== event.pointerId) return

    const nextZoomRange = finishTemporalPointerSelection(
      originalRange,
      pointerSelectionRef.current,
      event.pointerId,
      pointerTimestamp(event),
    )
    if (nextZoomRange !== null) setZoomRange(nextZoomRange)
    clearPointerSelection()
  }

  function cancelPointerSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerSelectionRef.current?.pointerId === event.pointerId) clearPointerSelection()
  }

  if (!hasValidScalar || playbackTime === null) {
    return (
      <section className="metric-chart metric-chart--empty" aria-label={`${metric} chart unavailable`}>
        <strong>No {metric} track data for the selected Activities</strong>
      </section>
    )
  }

  return (
    <section className="metric-chart" aria-label={`${metric} time-series chart`}>
      <div className="metric-chart__heading">
        <div>
          <strong>{metric} over GPS time</strong>
          <span>degrees · UTC</span>
        </div>
        {zoomRange && (
          <button
            className="metric-chart__reset"
            type="button"
            onClick={() => setZoomRange(null)}
          >
            Reset
          </button>
        )}
      </div>
      <div
        className="metric-chart__canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelPointerSelection}
        onPointerLeave={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) cancelPointerSelection(event)
        }}
        onLostPointerCapture={cancelPointerSelection}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={timelinePoints}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="#dbe6e8" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={zoomPresentation.domain}
              allowDataOverflow={zoomPresentation.allowDataOverflow}
              tickFormatter={formatAxisTime}
              minTickGap={28}
              tick={{ fill: '#60777e', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#b9cbcf' }}
            />
            <YAxis
              width={42}
              tickFormatter={(value) => `${value}°`}
              tick={{ fill: '#60777e', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(value) => `${formatGpsTime(Number(value))} UTC`}
              formatter={(value, name) => [
                value === null || value === undefined
                  ? '—'
                  : `${Number(value).toFixed(1)}°`,
                name,
              ]}
            />
            <ReferenceLine
              x={playbackTime}
              stroke="#ed7658"
              strokeWidth={2}
              ifOverflow={zoomPresentation.playbackReferenceOverflow}
            />
            {pointerSelection !== null && (
              <ReferenceArea
                x1={pointerSelection.start}
                x2={pointerSelection.end}
                fill="#168097"
                fillOpacity={0.12}
              />
            )}
            <ReferenceLine
              y={0}
              stroke="#91a5aa"
              strokeDasharray="3 4"
              ifOverflow="extendDomain"
            />
            {comparisonSamples && (
              <Line
                data={comparisonScalarPoints}
                type="linear"
                dataKey="value"
                name={comparisonLabel ?? 'Compare'}
                stroke={ACTIVITY_COLORS.comparison}
                strokeOpacity={0.55}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            <Line
              data={primaryScalarPoints}
              type="linear"
              dataKey="value"
              name={primaryLabel}
              stroke={ACTIVITY_COLORS.primary}
              strokeOpacity={comparisonSamples ? 0.85 : undefined}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export default function MetricChart(props: MetricChartProps) {
  if (props.metric === 'SOG') {
    return (
      <SogSignalChart
        primarySamples={props.primarySamples}
        comparisonSamples={props.comparisonSamples}
        playbackTime={props.playbackTime}
        primaryLabel={props.primaryLabel}
        comparisonLabel={props.comparisonLabel}
      />
    )
  }

  if (props.metric === 'COG') {
    return (
      <CogSignalChart
        primarySamples={props.primarySamples}
        comparisonSamples={props.comparisonSamples}
        playbackTime={props.playbackTime}
        primaryLabel={props.primaryLabel}
        comparisonLabel={props.comparisonLabel}
      />
    )
  }

  if (props.metric === 'HEEL') {
    return (
      <HeelSignalChart
        primarySamples={props.primarySamples}
        comparisonSamples={props.comparisonSamples}
        playbackTime={props.playbackTime}
        primaryLabel={props.primaryLabel}
        comparisonLabel={props.comparisonLabel}
      />
    )
  }

  return (
    <RechartsMetricChart
      metric={props.metric}
      primarySamples={props.primarySamples}
      comparisonSamples={props.comparisonSamples}
      playbackTime={props.playbackTime}
      primaryLabel={props.primaryLabel}
      comparisonLabel={props.comparisonLabel}
    />
  )
}
