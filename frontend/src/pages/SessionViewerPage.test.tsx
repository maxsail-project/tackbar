import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  resolveSelectedManeuverAnalytics,
  SharedSessionUnavailable,
} from './SessionViewerPage'
import { formatSessionDuration } from '../utils/sessionPresentation'
import type { ActivityManeuverAnalytics } from '../types/maneuver'

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

describe('selected maneuver analytics alignment', () => {
  it('does not reuse previously ready Primary analytics after P changes', () => {
    expect(resolveSelectedManeuverAnalytics(
      readyAnalyticsState('primary-old'),
      'primary-new',
    )).toBeNull()
  })

  it('does not reuse previously ready Comparison analytics after C changes', () => {
    expect(resolveSelectedManeuverAnalytics(
      readyAnalyticsState('comparison-old'),
      'comparison-new',
    )).toBeNull()
  })

  it('removes ready Comparison analytics when Comparison is cleared', () => {
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
