import AboutControl, { PublicHeaderBrand } from '../components/AboutControl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPersonalActivities, getPersonalBoats, getPersonalTackBar, PersonalTackBarNotFoundError, updatePersonalActivity } from '../api/tackbarApi'
import type { PersonalActivity, PersonalActivityPatch, PersonalBoat, PersonalSession, PersonalTackBar } from '../types/personal'
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
  const onUnavailable = useCallback(() => setState({ status: 'unavailable' }), [])
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
  return <PersonalTackBarContent state={state} token={token} onUnavailable={onUnavailable} />
}

export function PersonalTackBarContent({ state, token, onUnavailable }: { state: PersonalPageState; token?: string; onUnavailable?: () => void }) {
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
      {token && <MyActivities token={token} onUnavailable={onUnavailable} />}
    </>}
    </main>
  </>
}

type ActivitiesState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; activities: PersonalActivity[]; boats: PersonalBoat[] }

function boatName(boat: PersonalBoat) {
  return [boat.name, boat.sailing_class, boat.sail_number].filter(Boolean).join(' · ')
}

function MyActivities({ token, onUnavailable }: { token: string; onUnavailable?: () => void }) {
  const [state, setState] = useState<ActivitiesState>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [boatChoice, setBoatChoice] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ id: string; message: string; error?: boolean } | null>(null)
  const writeController = useRef<AbortController | null>(null)
  const submitting = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([getPersonalActivities(token, controller.signal), getPersonalBoats(token, controller.signal)]).then(
      ([activities, boats]) => { if (!controller.signal.aborted) setState({ status: 'ready', activities, boats }) },
      (error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof PersonalTackBarNotFoundError) onUnavailable?.()
        else setState({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [token, retry, onUnavailable])

  useEffect(() => () => writeController.current?.abort(), [])

  function beginEdit(activity: PersonalActivity, boats: PersonalBoat[]) {
    setEditingId(activity.id)
    setBoatChoice(activity.boat_id && !boats.some((boat) => boat.id === activity.boat_id) ? '__keep__' : activity.boat_id ?? '')
    setLabel(activity.device_label ?? '')
    setFeedback(null)
  }

  async function save(activity: PersonalActivity) {
    if (submitting.current || state.status !== 'ready') return
    const patch: PersonalActivityPatch = {}
    if (boatChoice !== '__keep__' && boatChoice !== (activity.boat_id ?? '')) patch.boat_id = boatChoice || null
    if (label !== (activity.device_label ?? '')) patch.device_label = label === '' ? null : label
    if (Object.keys(patch).length === 0) { setEditingId(null); return }
    submitting.current = true
    setSaving(true)
    setFeedback(null)
    const controller = new AbortController()
    writeController.current = controller
    try {
      const updated = await updatePersonalActivity(token, activity.id, patch, controller.signal)
      if (controller.signal.aborted) return
      setState((current) => current.status === 'ready'
        ? { ...current, activities: current.activities.map((item) => item.id === updated.id ? updated : item) }
        : current)
      setEditingId(null)
      setFeedback({ id: activity.id, message: 'Activity saved.' })
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof PersonalTackBarNotFoundError) onUnavailable?.()
      else setFeedback({ id: activity.id, message: 'Could not save Activity. Please try again.', error: true })
    } finally {
      submitting.current = false
      writeController.current = null
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  return <section aria-labelledby="my-activities-heading">
    <h2 id="my-activities-heading">My Activities</h2>
    {state.status === 'loading' && <p role="status">Loading My Activities…</p>}
    {state.status === 'error' && <div role="alert">Could not load My Activities. <button type="button" onClick={() => { setState({ status: 'loading' }); setRetry((value) => value + 1) }}>Retry</button></div>}
    {state.status === 'ready' && (state.activities.length === 0
      ? <p>No Activities recorded yet.</p>
      : <ol className="personal-activities">{state.activities.map((activity) => {
        const owned = state.boats.some((boat) => boat.id === activity.boat_id)
        const currentBoat = activity.boat ? boatName(activity.boat) : activity.boat_id ? 'Unavailable Boat association' : 'No Boat'
        const editing = editingId === activity.id
        return <li className="personal-activity" key={activity.id}>
          <h3><time dateTime={activity.start_time}>{day(activity.start_time)} · {time(activity.start_time)}</time></h3>
          <p>Boat: {currentBoat}</p>
          <p>Device: {activity.device_label || activity.device_name || 'Not available'}</p>
          <p className="personal-activity__origin">Source: {activity.source} · Original file: {activity.original_filename} · Extracted Device: {activity.device_name || 'Not available'}</p>
          {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(activity) }}>
            <label>Boat
              <select value={boatChoice} disabled={saving} onChange={(event) => setBoatChoice(event.target.value)}>
                {activity.boat_id && !owned && <option value="__keep__">Keep current Boat association</option>}
                <option value="">No Boat</option>
                {state.boats.map((boat) => <option key={boat.id} value={boat.id}>{boatName(boat)}</option>)}
              </select>
            </label>
            <label>Device label
              <input type="text" value={label} disabled={saving} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <div className="personal-activity__actions">
              <button type="submit" disabled={saving}>Save</button>
              <button type="button" disabled={saving} onClick={() => { setEditingId(null); setFeedback(null) }}>Cancel</button>
            </div>
            {saving && <p role="status">Saving Activity…</p>}
          </form> : <button type="button" disabled={saving} onClick={() => beginEdit(activity, state.boats)}>Edit Activity</button>}
          {feedback?.id === activity.id && <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
        </li>
      })}</ol>)}
  </section>
}
