import AboutControl, { PublicHeaderBrand } from '../components/AboutControl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPersonalActivities, getPersonalBoats, getPersonalTackBar, PersonalTackBarNotFoundError, updatePersonalActivity, updatePersonalProfile } from '../api/tackbarApi'
import type { PersonalActivity, PersonalActivityPatch, PersonalBoat, PersonalSession, PersonalTackBar } from '../types/personal'
import MyBoats, { boatName } from './MyBoats'
import { formatHistoricalConditionsCompact } from '../utils/historicalConditions'
import { sessionDisplayLocation } from '../utils/sessionPresentation'

export type PersonalPageState =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'ready'; data: PersonalTackBar }

const day = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
const time = (value: string) => new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value))
const sailingInterval = (start: string, end: string) => <>
  <time dateTime={start}>{time(start)}</time>–<time dateTime={end}>{day(start) !== day(end) && `${day(end)} · `}{time(end)}</time>
</>

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

function latestSession(sessions: PersonalSession[]): PersonalSession | null {
  return sessions.reduce<PersonalSession | null>((latest, session) =>
    !latest || Date.parse(session.sailing_end) > Date.parse(latest.sailing_end) ? session : latest, null)
}

function SessionCard({ session }: { session: PersonalSession }) {
  const weather = compactWeather(session)
  const location = sessionDisplayLocation(session.location_label, session.location_country)
  const content = <>
    <h3>{location && `${location} · `}<time dateTime={session.sailing_start}>{day(session.sailing_start)}</time></h3>
    <p className="personal-session__summary">{sailingInterval(session.sailing_start, session.sailing_end)} · {session.sailor_count} {session.sailor_count === 1 ? 'sailor' : 'sailors'}</p>
    {weather && <p className="personal-session__weather">{weather}</p>}
  </>
  return <li className={`personal-session${session.session_path ? '' : ' personal-session--unavailable'}`}>
    {session.session_path
      ? <Link className="personal-session__target" to={session.session_path} referrerPolicy="no-referrer">{content}</Link>
      : <div className="personal-session__target" aria-disabled="true">{content}<span className="personal-session__status">Session unavailable</span></div>}
  </li>
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
  const onProfileSaved = useCallback((name: string | null) => {
    setState((current) => current.status === 'ready' ? { status: 'ready', data: { ...current.data, name } } : current)
  }, [])
  return <PersonalTackBarContent state={state} token={token} onUnavailable={onUnavailable} onProfileSaved={onProfileSaved} />
}

export function PersonalTackBarContent({ state, token, onUnavailable, onProfileSaved }: { state: PersonalPageState; token?: string; onUnavailable?: () => void; onProfileSaved?: (name: string | null) => void }) {
  const [query, setQuery] = useState('')
  const [boatSaved, setBoatSaved] = useState<PersonalBoat | null>(null)
  const [boatsExpanded, setBoatsExpanded] = useState(false)
  const [sessionsExpanded, setSessionsExpanded] = useState(false)
  const [activitiesExpanded, setActivitiesExpanded] = useState(false)
  const lastSession = state.status === 'ready' ? latestSession(state.data.sessions) : null
  const sessions = useMemo(
    () => state.status === 'ready' ? filterPersonalSessions(state.data.sessions, query) : [],
    [query, state],
  )
  return <>
    <header className="app-header personal-header"><PublicHeaderBrand /><AboutControl /></header>
    <main className="personal-page">
    <h1 className="personal-page__sr-only">Personal TackBar</h1>
    {state.status === 'ready' && (token
      ? <MyProfile token={token} name={state.data.name} email={state.data.email} onSaved={onProfileSaved} onUnavailable={onUnavailable} />
      : <section className="personal-profile" aria-label="My Profile"><p><strong>Name:</strong> {state.data.name?.trim() || 'Not set'}</p><p><strong>Email:</strong> {state.data.email}</p></section>)}
    {state.status === 'loading' && <p className="personal-feedback" role="status">Loading My Sessions…</p>}
    {state.status === 'unavailable' && <p className="personal-feedback" role="alert">This personal link is unavailable.</p>}
    {state.status === 'error' && <p className="personal-feedback" role="alert">Cannot load My TackBar. Please try again.</p>}
    {state.status === 'ready' && <>
      <section className="personal-last-session" aria-labelledby="personal-last-session-heading">
        <h2 id="personal-last-session-heading">Open Last Session</h2>
        {lastSession ? <ol className="personal-sessions"><SessionCard session={lastSession} /></ol> : <p>No Sessions recorded yet.</p>}
      </section>
      <section aria-labelledby="my-sessions-heading">
        <h2 id="my-sessions-heading"><button className="personal-disclosure" type="button" aria-expanded={sessionsExpanded} aria-controls="my-sessions-content" onClick={() => setSessionsExpanded((value) => !value)}>My Sessions</button></h2>
        <div id="my-sessions-content" hidden={!sessionsExpanded}>
        <p>{state.data.session_count} {state.data.session_count === 1 ? 'Session' : 'Sessions'}</p>
        {state.data.sessions.length === 0 ? <p>No Sessions recorded yet.</p> : <>
          <label className="personal-search">
            <span>Search Sessions</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Location or sailing date" />
          </label>
          {sessions.length === 0 ? <p>No Sessions match this search.</p> : <ol className="personal-sessions">
            {sessions.map((session, index) => <SessionCard key={index} session={session} />)}
          </ol>}
        </>}
        </div>
      </section>
      {token && <MyActivities token={token} onUnavailable={onUnavailable} boatSaved={boatSaved} expanded={activitiesExpanded} onToggle={() => setActivitiesExpanded((value) => !value)} />}
      {token && <MyBoats token={token} onUnavailable={onUnavailable} onBoatSaved={setBoatSaved} expanded={boatsExpanded} onToggle={() => setBoatsExpanded((value) => !value)} />}
    </>}
    </main>
  </>
}

function MyProfile({ token, name, email, onSaved, onUnavailable }: { token: string; name: string | null; email: string; onSaved?: (name: string | null) => void; onUnavailable?: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null)
  const submitting = useRef(false)
  const writeController = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)

  useEffect(() => () => writeController.current?.abort(), [])
  useEffect(() => {
    if (editing) input.current?.focus()
    else if (wasEditing.current) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])

  async function save() {
    if (submitting.current) return
    const normalized = draft.trim() || null
    if (normalized === (name?.trim() || null)) {
      setEditing(false)
      setFeedback(null)
      return
    }
    submitting.current = true
    setSaving(true)
    setFeedback(null)
    const controller = new AbortController()
    writeController.current = controller
    try {
      const updated = await updatePersonalProfile(token, normalized, controller.signal)
      if (controller.signal.aborted) return
      onSaved?.(updated.name)
      setEditing(false)
      setFeedback({ message: 'Profile saved.' })
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof PersonalTackBarNotFoundError) {
        controller.abort()
        onUnavailable?.()
      }
      else setFeedback({ message: 'Could not save Profile. Please try again.', error: true })
    } finally {
      submitting.current = false
      writeController.current = null
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  return <section className="personal-profile" aria-label="My Profile">
    <p><strong>Name:</strong> {name?.trim() || 'Not set'}</p>
    <p><strong>Email:</strong> {email}</p>
    {editing ? <form onSubmit={(event) => { event.preventDefault(); void save() }}>
      <label htmlFor="personal-profile-name">Name</label>
      <input id="personal-profile-name" ref={input} type="text" value={draft} disabled={saving} onChange={(event) => setDraft(event.target.value)} />
      <div className="personal-profile__actions">
        <button className="personal-action personal-action--primary" type="submit" disabled={saving}>Save</button>
        <button className="personal-action personal-action--secondary" type="button" disabled={saving} onClick={() => { setEditing(false); setFeedback(null) }}>Cancel</button>
      </div>
      {saving && <p className="personal-feedback" role="status">Saving Profile…</p>}
    </form> : <button ref={editButton} className="personal-action personal-action--edit" type="button" onClick={() => { setDraft(name ?? ''); setEditing(true); setFeedback(null) }}>Edit Name</button>}
    {feedback && <p className="personal-feedback" role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
  </section>
}

type ActivitiesState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; activities: PersonalActivity[]; boats: PersonalBoat[] }

function effectiveDevice(activity: PersonalActivity): string {
  return (activity.device_label?.trim() && activity.device_label)
    || (activity.device_name.trim() && activity.device_name) || ''
}

function MyActivities({ token, onUnavailable, boatSaved, expanded, onToggle }: { token: string; onUnavailable?: () => void; boatSaved: PersonalBoat | null; expanded: boolean; onToggle: () => void }) {
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
    let denied = false
    const watchDenial = <T,>(request: Promise<T>) => request.catch((error: unknown) => {
      if (!controller.signal.aborted && !denied && error instanceof PersonalTackBarNotFoundError) {
        denied = true
        onUnavailable?.()
      }
      throw error
    })
    void Promise.allSettled([
      watchDenial(getPersonalActivities(token, controller.signal)),
      watchDenial(getPersonalBoats(token, controller.signal)),
    ]).then(
      ([activityResult, boatResult]) => {
        if (controller.signal.aborted) return
        const errors = [activityResult, boatResult].flatMap((result) => result.status === 'rejected' ? [result.reason as unknown] : [])
        if (errors.some((error) => error instanceof PersonalTackBarNotFoundError)) return
        if (errors.length) setState({ status: 'error' })
        else if (activityResult.status === 'fulfilled' && boatResult.status === 'fulfilled') {
          setState({ status: 'ready', activities: activityResult.value, boats: boatResult.value })
        }
      },
    )
    return () => controller.abort()
  }, [token, retry, onUnavailable])

  useEffect(() => () => writeController.current?.abort(), [])

  useEffect(() => {
    if (!boatSaved || state.status !== 'ready') return
    setState((current) => current.status === 'ready' ? {
      ...current,
      boats: current.boats.some((boat) => boat.id === boatSaved.id)
        ? current.boats.map((boat) => boat.id === boatSaved.id ? boatSaved : boat)
        : [...current.boats, boatSaved],
      activities: current.activities.map((activity) => activity.boat_id === boatSaved.id
        ? { ...activity, boat: boatSaved } : activity),
    } : current)
  }, [boatSaved, state.status])

  function beginEdit(activity: PersonalActivity, boats: PersonalBoat[]) {
    setEditingId(activity.id)
    setBoatChoice(activity.boat_id && !boats.some((boat) => boat.id === activity.boat_id) ? '__keep__' : activity.boat_id ?? '')
    setLabel(effectiveDevice(activity))
    setFeedback(null)
  }

  async function save(activity: PersonalActivity) {
    if (submitting.current || state.status !== 'ready') return
    const patch: PersonalActivityPatch = {}
    if (boatChoice !== '__keep__' && boatChoice !== (activity.boat_id ?? '')) patch.boat_id = boatChoice || null
    const nextLabel = label.trim()
    const originalLabel = activity.device_label?.trim() || ''
    const extractedName = activity.device_name.trim()
    if (label !== effectiveDevice(activity)) {
      if (originalLabel && (!nextLabel || nextLabel === extractedName)) patch.device_label = null
      else if (nextLabel) patch.device_label = nextLabel
    }
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
    <h2 id="my-activities-heading"><button className="personal-disclosure" type="button" aria-expanded={expanded} aria-controls="my-activities-content" onClick={onToggle}>My Activities</button></h2>
    <div id="my-activities-content" hidden={!expanded}>
    {state.status === 'loading' && <p className="personal-feedback" role="status">Loading My Activities…</p>}
    {state.status === 'error' && <div className="personal-feedback" role="alert">Could not load My Activities. <button className="personal-action personal-action--secondary" type="button" onClick={() => { setState({ status: 'loading' }); setRetry((value) => value + 1) }}>Retry</button></div>}
    {state.status === 'ready' && (state.activities.length === 0
      ? <p>No Activities recorded yet.</p>
      : <ol className="personal-activities">{state.activities.map((activity) => {
        const owned = state.boats.some((boat) => boat.id === activity.boat_id)
        const currentBoat = activity.boat ? boatName(activity.boat) : activity.boat_id ? 'Unavailable Boat association' : 'No Boat'
        const editing = editingId === activity.id
        return <li className="personal-activity" key={activity.id}>
          <h3><time dateTime={activity.start_time}>{day(activity.start_time)}</time></h3>
          <p className="personal-activity__summary">{sailingInterval(activity.start_time, activity.end_time)}</p>
          <p className="personal-activity__context"><strong>Boat:</strong> {currentBoat}</p>
          <p className="personal-activity__context"><strong>Device:</strong> {effectiveDevice(activity) || 'Not available'}</p>
          <p className="personal-activity__origin">Source: {activity.source} · Original file: {activity.original_filename} · Extracted Device: {activity.device_name.trim() ? activity.device_name : 'Not available'}</p>
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
              <button className="personal-action personal-action--primary" type="submit" disabled={saving}>Save</button>
              <button className="personal-action personal-action--secondary" type="button" disabled={saving} onClick={() => { setEditingId(null); setFeedback(null) }}>Cancel</button>
            </div>
            {saving && <p className="personal-feedback" role="status">Saving Activity…</p>}
          </form> : <button className="personal-action personal-action--edit personal-activity__edit" type="button" disabled={saving} onClick={() => beginEdit(activity, state.boats)}>Edit Activity</button>}
          {feedback?.id === activity.id && <p className="personal-feedback" role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
        </li>
      })}</ol>)}
    </div>
  </section>
}
