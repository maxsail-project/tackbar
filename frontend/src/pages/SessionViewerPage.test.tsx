import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  createAnalysisWindowReplay,
  createAnalysisWindowSummaryMetrics,
  resolveSelectedManeuverAnalytics,
  SharedSessionUnavailable,
} from './SessionViewerPage'
import { formatSessionDuration } from '../utils/sessionPresentation'
import type { ActivityManeuverAnalytics } from '../types/maneuver'
import type { SummaryMetrics } from '../utils/summaryMetrics'

const analytics: ActivityManeuverAnalytics = {
  activity_id: 'activity-a',
  status: 'available',
  maneuvers: [],
}

function readyAnalyticsState(activityId: string) {
  return {
    activityId,
    status: 'ready' as const,
    analytics: { ...analytics, activity_id: activityId },
  }
}

describe('unavailable shared Session', () => {
  it('shows a generic unavailable state without internal identifiers', () => {
    const markup = renderToStaticMarkup(<SharedSessionUnavailable />)

    expect(markup).toContain('Session not found')
    expect(markup).toContain('shared link is unavailable')
    expect(markup).not.toContain('session_id')
    expect(markup).not.toContain('capability')
  })
})

describe('Session summary presentation', () => {
  it('formats canonical sailing duration compactly', () => {
    expect(formatSessionDuration('2026-09-05T11:49:00Z', '2026-09-05T15:21:00Z')).toBe('3h 32m')
    expect(formatSessionDuration('2026-09-05T11:49:00Z', '2026-09-05T12:37:00Z')).toBe('48m')
  })

  it('counts unique Sailors rather than Activities', () => {
    const activities = [
      { sailor: { id: 'sailor-a' } },
      { sailor: { id: 'sailor-a' } },
      { sailor: { id: 'sailor-b' } },
    ]
    expect(new Set(activities.map((activity) => activity.sailor.id)).size).toBe(2)
  })
})

describe('integrated Analysis Window replay', () => {
  it('passes existing Viewer replay state and callbacks only when replay is available', () => {
    const onTogglePlayback = vi.fn()
    const onSpeedChange = vi.fn()

    expect(createAnalysisWindowReplay(
      false,
      123,
      false,
      1,
      onTogglePlayback,
      onSpeedChange,
    )).toBeNull()

    expect(createAnalysisWindowReplay(
      true,
      123,
      true,
      5,
      onTogglePlayback,
      onSpeedChange,
    )).toEqual({
      playbackTime: 123,
      isPlaying: true,
      speed: 5,
      onTogglePlayback,
      onSpeedChange,
    })
  })

  it('passes the existing summary metric objects to the integrated Analysis Window', () => {
    const primaryMetrics = { distanceMeters: 210 } as SummaryMetrics
    const comparisonMetrics = { distanceMeters: 198 } as SummaryMetrics

    const compared = createAnalysisWindowSummaryMetrics(
      primaryMetrics,
      true,
      comparisonMetrics,
    )
    expect(compared.primaryMetrics).toBe(primaryMetrics)
    expect(compared.comparisonMetrics).toBe(comparisonMetrics)

    expect(createAnalysisWindowSummaryMetrics(
      primaryMetrics,
      false,
      comparisonMetrics,
    )).toEqual({
      primaryMetrics,
      comparisonMetrics: null,
    })
  })
})

describe('selected maneuver analytics alignment', () => {
  it('does not expose stale Primary events or markers after P changes', () => {
    expect(resolveSelectedManeuverAnalytics(
      readyAnalyticsState('primary-old'),
      'primary-new',
    )).toBeNull()
  })

  it('does not expose stale Comparison events or markers after C changes', () => {
    expect(resolveSelectedManeuverAnalytics(
      readyAnalyticsState('comparison-old'),
      'comparison-new',
    )).toBeNull()
  })

  it('removes Comparison events and markers when Comparison is cleared', () => {
    expect(resolveSelectedManeuverAnalytics(
      readyAnalyticsState('comparison'),
      null,
    )).toBeNull()
  })

  it('uses ready analytics only when the selected Activity id matches', () => {
    const state = readyAnalyticsState('activity-a')

    expect(resolveSelectedManeuverAnalytics(state, 'activity-a')).toBe(
      state.analytics,
    )
  })
})
