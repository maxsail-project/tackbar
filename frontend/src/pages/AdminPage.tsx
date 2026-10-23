import TackBarBrand from '../components/TackBarBrand'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import AdminTrackUpload from '../components/AdminTrackUpload'
import { ingestionIsRunning, ingestionStatusLabels, pollAdminIngestions } from '../utils/adminIngestionPolling'
import {
  AdminApiError,
  confirmConsent,
  enrichSession,
  getAdminActivity,
  getAdminIngestion,
  getAdminSailor,
  getAdminSession,
  listAdminSailors,
  listAdminSessions,
  listAdminIngestions,
  listAdminActivities,
  markConsentRequested,
  sendConsentRequest,
  regenerateCapability,
  regeneratePersonalCapability,
  revokePersonalCapability,
  resendWelcomeEmail,
  renewSession,
  revokeCapability,
  revokeConsent,
  startNewConsentCycle,
  reprocessIngestion,
  discardIngestion,
  restoreIngestion,
  reviewMailbox,
  recalculateAdminActivityManeuvers,
  type IngestionDispositionFilter,
  type IngestionStatusFilter,
} from '../api/adminApi'
import type { AdminActivity, AdminActivitySummary, AdminConsentRequestState, AdminIngestion, AdminIngestionDetail, AdminSailor, AdminSailorDetail, AdminSession, AdminSessionSummary, CapabilityState, ConsentOperationalGroup } from '../types/admin'
import { sessionDisplayLocation } from '../utils/sessionPresentation'

export type Section = 'sailors' | 'sessions' | 'ingestions' | 'activities'
type AdminDrilldown =
  | { kind: 'ingestion'; value: AdminIngestionDetail }
  | { kind: 'activity'; value: AdminActivity }
  | { kind: 'sailor'; value: AdminSailorDetail }
  | { kind: 'session'; value: AdminSession }

export function adminNavigationTarget(kind: AdminDrilldown['kind'], id: string, _origin: Section) {
  return {
    section: kind === 'sailor' ? 'sailors' as const : kind === 'session' ? 'sessions' as const : kind === 'ingestion' ? 'ingestions' as const : 'activities' as const,
    selected: { kind, id },
    contextual: false,
  }
}

export const UNRESOLVED_SAILOR_FILTER = 'unresolved'

export interface IngestionListFilters {
  status: IngestionStatusFilter
  disposition: IngestionDispositionFilter
  sailor: string
  search: string
}

export function ingestionSailorOptions(ingestions: AdminIngestion[]) {
  const resolved = new Map<string, { value: string; label: string }>()
  let hasUnresolved = false
  for (const ingestion of ingestions) {
    if (!ingestion.sailor_id) {
      hasUnresolved = true
      continue
    }
    const identity = sailorIdentity(ingestion.sailor_label, ingestion.sailor_email, ingestion.sailor_id)
    const label = ingestion.sailor_email && identity !== ingestion.sailor_email
      ? `${identity} · ${ingestion.sailor_email}`
      : identity
    resolved.set(ingestion.sailor_id, { value: ingestion.sailor_id, label })
  }
  const options = [...resolved.values()].sort((left, right) => left.label.localeCompare(right.label))
  if (hasUnresolved) options.push({ value: UNRESOLVED_SAILOR_FILTER, label: 'Unknown / unresolved' })
  return options
}

export function filterAdminIngestions(ingestions: AdminIngestion[], filters: IngestionListFilters) {
  const query = filters.search.trim().toLocaleLowerCase()
  return ingestions.filter((ingestion) => {
    if (filters.status !== 'all' && ingestion.status !== filters.status) return false
    if (filters.disposition !== 'all' && ingestion.disposition !== filters.disposition) return false
    if (filters.sailor === UNRESOLVED_SAILOR_FILTER && ingestion.sailor_id !== null) return false
    if (filters.sailor !== 'all' && filters.sailor !== UNRESOLVED_SAILOR_FILTER && ingestion.sailor_id !== filters.sailor) return false
    if (!query) return true
    return [
      ingestion.id,
      ingestion.attachment_name,
      ingestion.sender_email,
      ingestion.sailor_id,
      ingestion.sailor_label,
      ingestion.sailor_email,
      ingestion.activity_id,
      ingestion.session_id,
    ].some((value) => value?.toLocaleLowerCase().includes(query))
  })
}

function matchesAdminSearch(values: Array<string | null | undefined>, search: string) {
  const query = search.trim().toLocaleLowerCase()
  return !query || values.some((value) => value?.toLocaleLowerCase().includes(query))
}

export function filterAdminActivities(activities: AdminActivitySummary[], search: string) {
  return activities.filter((activity) => matchesAdminSearch([
    activity.id,
    activity.sailor_id,
    activity.sailor_label,
    activity.session_id,
    activity.source,
    activity.device_name,
    activity.original_filename,
  ], search))
}

export function filterAdminSailors(sailors: AdminSailor[], search: string) {
  return sailors.filter((sailor) => matchesAdminSearch([
    sailor.id,
    sailor.name,
    sailor.email,
  ], search))
}

function sessionDateSearchText(session: AdminSessionSummary) {
  const timestamps = [session.sailing_start, session.sailing_end].filter((value): value is string => value !== null)
  const formats = [
    new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }),
    new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }),
  ]
  return timestamps.flatMap((timestamp) => formats.map((format) => format.format(new Date(timestamp)))).join(' ')
}

export function filterAdminSessions(sessions: AdminSessionSummary[], activities: AdminActivitySummary[], search: string) {
  return sessions.filter((session) => {
    const members = activities.filter((activity) => activity.session_id === session.id)
    return matchesAdminSearch([
      session.id,
      sessionDisplayLocation(session.location_label, session.location_country),
      sessionSailingLabel(session),
      sessionDateSearchText(session),
      ...members.flatMap((activity) => [activity.id, activity.sailor_id, activity.sailor_label]),
    ], search)
  })
}

export const ADMIN_SECTION_ORDER: Section[] = ['ingestions', 'activities', 'sailors', 'sessions']
export const DEFAULT_ADMIN_SECTION: Section = 'ingestions'

export const consentLabels: Record<ConsentOperationalGroup, string> = {
  pending_needs_request: 'Pending · request needed',
  pending_awaiting_response: 'Pending · awaiting response',
  active: 'Active',
  revoked: 'Revoked',
}
export const capabilityLabels: Record<CapabilityState, string> = {
  active: 'Active', expired: 'Expired', revoked: 'Revoked', never_generated: 'Never generated',
}

export function confirmNewConsentCycle(
  confirm: (message: string) => boolean,
  action: () => void,
) {
  if (confirm('Start a new consent cycle for this Sailor? They will return to Pending and will need consent again.')) action()
}

export function confirmConsentRequestSend(
  state: AdminConsentRequestState,
  confirm: (message: string) => boolean,
  action: () => void,
) {
  if (state !== 'expired' || confirm('Reissue this expired consent request? A new consent link will be created.')) action()
}

function localDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}

export function sessionLifetimePresentation(expiresAt: string, now = new Date()) {
  const remainingMilliseconds = new Date(expiresAt).getTime() - now.getTime()
  if (remainingMilliseconds <= 0) return { state: 'expired' as const, expiration: `Expired ${localDate(expiresAt)}` }
  return { state: 'active' as const, expiration: `Expires ${localDate(expiresAt)} · ${Math.ceil(remainingMilliseconds / 86_400_000)} days remaining` }
}

function sailingDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function sailingTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function sailingDuration(start: string, end: string) {
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours > 0 ? `${hours} h ${remainder} min` : `${remainder} min`
}

function sessionSailingLabel(session: AdminSessionSummary) {
  const location = sessionDisplayLocation(session.location_label, session.location_country)
  if (!session.sailing_start || !session.sailing_end) return location ? `${location} · Sailing time unavailable` : 'Sailing time unavailable'
  const start = new Date(session.sailing_start)
  const end = new Date(session.sailing_end)
  const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })
  const sailing = day.format(start) === day.format(end)
    ? `${day.format(start)} · ${time.format(start)}–${time.format(end)}`
    : `${localDate(session.sailing_start)}–${localDate(session.sailing_end)}`
  return location ? `${location} · ${sailing}` : sailing
}

function temporaryShareRemaining(expiresAt: string, now = new Date()) {
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60_000))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours > 0 ? `${hours} h ${remainder} min remaining` : `${remainder} min remaining`
}

function errorMessage(error: unknown) {
  if (!(error instanceof AdminApiError) || error.status === null) return 'Cannot reach the Admin backend.'
  if (error.status === 401) return 'Admin authorization failed.'
  if (error.status === 503) return 'Admin access is not configured or unavailable.'
  if (error.status === 409) return 'This operation is not currently allowed.'
  if (error.status === 422) return 'Check the entered value and try again.'
  return 'The Admin request failed. Try again.'
}

export function AdminAccessForm({ onEnter, error, busy }: { onEnter: (key: string) => void, error: string | null, busy: boolean }) {
  const [value, setValue] = useState('')
  const submit = (event: FormEvent) => { event.preventDefault(); if (value.trim()) onEnter(value) }
  return <main className="admin-login"><form className="admin-login__card" onSubmit={submit}>
    <TackBarBrand /><h1>Admin</h1>
    <label htmlFor="admin-key">Admin key</label>
    <input id="admin-key" type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} />
    {error && <p className="admin-error" role="alert">{error}</p>}
    <button className="admin-primary" disabled={busy || !value.trim()}>{busy ? 'Checking…' : 'Enter Admin'}</button>
  </form></main>
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null)
  const [section, setSection] = useState<Section>(DEFAULT_ADMIN_SECTION)
  const [sailors, setSailors] = useState<AdminSailor[]>([])
  const [sessions, setSessions] = useState<AdminSessionSummary[]>([])
  const [ingestions, setIngestions] = useState<AdminIngestion[]>([])
  const ingestionRevision = useRef(0)
  const [activities, setActivities] = useState<AdminActivitySummary[]>([])
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatusFilter>('all')
  const [ingestionDisposition, setIngestionDisposition] = useState<IngestionDispositionFilter>('all')
  const [ingestionSailor, setIngestionSailor] = useState('all')
  const [ingestionSearch, setIngestionSearch] = useState('')
  const [activitySearch, setActivitySearch] = useState('')
  const [sailorSearch, setSailorSearch] = useState('')
  const [sessionSearch, setSessionSearch] = useState('')
  const [reviewSummary, setReviewSummary] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [lastUploadId, setLastUploadId] = useState<string | null>(null)
  const ingestionToReveal = useRef<string | null>(null)
  const [selectedSailor, setSelectedSailor] = useState<AdminSailorDetail | null>(null)
  const [selectedSession, setSelectedSession] = useState<AdminSession | null>(null)
  const [selectedActivity, setSelectedActivity] = useState<AdminActivity | null>(null)
  const [drilldown, setDrilldown] = useState<AdminDrilldown[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleError = (cause: unknown) => {
    setError(errorMessage(cause))
    if (cause instanceof AdminApiError && cause.status === 401) {
      setAdminKey(null)
      setSailors([])
      setSessions([])
      setActivities([])
      setIngestions([])
      setLastUploadId(null)
      setUploadOpen(false)
      setSelectedSailor(null)
      setSelectedSession(null)
      setSelectedActivity(null)
      setDrilldown([])
    }
  }
  const loadAll = async (key: string) => {
    const revision = ingestionRevision.current
    const [nextSailors, nextSessions, nextIngestions, nextActivities] = await Promise.all([listAdminSailors(key), listAdminSessions(key), listAdminIngestions(key), listAdminActivities(key)])
    if (revision === ingestionRevision.current) {
      ingestionRevision.current += 1
      setIngestions(nextIngestions)
    }
    setSailors(nextSailors); setSessions(nextSessions); setActivities(nextActivities)
  }
  // Re-entering Ingestions inspects persisted results, including work completed
  // while this section was closed. No other dashboard collection is polled.
  useEffect(() => {
    if (!adminKey || section !== 'ingestions') return
    const controller = new AbortController()
    const revision = ingestionRevision.current
    void listAdminIngestions(adminKey, 'all', 'all', controller.signal).then((records) => {
      // An earlier read must not replace a newer acceptance or worker update.
      if (!controller.signal.aborted && revision === ingestionRevision.current) setIngestions(records)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) handleError(cause) })
    return () => controller.abort()
  }, [adminKey, section])
  const runningIngestionIds = ingestions.filter(ingestionIsRunning).map((item) => item.id).sort().join(',')
  useEffect(() => {
    if (!adminKey || section !== 'ingestions' || busy || !runningIngestionIds) return
    return pollAdminIngestions(adminKey, runningIngestionIds.split(','), (record) => {
      ingestionRevision.current += 1
      setIngestions((current) => current.map((item) => item.id === record.id ? record : item))
      setDrilldown((current) => current.map((item) => item.kind === 'ingestion' && item.value.id === record.id ? { kind: 'ingestion', value: record } : item))
    }, (cause) => {
      handleError(cause)
      setError(`${errorMessage(cause)} Status refresh stopped. Use Refresh to check again.`)
    })
  }, [adminKey, section, busy, runningIngestionIds])
  const acceptUpload = (record: AdminIngestion) => {
    ingestionRevision.current += 1
    setIngestions((current) => [record, ...current.filter((item) => item.id !== record.id)])
    setLastUploadId(record.id)
  }
  const enter = async (key: string) => {
    setBusy(true); setError(null)
    try { await loadAll(key); setAdminKey(key) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const refresh = async () => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try {
      await loadAll(adminKey)
      if (selectedSailor) setSelectedSailor(await getAdminSailor(adminKey, selectedSailor.id))
      if (selectedSession) setSelectedSession(await getAdminSession(adminKey, selectedSession.id))
      if (selectedActivity) setSelectedActivity(await getAdminActivity(adminKey, selectedActivity.id))
      const selected = drilldown.find((item) => item.kind === 'ingestion')
      if (selected) {
        const detail = await getAdminIngestion(adminKey, selected.value.id)
        setDrilldown((current) => current.map((item) => item.kind === 'ingestion' && item.value.id === detail.id ? { kind: 'ingestion', value: detail } : item))
      }
    } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const sailorAction = async (action: () => Promise<AdminSailorDetail>) => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try {
      const updated = await action()
      setSelectedSailor(updated)
      setSailors((current) => current.map((sailor) => sailor.id === updated.id ? updated : sailor))
      setSailors(await listAdminSailors(adminKey))
    } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const sessionAction = async (action: () => Promise<AdminSession>) => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try {
      const updated = await action()
      if (selectedSession?.id === updated.id) setSelectedSession(updated)
      setSessions((current) => current.map((session) => session.id === updated.id ? updated : session))
      setSessions(await listAdminSessions(adminKey))
    } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const ingestionAction = async (id: string) => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try { const updated = await reprocessIngestion(adminKey, id); setIngestions((current) => current.map((item) => item.id === id ? updated : item)); setIngestions(await listAdminIngestions(adminKey)); const detail = await getAdminIngestion(adminKey, id); setDrilldown((current) => current.map((item) => item.kind === 'ingestion' && item.value.id === id ? { kind: 'ingestion', value: detail } : item)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const ingestionDispositionAction = async (id: string, action: () => Promise<AdminIngestion>) => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try { await action(); setIngestions(await listAdminIngestions(adminKey)); const detail = await getAdminIngestion(adminKey, id); setDrilldown((current) => current.map((item) => item.kind === 'ingestion' && item.value.id === id ? { kind: 'ingestion', value: detail } : item)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const changeIngestionFilters = (status: IngestionStatusFilter, disposition: IngestionDispositionFilter) => {
    setIngestionStatus(status); setIngestionDisposition(disposition); setDrilldown([])
  }
  const mailboxAction = async () => {
    if (!adminKey) return
    setBusy(true); setError(null); setReviewSummary(null)
    try { const result = await reviewMailbox(adminKey); setReviewSummary(`Mailbox review complete: ${result.processed} processed · ${result.skipped_already_processed} skipped · ${result.known_failed} known failed · ${result.failed} failed`); setIngestions(await listAdminIngestions(adminKey)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const fetchDrilldown = async (kind: AdminDrilldown['kind'], id: string): Promise<AdminDrilldown> => {
    if (!adminKey) throw new Error('Admin access unavailable')
    if (kind === 'ingestion') return { kind, value: await getAdminIngestion(adminKey, id) }
    if (kind === 'activity') return { kind, value: await getAdminActivity(adminKey, id) }
    if (kind === 'sailor') return { kind, value: await getAdminSailor(adminKey, id) }
    return { kind, value: await getAdminSession(adminKey, id) }
  }
  useEffect(() => {
    const id = ingestionToReveal.current
    if (!id || busy || section !== 'ingestions' || !drilldown.some((item) => item.kind === 'ingestion' && item.value.id === id)) return
    const summary = document.getElementById(`admin-ingestion-${id}`)?.querySelector<HTMLButtonElement>('.admin-entity-summary')
    if (!summary) return
    summary.focus({ preventScroll: true })
    summary.scrollIntoView({ block: 'start' })
    ingestionToReveal.current = null
  }, [drilldown, busy, section])
  const selectIngestion = async (id: string, reveal = false) => {
    const selected = drilldown.length === 1 && drilldown[0].kind === 'ingestion' && drilldown[0].value.id === id
    if (selected && !reveal) { setDrilldown([]); return }
    if (reveal) ingestionToReveal.current = id
    setBusy(true); setError(null)
    try { setDrilldown([await fetchDrilldown('ingestion', id)]) } catch (cause) { ingestionToReveal.current = null; handleError(cause) } finally { setBusy(false) }
  }
  const selectActivity = async (id: string) => {
    if (selectedActivity?.id === id) { setSelectedActivity(null); return }
    if (!adminKey) return
    setBusy(true); setError(null)
    try { setSelectedActivity(await getAdminActivity(adminKey, id)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const selectSailor = async (id: string) => {
    if (selectedSailor?.id === id) { setSelectedSailor(null); return }
    if (!adminKey) return
    setBusy(true); setError(null)
    try { setSelectedSailor(await getAdminSailor(adminKey, id)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const selectSession = async (id: string) => {
    if (selectedSession?.id === id) { setSelectedSession(null); return }
    if (!adminKey) return
    setBusy(true); setError(null)
    try { setSelectedSession(await getAdminSession(adminKey, id)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const recalculateManeuvers = async () => {
    if (!adminKey || !selectedActivity) return
    setBusy(true); setError(null)
    try {
      const maneuvers = await recalculateAdminActivityManeuvers(adminKey, selectedActivity.id)
      setSelectedActivity((current) => current ? { ...current, maneuvers } : current)
    } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const followRelation = async (kind: AdminDrilldown['kind'], id: string) => {
    setBusy(true); setError(null)
    try {
      const target = adminNavigationTarget(kind, id, section)
      const next = await fetchDrilldown(target.selected.kind, target.selected.id)
      // Newly processed uploads may refer to entities absent from the initial
      // dashboard snapshot. Insert the fetched entity into its owning list.
      if (next.kind === 'activity') { setActivitySearch(''); setActivities((current) => [next.value, ...current.filter((item) => item.id !== next.value.id)]) }
      if (next.kind === 'session') { setSessionSearch(''); setSessions((current) => [next.value, ...current.filter((item) => item.id !== next.value.id)]) }
      if (next.kind === 'sailor') { setSailorSearch(''); setSelectedSailor(next.value); setDrilldown([]) }
      else if (next.kind === 'session') { setSelectedSession(next.value); setDrilldown([]) }
      else if (next.kind === 'ingestion') {
        setIngestionStatus('all'); setIngestionDisposition('all'); setIngestionSailor('all'); setIngestionSearch('')
        setIngestions((current) => [next.value, ...current.filter((item) => item.id !== next.value.id)])
        setDrilldown([next])
      }
      else { setSelectedActivity(next.value); setDrilldown([]) }
      setSection(target.section)
    } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const withSailorLabel = <T extends AdminIngestion,>(record: T): T => {
    const owner = record.provider === 'admin_upload' ? sailors.find((sailor) => sailor.id === record.owner_sailor_id) : undefined
    return owner && !record.sailor_label ? { ...record, sailor_label: owner.name || owner.email, sailor_email: owner.email } : record
  }
  const presentedIngestions = ingestions.map(withSailorLabel)
  const visibleIngestions = filterAdminIngestions(presentedIngestions, {
    status: ingestionStatus,
    disposition: ingestionDisposition,
    sailor: ingestionSailor,
    search: ingestionSearch,
  })
  const visibleActivities = filterAdminActivities(activities, activitySearch)
  const visibleSailors = filterAdminSailors(sailors, sailorSearch)
  const visibleSessions = filterAdminSessions(sessions, activities, sessionSearch)
  const sailorOptions = ingestionSailorOptions(presentedIngestions)
  const lastUpload = presentedIngestions.find((item) => item.id === lastUploadId)
  if (!adminKey) return <AdminAccessForm onEnter={enter} error={error} busy={busy} />

  return <main className="admin-page">
    <AdminHeader busy={busy} onRefresh={refresh} />
    <nav className="admin-tabs" aria-label="Admin sections">
      {ADMIN_SECTION_ORDER.map((item) => <button key={item} className={section === item ? 'is-active' : ''} onClick={() => { setSection(item); setDrilldown([]) }}>{item[0].toUpperCase() + item.slice(1)}</button>)}
    </nav>
    {error && <p className="admin-error admin-feedback" role="alert">{error}</p>}
    {section === 'activities' ? <section className="admin-content"><h1>Activities</h1><AdminSearch value={activitySearch} busy={busy} placeholder="Sailor, sailing source or filename" onChange={(value) => { setActivitySearch(value); setSelectedActivity(null) }} />{visibleActivities.length === 0 && <p className="admin-meta">No Activities match the search.</p>}<div className="admin-list admin-activity-list">
      {visibleActivities.map((activity) => <ActivityCard key={activity.id} activity={activity} detail={selectedActivity?.id === activity.id ? selectedActivity : null} session={sessions.find((session) => session.id === activity.session_id)} sourceIngestion={ingestions.find((ingestion) => ingestion.id === selectedActivity?.source_ingestion_id)} busy={busy} onSelect={() => void selectActivity(activity.id)} onFollow={(kind, id) => void followRelation(kind, id)} onRecalculate={() => void recalculateManeuvers()} />)}
    </div></section> : section === 'sailors' ? <section className="admin-content"><h1>Sailors</h1><AdminSearch value={sailorSearch} busy={busy} placeholder="Name or email" onChange={(value) => { setSailorSearch(value); setSelectedSailor(null) }} />{visibleSailors.length === 0 && <p className="admin-meta">No Sailors match the search.</p>}<div className="admin-list admin-sailor-list">
      {visibleSailors.map((sailor) => <SailorCard key={sailor.id} sailor={sailor} detail={selectedSailor?.id === sailor.id ? selectedSailor : null} activities={activities.filter((activity) => activity.sailor_id === sailor.id)} busy={busy} onSelect={() => void selectSailor(sailor.id)} onActivitySelect={(id) => void followRelation('activity', id)} onSessionSelect={(id) => void followRelation('session', id)} onRequested={() => sailorAction(() => markConsentRequested(adminKey, sailor.id))} onConsentRequestSend={() => sailorAction(() => sendConsentRequest(adminKey, sailor.id))} onConfirm={() => sailorAction(() => confirmConsent(adminKey, sailor.id))} onRevoke={() => { if (window.confirm('Record consent withdrawal?')) void sailorAction(() => revokeConsent(adminKey, sailor.id)) }} onNewCycle={() => confirmNewConsentCycle((message) => window.confirm(message), () => void sailorAction(() => startNewConsentCycle(adminKey, sailor.id)))} onPersonalRegenerate={() => { if (window.confirm('Regenerate personal access? The current personal link will stop working.')) void sailorAction(() => regeneratePersonalCapability(adminKey, sailor.id)) }} onPersonalRevoke={() => { if (window.confirm('Revoke personal access? Consent and shared Sessions will remain unchanged.')) void sailorAction(() => revokePersonalCapability(adminKey, sailor.id)) }} onWelcomeEmailResend={() => void sailorAction(() => resendWelcomeEmail(adminKey, sailor.id))} />)}
    </div></section> : section === 'sessions' ? <section className="admin-content"><h1>Sessions</h1><AdminSearch value={sessionSearch} busy={busy} placeholder="Location, sailing date or Sailor" onChange={(value) => { setSessionSearch(value); setSelectedSession(null) }} />{visibleSessions.length === 0 && <p className="admin-meta">No Sessions match the search.</p>}<div className="admin-list admin-session-list">
      {visibleSessions.map((session) => <SessionCard key={session.id} session={session} detail={selectedSession?.id === session.id ? selectedSession : null} activities={activities.filter((activity) => activity.session_id === session.id)} busy={busy} onSelect={() => void selectSession(session.id)} onActivitySelect={(id) => void followRelation('activity', id)} onSailorSelect={(id) => void followRelation('sailor', id)} onEnrich={() => void sessionAction(() => enrichSession(adminKey, session.id))} onRegenerate={() => { if (window.confirm('Regenerate capability? The current shared link will stop working.')) void sessionAction(() => regenerateCapability(adminKey, session.id)) }} onRevoke={() => { if (window.confirm('Revoke this shared capability?')) void sessionAction(() => revokeCapability(adminKey, session.id)) }} onRenew={(days) => { if (window.confirm(`Set expiry to ${days} days from now?`)) void sessionAction(() => renewSession(adminKey, session.id, days)) }} />)}
    </div></section> : <section className="admin-content"><IngestionSectionHeader busy={busy} onReview={() => void mailboxAction()} uploadOpen={uploadOpen} onUpload={() => setUploadOpen((current) => !current)} />
      {uploadOpen && <AdminTrackUpload adminKey={adminKey} sailors={sailors} onAccepted={acceptUpload} onUnauthorized={handleError} />}
      {lastUpload && <IngestionUploadResult ingestion={lastUpload} onInspect={() => { setIngestionStatus('all'); setIngestionDisposition('all'); setIngestionSailor('all'); setIngestionSearch(''); void selectIngestion(lastUpload.id, true) }} />}
      <IngestionFilters status={ingestionStatus} disposition={ingestionDisposition} sailor={ingestionSailor} search={ingestionSearch} sailors={sailorOptions} busy={busy} onChange={changeIngestionFilters} onSailorChange={(value) => { setIngestionSailor(value); setDrilldown([]) }} onSearchChange={(value) => { setIngestionSearch(value); setDrilldown([]) }} />{reviewSummary && <p className="admin-meta">{reviewSummary}</p>}{<>{visibleIngestions.length === 0 && <p className="admin-meta">No Ingestions match the active filters.</p>}<div className="admin-list admin-ingestion-list">{visibleIngestions.map((item) => {
      const selected = drilldown.length === 1 && drilldown[0].kind === 'ingestion' && drilldown[0].value.id === item.id ? withSailorLabel(drilldown[0].value) : null
      return <IngestionCard key={item.id} ingestion={item} detail={selected} session={sessions.find((session) => session.id === item.session_id)} busy={busy} onSelect={() => void selectIngestion(item.id)} onFollow={(kind, id) => void followRelation(kind, id)} onReprocess={() => { if (window.confirm('Reprocess this ingestion from its preserved original?')) void ingestionAction(item.id) }} onDiscard={() => void ingestionDispositionAction(item.id, () => discardIngestion(adminKey!, item.id))} onRestore={() => void ingestionDispositionAction(item.id, () => restoreIngestion(adminKey!, item.id))} />
    })}</div></>}</section>}
  </main>
}

export function AdminHeader({ busy, onRefresh, version = import.meta.env.VITE_APP_VERSION }: { busy: boolean, onRefresh: () => void, version?: string }) {
  const releaseSuffix = version?.trim()
  return <header className="admin-header"><div><TackBarBrand inverted /><span>Admin · Real Sailing Pilot{releaseSuffix ? ` · ${releaseSuffix}` : ''}</span></div><button onClick={onRefresh} disabled={busy}>Refresh</button></header>
}

export function IngestionSectionHeader({ busy, onReview, uploadOpen = false, onUpload }: { busy: boolean, onReview: () => void, uploadOpen?: boolean, onUpload?: () => void }) {
  return <div className="admin-ingestion-section-header"><h1>Ingestions</h1><div className="admin-actions">{onUpload && <button className="admin-section-action" type="button" aria-expanded={uploadOpen} onClick={onUpload}>Upload track</button>}<button className="admin-section-action" type="button" disabled={busy} onClick={onReview}>Review mailbox</button></div></div>
}

export function IngestionUploadResult({ ingestion, onInspect }: { ingestion: AdminIngestion, onInspect: () => void }) {
  return <div className="admin-upload-result" role="status">
    <p><strong>{ingestion.attachment_name}</strong> · {ingestionStatusLabels[ingestion.status]}</p>
    <p className="admin-meta">Accepted and preserved. {ingestionIsRunning(ingestion) ? 'Backend processing continues independently; you can navigate elsewhere.' : 'Inspect the persisted result below.'}</p>
    {ingestion.last_error && <p className="admin-error">{ingestion.last_error}</p>}
    <RelationButton label="Ingestion" id={ingestion.id} value="Inspect upload result" onFollow={onInspect} />
  </div>
}

export function AdminSearch({ value, busy, placeholder, onChange }: { value: string, busy: boolean, placeholder: string, onChange: (value: string) => void }) {
  return <label className="admin-search">Search<input type="search" value={value} disabled={busy} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>
}

export function IngestionFilters({ status, disposition, sailor, search, sailors, busy, onChange, onSailorChange, onSearchChange }: { status: IngestionStatusFilter, disposition: IngestionDispositionFilter, sailor: string, search: string, sailors: Array<{ value: string; label: string }>, busy: boolean, onChange: (status: IngestionStatusFilter, disposition: IngestionDispositionFilter) => void, onSailorChange: (sailor: string) => void, onSearchChange: (search: string) => void }) {
  return <div className="admin-filters"><AdminSearch value={search} busy={busy} placeholder="Filename, email or ID" onChange={onSearchChange} /><label>Status<select value={status} disabled={busy} onChange={(event) => onChange(event.target.value as IngestionStatusFilter, disposition)}><option value="all">All</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="processed">Processed</option><option value="failed">Failed</option></select></label><label>Disposition<select value={disposition} disabled={busy} onChange={(event) => onChange(status, event.target.value as IngestionDispositionFilter)}><option value="all">All</option><option value="active">Active</option><option value="discarded">Discarded</option></select></label><label>Sailor<select value={sailor} disabled={busy} onChange={(event) => onSailorChange(event.target.value)}><option value="all">All sailors</option>{sailors.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
}

function compactId(value: string | null) {
  return value ? `${value.slice(0, 8)}…` : '—'
}

export function sailorIdentity(name: string | null | undefined, email: string | null | undefined, id: string | null) {
  return name?.trim() || email?.trim() || compactId(id)
}

function activityRelationIdentity(activity: Pick<AdminActivitySummary, 'start_time' | 'end_time'>) {
  return `${sailingDate(activity.start_time)} · ${sailingTime(activity.start_time)}–${sailingTime(activity.end_time)}`
}

function sessionRelationIdentity(session: AdminSessionSummary, includeActivityCount = false) {
  const count = includeActivityCount ? ` · ${session.total_activity_count} ${session.total_activity_count === 1 ? 'Activity' : 'Activities'}` : ''
  return `${sessionSailingLabel(session)}${count}`
}

function ingestionRelationIdentity(ingestion: AdminIngestion) {
  const attachment = ingestion.attachment_name || 'Unknown attachment'
  const contextTime = ingestion.activity_start_time || ingestion.received_at || ingestion.accepted_at
  return contextTime ? `${attachment} · ${sailingDate(contextTime)}` : attachment
}

function relatedIngestionIdentity(ingestion: AdminActivity['related_ingestions'][number]) {
  const attachment = ingestion.attachment_name || 'Unknown attachment'
  return ingestion.received_at ? `${attachment} · ${sailingDate(ingestion.received_at)}` : attachment
}

function DiagnosticJson({ value, label = 'Read-only JSON' }: { value: Record<string, unknown>, label?: string }) {
  return <details className="admin-diagnostics"><summary>{label}</summary><p>This diagnostic representation is read-only.</p><pre>{JSON.stringify(value, null, 2)}</pre></details>
}

function DisclosureAffordance({ expanded }: { expanded: boolean }) {
  return <span className={`admin-disclosure-affordance${expanded ? ' is-expanded' : ''}`} aria-hidden="true">›</span>
}

export function RelationButton({ label, id, value, unavailableValue = 'Unavailable', onFollow }: { label: string, id: string | null, value?: string | null, unavailableValue?: string, onFollow: () => void }) {
  return id ? <button className="admin-relation" type="button" onClick={onFollow}><span>{label}</span><strong>{value || compactId(id)}</strong><span aria-hidden="true">›</span></button> : <div className="admin-relation admin-relation--unavailable"><span>{label}</span><strong>{unavailableValue}</strong></div>
}

export function IngestionCard({ ingestion, detail, session, busy, onSelect, onFollow, onReprocess, onDiscard, onRestore }: { ingestion: AdminIngestion, detail?: AdminIngestionDetail | null, session?: AdminSessionSummary, busy: boolean, onSelect: () => void, onFollow: (kind: AdminDrilldown['kind'], id: string) => void, onReprocess: () => void, onDiscard: () => void, onRestore: () => void }) {
  const hasSailing = Boolean(ingestion.activity_start_time && ingestion.activity_end_time)
  const technicalStatusClass = ingestion.status === 'processed' ? 'active' : ingestion.status === 'failed' ? 'expired' : 'pending_needs_request'
  const activityOutcome = ingestion.activity_created_by_ingestion === true ? 'Activity created' : ingestion.activity_created_by_ingestion === false ? 'Existing Activity reused' : 'Activity creation status unknown'
  return <article id={`admin-ingestion-${ingestion.id}`} className={`admin-card admin-entity-card admin-ingestion-card${detail ? ' is-expanded is-selected' : ''}`} aria-current={detail ? 'true' : undefined}>
    <button className="admin-entity-summary admin-ingestion-summary" type="button" aria-expanded={Boolean(detail)} disabled={busy} onClick={onSelect}>
      <div className="admin-card__heading"><div><h2>{ingestion.attachment_name || 'Unknown attachment'}</h2><p>{ingestion.provider === 'admin_upload' ? `Admin upload · ${sailorIdentity(ingestion.sailor_label, ingestion.sailor_email, ingestion.owner_sailor_id ?? ingestion.sailor_id)}` : `${ingestion.sender_email || 'Unknown sender'} · ${ingestion.provider}`} · {localDate(ingestion.received_at || ingestion.accepted_at || null)}</p></div><span className={`state-badge state-${technicalStatusClass}`}>{ingestionStatusLabels[ingestion.status]}</span></div>
      <div className="admin-ingestion-summary__context">{hasSailing ? <span>Sailing <strong>{sailingDate(ingestion.activity_start_time!)}</strong> · {sailingTime(ingestion.activity_start_time!)}–{sailingTime(ingestion.activity_end_time!)} · {ingestion.activity_sample_count?.toLocaleString() ?? '—'} samples</span> : <span>Sailing context unavailable</span>}{ingestion.status === 'processed' && ingestion.activity_id && <span>{activityOutcome}</span>}{ingestion.disposition === 'discarded' && <span className="state-badge state-revoked">Discarded</span>}</div>
      <DisclosureAffordance expanded={Boolean(detail)} />
    </button>
    {detail && <IngestionOperationalDetail ingestion={detail} session={session} busy={busy} onFollow={onFollow} onReprocess={onReprocess} onDiscard={onDiscard} onRestore={onRestore} />}
  </article>
}

export function IngestionOperationalDetail({ ingestion, session, busy, onFollow, onReprocess, onDiscard, onRestore }: { ingestion: AdminIngestionDetail, session?: AdminSessionSummary, busy: boolean, onFollow: (kind: AdminDrilldown['kind'], id: string) => void, onReprocess?: () => void, onDiscard?: () => void, onRestore?: () => void }) {
  const notification = ingestion.session_result_notification
  const outcome = ingestionIsRunning(ingestion) ? 'Awaiting processing result' : ingestion.provider === 'admin_upload' && ingestion.status === 'failed' && !ingestion.activity_id ? 'No related Activity' : ingestion.activity_created_by_ingestion === true ? 'Created by this Ingestion' : ingestion.activity_created_by_ingestion === false ? 'Reused existing Activity' : 'Unknown (legacy provenance)'
  const outboundStatus = ingestion.provider === 'admin_upload' ? 'Suppressed · manual source (no automatic emails)' : !ingestion.session_result_notification_candidate ? 'Not applicable / not attempted' : !notification ? 'Not attempted' : notification.status === 'eligible' ? 'Not attempted' : notification.status[0].toUpperCase() + notification.status.slice(1)
  return <div className="admin-entity-detail admin-ingestion-detail">
    <div className="admin-detail-grid">
      <section><h3>Sailing</h3>{ingestion.activity_start_time && ingestion.activity_end_time ? <dl><div><dt>Date</dt><dd>{sailingDate(ingestion.activity_start_time)}</dd></div><div><dt>Time</dt><dd>{sailingTime(ingestion.activity_start_time)}–{sailingTime(ingestion.activity_end_time)}</dd></div><div><dt>Duration</dt><dd>{sailingDuration(ingestion.activity_start_time, ingestion.activity_end_time)}</dd></div><div><dt>Samples</dt><dd>{ingestion.activity_sample_count?.toLocaleString() ?? '—'}</dd></div></dl> : <p>Unavailable</p>}</section>
      <section><h3>Source</h3><dl><div><dt>Attachment</dt><dd>{ingestion.attachment_name || '—'}</dd></div>{ingestion.provider !== 'admin_upload' && <div><dt>Sender</dt><dd>{ingestion.sender_email || '—'}</dd></div>}<div><dt>Provider</dt><dd>{ingestion.provider}</dd></div>{ingestion.provider === 'admin_upload' ? <div><dt>Accepted</dt><dd>{localDate(ingestion.accepted_at || null)}</dd></div> : <div><dt>Email received</dt><dd>{localDate(ingestion.received_at)}</dd></div>}</dl></section>
      <section className="admin-detail-grid__wide"><h3>Traceability</h3><div className="admin-relations"><RelationButton label="Sailor" id={ingestion.sailor_id} value={sailorIdentity(ingestion.sailor_label, ingestion.sailor_email, ingestion.sailor_id)} onFollow={() => ingestion.sailor_id && onFollow('sailor', ingestion.sailor_id)} /><RelationButton label="Activity" id={ingestion.activity_id} value={ingestion.activity_start_time && ingestion.activity_end_time ? activityRelationIdentity({ start_time: ingestion.activity_start_time, end_time: ingestion.activity_end_time }) : undefined} onFollow={() => ingestion.activity_id && onFollow('activity', ingestion.activity_id)} /><RelationButton label="Session" id={ingestion.session_id} value={session ? sessionRelationIdentity(session, true) : undefined} onFollow={() => ingestion.session_id && onFollow('session', ingestion.session_id)} /></div><p><strong>Activity outcome:</strong> {outcome}</p></section>
      <section><h3>Processing</h3><dl><div><dt>Technical status</dt><dd>{ingestionStatusLabels[ingestion.status]}</dd></div><div><dt>Disposition</dt><dd>{ingestion.disposition === 'active' ? 'Active' : 'Discarded'}</dd></div><div><dt>Attempts</dt><dd>{ingestion.attempts}</dd></div><div><dt>Last attempt</dt><dd>{localDate(ingestion.last_attempt_at)}</dd></div><div><dt>Preserved original</dt><dd>{ingestion.original_available ? 'Available' : 'Unavailable'}</dd></div></dl>{ingestion.last_error && <p className="admin-error">{ingestion.last_error}</p>}</section>
      <section><h3>Outbound notification</h3><p><strong>Status:</strong> {outboundStatus}</p>{notification?.attempted_at && <p><strong>Attempted:</strong> {localDate(notification.attempted_at)}</p>}{notification?.sent_at && <p><strong>Sent:</strong> {localDate(notification.sent_at)}</p>}{notification?.last_error && <p className="admin-error">{notification.last_error}</p>}<p className="admin-meta">Outbound notification delivery does not change the technical Ingestion result.</p></section>
    </div>
    {onReprocess && onDiscard && onRestore && <section className="admin-maintenance"><h3>Maintenance</h3><div className="admin-actions">{ingestion.original_available && <button disabled={busy || ingestionIsRunning(ingestion)} onClick={onReprocess}>Reprocess</button>}<button disabled={busy || ingestionIsRunning(ingestion)} onClick={ingestion.disposition === 'active' ? onDiscard : onRestore}>{ingestion.disposition === 'active' ? 'Discard' : 'Restore'}</button></div></section>}
    <details className="admin-advanced"><summary>Advanced details</summary><h4>Technical traceability</h4><dl><div><dt>Ingestion ID</dt><dd>{ingestion.id}</dd></div><div><dt>Sailor ID</dt><dd>{ingestion.sailor_id || '—'}</dd></div><div><dt>Activity ID</dt><dd>{ingestion.activity_id || '—'}</dd></div><div><dt>Session ID</dt><dd>{ingestion.session_id || '—'}</dd></div>{ingestion.provider === 'admin_upload' ? <div><dt>Operation ID</dt><dd>{ingestion.operation_id || ingestion.id}</dd></div> : <div><dt>Provider message ID</dt><dd>{ingestion.provider_message_id}</dd></div>}<div><dt>Attachment SHA-256</dt><dd>{ingestion.attachment_sha256 || '—'}</dd></div></dl></details>
    <DiagnosticJson value={ingestion.diagnostic} />
  </div>
}

export function ActivityCard({ activity, detail, session, sourceIngestion, busy, onSelect, onFollow, onRecalculate }: { activity: AdminActivitySummary, detail: AdminActivity | null, session?: AdminSessionSummary, sourceIngestion?: AdminIngestion, busy: boolean, onSelect: () => void, onFollow: (kind: AdminDrilldown['kind'], id: string) => void, onRecalculate: () => void }) {
  return <article className={`admin-card admin-entity-card admin-activity-card${detail ? ' is-expanded is-selected' : ''}`} aria-current={detail ? 'true' : undefined}>
    <button className="admin-entity-summary admin-activity-summary" type="button" aria-expanded={Boolean(detail)} disabled={busy} onClick={onSelect}>
      <div className="admin-card__heading"><div><h2>{activityRelationIdentity(activity)}</h2><p>{sailorIdentity(activity.sailor_label, null, activity.sailor_id)}</p></div><span className="state-badge">{activity.sample_count.toLocaleString()} samples</span></div>
      <p className="admin-meta">{activity.source} · {activity.device_name}</p>
      <DisclosureAffordance expanded={Boolean(detail)} />
    </button>
    {detail && <ActivityAdminDetail activity={detail} session={session} sourceIngestion={sourceIngestion} busy={busy} onFollow={onFollow} onRecalculate={onRecalculate} />}
  </article>
}

export function ActivityAdminDetail({ activity, session, sourceIngestion, busy = false, onFollow, onRecalculate = () => undefined }: { activity: AdminActivity, session?: AdminSessionSummary, sourceIngestion?: AdminIngestion, busy?: boolean, onFollow: (kind: AdminDrilldown['kind'], id: string) => void, onRecalculate?: () => void }) {
  const boat = activity.boat ? [activity.boat.name, activity.boat.sailing_class, activity.boat.sail_number].filter(Boolean).join(' · ') : '—'
  const maneuvers = activity.maneuvers
  const detector = maneuvers.detector_status === null ? 'Not available' : maneuvers.detector_status === 'available' ? 'Available' : `Unavailable · ${maneuvers.unavailable_reason?.replaceAll('_', ' ') || 'unknown reason'}`
  const ingestionUnavailable = activity.source_ingestion_resolution === 'ambiguous' ? 'Ambiguous · multiple related Ingestions' : 'Unavailable'
  return <div className="admin-entity-detail admin-activity-detail"><div className="admin-detail-grid admin-activity-detail__sections"><section><h3>Track</h3><dl><div><dt>Date</dt><dd>{sailingDate(activity.start_time)}</dd></div><div><dt>Start</dt><dd>{sailingTime(activity.start_time)}</dd></div><div><dt>End</dt><dd>{sailingTime(activity.end_time)}</dd></div><div><dt>Duration</dt><dd>{sailingDuration(activity.start_time, activity.end_time)}</dd></div><div><dt>Samples</dt><dd>{activity.sample_count.toLocaleString()}</dd></div><div><dt>Normalized track</dt><dd>{activity.track_available ? 'Available' : 'Unavailable'}</dd></div></dl></section><section><h3>Source</h3><dl><div><dt>Provider/source</dt><dd>{activity.source}</dd></div><div><dt>Device</dt><dd>{activity.device_name}</dd></div><div><dt>Original filename</dt><dd>{activity.original_filename}</dd></div></dl></section><section className="admin-detail-grid__wide"><h3>Traceability</h3><dl><div><dt>Boat</dt><dd>{boat}</dd></div></dl><div className="admin-relations"><RelationButton label="Sailor" id={activity.sailor_id} value={sailorIdentity(activity.sailor_label, null, activity.sailor_id)} onFollow={() => onFollow('sailor', activity.sailor_id)} /><RelationButton label="Session" id={activity.session_id} value={session ? sessionRelationIdentity(session, true) : undefined} onFollow={() => activity.session_id && onFollow('session', activity.session_id)} /><RelationButton label="Source Ingestion" id={activity.source_ingestion_id} value={sourceIngestion ? ingestionRelationIdentity(sourceIngestion) : undefined} unavailableValue={ingestionUnavailable} onFollow={() => activity.source_ingestion_id && onFollow('ingestion', activity.source_ingestion_id)} /></div></section><section className="admin-detail-grid__wide"><h3>Maneuvers</h3><dl><div><dt>Artifact currency</dt><dd>{maneuvers.artifact_currency.toUpperCase()}</dd></div><div><dt>Detector status</dt><dd>{detector}</dd></div><div><dt>Detector mode</dt><dd>{maneuvers.detector_mode ?? 'Not available'}</dd></div><div><dt>Detected event count</dt><dd>{maneuvers.detected_count ?? '—'}</dd></div><div><dt>Persisted algorithm version</dt><dd>{maneuvers.artifact_algorithm_version ?? '—'}</dd></div><div><dt>Current algorithm version</dt><dd>{maneuvers.current_algorithm_version}</dd></div></dl><div className="admin-actions"><button disabled={busy || !activity.track_available} onClick={onRecalculate}>{busy ? 'Recalculating…' : 'Recalculate maneuvers'}</button></div></section></div><details className="admin-advanced"><summary>Advanced</summary><h4>Technical traceability</h4><dl><div><dt>Activity ID</dt><dd>{activity.id}</dd></div><div><dt>Sailor ID</dt><dd>{activity.sailor_id}</dd></div><div><dt>Session ID</dt><dd>{activity.session_id || '—'}</dd></div>{activity.source_ingestion_resolution === 'ambiguous' ? <div><dt>Source Ingestion</dt><dd>AMBIGUOUS</dd></div> : <div><dt>Source Ingestion ID</dt><dd>{activity.source_ingestion_id || '—'}</dd></div>}<div><dt>Attachment SHA-256</dt><dd>{activity.attachment_sha256}</dd></div></dl>{activity.source_ingestion_resolution === 'ambiguous' && activity.related_ingestions.length > 0 && <div className="admin-technical-ingestions"><h4>Related Ingestions</h4><ul>{activity.related_ingestions.map((ingestion) => <li key={ingestion.id}><strong>{relatedIngestionIdentity(ingestion)}</strong><span>{ingestion.id}</span></li>)}</ul></div>}<h4>Technical track</h4>{activity.technical_track ? <dl><div><dt>Sample count</dt><dd>{activity.technical_track.sample_count.toLocaleString()}</dd></div><div><dt>Duration</dt><dd>{activity.technical_track.duration_seconds.toLocaleString(undefined, { maximumFractionDigits: 2 })} s</dd></div><div><dt>Effective sample frequency</dt><dd>{activity.technical_track.effective_sample_frequency_hz === null ? 'Unavailable' : `${activity.technical_track.effective_sample_frequency_hz.toLocaleString(undefined, { maximumFractionDigits: 2 })} Hz`}</dd></div><div><dt>Available telemetry channels</dt><dd>{activity.technical_track.available_channels.join(' · ') || 'None available'}</dd></div></dl> : <dl><div><dt>Normalized track</dt><dd>Unavailable</dd></div></dl>}</details><DiagnosticJson value={activity.diagnostic} label="Diagnostic JSON" /></div>
}

type SailorActions = {
  onRequested: () => void; onConsentRequestSend: () => void; onConfirm: () => void
  onRevoke: () => void; onNewCycle: () => void; onPersonalRegenerate: () => void
  onPersonalRevoke: () => void; onWelcomeEmailResend: () => void
}

export function SailorCard({ sailor, detail, activities, busy, onSelect, onActivitySelect, onSessionSelect, ...actions }: { sailor: AdminSailor, detail: AdminSailorDetail | null, activities: AdminActivitySummary[], busy: boolean, onSelect: () => void, onActivitySelect?: (id: string) => void, onSessionSelect?: (id: string) => void } & SailorActions) {
  return <article className={`admin-card admin-entity-card admin-sailor-card${detail ? ' is-expanded is-selected' : ''}`} aria-current={detail ? 'true' : undefined}>
    <button className="admin-entity-summary admin-sailor-summary" type="button" aria-expanded={Boolean(detail)} disabled={busy} onClick={onSelect}>
      <div className="admin-card__heading"><div><h2>{sailorIdentity(sailor.name, sailor.email, sailor.id)}</h2>{sailor.name && <p>{sailor.email}</p>}</div><span className={`state-badge state-${sailor.operational_group}`}>{consentLabels[sailor.operational_group]}</span></div>
      <p className="admin-meta">{sailor.activity_count} Activities · {sailor.session_count} Sessions<br />Latest sailing: {sailor.last_sailing_end ? `${localDate(sailor.last_sailing_start)}–${localDate(sailor.last_sailing_end)}` : '—'}</p>
      <DisclosureAffordance expanded={Boolean(detail)} />
    </button>
    {detail && <SailorDetail sailor={detail} activities={activities} busy={busy} onActivitySelect={onActivitySelect} onSessionSelect={onSessionSelect} {...actions} />}
  </article>
}

export function SailorDetail({ sailor, activities = [], busy, onActivitySelect, onSessionSelect, onRequested, onConsentRequestSend, onConfirm, onRevoke, onNewCycle, onPersonalRegenerate, onPersonalRevoke, onWelcomeEmailResend }: { sailor: AdminSailorDetail, activities?: AdminActivitySummary[], busy: boolean, onActivitySelect?: (id: string) => void, onSessionSelect?: (id: string) => void } & SailorActions) {
  const pending = sailor.consent_status === 'PENDING'
  const request = sailor.consent_request
  const requestAction = request.state === 'none' ? 'Send consent request' : request.state === 'expired' ? 'Reissue consent request' : request.state === 'valid' ? 'Resend consent request' : null
  const sendRequest = () => confirmConsentRequestSend(request.state, (message) => window.confirm(message), onConsentRequestSend)
  const canResendWelcome = sailor.consent_status === 'ACTIVE' && sailor.personal_capability_state === 'active' && sailor.personal_capability_path !== null
  const boat = sailor.default_boat ? [sailor.default_boat.name, sailor.default_boat.sailing_class, sailor.default_boat.sail_number].filter(Boolean).join(' · ') : null
  return <div className="admin-entity-detail admin-sailor-detail">
    <div className="admin-detail-grid admin-sailor-detail__sections">
      <section><h3>Current state</h3><dl><div><dt>Name</dt><dd>{sailor.name || '—'}</dd></div><div><dt>Email</dt><dd>{sailor.email}</dd></div><div><dt>Consent</dt><dd>{sailor.consent_status}</dd></div><div><dt>Operational group</dt><dd>{consentLabels[sailor.operational_group]}</dd></div><div><dt>Personal TackBar</dt><dd>{personalCapabilityLabels[sailor.personal_capability_state]}</dd></div><div><dt>Latest sailing</dt><dd>{sailor.last_sailing_end ? `${localDate(sailor.last_sailing_start)}–${localDate(sailor.last_sailing_end)}` : '—'}</dd></div>{boat && <div><dt>Default Boat</dt><dd>{boat}</dd></div>}</dl></section>
      <ConsentRequestStatus sailor={sailor} />
      <details className="admin-sailor-disclosure"><summary>Consent timeline</summary>{sailor.consent_events.length === 0 ? <p>No consent events recorded.</p> : <ul className="event-list">{sailor.consent_events.map((event, index) => <li key={`${event.timestamp}-${index}`}><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{localDate(event.timestamp)} · {event.source}{event.agreement_version ? ` · ${event.agreement_version}` : ''}</span></li>)}</ul>}</details>
      <PersonalCapabilityControls key={`${sailor.id}-${sailor.personal_capability_path}-${sailor.personal_capability_state}`} sailor={sailor} busy={busy} />
      <section className="admin-detail-grid__wide"><h3>Traceability</h3><h4>Activities</h4>{activities.length === 0 ? <p>No Activities recorded.</p> : <div className="admin-relations">{activities.map((activity) => <RelationButton key={activity.id} label="Activity" id={activity.id} value={activityRelationIdentity(activity)} onFollow={() => onActivitySelect?.(activity.id)} />)}</div>}<h4>Sessions</h4>{sailor.sessions.length === 0 ? <p>No Sessions recorded.</p> : <div className="admin-relations">{sailor.sessions.map((session) => <RelationButton key={session.session_id} label="Session" id={session.session_id} value={session.sailing_start && session.sailing_end ? sessionRelationIdentity({ ...session, id: session.session_id, visible_activity_count: 0, sailor_count: 1, location_label: null, location_country: null }, true) : `${session.total_activity_count} ${session.total_activity_count === 1 ? 'Activity' : 'Activities'}`} onFollow={() => onSessionSelect?.(session.session_id)} />)}</div>}</section>
      <WelcomeEmailStatus sailor={sailor} />
      <section className="admin-detail-grid__wide admin-maintenance"><h3>Maintenance</h3><div className="admin-maintenance-groups"><div><h4>Consent</h4><div className="admin-actions">{sailor.operational_group === 'pending_needs_request' && <button disabled={busy} onClick={onRequested}>Mark request sent manually</button>}{sailor.consent_status === 'PENDING' && requestAction && <button disabled={busy} onClick={sendRequest}>{busy ? 'Sending consent request…' : requestAction}</button>}{pending && <><button disabled={busy} onClick={onConfirm}>Confirm consent</button><button disabled={busy} className="danger" onClick={onRevoke}>Record decline</button></>}{sailor.operational_group === 'active' && <button disabled={busy} className="danger" onClick={onRevoke}>Record withdrawal</button>}{sailor.operational_group === 'revoked' && <button disabled={busy} onClick={onNewCycle}>Start new consent cycle</button>}</div></div><div><h4>Personal TackBar</h4><div className="admin-actions"><button disabled={busy} onClick={onPersonalRegenerate}>Regenerate</button>{(sailor.personal_capability_state === 'active' || sailor.personal_capability_state === 'consent_inactive') && <button className="danger" disabled={busy} onClick={onPersonalRevoke}>Revoke</button>}</div></div>{canResendWelcome && <div><h4>Communication</h4><div className="admin-actions"><button disabled={busy} onClick={onWelcomeEmailResend}>{busy ? 'Resending welcome email…' : 'Resend welcome email'}</button></div></div>}</div></section>
    </div>
    <details className="admin-advanced"><summary>Advanced</summary><h4>Technical traceability</h4><dl><div><dt>Sailor ID</dt><dd>{sailor.id}</dd></div>{sailor.default_boat && <div><dt>Default Boat ID</dt><dd>{sailor.default_boat.id}</dd></div>}{activities.length > 0 && <div><dt>Activity IDs</dt><dd>{activities.map((activity) => activity.id).join(' · ')}</dd></div>}{sailor.sessions.length > 0 && <div><dt>Session IDs</dt><dd>{sailor.sessions.map((session) => session.session_id).join(' · ')}</dd></div>}</dl><h4>Consent timestamps</h4><dl><div><dt>Consent requested</dt><dd>{localDate(sailor.consent_request_sent_at)}</dd></div><div><dt>Consent granted</dt><dd>{localDate(sailor.consent_granted_at)}</dd></div><div><dt>Consent revoked</dt><dd>{localDate(sailor.consent_revoked_at)}</dd></div></dl></details>
    <DiagnosticJson value={sailor.diagnostic} label="Diagnostic JSON" />
  </div>
}

export function ConsentRequestStatus({ sailor }: { sailor: AdminSailorDetail }) {
  const request = sailor.consent_request
  const failed = request.delivery_last_error !== null
  const status = request.state === 'none' ? 'Not issued'
    : request.state === 'expired' ? 'Expired'
    : request.state === 'accepted' ? 'Accepted'
    : request.state === 'unusable' ? 'Unavailable'
    : failed ? 'Failed'
    : request.delivery_sent_at ? 'Sent'
    : 'Not sent'
  return <section className="admin-consent-request" aria-label="Consent request">
    <h3>Consent</h3>
    <p><strong>Status:</strong> {status}</p>
    {request.agreement_version && <p><strong>Agreement:</strong> {request.agreement_version}</p>}
    {request.created_at && <p><strong>Created:</strong> {localDate(request.created_at)}</p>}
    {request.expires_at && <p><strong>Expires:</strong> {localDate(request.expires_at)}</p>}
    {request.automatic_delivery_attempted_at && <p><strong>Automatic attempt:</strong> {localDate(request.automatic_delivery_attempted_at)}</p>}
    {request.delivery_sent_at && <p><strong>Last delivery:</strong> {localDate(request.delivery_sent_at)}</p>}
    {failed && <p className="admin-error">{request.delivery_last_error}</p>}
  </section>
}

export function WelcomeEmailStatus({ sailor }: { sailor: AdminSailorDetail }) {
  const failed = sailor.welcome_email_last_error !== null
  const sent = sailor.welcome_email_sent_at !== null
  const status = failed ? 'Failed' : sent ? 'Sent' : 'Not sent'
  return <section className="admin-welcome-email" aria-label="Welcome email">
    <h3>Communication</h3>
    <p><strong>Welcome email:</strong> {status}</p>
    {sent && <p>Last sent <time dateTime={sailor.welcome_email_sent_at!}>{localDate(sailor.welcome_email_sent_at)}</time></p>}
  </section>
}

const personalCapabilityLabels = { active: 'Active', revoked: 'Revoked', never_generated: 'Never generated', consent_inactive: 'Unavailable · consent inactive' }

export function PersonalCapabilityControls({ sailor, busy }: { sailor: AdminSailorDetail; busy: boolean }) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const path = sailor.personal_capability_path
  const copyLink = async () => {
    if (!path || busy) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopyMessage('Personal link copied.')
    } catch { setCopyMessage('Could not copy the personal link. Try again.') }
  }
  return <section aria-label="Personal TackBar">
    <h3>Personal TackBar</h3>
    <p>{personalCapabilityLabels[sailor.personal_capability_state]}</p>
    <div className="admin-actions">
      {sailor.personal_capability_state === 'active' && path && <button disabled={busy} onClick={() => void copyLink()}>Copy link</button>}
      {sailor.personal_capability_state === 'active' && path && <a className="admin-button" href={path} target="_blank" rel="noopener noreferrer">Open Personal TackBar</a>}
    </div>
    {copyMessage && <p role="status">{copyMessage}</p>}
  </section>
}

function contextNumber(value: number | null, unit: string, digits = 1) {
  return value === null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: digits })}${unit}`
}

export function HistoricalConditionsInspection({ conditions }: { conditions: AdminSession['historical_conditions'] }) {
  if (!conditions) return <p>Historical conditions unavailable.</p>
  const sourceLabel = (source: NonNullable<typeof conditions.weather_source>) => `${source.provider} · ${source.route}`
  const gridLabel = (source: NonNullable<typeof conditions.weather_source>) => `${source.grid_latitude.toFixed(5)}, ${source.grid_longitude.toFixed(5)}`
  return <details className="admin-session-conditions"><summary>Historical conditions · {conditions.hourly.length} hourly samples</summary>
    <dl>
      <div><dt>Coverage</dt><dd>{localDate(conditions.coverage_start)}–{localDate(conditions.coverage_end)}</dd></div>
      <div><dt>Weather source</dt><dd>{conditions.weather_source ? sourceLabel(conditions.weather_source) : 'Unavailable'}</dd></div>
      <div><dt>Marine source</dt><dd>{conditions.marine_source ? sourceLabel(conditions.marine_source) : 'Unavailable'}</dd></div>
      <div><dt>Requested coordinate</dt><dd>{conditions.requested_latitude.toFixed(5)}, {conditions.requested_longitude.toFixed(5)}</dd></div>
      <div><dt>Weather grid / retrieved</dt><dd>{conditions.weather_source ? `${gridLabel(conditions.weather_source)} · ${localDate(conditions.weather_source.retrieved_at)}` : 'Unavailable'}</dd></div>
      <div><dt>Marine grid / retrieved</dt><dd>{conditions.marine_source ? `${gridLabel(conditions.marine_source)} · ${localDate(conditions.marine_source.retrieved_at)}` : 'Unavailable'}</dd></div>
    </dl>
    <div className="admin-session-conditions__table"><table><thead><tr><th>UTC</th><th>Air</th><th>Wind</th><th>Dir</th><th>Gust</th><th>Cloud</th><th>Wave</th><th>Wave dir</th><th>Period</th></tr></thead><tbody>
      {conditions.hourly.map((sample) => <tr key={sample.time}><td>{new Date(sample.time).toISOString().slice(0, 16).replace('T', ' ')}</td><td>{contextNumber(sample.air_temperature_c, ' °C')}</td><td>{contextNumber(sample.wind_speed_10m_kn, ' kn')}</td><td>{contextNumber(sample.wind_direction_10m_deg, '°', 0)}</td><td>{contextNumber(sample.wind_gusts_10m_kn, ' kn')}</td><td>{contextNumber(sample.cloud_cover_pct, '%', 0)}</td><td>{contextNumber(sample.wave_height_m, ' m', 2)}</td><td>{contextNumber(sample.wave_direction_deg, '°', 0)}</td><td>{contextNumber(sample.wave_period_s, ' s', 2)}</td></tr>)}
    </tbody></table></div>
  </details>
}

export function SessionCard({ session, detail = null, activities = [], busy, onSelect, onActivitySelect, onSailorSelect, onEnrich = () => undefined, onRegenerate, onRevoke, onRenew }: { session: AdminSessionSummary, detail?: AdminSession | null, activities?: AdminActivitySummary[], busy: boolean, onSelect: () => void, onActivitySelect?: (id: string) => void, onSailorSelect?: (id: string) => void, onEnrich?: () => void, onRegenerate: () => void, onRevoke: () => void, onRenew: (days: number) => void }) {
  const lifetime = sessionLifetimePresentation(session.expires_at)
  return <article className={`admin-card admin-entity-card admin-session-card${detail ? ' is-expanded is-selected' : ''}`} aria-current={detail ? 'true' : undefined}>
    <button className="admin-entity-summary admin-session-summary" type="button" aria-expanded={Boolean(detail)} disabled={busy} onClick={onSelect}>
      <div className="admin-card__heading"><div><h2>{sessionSailingLabel(session)}</h2><p>{session.total_activity_count} Activities · {session.visible_activity_count} shareable now · {session.sailor_count} Sailors</p></div><span className={`state-badge state-${lifetime.state}`}>{lifetime.state.toUpperCase()}</span></div>
      <p className="admin-session-expiration">{lifetime.expiration}</p>
      <DisclosureAffordance expanded={Boolean(detail)} />
    </button>
    {detail && <SessionOperationalDetail session={detail} activities={activities} busy={busy} onActivitySelect={onActivitySelect} onSailorSelect={onSailorSelect} onEnrich={onEnrich} onRegenerate={onRegenerate} onRevoke={onRevoke} onRenew={onRenew} />}
  </article>
}

export function SessionOperationalDetail({ session, activities = [], busy, onActivitySelect, onSailorSelect, onEnrich = () => undefined, onRegenerate, onRevoke, onRenew }: { session: AdminSession, activities?: AdminActivitySummary[], busy: boolean, onActivitySelect?: (id: string) => void, onSailorSelect?: (id: string) => void, onEnrich?: () => void, onRegenerate: () => void, onRevoke: () => void, onRenew: (days: number) => void }) {
  const [days, setDays] = useState(90)
  const lifetime = sessionLifetimePresentation(session.expires_at)
  const capabilityUrl = session.capability_state === 'active' && session.capability_path ? `${window.location.origin}${session.capability_path}` : null
  const activeShare = session.temporary_shares.active_share
  const temporaryUrl = activeShare?.path ? `${window.location.origin}${activeShare.path}` : null
  const activityIdentities = new Map(activities.map((activity) => [activity.id, activityRelationIdentity(activity)]))
  return <div className="admin-entity-detail admin-session-detail">
    <section className="admin-session-section" aria-label="Membership and traceability"><h3>Membership / traceability</h3>
      <div className="admin-session-membership">{session.activities.map((activity) => <div className="admin-session-member" key={activity.id}>
        <RelationButton label="Activity" id={activity.id} value={activityIdentities.get(activity.id)} onFollow={() => onActivitySelect?.(activity.id)} />
        <RelationButton label="Sailor" id={activity.sailor_id} value={sailorIdentity(activity.sailor_label, null, activity.sailor_id)} onFollow={() => onSailorSelect?.(activity.sailor_id)} />
        <span className={`state-badge state-${activity.shareable ? 'active' : 'revoked'}`}>{activity.shareable ? 'SHAREABLE' : 'NOT SHARED'}</span>
      </div>)}</div>
    </section>
    <section className="admin-session-section" aria-label="Session access"><h3>Session access</h3>
      <div className="admin-session-access-block"><p><strong>Original capability:</strong> {capabilityLabels[session.capability_state]}</p>{capabilityUrl && !busy && <div className="admin-actions"><button onClick={() => void navigator.clipboard.writeText(capabilityUrl)}>Copy link</button><a className="admin-button" href={session.capability_path!} target="_blank" rel="noopener noreferrer">Open session</a></div>}</div>
    </section>
    <section className="admin-session-section" aria-label="Temporary QR access"><h3>Temporary QR access</h3>
      <div className="admin-session-access-block"><p><strong>Temporary QR access:</strong> Active {session.temporary_shares.active_count} · Expired {session.temporary_shares.expired_count} · Unavailable {session.temporary_shares.unavailable_count}</p>
        {activeShare && <details className="admin-temporary-share"><summary>Active temporary share</summary><dl><div><dt>Created</dt><dd>{localDate(activeShare.created_at)}</dd></div><div><dt>Expires</dt><dd>{localDate(activeShare.expires_at)}</dd></div><div><dt>Remaining</dt><dd>{temporaryShareRemaining(activeShare.expires_at)}</dd></div><div><dt>State</dt><dd>VALID</dd></div></dl>{temporaryUrl && !busy && <div className="admin-actions"><button onClick={() => void navigator.clipboard.writeText(temporaryUrl)}>Copy temporary link</button><a className="admin-button" href={activeShare.path!} target="_blank" rel="noopener noreferrer">Open temporary share</a></div>}</details>}
      </div>
    </section>
    <section className="admin-session-section" aria-label="Session details"><h3>Session details</h3><dl><div><dt>Created</dt><dd>{localDate(session.created_at)}</dd></div><div><dt>Expires</dt><dd>{localDate(session.expires_at)}</dd></div><div><dt>Status</dt><dd>{lifetime.expiration}</dd></div><div><dt>Location</dt><dd>{session.location ? sessionDisplayLocation(session.location.label, session.location.country) || 'Unavailable' : 'Unavailable'}</dd></div><div><dt>Location provider</dt><dd>{session.location?.provider || 'Unavailable'}</dd></div><div><dt>Location resolved</dt><dd>{localDate(session.location?.resolved_at || null)}</dd></div></dl>
      {session.location && <div className="admin-session-location-source"><RelationButton label="Location source Activity" id={session.location.source_activity_id} value={activityIdentities.get(session.location.source_activity_id)} onFollow={() => onActivitySelect?.(session.location!.source_activity_id)} /></div>}
      <HistoricalConditionsInspection conditions={session.historical_conditions} />
    </section>
    <section className="admin-session-section" aria-label="Maintenance"><h3>Maintenance</h3>
      <div className="admin-actions"><button disabled={busy} onClick={onEnrich}>Enrich Session</button></div>
      <form className="renew-form" onSubmit={(event) => { event.preventDefault(); if (days >= 1 && days <= 365) onRenew(days) }}><label>Renew Session <span>Sets expiry to days from now</span><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /></label><button disabled={busy || days < 1 || days > 365}>Renew</button></form>
      <div className="admin-actions"><button disabled={busy} onClick={onRegenerate}>Regenerate capability</button><button disabled={busy} className="danger" onClick={onRevoke}>Revoke capability</button></div>
    </section>
    <details className="admin-advanced"><summary>Advanced</summary><h4>Technical traceability</h4><dl><div><dt>Session ID</dt><dd>{session.id}</dd></div><div><dt>Activity IDs</dt><dd>{session.activities.map((activity) => activity.id).join(' · ') || '—'}</dd></div><div><dt>Sailor IDs</dt><dd>{[...new Set(session.activities.map((activity) => activity.sailor_id))].join(' · ') || '—'}</dd></div></dl>{session.location && <><h4>Geographic context</h4><dl><div><dt>Region</dt><dd>{session.location.region || '—'}</dd></div><div><dt>Country</dt><dd>{session.location.country || '—'}</dd></div><div><dt>Country code</dt><dd>{session.location.country_code || '—'}</dd></div></dl></>}<h4>Technical state</h4><dl><div><dt>Technical Activities</dt><dd>{session.total_activity_count}</dd></div><div><dt>Shareable now</dt><dd>{session.visible_activity_count}</dd></div><div><dt>Consent coverage</dt><dd>ACTIVE {session.consent_active_count} · PENDING {session.consent_pending_count} · REVOKED {session.consent_revoked_count}</dd></div></dl></details>
    <DiagnosticJson value={session.diagnostic} label="Diagnostic JSON" />
  </div>
}
