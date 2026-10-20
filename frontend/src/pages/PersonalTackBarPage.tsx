import AboutControl, { PublicHeaderBrand } from '../components/AboutControl'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPersonalTackBar, PersonalTackBarNotFoundError } from '../api/tackbarApi'
import type { PersonalSession, PersonalTackBar } from '../types/personal'
import { formatHistoricalConditionsCompact } from '../utils/historicalConditions'
import { sessionDisplayLocation } from '../utils/sessionPresentation'

export type PersonalPageState =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'ready'; data: PersonalTackBar }

const day = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
const time = (value: string) => new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value))

const normalized = (value: string) => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()

export function filterPersonalSessions(sessions: PersonalSession[], query: string) {
  const needle = normalized(query.trim())
  if (!needle) return sessions
  return sessions.filter((session) => normalized(
    `${sessionDisplayLocation(session.location_label, session.location_country) ?? ''} ${day(session.sailing_start)} ${session.sailing_start.slice(0, 10)}`,
  ).includes(needle))
}

function compactWeather(session: PersonalSession) {
  const compact = session.weather
    ? formatHistoricalConditionsCompact(session.weather)
    : null
  return compact?.replace('°C', ' °C') ?? null
}

export default function PersonalTackBarPage() {
  const { token = '' } = useParams<{ token: string }>()
  return <PersonalPage key={token} token={token} />
}

function PersonalPage({ token }: { token: string }) {
  const [state, setState] = useState<PersonalPageState>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    void getPersonalTackBar(token, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ status: 'ready', data }) },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({
          status: error instanceof PersonalTackBarNotFoundError ? 'unavailable' : 'error',
        })
      },
    )
    return () => controller.abort()
  }, [token])
  return <PersonalTackBarContent state={state} />
}

export function PersonalTackBarContent({ state }: { state: PersonalPageState }) {
  const [query, setQuery] = useState('')
  const sessions = useMemo(
    () => state.status === 'ready' ? filterPersonalSessions(state.data.sessions, query) : [],
    [query, state],
  )
  return <>
    <header className="app-header personal-header"><PublicHeaderBrand /><AboutControl /></header>
    <main className="personal-page">
    <h1 id="my-sessions-heading">My Sessions</h1>
    {state.status === 'loading' && <p role="status">Loading My Sessions…</p>}
    {state.status === 'unavailable' && <p role="alert">This personal link is unavailable.</p>}
    {state.status === 'error' && <p role="alert">Cannot load My TackBar. Please try again.</p>}
    {state.status === 'ready' && <>
      <p className="personal-name">{state.data.email}{state.data.name?.trim() ? ` - ${state.data.name.trim()}` : ''}</p>
      <p>{state.data.session_count} {state.data.session_count === 1 ? 'Session' : 'Sessions'}</p>
      <section aria-labelledby="my-sessions-heading">
        {state.data.sessions.length === 0 ? <p>No Sessions recorded yet.</p> : <>
          <label className="personal-search">
            <span>Search Sessions</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Location or sailing date" />
          </label>
          {sessions.length === 0 ? <p>No Sessions match this search.</p> : <ol className="personal-sessions">
            {sessions.map((session, index) => {
              const weather = compactWeather(session)
              const location = sessionDisplayLocation(session.location_label, session.location_country)
              const content = <>
                <h2>{location && `${location} · `}<time dateTime={session.sailing_start}>{day(session.sailing_start)}</time></h2>
                <p className="personal-session__summary"><time dateTime={session.sailing_start}>{time(session.sailing_start)}</time>–<time dateTime={session.sailing_end}>{day(session.sailing_start) !== day(session.sailing_end) && `${day(session.sailing_end)} · `}{time(session.sailing_end)}</time> · {session.sailor_count} {session.sailor_count === 1 ? 'sailor' : 'sailors'}</p>
                {weather && <p className="personal-session__weather">{weather}</p>}
              </>
              return <li className={`personal-session${session.session_path ? '' : ' personal-session--unavailable'}`} key={index}>
                {session.session_path
                  ? <Link className="personal-session__target" to={session.session_path} referrerPolicy="no-referrer">{content}</Link>
                  : <div className="personal-session__target" aria-disabled="true">{content}<span className="personal-session__status">Session unavailable</span></div>}
              </li>
            })}
          </ol>}
        </>}
      </section>
    </>}
    </main>
  </>
}
