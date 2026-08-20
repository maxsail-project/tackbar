import { Link } from 'react-router-dom'
import { mockSessions } from '../data/mockSessions'

export default function SessionsPage() {
  return (
    <main className="page-shell sessions-page">
      <header className="app-header app-header--sessions">
        <div>
          <p className="brand">TackBar</p>
          <p className="eyebrow">Local frontend PoC</p>
        </div>
      </header>

      <section className="sessions-content" aria-labelledby="recent-sessions-title">
        <div className="page-intro">
          <p className="section-kicker">Sessions</p>
          <h1 id="recent-sessions-title">Recent sessions</h1>
          <p>Select a sailing session to begin the debrief.</p>
        </div>

        <div className="session-list">
          {mockSessions.map((session) => (
            <Link
              className="session-card"
              to={`/sessions/${session.session_id}`}
              key={session.session_id}
            >
              <div>
                <h2>{session.date_label} · {session.location_label}</h2>
                <p className="session-card__time">{session.start_time}</p>
                <p>{session.track_count} tracks · mock data</p>
              </div>
              <span className="session-card__arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}

