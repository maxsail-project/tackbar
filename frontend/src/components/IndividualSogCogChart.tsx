import { useEffect, useMemo, useState } from 'react'
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
  resolveTemporalZoomChartPresentation,
  selectTemporalZoom,
  type TemporalRange,
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

export function resolveIndividualChartTimestamp(event: { activeLabel?: unknown } | undefined) {
  const value = Number(event?.activeLabel)
  return Number.isFinite(value) ? value : null
}

export default function IndividualSogCogChart({
  samples,
  playbackTime,
  activityLabel,
  sogColor,
}: IndividualSogCogChartProps) {
  const [zoomRange, setZoomRange] = useState<TemporalRange | null>(null)
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
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
    setSelectionStart(null)
    setSelectionEnd(null)
  }, [originalRange?.end, originalRange?.start])

  function timestampFromChartEvent(event: { activeLabel?: unknown } | undefined) {
    return resolveIndividualChartTimestamp(event)
  }

  function finishSelection(event: { activeLabel?: unknown } | undefined) {
    const nextSelectionEnd = timestampFromChartEvent(event)
    setZoomRange(selectTemporalZoom(originalRange, selectionStart, nextSelectionEnd))
    setSelectionStart(null)
    setSelectionEnd(null)
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
      <div className="metric-chart__canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartPoints}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            accessibilityLayer
            onMouseDown={(event) => {
              const timestamp = timestampFromChartEvent(event)
              setSelectionStart(timestamp)
              setSelectionEnd(timestamp)
            }}
            onMouseMove={(event) => {
              if (selectionStart !== null) setSelectionEnd(timestampFromChartEvent(event))
            }}
            onMouseUp={finishSelection}
            onMouseLeave={() => {
              setSelectionStart(null)
              setSelectionEnd(null)
            }}
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
            {selectionStart !== null && selectionEnd !== null && (
              <ReferenceArea
                xAxisId={INDIVIDUAL_SOG_COG_CHART_CONFIG.xAxisId}
                x1={selectionStart}
                x2={selectionEnd}
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
