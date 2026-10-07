import type { ActivityManeuverAnalytics, Maneuver } from '../types/maneuver'
import type { AnalysisWindowRange } from './analysisWindow'
import { timestampToMilliseconds } from './replay'

export type ManeuverActivityRole = 'primary' | 'comparison'

export interface DisplayManeuver {
  activityRole: ManeuverActivityRole
  maneuver: Maneuver
  centerTimeMs: number
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
  return rounded < 0 ? `−${Math.abs(rounded)}°` : `+${rounded}°`
}
