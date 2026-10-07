import type { ActivityManeuverAnalytics, Maneuver } from '../types/maneuver'
import type { AnalysisWindowRange } from './analysisWindow'
import { timestampToMilliseconds } from './replay'

export type ManeuverActivityRole = 'primary' | 'comparison'

export interface DisplayManeuver {
  activityRole: ManeuverActivityRole
  maneuver: Maneuver
  centerTimeMs: number
}

export function maneuverSelectionKey(event: DisplayManeuver) {
  return [
    event.activityRole,
    event.maneuver.start_time,
    event.maneuver.center_time,
    event.maneuver.end_time,
  ].join(':')
}

export function retainDisplayedManeuverSelection(
  selectedKey: string | null,
  events: DisplayManeuver[],
) {
  if (selectedKey === null) return null
  return events.some((event) => maneuverSelectionKey(event) === selectedKey)
    ? selectedKey
    : null
}

function availableEvents(
  analytics: ActivityManeuverAnalytics | null,
  activityRole: ManeuverActivityRole,
  analysisWindow: AnalysisWindowRange,
) {
  if (analytics?.status !== 'available') return []

  return analytics.maneuvers.flatMap((maneuver): DisplayManeuver[] => {
    let centerTimeMs: number
    try {
      centerTimeMs = timestampToMilliseconds(maneuver.center_time)
    } catch {
      return []
    }

    if (
      centerTimeMs < analysisWindow.start
      || centerTimeMs > analysisWindow.end
    ) return []

    return [{ activityRole, maneuver, centerTimeMs }]
  })
}

export function deriveDisplayManeuvers(
  primaryAnalytics: ActivityManeuverAnalytics | null,
  comparisonAnalytics: ActivityManeuverAnalytics | null,
  analysisWindow: AnalysisWindowRange,
) {
  return [
    ...availableEvents(primaryAnalytics, 'primary', analysisWindow),
    ...availableEvents(comparisonAnalytics, 'comparison', analysisWindow),
  ].sort((first, second) => {
    const timeDifference = first.centerTimeMs - second.centerTimeMs
    if (timeDifference !== 0) return timeDifference
    if (first.activityRole === second.activityRole) return 0
    return first.activityRole === 'primary' ? -1 : 1
  })
}

export function formatHeadingChange(headingChangeDegrees: number) {
  const rounded = Math.round(headingChangeDegrees)
  return rounded < 0 ? `−${Math.abs(rounded)}` : `+${rounded}`
}

export function formatSeconds(value: number | null | undefined) {
  return value == null ? '—' : Math.round(value).toString()
}

export function formatKnots(value: number | null | undefined) {
  return value == null ? '—' : value.toFixed(1)
}

export function formatMetres(value: number | null | undefined) {
  return value == null ? '—' : Math.round(value).toString()
}
