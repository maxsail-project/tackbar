import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ActivitySelector from '../components/ActivitySelector'
import AnalysisWindow from '../components/AnalysisWindow'
import ComparisonTable from '../components/ComparisonTable'
import MetricChart from '../components/MetricChart'
import MetricSelector from '../components/MetricSelector'
import ReplayControls from '../components/ReplayControls'
import TrackMap from '../components/TrackMap'
import { mockSessions } from '../data/mockSessions'
import { demoComparisonActivityTrack } from '../data/demoComparisonActivityTrack'
import { demoPrimaryActivityTrack } from '../data/demoPrimaryActivityTrack'
import type { EnabledReplayMetric, SessionSummary } from '../types/session'
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

const DEVELOPMENT_TRACKS = [demoPrimaryActivityTrack, demoComparisonActivityTrack]

function findDevelopmentTrack(activityId: string | null) {
  return DEVELOPMENT_TRACKS.find((track) => (
    track.activity_id === activityId
  )) ?? null
}

function activityTrackRange(track: ActivityTrack | null) {
  if (!track || track.samples.length === 0) return null
  return createFullAnalysisWindow(
    timestampToMilliseconds(track.samples[0].utc),
    timestampToMilliseconds(track.samples[track.samples.length - 1].utc),
  )
}

function SessionViewer({ session }: { session: SessionSummary }) {
  const [primaryActivityId, setPrimaryActivityId] = useState(
    session.activities[0]?.activity_id ?? '',
  )
  const [comparisonActivityId, setComparisonActivityId] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<EnabledReplayMetric>('SOG')
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)

  const primaryActivity = session.activities.find(
    (activity) => activity.activity_id === primaryActivityId,
  ) ?? session.activities[0]
  const comparisonActivity = session.activities.find(
    (activity) => activity.activity_id === comparisonActivityId,
  )
  const comparisonOptions = session.activities.filter(
    (activity) => activity.activity_id !== primaryActivityId,
  )
  const primaryTrack = findDevelopmentTrack(primaryActivityId)
  const comparisonTrack = findDevelopmentTrack(comparisonActivityId)
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
    if (comparisonRange === null) return null
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
    return <p className="empty-state">This mock Session has no Activities.</p>
  }

  const hasNoTemporalOverlap = primaryTrack !== null
    && comparisonTrack !== null
    && availableRange === null
  const canReplay = primaryTrack !== null
    && analysisWindow !== null
    && windowStart !== null
    && windowEnd !== null
    && primaryWindowSamples.length > 0
  const unavailableMessage = hasNoTemporalOverlap
    ? 'The selected Activities do not overlap in GPS/UTC time.'
    : comparisonActivityId !== null && comparisonTrack === null
      ? 'No development track fixture for the selected comparison Activity.'
      : 'No replay fixture for this mock Activity.'

  return (
    <main className="page-shell viewer-page">
      <header className="app-header viewer-header">
        <div>
          <Link className="back-link" to="/sessions">← Sessions</Link>
          <p className="brand">TackBar</p>
          <h1>{session.date_label} · {session.location_label} · {session.start_time}</h1>
        </div>
        <span className="mock-badge">Dev fixture</span>
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

      {canReplay && primaryTrack ? (
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
          <span>{unavailableMessage}</span>
        </section>
      )}

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
      <AnalysisWindow
        availableRange={availableRange}
        analysisWindow={analysisWindow}
        onWindowChange={changeAnalysisWindow}
      />
      <ComparisonTable
        primaryLabel={primaryActivity.participant.name ?? primaryActivity.participant.id}
        primaryMetrics={primarySummaryMetrics}
        comparisonLabel={
          comparisonActivity
            ? comparisonActivity.participant.name ?? comparisonActivity.participant.id
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
        primaryLabel={primaryActivity.participant.name ?? primaryActivity.participant.id}
        comparisonLabel={
          comparisonActivity
            ? comparisonActivity.participant.name ?? comparisonActivity.participant.id
            : undefined
        }
      />
    </main>
  )
}

export default function SessionViewerPage() {
  const { sessionId } = useParams()
  const session = mockSessions.find((candidate) => candidate.session_id === sessionId)

  if (!session) {
    return (
      <main className="page-shell not-found-page">
        <p className="brand">TackBar</p>
        <h1>Session not found</h1>
        <p>This frontend scaffold currently uses local mock Sessions only.</p>
        <Link className="primary-link" to="/sessions">View recent sessions</Link>
      </main>
    )
  }

  return <SessionViewer key={session.session_id} session={session} />
}
