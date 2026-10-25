import { MANEUVER_HEEL_INSIGHTS, MANEUVER_SOG_INSIGHTS } from '../config/maneuverProfile'
import type { SogChartPoint } from './metricChartData'
import type { SogAxisBounds } from './maneuverSogInsights'

export interface HeelManeuverInsights {
  entryHeel: number | null
  heelVariation: number | null
  exitHeel: number | null
}

function median(values: number[]): number {
  values.sort((a, b) => a - b)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
}

function supportedValues(points: readonly SogChartPoint[], window: {
  firstOffsetSeconds: number
  lastOffsetSeconds: number
  minimumSupportedPositions: number
}): number[] | null {
  const values: number[] = []
  for (let offset = window.firstOffsetSeconds; offset <= window.lastOffsetSeconds; offset += 1) {
    const point = points[offset + MANEUVER_SOG_INSIGHTS.profileHalfSpanSeconds]
    if (point?.time === offset * 1000 && point.sog !== null && Number.isFinite(point.sog)) values.push(point.sog)
  }
  return values.length >= window.minimumSupportedPositions ? values : null
}

/** Input is the chart's supported, unsmoothed |HEEL| median; unsupported offsets are null. */
export function calculateHeelManeuverInsights(points: readonly SogChartPoint[]): HeelManeuverInsights {
  const entryValues = supportedValues(points, MANEUVER_HEEL_INSIGHTS.entry)
  const centralValues = supportedValues(points, MANEUVER_HEEL_INSIGHTS.central)
  const exitValues = supportedValues(points, MANEUVER_HEEL_INSIGHTS.exit)
  const entryHeel = entryValues === null ? null : median(entryValues)
  const centralHeel = centralValues === null ? null : median(centralValues)
  return {
    entryHeel,
    heelVariation: entryHeel === null || centralHeel === null ? null : centralHeel - entryHeel,
    exitHeel: exitValues === null ? null : median(exitValues),
  }
}

/** Zero-based degree scale shared by visible P/C |HEEL| curves. */
export function heelManeuverAxisBounds(...series: readonly SogChartPoint[][]): SogAxisBounds {
  const values = series.flat().flatMap((point) => point.sog === null || !Number.isFinite(point.sog) ? [] : [point.sog])
  return { minimum: 0, maximum: values.length === 0 ? 3 : Math.max(3, Math.ceil(Math.max(...values) + 0.2)) }
}
