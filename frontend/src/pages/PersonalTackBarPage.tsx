import TackBarBrand from '../components/TackBarBrand'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPersonalTackBar, PersonalTackBarNotFoundError } from '../api/tackbarApi'
import type { PersonalTackBar } from '../types/personal'

export type PersonalPageState =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'ready'; data: PersonalTackBar }

const day = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
const time = (value: string) => new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(value))

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
  return <>
    <header className="app-header personal-header"><TackBarBrand inverted /></header>
    <main className="personal-page">
    <h1 id="my-sessions-heading">My Sessions</h1>
    {state.status === 'loading' && <p role="status">Loading My Sessions…</p>}
    {state.status === 'unavailable' && <p role="alert">This personal link is unavailable.</p>}
    {state.status === 'error' && <p role="alert">Cannot load My TackBar. Please try again.</p>}
    {state.status === 'ready' && <>
      <p className="personal-name">{state.data.email}{state.data.name?.trim() ? ` - ${state.data.name.trim()}` : ''}</p>
      <p>{state.data.session_count} {state.data.session_count === 1 ? 'Session' : 'Sessions'}</p>
      <section aria-labelledby="my-sessions-heading">
        {state.data.sessions.length === 0 ? <p>No Sessions recorded yet.</p> : <ol className="personal-sessions">
          {state.data.sessions.map((session, index) => <li className="personal-session" key={index}>
            <h2><time dateTime={session.sailing_start}>{day(session.sailing_start)}</time></h2>
            <p><time dateTime={session.sailing_start}>{time(session.sailing_start)}</time> – <time dateTime={session.sailing_end}>{day(session.sailing_start) !== day(session.sailing_end) && `${day(session.sailing_end)} · `}{time(session.sailing_end)}</time></p>
            <p>{session.sailor_count} {session.sailor_count === 1 ? 'sailor' : 'sailors'}</p>
            {session.session_path
              ? <Link className="personal-session__action" to={session.session_path} referrerPolicy="no-referrer">Open Session</Link>
              : <button className="personal-session__action" disabled>Session unavailable</button>}
          </li>)}
        </ol>}
      </section>
    </>}
    </main>
  </>
}
