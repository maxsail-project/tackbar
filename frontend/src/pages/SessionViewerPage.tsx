import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ActivityTrackNotFoundError,
  getActivityTrack,
  getSession,
  SessionNotFoundError,
} from '../api/tackbarApi'
import ActivitySelector from '../components/ActivitySelector'
import AnalysisWindow from '../components/AnalysisWindow'
import ComparisonTable from '../components/ComparisonTable'
import MetricChart from '../components/MetricChart'
import MetricSelector from '../components/MetricSelector'
import ReplayControls from '../components/ReplayControls'
import TrackMap from '../components/TrackMap'
import type { EnabledReplayMetric, SessionDetail } from '../types/session'
import type { ActivityTrack } from '../types/track'
import {
  createFullAnalysisWindow,
  filterSamplesByAnalysisWindow,
  intersectAnalysisWindowRanges,
  reconcileAnalysisWindow,
  updateSessionTimelineWindow,
  type AnalysisWindowBoundary,
  type AnalysisWindowRange,
} from '../utils/analysisWindow'
import {
  advancePlaybackTime,
  clampPlaybackTime,
  timestampToMilliseconds,
  type PlaybackSpeed,
} from '../utils/replay'
import { resolveReplayPresentation } from '../utils/metricPresentation'
import { calculateSummaryMetrics } from '../utils/summaryMetrics'
import { formatActivityIdentity } from '../utils/activityLabel'
import { formatSessionRange } from '../utils/sessionPresentation'

type TrackLoadStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error'

interface TrackLoadState {
  activityId: string | null
  status: TrackLoadStatus
  track: ActivityTrack | null
}

function useActivityTrack(
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

    getActivityTrack(activityId, controller.signal).then((track) => {
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
  }, [activityId, cache])

  return state
}

function activityTrackRange(track: ActivityTrack | null) {
  if (!track || track.samples.length === 0) return null
  return createFullAnalysisWindow(
    timestampToMilliseconds(track.samples[0].utc),
    timestampToMilliseconds(track.samples[track.samples.length - 1].utc),
  )
}

function SessionViewer({ session }: { session: SessionDetail }) {
  const [primaryActivityId, setPrimaryActivityId] = useState(
    session.activities[0]?.id ?? '',
  )
  const [comparisonActivityId, setComparisonActivityId] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<EnabledReplayMetric>('SOG')
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const trackCache = useRef(new Map<string, ActivityTrack>()).current

  const primaryActivity = session.activities.find(
    (activity) => activity.id === primaryActivityId,
  ) ?? session.activities[0]
  const comparisonActivity = session.activities.find(
    (activity) => activity.id === comparisonActivityId,
  )
  const comparisonOptions = session.activities.filter(
    (activity) => activity.id !== primaryActivityId,
  )
  const primaryTrackState = useActivityTrack(primaryActivityId || null, trackCache)
  const comparisonTrackState = useActivityTrack(comparisonActivityId, trackCache)
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
      selectedMetric,
    ),
    [playbackTime, primaryWindowSamples, selectedMetric],
  )
  const comparisonReplayPresentation = useMemo(
    () => resolveReplayPresentation(
      comparisonWindowSamples,
      playbackTime,
      selectedMetric,
    ),
    [comparisonWindowSamples, playbackTime, selectedMetric],
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
    const clampedTime = clampPlaybackTime(
      nextPlaybackTime,
      windowStart,
      windowEnd,
    )
    setIsPlaying(false)
    playbackTimeRef.current = clampedTime
    setPlaybackTime(clampedTime)
  }

  function changeAnalysisWindow(
    boundary: AnalysisWindowBoundary,
    requestedTime: number,
  ) {
    if (
      analysisWindow === null
      || availableRange === null
    ) return

    const nextTimeline = updateSessionTimelineWindow(
      analysisWindow,
      boundary,
      requestedTime,
      availableRange,
      playbackTimeRef.current,
    )

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

  return (
    <main className="page-shell viewer-page">
      <header className="app-header viewer-header">
        <div>
          <Link className="back-link" to="/sessions">← Sessions</Link>
          <p className="brand">TackBar</p>
          <h1>{formatSessionRange(session.start_time, session.end_time)}</h1>
        </div>
      </header>

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
          primaryBoatPosition={primaryReplayPresentation.position}
          comparisonBoatPosition={comparisonReplayPresentation.position}
          hasComparison={comparisonTrack !== null}
          playbackTime={playbackTime}
          selectedMetric={selectedMetric}
          primaryCurrentMetric={primaryReplayPresentation.metricValue}
          comparisonCurrentMetric={comparisonReplayPresentation.metricValue}
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
        onWindowChange={changeAnalysisWindow}
      />
      {canReplay && windowStart !== null && windowEnd !== null && (
        <ReplayControls
          playbackTime={playbackTime}
          replayStart={windowStart}
          replayEnd={windowEnd}
          selectedMetric={selectedMetric}
          currentMetric={primaryReplayPresentation.metricValue}
          isPlaying={isPlaying}
          speed={speed}
          onTogglePlayback={togglePlayback}
          onScrub={scrubTo}
          onScrubStart={() => setIsPlaying(false)}
          onSpeedChange={setSpeed}
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
    </main>
  )
}

export default function SessionViewerPage() {
  const { sessionId } = useParams()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    setSession(null)
    setStatus('loading')

    if (!sessionId) {
      setStatus('not-found')
      return () => {
        isCurrent = false
        controller.abort()
      }
    }

    getSession(sessionId, controller.signal).then((loadedSession) => {
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
  }, [sessionId])

  if (status === 'loading') {
    return (
      <main className="page-shell not-found-page" aria-live="polite">
        <p className="brand">TackBar</p>
        <h1>Loading Session…</h1>
      </main>
    )
  }

  if (status === 'not-found') {
    return (
      <main className="page-shell not-found-page">
        <p className="brand">TackBar</p>
        <h1>Session not found</h1>
        <Link className="primary-link" to="/sessions">View recent sessions</Link>
      </main>
    )
  }

  if (status === 'error' || !session) {
    return (
      <main className="page-shell not-found-page" role="alert">
        <p className="brand">TackBar</p>
        <h1>Unable to load Session.</h1>
        <Link className="primary-link" to="/sessions">View recent sessions</Link>
      </main>
    )
  }

  return <SessionViewer key={session.id} session={session} />
}
