import { MANEUVER_SOG_INSIGHTS } from '../config/maneuverProfile'
import type { SogChartPoint } from './metricChartData'

export interface SogManeuverInsights {
  entrySog: number | null
  minimumSog: number | null
  exitSog: number | null
}

export type SogProfileRecovery =
  | { status: 'recovered', offsetSeconds: number, sogKnots: number }
  | { status: 'not_reached' | 'unavailable' }

function supportedValues(points: readonly SogChartPoint[], window: {
  firstOffsetSeconds: number
  lastOffsetSeconds: number
  minimumSupportedPositions: number
}): number[] | null {
  const values: number[] = []
  for (let offset = window.firstOffsetSeconds; offset <= window.lastOffsetSeconds; offset += 1) {
    const value = points[offset + MANEUVER_SOG_INSIGHTS.profileHalfSpanSeconds]?.sog
    if (value !== null && value !== undefined && Number.isFinite(value)) values.push(value)
  }
  return values.length >= window.minimumSupportedPositions ? values : null
}

/** Input is the chart's supported raw median, with unsupported offsets already null. */
export function calculateSogManeuverInsights(points: readonly SogChartPoint[]): SogManeuverInsights {
  const entryValues = supportedValues(points, MANEUVER_SOG_INSIGHTS.entry)
  const minimumValues = supportedValues(points, MANEUVER_SOG_INSIGHTS.minimum)
  const exitValues = supportedValues(points, MANEUVER_SOG_INSIGHTS.exit)
  const entrySog = entryValues === null ? null : median(entryValues)
  const minimumSog = minimumValues === null ? null : Math.min(...minimumValues)
  return { entrySog, minimumSog, exitSog: exitValues === null ? null : median(exitValues) }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
}

/** Recovery is center-relative and requires an unbroken supported run from a below-threshold dip. */
export function calculateSogProfileRecovery(points: readonly SogChartPoint[], entrySog: number | null): SogProfileRecovery {
  if (entrySog === null || !Number.isFinite(entrySog)) return { status: 'unavailable' }
  const threshold = entrySog * MANEUVER_SOG_INSIGHTS.recoveryFractionOfEntry
  let activeDip = false
  for (let offset = -MANEUVER_SOG_INSIGHTS.profileHalfSpanSeconds; offset <= MANEUVER_SOG_INSIGHTS.profileHalfSpanSeconds; offset += 1) {
    const sog = points[offset + MANEUVER_SOG_INSIGHTS.profileHalfSpanSeconds]?.sog
    if (sog === null || sog === undefined || !Number.isFinite(sog)) {
      activeDip = false
      continue
    }
    if (sog < threshold) {
      activeDip = true
    } else if (activeDip) {
      if (offset >= 0) return { status: 'recovered', offsetSeconds: offset, sogKnots: sog }
      activeDip = false
    }
  }
  return activeDip ? { status: 'not_reached' } : { status: 'unavailable' }
}

export type SogInsightMetric = keyof SogManeuverInsights

export function compareSogManeuverInsight(
  primary: number | null,
  comparison: number | null,
): string {
  if (primary === null || comparison === null) return '—'
  if (Math.abs(primary - comparison) <= MANEUVER_SOG_INSIGHTS.similarityKnots + 1e-9) return 'Similar'
  return primary > comparison ? 'P higher' : 'C higher'
}

export function compareSogProfileRecovery(primary: SogProfileRecovery, comparison: SogProfileRecovery): string {
  if (primary.status !== 'recovered' || comparison.status !== 'recovered') return ''
  if (primary.offsetSeconds === comparison.offsetSeconds) return 'Same recovery time'
  return primary.offsetSeconds < comparison.offsetSeconds ? 'P earlier' : 'C earlier'
}

export interface SogAxisBounds { minimum: number, maximum: number }

export function sogManeuverCoordinates(offsetSeconds: number, sogKnots: number, bounds: SogAxisBounds) {
  const span = MANEUVER_SOG_INSIGHTS.profileHalfSpanSeconds
  return {
    x: (offsetSeconds + span) / (2 * span) * 1000,
    y: 192 - (sogKnots - bounds.minimum) / (bounds.maximum - bounds.minimum) * 184,
  }
}

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
    const { x, y } = sogManeuverCoordinates(point.time / 1000, point.sog, bounds)
    path += `${beginsSegment ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `
    beginsSegment = false
  }
  return path.trim()
}
