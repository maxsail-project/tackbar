import TackBarBrand from '../components/TackBarBrand'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ActivityManeuverAnalyticsNotFoundError,
  ActivityTrackNotFoundError,
  createTemporarySessionShare,
  getActivityManeuversForAccess,
  getActivityTrackForAccess,
  getSessionForAccess,
  SessionNotFoundError,
  TemporaryAccessExpiredError,
  TemporaryAccessNotFoundError,
  TemporaryAccessUnavailableError,
} from '../api/tackbarApi'
import ActivitySelector from '../components/ActivitySelector'
import AnalysisWindow, {
  type AnalysisWindowReplay,
} from '../components/AnalysisWindow'
import ComparisonTable from '../components/ComparisonTable'
import IndividualAnalysis from '../components/IndividualAnalysis'
import MetricChart from '../components/MetricChart'
import MetricSelector, {
  DEFAULT_VIEWER_METRIC_VIEW,
  type ViewerMetricView,
} from '../components/MetricSelector'
import VsDistributionView from '../components/VsDistributionView'
import ManeuverEventTable, {
  type ManeuverPresentationStatus,
} from '../components/ManeuverEventTable'
import TrackMap, {
  type ContextualMapActivity,
  createMapFitContextKey,
  type MapFocusRequest,
} from '../components/TrackMap'
import {
  SessionSharePanel,
  SessionSummaryHeading,
  SessionViewerHeader,
} from '../components/SessionShare'
import type {
  SessionAccess,
  SessionActivity,
  SessionDetail,
  SharedSessionDetail,
  TemporarySessionDetail,
  TemporarySessionShare,
} from '../types/session'
import type { ActivityTrack, TrackSample } from '../types/track'
import type { ActivityManeuverAnalytics } from '../types/maneuver'
import {
  commitSessionTimelineWindow,
  createFullAnalysisWindow,
  filterSamplesByAnalysisWindow,
  intersectAnalysisWindowRanges,
  reconcileAnalysisWindow,
  type AnalysisWindowRange,
} from '../utils/analysisWindow'
import {
  advancePlaybackTime,
  clampPlaybackTime,
  selectReplayTime,
  timestampToMilliseconds,
  type PlaybackSpeed,
} from '../utils/replay'
import {
  resolveReplayPresentation,
} from '../utils/metricPresentation'
import { calculateSummaryMetrics, type SummaryMetrics } from '../utils/summaryMetrics'
import { formatActivityIdentity, formatActivityLabel } from '../utils/activityLabel'
import { formatSessionDuration, formatSessionRange } from '../utils/sessionPresentation'
import {
  deriveDisplayManeuvers,
  maneuverSelectionKey,
  retainDisplayedManeuverSelection,
  type DisplayManeuver,
} from '../utils/maneuverEvents'

type TrackLoadStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error'

interface TrackLoadState {
  activityId: string | null
  status: TrackLoadStatus
  track: ActivityTrack | null
}

function useActivityTrack(
  access: SessionAccess,
  activityId: string | null,
  cache: Map<string, ActivityTrack>,
): TrackLoadState {
  const [state, setState] = useState<TrackLoadState>({
    activityId: null,
    status: 'idle',
    track: null,
  })

  useEffect(() => {
    if (activityId === null) {
      setState({ activityId: null, status: 'idle', track: null })
      return
    }

    const cachedTrack = cache.get(activityId)
    if (cachedTrack) {
      setState({ activityId, status: 'ready', track: cachedTrack })
      return
    }

    const controller = new AbortController()
    let isCurrent = true
    setState({ activityId, status: 'loading', track: null })

    getActivityTrackForAccess(access, activityId, controller.signal).then((track) => {
      if (!isCurrent) return
      if (track.activity_id !== activityId) {
        setState({ activityId, status: 'error', track: null })
        return
      }
      cache.set(activityId, track)
      setState({ activityId, status: 'ready', track })
    }).catch((error: unknown) => {
      if (!isCurrent || (error instanceof DOMException && error.name === 'AbortError')) return
      setState({
        activityId,
        status: error instanceof ActivityTrackNotFoundError ? 'not-found' : 'error',
        track: null,
      })
    })

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [access.kind, access.token, activityId, cache])

  return state
}

function useContextualActivityTracks(
  access: SessionAccess,
  activityIds: string[],
  cache: Map<string, ActivityTrack>,
) {
  const activityIdsKey = activityIds.join('\u0000')
  const [tracks, setTracks] = useState<Map<string, ActivityTrack>>(new Map())

  useEffect(() => {
    const controllers: AbortController[] = []
    let isCurrent = true
    const requestedIds = activityIdsKey === '' ? [] : activityIdsKey.split('\u0000')
    const cachedTracks = new Map<string, ActivityTrack>()

    requestedIds.forEach((activityId) => {
      const cachedTrack = cache.get(activityId)
      if (cachedTrack) cachedTracks.set(activityId, cachedTrack)
    })
    setTracks(cachedTracks)

    requestedIds.forEach((activityId) => {
      if (cachedTracks.has(activityId)) return
      const controller = new AbortController()
      controllers.push(controller)
      getActivityTrackForAccess(access, activityId, controller.signal).then((track) => {
        if (!isCurrent || track.activity_id !== activityId) return
        cache.set(activityId, track)
        setTracks((current) => new Map(current).set(activityId, track))
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Fleet context is optional; an unavailable track must not break the debrief.
      })
    })

    return () => {
      isCurrent = false
      controllers.forEach((controller) => controller.abort())
    }
  }, [access.kind, access.token, activityIdsKey, cache])

  return tracks
}

export function promoteContextualActivityToComparison(
  primaryActivityId: string,
  contextualActivityId: string,
) {
  return contextualActivityId === primaryActivityId ? null : contextualActivityId
}

interface ContextualReplayMapActivity extends ContextualMapActivity {
  replaySamples: TrackSample[]
}

export function createContextualMapActivities(
  activities: SessionActivity[],
  primaryActivityId: string,
  comparisonActivityId: string | null,
  tracks: Map<string, ActivityTrack>,
  analysisWindow: AnalysisWindowRange | null,
): ContextualReplayMapActivity[] {
  if (analysisWindow === null) return []

  return activities.flatMap((activity) => {
    if (
      activity.id === primaryActivityId
      || activity.id === comparisonActivityId
    ) return []

    const track = tracks.get(activity.id)
    if (!track) return []
    if (track.samples.length === 0) return []
    const firstTime = timestampToMilliseconds(track.samples[0].utc)
    const lastTime = timestampToMilliseconds(
      track.samples[track.samples.length - 1].utc,
    )
    if (
      lastTime < analysisWindow.start
      || firstTime > analysisWindow.end
    ) return []
    const visibleSamples = filterSamplesByAnalysisWindow(
      track.samples,
      analysisWindow.start,
      analysisWindow.end,
    )

    return [{
      id: activity.id,
      identity: formatActivityLabel(activity),
      visibleSamples,
      replaySamples: track.samples,
      boatPosition: null,
      cog: null,
    }]
  })
}

export function synchronizeContextualMapActivities(
  activities: ContextualReplayMapActivity[],
  analysisWindow: AnalysisWindowRange,
  playbackTime: number,
): ContextualMapActivity[] {
  return activities.map((activity) => {
    if (
      playbackTime < analysisWindow.start
      || playbackTime > analysisWindow.end
    ) {
      return {
        id: activity.id,
        identity: activity.identity,
        visibleSamples: activity.visibleSamples,
        boatPosition: null,
        cog: null,
      }
    }

    const replayPresentation = resolveReplayPresentation(
      activity.replaySamples,
      playbackTime,
    )
    return {
      id: activity.id,
      identity: activity.identity,
      visibleSamples: activity.visibleSamples,
      boatPosition: replayPresentation.position,
      cog: replayPresentation.cog,
    }
  })
}

type ManeuverLoadStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error'

interface ManeuverLoadState {
  activityId: string | null
  status: ManeuverLoadStatus
  analytics: ActivityManeuverAnalytics | null
}

export function resolveSelectedManeuverAnalytics(
  state: ManeuverLoadState,
  selectedActivityId: string | null,
) {
  return selectedActivityId !== null
    && state.activityId === selectedActivityId
    && state.status === 'ready'
    ? state.analytics
    : null
}

export function createAnalysisWindowReplay(
  canReplay: boolean,
  playbackTime: number,
  isPlaying: boolean,
  speed: PlaybackSpeed,
  onTogglePlayback: () => void,
  onSpeedChange: (speed: PlaybackSpeed) => void,
): AnalysisWindowReplay | null {
  if (!canReplay) return null
  return {
    playbackTime,
    isPlaying,
    speed,
    onTogglePlayback,
    onSpeedChange,
  }
}

export function createAnalysisWindowSummaryMetrics(
  primaryMetrics: SummaryMetrics | null,
  hasComparison: boolean,
  comparisonMetrics: SummaryMetrics | null,
) {
  return {
    primaryMetrics,
    comparisonMetrics: hasComparison ? comparisonMetrics : null,
  }
}

export function createTimelineManeuverNavigation(
  event: DisplayManeuver,
  requestId: number,
): { playbackTime: number, focusRequest: MapFocusRequest } {
  return {
    playbackTime: event.centerTimeMs,
    focusRequest: {
      activityRole: event.activityRole,
      requestId,
    },
  }
}

export function resolveSelectedDisplayManeuver(
  selectedManeuverKey: string | null,
  displayManeuvers: DisplayManeuver[],
) {
  if (selectedManeuverKey === null) return null
  return displayManeuvers.find(
    (event) => maneuverSelectionKey(event) === selectedManeuverKey,
  ) ?? null
}

function useActivityManeuvers(
  access: SessionAccess,
  activityId: string | null,
  cache: Map<string, ActivityManeuverAnalytics>,
): ManeuverLoadState {
  const [state, setState] = useState<ManeuverLoadState>({
    activityId: null,
    status: 'idle',
    analytics: null,
  })

  useEffect(() => {
    if (activityId === null) {
      setState({ activityId: null, status: 'idle', analytics: null })
      return
    }

    const cachedAnalytics = cache.get(activityId)
    if (cachedAnalytics) {
      setState({ activityId, status: 'ready', analytics: cachedAnalytics })
      return
    }

    const controller = new AbortController()
    let isCurrent = true
    setState({ activityId, status: 'loading', analytics: null })

    getActivityManeuversForAccess(access, activityId, controller.signal).then((analytics) => {
      if (!isCurrent) return
      if (analytics.activity_id !== activityId) {
        setState({ activityId, status: 'error', analytics: null })
        return
      }
      cache.set(activityId, analytics)
      setState({ activityId, status: 'ready', analytics })
    }).catch((error: unknown) => {
      if (!isCurrent || (error instanceof DOMException && error.name === 'AbortError')) return
      setState({
        activityId,
        status: error instanceof ActivityManeuverAnalyticsNotFoundError
          ? 'not-found'
          : 'error',
        analytics: null,
      })
    })

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [access.kind, access.token, activityId, cache])

  return state
}

function maneuverPresentationStatus(
  state: ManeuverLoadState,
  selectedActivityId: string | null,
): ManeuverPresentationStatus {
  if (
    selectedActivityId !== null
    && (
      state.activityId !== selectedActivityId
      || state.status === 'loading'
      || state.status === 'idle'
    )
  ) return 'loading'

  if (state.status !== 'ready' || state.analytics === null) return 'error'
  return state.analytics.status
}

function activityTrackRange(track: ActivityTrack | null) {
  if (!track || track.samples.length === 0) return null
  return createFullAnalysisWindow(
    timestampToMilliseconds(track.samples[0].utc),
    timestampToMilliseconds(track.samples[track.samples.length - 1].utc),
  )
}

export function SessionViewer({
  access,
  session,
}: {
  access: SessionAccess
  session: SessionDetail
}) {
  const [primaryActivityId, setPrimaryActivityId] = useState(
    session.activities[0]?.id ?? '',
  )
  const [comparisonActivityId, setComparisonActivityId] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<ViewerMetricView>(
    DEFAULT_VIEWER_METRIC_VIEW,
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const trackCache = useRef(new Map<string, ActivityTrack>()).current
  const maneuverCache = useRef(new Map<string, ActivityManeuverAnalytics>()).current
  const [sharePanelOpen, setSharePanelOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [temporaryShare, setTemporaryShare] = useState<TemporarySessionShare | null>(null)
  const contextualActivityIds = useMemo(
    () => session.activities
      .filter((activity) => (
        activity.id !== primaryActivityId
        && activity.id !== comparisonActivityId
      ))
      .map((activity) => activity.id),
    [comparisonActivityId, primaryActivityId, session.activities],
  )
  const contextualTracks = useContextualActivityTracks(
    access,
    contextualActivityIds,
    trackCache,
  )

  const primaryActivity = session.activities.find(
    (activity) => activity.id === primaryActivityId,
  ) ?? session.activities[0]
  const comparisonActivity = session.activities.find(
    (activity) => activity.id === comparisonActivityId,
  )
  const comparisonOptions = session.activities.filter(
    (activity) => activity.id !== primaryActivityId,
  )
  const primaryTrackState = useActivityTrack(access, primaryActivityId || null, trackCache)
  const comparisonTrackState = useActivityTrack(access, comparisonActivityId, trackCache)
  const primaryManeuverState = useActivityManeuvers(
    access,
    primaryActivityId || null,
    maneuverCache,
  )
  const comparisonManeuverState = useActivityManeuvers(
    access,
    comparisonActivityId,
    maneuverCache,
  )
  const primaryTrack = primaryTrackState.activityId === primaryActivityId
    && primaryTrackState.status === 'ready'
    ? primaryTrackState.track
    : null
  const comparisonTrack = comparisonTrackState.activityId === comparisonActivityId
    && comparisonTrackState.status === 'ready'
    ? comparisonTrackState.track
    : null
  const primaryRange = useMemo(
    () => activityTrackRange(primaryTrack),
    [primaryTrack],
  )
  const comparisonRange = useMemo(
    () => activityTrackRange(comparisonTrack),
    [comparisonTrack],
  )
  const availableRange = useMemo(() => {
    if (primaryRange === null) return null
    if (comparisonActivityId === null) return primaryRange
    if (comparisonRange === null) return primaryRange
    return intersectAnalysisWindowRanges(primaryRange, comparisonRange)
  }, [comparisonActivityId, comparisonRange, primaryRange])
  const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindowRange | null>(
    primaryRange,
  )
  const windowStart = analysisWindow?.start ?? null
  const windowEnd = analysisWindow?.end ?? null
  const primaryAvailableSamples = useMemo(
    () => primaryTrack && availableRange
      ? filterSamplesByAnalysisWindow(
          primaryTrack.samples,
          availableRange.start,
          availableRange.end,
        )
      : [],
    [availableRange, primaryTrack],
  )
  const comparisonAvailableSamples = useMemo(
    () => comparisonTrack && availableRange
      ? filterSamplesByAnalysisWindow(
          comparisonTrack.samples,
          availableRange.start,
          availableRange.end,
        )
      : [],
    [availableRange, comparisonTrack],
  )
  const primaryWindowSamples = useMemo(
    () => primaryTrack && analysisWindow
      ? filterSamplesByAnalysisWindow(
          primaryTrack.samples,
          analysisWindow.start,
          analysisWindow.end,
        )
      : [],
    [analysisWindow, primaryTrack],
  )
  const comparisonWindowSamples = useMemo(
    () => comparisonTrack && analysisWindow
      ? filterSamplesByAnalysisWindow(
          comparisonTrack.samples,
          analysisWindow.start,
          analysisWindow.end,
        )
      : [],
    [analysisWindow, comparisonTrack],
  )
  const primarySummaryMetrics = useMemo(
    () => primaryWindowSamples.length > 0 && primaryTrack && analysisWindow
      ? calculateSummaryMetrics(primaryTrack.samples, analysisWindow)
      : null,
    [analysisWindow, primaryTrack, primaryWindowSamples],
  )
  const comparisonSummaryMetrics = useMemo(
    () => comparisonWindowSamples.length > 0 && comparisonTrack && analysisWindow
      ? calculateSummaryMetrics(comparisonTrack.samples, analysisWindow)
      : null,
    [analysisWindow, comparisonTrack, comparisonWindowSamples],
  )
  const [playbackTime, setPlaybackTime] = useState(windowStart ?? 0)
  const [selectedManeuverKey, setSelectedManeuverKey] = useState<string | null>(null)
  const playbackTimeRef = useRef(playbackTime)
  const mapFocusRequestIdRef = useRef(0)
  const [mapFocusRequest, setMapFocusRequest] = useState<MapFocusRequest | null>(null)
  const analysisWindowRef = useRef(analysisWindow)
  const speedRef = useRef(speed)
  const primaryReplayPresentation = useMemo(
    () => resolveReplayPresentation(
      primaryWindowSamples,
      playbackTime,
    ),
    [playbackTime, primaryWindowSamples],
  )
  const comparisonReplayPresentation = useMemo(
    () => resolveReplayPresentation(
      comparisonWindowSamples,
      playbackTime,
    ),
    [comparisonWindowSamples, playbackTime],
  )
  const contextualWindowActivities = useMemo(
    () => createContextualMapActivities(
      session.activities,
      primaryActivityId,
      comparisonActivityId,
      contextualTracks,
      analysisWindow,
    ),
    [
      analysisWindow,
      comparisonActivityId,
      contextualTracks,
      primaryActivityId,
      session.activities,
    ],
  )
  const contextualMapActivities = useMemo(
    () => analysisWindow === null
      ? []
      : synchronizeContextualMapActivities(
          contextualWindowActivities,
          analysisWindow,
          playbackTime,
        ),
    [analysisWindow, contextualWindowActivities, playbackTime],
  )
  const primaryManeuverAnalytics = resolveSelectedManeuverAnalytics(
    primaryManeuverState,
    primaryActivityId || null,
  )
  const comparisonManeuverAnalytics = resolveSelectedManeuverAnalytics(
    comparisonManeuverState,
    comparisonActivityId,
  )
  const displayManeuvers = useMemo(
    () => analysisWindow === null
      ? []
      : deriveDisplayManeuvers(
          primaryManeuverAnalytics,
          comparisonManeuverAnalytics,
          analysisWindow,
        ),
    [analysisWindow, comparisonManeuverAnalytics, primaryManeuverAnalytics],
  )
  const timelineManeuvers = useMemo(
    () => availableRange === null
      ? []
      : deriveDisplayManeuvers(
          primaryManeuverAnalytics,
          comparisonManeuverAnalytics,
          availableRange,
        ),
    [availableRange, comparisonManeuverAnalytics, primaryManeuverAnalytics],
  )
  const selectedManeuver = resolveSelectedDisplayManeuver(
    selectedManeuverKey,
    displayManeuvers,
  )
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    setSelectedManeuverKey((current) => (
      retainDisplayedManeuverSelection(current, displayManeuvers)
    ))
  }, [displayManeuvers])

  useEffect(() => {
    if (primaryTrackState.status === 'loading') {
      setIsPlaying(false)
    }
  }, [primaryTrackState.status])

  useEffect(() => {
    const nextWindow = availableRange === null
      ? null
      : reconcileAnalysisWindow(analysisWindowRef.current, availableRange)
    const nextPlaybackTime = nextWindow === null
      ? 0
      : clampPlaybackTime(
          playbackTimeRef.current,
          nextWindow.start,
          nextWindow.end,
        )
    setIsPlaying(false)
    setMapFocusRequest(null)
    setAnalysisWindow(nextWindow)
    analysisWindowRef.current = nextWindow
    setPlaybackTime(nextPlaybackTime)
    playbackTimeRef.current = nextPlaybackTime
  }, [availableRange, comparisonActivityId, primaryActivityId])

  useEffect(() => {
    if (!isPlaying || windowStart === null || windowEnd === null) return

    let animationFrame = 0
    let previousFrameTime = performance.now()
    const updatePlayback = (frameTime: number) => {
      const nextPlaybackTime = advancePlaybackTime(
        playbackTimeRef.current,
        frameTime - previousFrameTime,
        speedRef.current,
        windowStart,
        windowEnd,
      )
      previousFrameTime = frameTime
      playbackTimeRef.current = nextPlaybackTime
      setPlaybackTime(nextPlaybackTime)

      if (nextPlaybackTime >= windowEnd) {
        setIsPlaying(false)
        return
      }
      animationFrame = requestAnimationFrame(updatePlayback)
    }

    animationFrame = requestAnimationFrame(updatePlayback)
    return () => cancelAnimationFrame(animationFrame)
  }, [isPlaying, windowEnd, windowStart])

  function changePrimary(activityId: string | null) {
    if (!activityId) return
    setIsPlaying(false)
    setMapFocusRequest(null)
    setSelectedManeuverKey(null)
    setPrimaryActivityId(activityId)
    if (activityId === comparisonActivityId) {
      setComparisonActivityId(null)
    }
  }

  function changeComparison(activityId: string | null) {
    setIsPlaying(false)
    setMapFocusRequest(null)
    setSelectedManeuverKey(null)
    setComparisonActivityId(
      activityId === primaryActivityId ? null : activityId,
    )
  }

  function compareContextualActivity(activityId: string) {
    changeComparison(promoteContextualActivityToComparison(
      primaryActivityId,
      activityId,
    ))
  }

  function togglePlayback() {
    if (windowStart === null || windowEnd === null) return
    if (isPlaying) {
      setIsPlaying(false)
      return
    }

    if (playbackTimeRef.current >= windowEnd) {
      playbackTimeRef.current = windowStart
      setPlaybackTime(windowStart)
    }
    setIsPlaying(true)
  }

  function scrubTo(nextPlaybackTime: number) {
    if (windowStart === null || windowEnd === null) return
    const nextReplay = selectReplayTime(
      nextPlaybackTime,
      windowStart,
      windowEnd,
    )
    setIsPlaying(nextReplay.isPlaying)
    playbackTimeRef.current = nextReplay.playbackTime
    setPlaybackTime(nextReplay.playbackTime)
  }

  function selectManeuver(event: DisplayManeuver, focusMap: boolean) {
    setSelectedManeuverKey(maneuverSelectionKey(event))
    scrubTo(event.centerTimeMs)
    if (!focusMap) return

    mapFocusRequestIdRef.current += 1
    const navigation = createTimelineManeuverNavigation(
      event,
      mapFocusRequestIdRef.current,
    )
    setMapFocusRequest(navigation.focusRequest)
  }

  function selectTimelineManeuver(event: DisplayManeuver) {
    selectManeuver(event, true)
  }

  function selectTableManeuver(event: DisplayManeuver) {
    selectManeuver(event, false)
  }

  function commitAnalysisWindowRange(requestedRange: AnalysisWindowRange) {
    if (availableRange === null) return
    const nextTimeline = commitSessionTimelineWindow(
      requestedRange,
      availableRange,
      playbackTimeRef.current,
    )
    if (nextTimeline === null) return

    setIsPlaying(nextTimeline.isPlaying)
    setMapFocusRequest(null)
    setAnalysisWindow(nextTimeline.analysisWindow)
    analysisWindowRef.current = nextTimeline.analysisWindow
    playbackTimeRef.current = nextTimeline.playbackTime
    setPlaybackTime(nextTimeline.playbackTime)
  }

  function openSharePanel() {
    if (access.kind !== 'original') return
    setSharePanelOpen(true)
    setShareStatus('loading')
    createTemporarySessionShare(access.token).then((share) => {
      setTemporaryShare(share)
      setShareStatus('ready')
    }).catch(() => {
      setShareStatus('error')
    })
  }

  if (!primaryActivity) {
    return <p className="empty-state">This Session has no Activities.</p>
  }

  const hasNoTemporalOverlap = primaryTrack !== null
    && primaryRange !== null
    && comparisonTrack !== null
    && comparisonRange !== null
    && intersectAnalysisWindowRanges(primaryRange, comparisonRange) === null
  const canReplay = primaryTrack !== null
    && analysisWindow !== null
    && windowStart !== null
    && windowEnd !== null
    && primaryWindowSamples.length > 0
  const primaryTrackLoading = primaryActivityId !== ''
    && (
      primaryTrackState.activityId !== primaryActivityId
      || primaryTrackState.status === 'loading'
    )
  const comparisonTrackLoading = comparisonActivityId !== null
    && (
      comparisonTrackState.activityId !== comparisonActivityId
      || comparisonTrackState.status === 'loading'
    )
  const comparisonTrackUnavailable = comparisonActivityId !== null
    && comparisonTrackState.activityId === comparisonActivityId
    && (
      comparisonTrackState.status === 'not-found'
      || comparisonTrackState.status === 'error'
      || (comparisonTrackState.status === 'ready' && comparisonRange === null)
    )

  const uniqueSailorCount = new Set(session.activities.map((activity) => activity.sailor.id)).size

  return (
    <main className="page-shell viewer-page">
      <SessionViewerHeader />
      {sharePanelOpen && access.kind === 'original' && (
        <SessionSharePanel
          share={temporaryShare}
          status={shareStatus}
          onClose={() => setSharePanelOpen(false)}
          origin={window.location.origin}
        />
      )}

      <section className="session-summary" aria-labelledby="session-summary-heading">
        <SessionSummaryHeading
          access={access}
          expiresAt={access.kind === 'temporary'
            ? access.expiresAt
            : (session as SharedSessionDetail).session_access_expires_at}
          onShare={openSharePanel}
        />
        <p>{formatSessionRange(session.start_time, session.end_time)}</p>
        <p>{formatSessionDuration(session.start_time, session.end_time)} · {uniqueSailorCount} {uniqueSailorCount === 1 ? 'sailor' : 'sailors'}</p>
      </section>

      <section className="selector-panel" aria-label="Activity selection">
        <ActivitySelector
          label="My track"
          activities={session.activities}
          selectedId={primaryActivityId}
          onChange={changePrimary}
        />
        <ActivitySelector
          label="Compare"
          activities={comparisonOptions}
          selectedId={comparisonActivityId}
          onChange={changeComparison}
          optional
        />
      </section>

      {comparisonTrackLoading && (
        <p className="track-load-message" aria-live="polite">
          Loading comparison track…
        </p>
      )}
      {comparisonTrackUnavailable && (
        <p className="track-load-message" role="alert">
          Comparison track unavailable.
        </p>
      )}

      {primaryTrackLoading ? (
        <section className="track-unavailable" aria-live="polite">
          <strong>Loading track…</strong>
        </section>
      ) : canReplay && primaryTrack ? (
        <TrackMap
          primaryVisibleSamples={primaryWindowSamples}
          comparisonVisibleSamples={comparisonWindowSamples}
          contextualActivities={contextualMapActivities}
          fitContextKey={createMapFitContextKey(
            primaryTrack.activity_id,
            comparisonTrack?.activity_id ?? null,
            windowStart,
            windowEnd,
          )}
          focusRequest={mapFocusRequest}
          primaryActivityIdentity={formatActivityIdentity(primaryActivity)}
          comparisonActivityIdentity={comparisonActivity
            ? formatActivityIdentity(comparisonActivity)
            : null}
          primaryBoatPosition={primaryReplayPresentation.position}
          comparisonBoatPosition={comparisonReplayPresentation.position}
          hasComparison={comparisonTrack !== null}
          playbackTime={playbackTime}
          primarySog={primaryReplayPresentation.sog}
          primaryCog={primaryReplayPresentation.cog}
          primaryHeel={primaryReplayPresentation.heel}
          primaryTrim={primaryReplayPresentation.trim}
          comparisonSog={comparisonReplayPresentation.sog}
          comparisonCog={comparisonReplayPresentation.cog}
          comparisonHeel={comparisonReplayPresentation.heel}
          comparisonTrim={comparisonReplayPresentation.trim}
          onCompareContextualActivity={compareContextualActivity}
        />
      ) : (
        <section className="track-unavailable" aria-live="polite">
          <strong>
            {hasNoTemporalOverlap ? 'No comparable GPS/UTC interval' : 'Track unavailable'}
          </strong>
          <span>
            {hasNoTemporalOverlap
              ? 'The selected Activities do not overlap in GPS/UTC time.'
              : 'Track unavailable.'}
          </span>
        </section>
      )}

      <AnalysisWindow
        availableRange={availableRange}
        analysisWindow={analysisWindow}
        primarySamples={primaryAvailableSamples}
        comparisonSamples={comparisonAvailableSamples}
        maneuvers={timelineManeuvers}
        selectedManeuver={selectedManeuver}
        hasComparison={comparisonActivityId !== null}
        {...createAnalysisWindowSummaryMetrics(
          primarySummaryMetrics,
          comparisonActivityId !== null,
          comparisonSummaryMetrics,
        )}
        replay={createAnalysisWindowReplay(
          canReplay,
          playbackTime,
          isPlaying,
          speed,
          togglePlayback,
          setSpeed,
        )}
        onRangeChange={commitAnalysisWindowRange}
        onManeuverSelect={selectTimelineManeuver}
      />
      {analysisWindow !== null && (
        <ManeuverEventTable
          events={displayManeuvers}
          primaryStatus={maneuverPresentationStatus(
            primaryManeuverState,
            primaryActivityId || null,
          )}
          comparisonStatus={comparisonActivityId === null
            ? undefined
            : maneuverPresentationStatus(
                comparisonManeuverState,
                comparisonActivityId,
              )}
          selectedManeuverKey={selectedManeuverKey}
          onSelect={selectTableManeuver}
        />
      )}
      <ComparisonTable
        primaryLabel={formatActivityIdentity(primaryActivity)}
        primaryMetrics={primarySummaryMetrics}
        comparisonLabel={
          comparisonActivity
            ? formatActivityIdentity(comparisonActivity)
            : undefined
        }
        comparisonMetrics={comparisonSummaryMetrics}
      />
      <MetricSelector
        selectedMetric={selectedMetric}
        onChange={setSelectedMetric}
      />
      {selectedMetric === 'VS'
        ? analysisWindow && primaryTrack && (
            <VsDistributionView
              primarySamples={primaryTrack.samples}
              comparisonSamples={comparisonTrack?.samples}
              analysisWindow={analysisWindow}
            />
          )
        : (
            <MetricChart
              metric={selectedMetric}
              primarySamples={canReplay ? primaryWindowSamples : null}
              comparisonSamples={comparisonActivity ? comparisonWindowSamples : undefined}
              playbackTime={canReplay ? playbackTime : null}
              primaryLabel={formatActivityIdentity(primaryActivity)}
              comparisonLabel={
                comparisonActivity
                  ? formatActivityIdentity(comparisonActivity)
                  : undefined
              }
            />
          )}
      <IndividualAnalysis
        primaryActivity={{
          id: primaryActivity.id,
          label: formatActivityIdentity(primaryActivity),
          samples: canReplay ? primaryWindowSamples : null,
          canonicalSamples: primaryTrack?.samples ?? null,
          colorRole: 'primary',
        }}
        comparisonActivity={comparisonActivity && comparisonTrack
          ? {
              id: comparisonActivity.id,
              label: formatActivityIdentity(comparisonActivity),
              samples: comparisonWindowSamples,
              canonicalSamples: comparisonTrack.samples,
              colorRole: 'comparison',
            }
          : undefined}
        playbackTime={canReplay ? playbackTime : null}
        analysisWindow={analysisWindow}
      />
    </main>
  )
}

type PageStatus =
  | 'loading'
  | 'ready'
  | 'not-found'
  | 'temporary-expired'
  | 'temporary-unavailable'
  | 'error'

export default function SessionViewerPage({
  accessKind = 'original',
}: {
  accessKind?: 'original' | 'temporary'
}) {
  const { token } = useParams()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [access, setAccess] = useState<SessionAccess | null>(null)
  const [status, setStatus] = useState<PageStatus>('loading')

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    setSession(null)
    setAccess(null)
    setStatus('loading')

    if (!token) {
      setStatus('not-found')
      return () => {
        isCurrent = false
        controller.abort()
      }
    }

    const requestedAccess: SessionAccess = accessKind === 'original'
      ? { kind: 'original', token }
      : { kind: 'temporary', token, expiresAt: '' }
    getSessionForAccess(requestedAccess, controller.signal).then((loadedSession) => {
      if (!isCurrent) return
      setSession(loadedSession)
      setAccess(accessKind === 'original'
        ? requestedAccess
        : {
            kind: 'temporary',
            token,
            expiresAt: (loadedSession as TemporarySessionDetail).temporary_access_expires_at,
          })
      setStatus('ready')
    }).catch((error: unknown) => {
      if (!isCurrent || (error instanceof DOMException && error.name === 'AbortError')) return
      if (error instanceof TemporaryAccessExpiredError) {
        setStatus('temporary-expired')
      } else if (error instanceof TemporaryAccessUnavailableError) {
        setStatus('temporary-unavailable')
      } else if (
        error instanceof SessionNotFoundError
        || error instanceof TemporaryAccessNotFoundError
      ) {
        setStatus('not-found')
      } else {
        setStatus('error')
      }
    })

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [accessKind, token])

  if (status === 'loading') {
    return (
      <main className="page-shell not-found-page" aria-live="polite">
        <TackBarBrand />
        <h1>Loading Session…</h1>
      </main>
    )
  }

  if (status === 'not-found') {
    return accessKind === 'temporary'
      ? <TemporaryAccessUnavailable state="not-found" />
      : <SharedSessionUnavailable />
  }

  if (status === 'temporary-expired') {
    return <TemporaryAccessUnavailable state="expired" />
  }

  if (status === 'temporary-unavailable') {
    return <TemporaryAccessUnavailable state="unavailable" />
  }

  if (status === 'error' || !session || !access) {
    return (
      <main className="page-shell not-found-page" role="alert">
        <TackBarBrand />
        <h1>Unable to load Session.</h1>
        <p>Please try the shared link again later.</p>
      </main>
    )
  }

  return <SessionViewer key={`${accessKind}:${token}`} access={access} session={session} />
}

export function SharedSessionUnavailable() {
  return (
    <main className="page-shell not-found-page">
      <TackBarBrand />
      <h1>Session not found</h1>
      <p>This shared link is unavailable.</p>
    </main>
  )
}

export function TemporaryAccessUnavailable({
  state,
}: {
  state: 'not-found' | 'expired' | 'unavailable'
}) {
  const heading = state === 'expired'
    ? 'Temporary access expired'
    : state === 'unavailable'
      ? 'Temporary access no longer available'
      : 'Session not found'
  const detail = state === 'expired'
    ? 'This temporary shared access has reached its expiry time.'
    : state === 'unavailable'
      ? 'This temporary shared access is no longer valid.'
      : 'This temporary shared link is not recognized.'
  return (
    <main className="page-shell not-found-page">
      <TackBarBrand />
      <h1>{heading}</h1>
      <p>{detail}</p>
    </main>
  )
}
