import TackBarBrand from '../components/TackBarBrand'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ActivityManeuverAnalyticsNotFoundError,
  ActivityTrackNotFoundError,
  getSharedActivityTrack,
  getSharedActivityManeuvers,
  getSharedSession,
  SessionNotFoundError,
} from '../api/tackbarApi'
import ActivitySelector from '../components/ActivitySelector'
import AnalysisWindow, {
  type AnalysisWindowReplay,
} from '../components/AnalysisWindow'
import ComparisonTable from '../components/ComparisonTable'
import IndividualAnalysis from '../components/IndividualAnalysis'
import MetricChart from '../components/MetricChart'
import MetricSelector from '../components/MetricSelector'
import ManeuverEventTable, {
  type ManeuverPresentationStatus,
} from '../components/ManeuverEventTable'
import TrackMap from '../components/TrackMap'
import type { SailingMetric, SessionDetail } from '../types/session'
import type { ActivityTrack } from '../types/track'
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
import { formatActivityIdentity } from '../utils/activityLabel'
import { formatSessionDuration, formatSessionRange } from '../utils/sessionPresentation'
import { deriveDisplayManeuvers } from '../utils/maneuverEvents'

type TrackLoadStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error'

interface TrackLoadState {
  activityId: string | null
  status: TrackLoadStatus
  track: ActivityTrack | null
}

function useActivityTrack(
  token: string,
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

    getSharedActivityTrack(token, activityId, controller.signal).then((track) => {
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
  }, [activityId, cache, token])

  return state
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

function useActivityManeuvers(
  token: string,
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

    getSharedActivityManeuvers(token, activityId, controller.signal).then((analytics) => {
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
  }, [activityId, cache, token])

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

function SessionViewer({ token, session }: { token: string, session: SessionDetail }) {
  const [primaryActivityId, setPrimaryActivityId] = useState(
    session.activities[0]?.id ?? '',
  )
  const [comparisonActivityId, setComparisonActivityId] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<SailingMetric>('SOG')
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const trackCache = useRef(new Map<string, ActivityTrack>()).current
  const maneuverCache = useRef(new Map<string, ActivityManeuverAnalytics>()).current

  const primaryActivity = session.activities.find(
    (activity) => activity.id === primaryActivityId,
  ) ?? session.activities[0]
  const comparisonActivity = session.activities.find(
    (activity) => activity.id === comparisonActivityId,
  )
  const comparisonOptions = session.activities.filter(
    (activity) => activity.id !== primaryActivityId,
  )
  const primaryTrackState = useActivityTrack(token, primaryActivityId || null, trackCache)
  const comparisonTrackState = useActivityTrack(token, comparisonActivityId, trackCache)
  const primaryManeuverState = useActivityManeuvers(
    token,
    primaryActivityId || null,
    maneuverCache,
  )
  const comparisonManeuverState = useActivityManeuvers(
    token,
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
    () => primaryWindowSamples.length > 0
      ? calculateSummaryMetrics(primaryWindowSamples)
      : null,
    [primaryWindowSamples],
  )
  const comparisonSummaryMetrics = useMemo(
    () => comparisonWindowSamples.length > 0
      ? calculateSummaryMetrics(comparisonWindowSamples)
      : null,
    [comparisonWindowSamples],
  )
  const [playbackTime, setPlaybackTime] = useState(windowStart ?? 0)
  const playbackTimeRef = useRef(playbackTime)
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
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

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
    setPrimaryActivityId(activityId)
    if (activityId === comparisonActivityId) {
      setComparisonActivityId(null)
    }
  }

  function changeComparison(activityId: string | null) {
    setIsPlaying(false)
    setComparisonActivityId(
      activityId === primaryActivityId ? null : activityId,
    )
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

  function commitAnalysisWindowRange(requestedRange: AnalysisWindowRange) {
    if (availableRange === null) return
    const nextTimeline = commitSessionTimelineWindow(
      requestedRange,
      availableRange,
      playbackTimeRef.current,
    )
    if (nextTimeline === null) return

    setIsPlaying(nextTimeline.isPlaying)
    setAnalysisWindow(nextTimeline.analysisWindow)
    analysisWindowRef.current = nextTimeline.analysisWindow
    playbackTimeRef.current = nextTimeline.playbackTime
    setPlaybackTime(nextTimeline.playbackTime)
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
      <header className="app-header viewer-header">
        <TackBarBrand inverted />
      </header>

      <section className="session-summary" aria-labelledby="session-summary-heading">
        <h1 id="session-summary-heading">Session</h1>
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
          fitActivityKey={`${primaryTrack.activity_id}:${comparisonTrack?.activity_id ?? ''}`}
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
        onManeuverSelect={scrubTo}
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
          onSelect={scrubTo}
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
      <IndividualAnalysis
        primaryActivity={{
          id: primaryActivity.id,
          label: formatActivityIdentity(primaryActivity),
          samples: canReplay ? primaryWindowSamples : null,
          colorRole: 'primary',
        }}
        comparisonActivity={comparisonActivity && comparisonTrack
          ? {
              id: comparisonActivity.id,
              label: formatActivityIdentity(comparisonActivity),
              samples: comparisonWindowSamples,
              colorRole: 'comparison',
            }
          : undefined}
        playbackTime={canReplay ? playbackTime : null}
      />
    </main>
  )
}

export default function SessionViewerPage() {
  const { token } = useParams()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    setSession(null)
    setStatus('loading')

    if (!token) {
      setStatus('not-found')
      return () => {
        isCurrent = false
        controller.abort()
      }
    }

    getSharedSession(token, controller.signal).then((loadedSession) => {
      if (!isCurrent) return
      setSession(loadedSession)
      setStatus('ready')
    }).catch((error: unknown) => {
      if (!isCurrent || (error instanceof DOMException && error.name === 'AbortError')) return
      setStatus(error instanceof SessionNotFoundError ? 'not-found' : 'error')
    })

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [token])

  if (status === 'loading') {
    return (
      <main className="page-shell not-found-page" aria-live="polite">
        <TackBarBrand />
        <h1>Loading Session…</h1>
      </main>
    )
  }

  if (status === 'not-found') {
    return <SharedSessionUnavailable />
  }

  if (status === 'error' || !session) {
    return (
      <main className="page-shell not-found-page" role="alert">
        <TackBarBrand />
        <h1>Unable to load Session.</h1>
        <p>Please try the shared link again later.</p>
      </main>
    )
  }

  return <SessionViewer key={token} token={token!} session={session} />
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
