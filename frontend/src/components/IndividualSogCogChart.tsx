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
import type { TrackSample } from '../types/track'
import { buildCogChartPoints } from '../utils/metricChartData'
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

interface IndividualSogCogChartProps {
  samples: TrackSample[] | null
  playbackTime: number | null
  activityLabel: string
  sogColor: string
}

export const INDIVIDUAL_SOG_COG_CHART_CONFIG = {
  xAxisId: 'time',
  tooltipXAxisId: 'time',
  sogAxisId: 'sog',
  cogAxisId: 'cog',
  cogDomain: [0, 360] as const,
  cogTicks: [0, 90, 180, 270, 360],
  cogColor: '#60777e',
} as const

function formatAxisTime(timestamp: number) {
  return formatGpsTime(timestamp).slice(0, 5)
}

export default function IndividualSogCogChart({
  samples,
  playbackTime,
  activityLabel,
  sogColor,
}: IndividualSogCogChartProps) {
  const [zoomRange, setZoomRange] = useState<TemporalRange | null>(null)
  const [pointerSelection, setPointerSelection] = useState<TemporalPointerSelection | null>(null)
  const pointerSelectionRef = useRef<TemporalPointerSelection | null>(null)
  const cogPoints = useMemo(
    () => buildCogChartPoints(samples ?? []),
    [samples],
  )
  const chartPoints = useMemo(
    () => {
      const pointsByTime = new Map<number, { time: number, sog: number | null, cog: number | null }>()
      const sourceSamples = samples ?? []

      sourceSamples.forEach((sample) => {
        const time = timestampToMilliseconds(sample.utc)
        pointsByTime.set(time, {
          time,
          sog: sample.sog !== null && Number.isFinite(sample.sog) ? sample.sog : null,
          cog: null,
        })
      })
      cogPoints.forEach((point) => {
        const current = pointsByTime.get(point.time)
        pointsByTime.set(point.time, {
          time: point.time,
          sog: current?.sog ?? null,
          cog: point.cog,
        })
      })

      return [...pointsByTime.values()].sort((first, second) => first.time - second.time)
    },
    [cogPoints, samples],
  )
  const originalRange = useMemo(
    () => createTemporalRange(chartPoints.map((point) => point.time)),
    [chartPoints],
  )
  const zoomPresentation = resolveTemporalZoomChartPresentation(zoomRange)
  const hasChartData = chartPoints.some((point) => point.sog !== null || point.cog !== null)

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
      className="individual-sog-cog-chart"
      aria-label={`${activityLabel} SOG and COG time-series chart`}
    >
      <div className="metric-chart__heading">
        <div>
          <strong>SOG + COG over GPS time</strong>
          <span>knots · degrees · UTC</span>
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
            data={chartPoints}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="#dbe6e8" strokeDasharray="3 4" vertical={false} />
            <XAxis
              xAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.xAxisId}
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
              yAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.sogAxisId}
              width={42}
              unit=" kt"
              tick={{ fill: '#60777e', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.cogAxisId}
              orientation="right"
              width={42}
              domain={INDIVIDUAL_SOG_COG_CHART_CONFIG.cogDomain}
              ticks={INDIVIDUAL_SOG_COG_CHART_CONFIG.cogTicks}
              tickFormatter={(value) => `${value}°`}
              allowDataOverflow
              tick={{ fill: '#60777e', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              axisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.tooltipXAxisId}
              labelFormatter={(value) => `${formatGpsTime(Number(value))} UTC`}
              formatter={(value, name) => [
                value === null || value === undefined
                  ? '—'
                  : `${Number(value).toFixed(1)}${name === 'COG' ? '°' : ' kt'}`,
                name,
              ]}
            />
            <ReferenceLine
              xAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.xAxisId}
              x={playbackTime}
              stroke="#ed7658"
              strokeWidth={2}
              ifOverflow={zoomPresentation.playbackReferenceOverflow}
            />
            {pointerSelection !== null && (
              <ReferenceArea
                xAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.xAxisId}
                x1={pointerSelection.start}
                x2={pointerSelection.end}
                fill="#168097"
                fillOpacity={0.12}
              />
            )}
            <Line
              xAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.xAxisId}
              yAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.sogAxisId}
              type="linear"
              dataKey="sog"
              name="SOG"
              stroke={sogColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              xAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.xAxisId}
              yAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.cogAxisId}
              type="linear"
              dataKey="cog"
              name="COG"
              stroke={INDIVIDUAL_SOG_COG_CHART_CONFIG.cogColor}
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
