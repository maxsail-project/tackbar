import { MANEUVER_SOG_INSIGHTS } from '../config/maneuverProfile'
import type { SogChartPoint } from './metricChartData'

export interface SogManeuverInsights {
  entrySog: number | null
  minimumSog: number | null
  sogDrop: number | null
}

function supportedValues(points: readonly SogChartPoint[], window: {
  firstOffsetSeconds: number
  lastOffsetSeconds: number
  minimumSupportedPositions: number
}): number[] | null {
  const values: number[] = []
  for (let offset = window.firstOffsetSeconds; offset <= window.lastOffsetSeconds; offset += 1) {
    const value = points[offset + 25]?.sog
    if (value !== null && value !== undefined && Number.isFinite(value)) values.push(value)
  }
  return values.length >= window.minimumSupportedPositions ? values : null
}

/** Input is the chart's supported raw median, with unsupported offsets already null. */
export function calculateSogManeuverInsights(points: readonly SogChartPoint[]): SogManeuverInsights {
  const entryValues = supportedValues(points, MANEUVER_SOG_INSIGHTS.entry)
  const minimumValues = supportedValues(points, MANEUVER_SOG_INSIGHTS.minimum)
  const orderedEntry = entryValues === null ? null : [...entryValues].sort((a, b) => a - b)
  const entrySog = orderedEntry === null ? null : (orderedEntry[Math.floor((orderedEntry.length - 1) / 2)] + orderedEntry[Math.floor(orderedEntry.length / 2)]) / 2
  const minimumSog = minimumValues === null ? null : Math.min(...minimumValues)
  return {
    entrySog,
    minimumSog,
    sogDrop: entrySog === null || minimumSog === null ? null : entrySog - minimumSog,
  }
}

export type SogInsightMetric = keyof SogManeuverInsights

export function compareSogManeuverInsight(
  metric: SogInsightMetric,
  primary: number | null,
  comparison: number | null,
): string {
  if (primary === null || comparison === null) return '—'
  if (metric === 'sogDrop' && (primary < 0 || comparison < 0)) return 'No confirmed drop'
  if (Math.abs(primary - comparison) <= MANEUVER_SOG_INSIGHTS.similarityKnots + 1e-9) return 'Similar'
  if (metric === 'sogDrop') return primary < comparison ? 'P smaller drop' : 'C smaller drop'
  return primary > comparison ? 'P higher' : 'C higher'
}

export interface SogAxisBounds { minimum: number, maximum: number }

/** Shared axis from visible supported P/C curves only. */
export function sogManeuverAxisBounds(...series: readonly SogChartPoint[][]): SogAxisBounds {
  const values = series.flat().flatMap((point) => point.sog === null || !Number.isFinite(point.sog) ? [] : [point.sog])
  if (values.length === 0) return { minimum: 0, maximum: 3 }
  const minimum = Math.max(0, Math.floor(Math.min(...values) - 0.2))
  const maximum = Math.max(Math.ceil(Math.max(...values) + 0.2), minimum + 3)
  return { minimum, maximum }
}

export function buildSogManeuverPath(points: readonly SogChartPoint[], bounds: SogAxisBounds): string {
  let path = ''
  let beginsSegment = true
  for (const point of points) {
    if (point.sog === null) { beginsSegment = true; continue }
    const x = (point.time + 25_000) / 50_000 * 1000
    const y = 192 - (point.sog - bounds.minimum) / (bounds.maximum - bounds.minimum) * 184
    path += `${beginsSegment ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `
    beginsSegment = false
  }
  return path.trim()
}
