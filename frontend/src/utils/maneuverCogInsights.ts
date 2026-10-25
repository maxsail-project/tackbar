import { MANEUVER_COG_INSIGHTS, MANEUVER_SOG_INSIGHTS } from '../config/maneuverProfile'
import type { SogChartPoint } from './metricChartData'

export interface CogManeuverInsights {
  turnAngleDeg: number | null
  turnMidpointSeconds: number | null
  turnStartSeconds: number | null
  turnEndSeconds: number | null
  turnDurationSeconds: number | null
}

function median(values: number[]): number {
  values.sort((a, b) => a - b)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
}

/** The input is the supported, unsmoothed 51-position relative COG median. */
export function calculateCogManeuverInsights(points: readonly SogChartPoint[]): CogManeuverInsights {
  const unavailable = { turnAngleDeg: null, turnMidpointSeconds: null, turnStartSeconds: null,
    turnEndSeconds: null, turnDurationSeconds: null }
  const valueAt = (offset: number): number | null => {
    const point = points[offset + MANEUVER_SOG_INSIGHTS.profileHalfSpanSeconds]
    return point?.time === offset * 1000 && point.sog !== null && Number.isFinite(point.sog) ? point.sog : null
  }
  const level = (window: typeof MANEUVER_COG_INSIGHTS.entry | typeof MANEUVER_COG_INSIGHTS.exit) => {
    const values: number[] = []
    for (let offset = window.firstOffsetSeconds; offset <= window.lastOffsetSeconds; offset += 1) {
      const value = valueAt(offset)
      if (value !== null) values.push(value)
    }
    return values.length >= window.minimumSupportedPositions ? median(values) : null
  }
  const entry = level(MANEUVER_COG_INSIGHTS.entry)
  const exit = level(MANEUVER_COG_INSIGHTS.exit)
  if (entry === null || exit === null || exit <= entry) return unavailable
  const turnAngleDeg = exit - entry

  type Crossing = { time: number, firstAboveOffset: number }
  const crossings = (threshold: number): Crossing[] => {
    const found: Crossing[] = []
    for (let offset = MANEUVER_COG_INSIGHTS.centralStartSeconds;
      offset <= MANEUVER_COG_INSIGHTS.centralEndSeconds; offset += 1) {
      const before = valueAt(offset - 1)
      const after = valueAt(offset)
      const confirmation = valueAt(offset + MANEUVER_COG_INSIGHTS.confirmationSeconds - 1)
      if (before === null || after === null || confirmation === null
        || before >= threshold || after < threshold || confirmation < threshold) continue
      found.push({ time: offset - 1 + (threshold - before) / (after - before), firstAboveOffset: offset })
    }
    return found
  }
  const startThreshold = entry + MANEUVER_COG_INSIGHTS.startFraction * turnAngleDeg
  const endThreshold = entry + MANEUVER_COG_INSIGHTS.endFraction * turnAngleDeg
  const starts = crossings(startThreshold)
  const ends = crossings(endThreshold)
  const midpoints = crossings(0)
  for (const end of ends) {
    for (const start of starts) {
      if (start.time >= end.time) continue
      let continuous = true
      for (let offset = start.firstAboveOffset; offset <= end.firstAboveOffset + 1; offset += 1) {
        const value = valueAt(offset)
        if (value === null || (offset < end.firstAboveOffset && value < startThreshold)) {
          continuous = false
          break
        }
      }
      if (!continuous) continue
      const midpoint = midpoints.find((candidate) => {
        const first = Math.min(start.firstAboveOffset, candidate.firstAboveOffset)
        const last = Math.max(end.firstAboveOffset, candidate.firstAboveOffset) + 1
        for (let offset = first; offset <= last; offset += 1) {
          const value = valueAt(offset)
          if (value === null || (offset >= candidate.firstAboveOffset && value < 0)) return false
        }
        return true
      })
      return { turnAngleDeg, turnMidpointSeconds: midpoint?.time ?? null,
        turnStartSeconds: start.time, turnEndSeconds: end.time,
        turnDurationSeconds: end.time - start.time }
    }
  }
  return { ...unavailable, turnAngleDeg }
}
