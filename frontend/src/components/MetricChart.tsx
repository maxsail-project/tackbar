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
  buildCogChartPoints,
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
  const [zoomRange, setZoomRange] = useState<TemporalRange | null>(null)
  const [pointerSelection, setPointerSelection] = useState<TemporalPointerSelection | null>(null)
  const pointerSelectionRef = useRef<TemporalPointerSelection | null>(null)
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
        <div>
          <strong>{metric} over GPS time</strong>
          <span>{usesDegrees ? 'degrees' : 'knots'} · UTC</span>
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
            data={isSignedOrientation ? timelinePoints : chartPoints}
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
