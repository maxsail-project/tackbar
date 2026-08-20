import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ActivitySelector from '../components/ActivitySelector'
import AnalysisWindow from '../components/AnalysisWindow'
import ComparisonTable from '../components/ComparisonTable'
import MetricChart from '../components/MetricChart'
import MetricSelector from '../components/MetricSelector'
import ReplayControls from '../components/ReplayControls'
import TrackMap from '../components/TrackMap'
import { mockSessions } from '../data/mockSessions'
import type { SailingMetric, SessionSummary } from '../types/session'

function SessionViewer({ session }: { session: SessionSummary }) {
  const [primaryActivityId, setPrimaryActivityId] = useState(
    session.activities[0]?.activity_id ?? '',
  )
  const [comparisonActivityId, setComparisonActivityId] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<SailingMetric>('SOG')

  const primaryActivity = session.activities.find(
    (activity) => activity.activity_id === primaryActivityId,
  ) ?? session.activities[0]
  const comparisonActivity = session.activities.find(
    (activity) => activity.activity_id === comparisonActivityId,
  )
  const comparisonOptions = session.activities.filter(
    (activity) => activity.activity_id !== primaryActivityId,
  )

  function changePrimary(activityId: string | null) {
    if (!activityId) return
    setPrimaryActivityId(activityId)
    if (activityId === comparisonActivityId) {
      setComparisonActivityId(null)
    }
  }

  if (!primaryActivity) {
    return <p className="empty-state">This mock Session has no Activities.</p>
  }

  return (
    <main className="page-shell viewer-page">
      <header className="app-header viewer-header">
        <div>
          <Link className="back-link" to="/sessions">← Sessions</Link>
          <p className="brand">TackBar</p>
          <h1>{session.date_label} · {session.location_label} · {session.start_time}</h1>
        </div>
        <span className="mock-badge">Mock</span>
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
          onChange={setComparisonActivityId}
          optional
        />
      </section>

      <TrackMap metric={selectedMetric} />
      <ReplayControls />
      <AnalysisWindow />
      <ComparisonTable
        primaryLabel={primaryActivity.participant.name ?? primaryActivity.participant.id}
        comparisonLabel={
          comparisonActivity
            ? comparisonActivity.participant.name ?? comparisonActivity.participant.id
            : undefined
        }
      />
      <MetricSelector
        selectedMetric={selectedMetric}
        onChange={setSelectedMetric}
      />
      <MetricChart metric={selectedMetric} />
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
