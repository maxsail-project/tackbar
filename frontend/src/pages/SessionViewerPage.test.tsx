import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  createAnalysisWindowReplay,
  createAnalysisWindowSummaryMetrics,
  createContextualMapActivities,
  createTimelineManeuverNavigation,
  promoteContextualActivityToComparison,
  resolveSelectedDisplayManeuver,
  resolveSelectedManeuverAnalytics,
  SharedSessionUnavailable,
  synchronizeContextualMapActivities,
  TemporaryAccessUnavailable,
} from './SessionViewerPage'
import { formatSessionDuration, formatSessionIdentity } from '../utils/sessionPresentation'
import type { ActivityManeuverAnalytics } from '../types/maneuver'
import type { SummaryMetrics } from '../utils/summaryMetrics'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import { maneuverSelectionKey } from '../utils/maneuverEvents'
import type { SessionActivity } from '../types/session'
import type { ActivityTrack, TrackSample } from '../types/track'

const analytics: ActivityManeuverAnalytics = {
  activity_id: 'activity-a',
  status: 'available',
  detector_mode: 'HIGH',
  signal_basis: ['hdg'],
  maneuvers: [],
}

function readyAnalyticsState(activityId: string) {
  return {
    activityId,
    status: 'ready' as const,
    analytics: { ...analytics, activity_id: activityId },
  }
}

function sessionActivity(id: string, identity: string): SessionActivity {
  return {
    id,
    source: 'test',
    device_name: 'Synthetic device',
    original_filename: `${id}.csv.gz`,
    start_time: '2031-01-01T10:00:00Z',
    end_time: '2031-01-01T10:00:04Z',
    sample_count: 3,
    sailor: { id: `sailor-${id}`, name: identity, email: `${id}@example.test` },
    boat: null,
  }
}

function trackSample(utc: string, lat: number, lon: number, cog = 90): TrackSample {
  return {
    utc,
    lat,
    lon,
    dist: 0,
    sog: 4,
    cog,
    hdg: null,
    heel: null,
    trim: null,
  }
}

function activityTrack(activityId: string, latitude: number): ActivityTrack {
  return {
    activity_id: activityId,
    samples: [
      trackSample('2031-01-01T10:00:00Z', latitude, -30.72),
      trackSample('2031-01-01T10:00:02Z', latitude, -30.70),
      trackSample('2031-01-01T10:00:04Z', latitude, -30.68),
    ],
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

  it('distinguishes expired and invalidated temporary access safely', () => {
    const expired = renderToStaticMarkup(
      <TemporaryAccessUnavailable state="expired" />,
    )
    const invalidated = renderToStaticMarkup(
      <TemporaryAccessUnavailable state="unavailable" />,
    )

    expect(expired).toContain('Temporary access expired')
    expect(invalidated).toContain('Temporary access no longer available')
    expect(expired + invalidated).not.toContain('capability')
  })
})

describe('Session summary presentation', () => {
  it('formats canonical sailing duration compactly', () => {
    expect(formatSessionDuration('2026-09-05T11:49:00Z', '2026-09-05T15:21:00Z')).toBe('3h 32m')
    expect(formatSessionDuration('2026-09-05T11:49:00Z', '2026-09-05T12:37:00Z')).toBe('48m')
  })

  it('uses location plus date as Session identity with a date-only fallback', () => {
    expect(formatSessionIdentity('Mahón', 'Spain', '2026-09-16T11:45:00Z'))
      .toBe('Mahón · 16 Sep 2026')
    expect(formatSessionIdentity('  ', ' Spain ', '2026-09-16T11:45:00Z'))
      .toBe('Spain · 16 Sep 2026')
    expect(formatSessionIdentity(null, null, '2026-09-16T11:45:00Z'))
      .toBe('16 Sep 2026')
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

describe('fleet context map state', () => {
  const activities = [
    sessionActivity('primary', 'Primary Sailor'),
    sessionActivity('comparison', 'Comparison Sailor'),
    sessionActivity('context-one', 'Context One'),
    sessionActivity('context-two', 'Context Two'),
  ]
  const tracks = new Map<string, ActivityTrack>([
    ['context-one', activityTrack('context-one', 0.26)],
    ['context-two', activityTrack('context-two', 0.27)],
  ])
  const analysisWindow = {
    start: Date.parse('2031-01-01T10:00:01Z'),
    end: Date.parse('2031-01-01T10:00:03Z'),
  }

  it('keeps window-scoped geometry while interpolating a marker across the boundary sample gap', () => {
    const context = synchronizeContextualMapActivities(createContextualMapActivities(
      activities,
      'primary',
      'comparison',
      tracks,
      analysisWindow,
    ), analysisWindow, Date.parse('2031-01-01T10:00:01.500Z'))

    expect(context.map((activity) => activity.id)).toEqual([
      'context-one',
      'context-two',
    ])
    expect(context[0].visibleSamples.map((sample) => sample.utc)).toEqual([
      '2031-01-01T10:00:02Z',
    ])
    expect(context[0].identity).toContain('Context One')
    expect(context[0].identity).toContain('10:00')
    expect(context[0].boatPosition?.lat).toBe(0.26)
    expect(context[0].boatPosition?.lon).toBeCloseTo(-30.705)
    expect(context[0].cog).toBe(90)
  })

  it('holds a contextual marker at the first position before Activity coverage', () => {
    const contextOneTrack = activityTrack('context-one', 0.26)
    const limitedTracks = new Map<string, ActivityTrack>([
      ['context-one', { ...contextOneTrack, samples: contextOneTrack.samples.slice(1) }],
    ])
    const context = synchronizeContextualMapActivities(createContextualMapActivities(
      activities,
      'primary',
      'comparison',
      limitedTracks,
      analysisWindow,
    ), analysisWindow, Date.parse('2031-01-01T10:00:01.500Z'))

    expect(context[0].boatPosition).toEqual({ lat: 0.26, lon: -30.70 })
    expect(context[0].cog).toBe(90)
  })

  it('interpolates a contextual marker while playback is inside Activity coverage', () => {
    const context = synchronizeContextualMapActivities(createContextualMapActivities(
      activities,
      'primary',
      'comparison',
      tracks,
      analysisWindow,
    ), analysisWindow, Date.parse('2031-01-01T10:00:03Z'))

    expect(context[0].boatPosition?.lat).toBe(0.26)
    expect(context[0].boatPosition?.lon).toBeCloseTo(-30.69)
    expect(context[0].cog).toBe(90)
  })

  it('holds a contextual marker at the last position after Activity coverage', () => {
    const contextTwoTrack = activityTrack('context-two', 0.27)
    const limitedTracks = new Map<string, ActivityTrack>([
      ['context-two', { ...contextTwoTrack, samples: contextTwoTrack.samples.slice(0, 2) }],
    ])
    const context = synchronizeContextualMapActivities(createContextualMapActivities(
      activities,
      'primary',
      'comparison',
      limitedTracks,
      analysisWindow,
    ), analysisWindow, Date.parse('2031-01-01T10:00:02.500Z'))

    expect(context[0].boatPosition).toEqual({ lat: 0.27, lon: -30.70 })
    expect(context[0].cog).toBe(90)
  })

  it('omits contextual Activities whose temporal coverage does not overlap the window', () => {
    const nonOverlappingTrack = activityTrack('context-one', 0.26)
    const context = createContextualMapActivities(
      activities,
      'primary',
      'comparison',
      new Map([[
        'context-one',
        { ...nonOverlappingTrack, samples: nonOverlappingTrack.samples.slice(0, 1) },
      ]]),
      analysisWindow,
    )

    expect(context).toEqual([])
  })

  it('does not show a contextual marker outside the Analysis Window', () => {
    const context = synchronizeContextualMapActivities(createContextualMapActivities(
      activities,
      'primary',
      'comparison',
      tracks,
      analysisWindow,
    ), analysisWindow, Date.parse('2031-01-01T10:00:00.500Z'))

    expect(context.every((activity) => activity.boatPosition === null)).toBe(true)
  })

  it('omits unavailable context without changing the active pair', () => {
    const context = createContextualMapActivities(
      activities,
      'primary',
      'comparison',
      new Map([['context-one', activityTrack('context-one', 0.26)]]),
      analysisWindow,
    )

    expect(context.map((activity) => activity.id)).toEqual(['context-one'])
    expect(promoteContextualActivityToComparison('primary', 'context-one'))
      .toBe('context-one')
    expect(promoteContextualActivityToComparison('primary', 'primary')).toBeNull()
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

  it('creates repeatable one-shot map focus requests from the explicit maneuver role', () => {
    const primaryEvent = {
      activityRole: 'primary',
      centerTimeMs: 123,
    } as DisplayManeuver
    const comparisonEvent = {
      activityRole: 'comparison',
      centerTimeMs: 456,
    } as DisplayManeuver

    expect(createTimelineManeuverNavigation(primaryEvent, 1)).toEqual({
      playbackTime: 123,
      focusRequest: {
        activityRole: 'primary',
        requestId: 1,
      },
    })
    expect(createTimelineManeuverNavigation(comparisonEvent, 2)).toEqual({
      playbackTime: 456,
      focusRequest: {
        activityRole: 'comparison',
        requestId: 2,
      },
    })
    expect(createTimelineManeuverNavigation(comparisonEvent, 3)).toEqual({
      playbackTime: 456,
      focusRequest: {
        activityRole: 'comparison',
        requestId: 3,
      },
    })
  })
})

describe('selected maneuver analytics alignment', () => {
  const primaryEvent = {
    activityRole: 'primary',
    centerTimeMs: 123,
    maneuver: {
      start_time: '2031-01-01T10:00:01Z',
      center_time: '2031-01-01T10:00:02Z',
      end_time: '2031-01-01T10:00:03Z',
    },
  } as DisplayManeuver
  const comparisonEvent = {
    activityRole: 'comparison',
    centerTimeMs: 456,
    maneuver: {
      start_time: '2031-01-01T10:00:04Z',
      center_time: '2031-01-01T10:00:05Z',
      end_time: '2031-01-01T10:00:06Z',
    },
  } as DisplayManeuver

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

  it('resolves the selected event only from maneuvers in the displayed window', () => {
    const selectedKey = maneuverSelectionKey(comparisonEvent)

    expect(resolveSelectedDisplayManeuver(
      selectedKey,
      [primaryEvent, comparisonEvent],
    )).toBe(comparisonEvent)
    expect(resolveSelectedDisplayManeuver(selectedKey, [primaryEvent])).toBeNull()
    expect(resolveSelectedDisplayManeuver(null, [comparisonEvent])).toBeNull()
  })
})
