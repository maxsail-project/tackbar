import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSessions } from '../api/tackbarApi'
import type { SessionListItem } from '../types/session'
import { formatSessionDate, formatSessionTime } from '../utils/sessionPresentation'

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    getSessions(controller.signal).then((loadedSessions) => {
      if (!isCurrent) return
      setSessions(loadedSessions)
      setHasError(false)
    }).catch((error: unknown) => {
      if (!isCurrent || (error instanceof DOMException && error.name === 'AbortError')) return
      setHasError(true)
    })

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [])

  return (
    <main className="page-shell sessions-page">
      <header className="app-header app-header--sessions">
        <div>
          <p className="brand">TackBar</p>
          <p className="eyebrow">Collaborative sailing debrief</p>
        </div>
      </header>

      <section className="sessions-content" aria-labelledby="recent-sessions-title">
        <div className="page-intro">
          <p className="section-kicker">Sessions</p>
          <h1 id="recent-sessions-title">Recent sessions</h1>
          <p>Select a sailing session to begin the debrief.</p>
        </div>

        {sessions === null && !hasError && (
          <p className="empty-state" aria-live="polite">Loading Sessions…</p>
        )}
        {hasError && (
          <p className="empty-state" role="alert">Unable to load Sessions.</p>
        )}
        {sessions?.length === 0 && (
          <p className="empty-state">No Sessions available.</p>
        )}
        {sessions && sessions.length > 0 && (
          <div className="session-list">
            {sessions.map((session) => (
              <Link
                className="session-card"
                to={`/sessions/${session.id}`}
                key={session.id}
              >
                <div>
                  <h2>{formatSessionDate(session.start_time)}</h2>
                  <p className="session-card__time">{formatSessionTime(session.start_time)}</p>
                  <p>
                    {session.activity_count}{' '}
                    {session.activity_count === 1 ? 'Activity' : 'Activities'}
                  </p>
                </div>
                <span className="session-card__arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
