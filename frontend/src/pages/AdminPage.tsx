import TackBarBrand from '../components/TackBarBrand'
import { useState, type FormEvent } from 'react'
import {
  AdminApiError,
  confirmConsent,
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
import type { AdminActivity, AdminActivitySummary, AdminConsentRequestState, AdminIngestion, AdminIngestionDetail, AdminSailor, AdminSailorDetail, AdminSession, CapabilityState, ConsentOperationalGroup } from '../types/admin'

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
    const identity = ingestion.sailor_label || ingestion.sailor_email || ingestion.sailor_id
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
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [ingestions, setIngestions] = useState<AdminIngestion[]>([])
  const [activities, setActivities] = useState<AdminActivitySummary[]>([])
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatusFilter>('all')
  const [ingestionDisposition, setIngestionDisposition] = useState<IngestionDispositionFilter>('all')
  const [ingestionSailor, setIngestionSailor] = useState('all')
  const [ingestionSearch, setIngestionSearch] = useState('')
  const [reviewSummary, setReviewSummary] = useState<string | null>(null)
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
      setSelectedSailor(null)
      setSelectedSession(null)
      setSelectedActivity(null)
      setDrilldown([])
    }
  }
  const loadAll = async (key: string) => {
    const [nextSailors, nextSessions, nextIngestions, nextActivities] = await Promise.all([listAdminSailors(key), listAdminSessions(key), listAdminIngestions(key), listAdminActivities(key)])
    setSailors(nextSailors); setSessions(nextSessions); setIngestions(nextIngestions); setActivities(nextActivities)
  }
  const enter = async (key: string) => {
    setBusy(true); setError(null)
    try { await loadAll(key); setAdminKey(key) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const refresh = async () => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try { await loadAll(adminKey); if (selectedSailor) setSelectedSailor(await getAdminSailor(adminKey, selectedSailor.id)); if (selectedSession) setSelectedSession(await getAdminSession(adminKey, selectedSession.id)); if (selectedActivity) setSelectedActivity(await getAdminActivity(adminKey, selectedActivity.id)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
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
  const selectIngestion = async (id: string) => {
    const selected = drilldown.length === 1 && drilldown[0].kind === 'ingestion' && drilldown[0].value.id === id
    if (selected) { setDrilldown([]); return }
    setBusy(true); setError(null)
    try { setDrilldown([await fetchDrilldown('ingestion', id)]) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const selectActivity = async (id: string) => {
    if (selectedActivity?.id === id) { setSelectedActivity(null); return }
    if (!adminKey) return
    setBusy(true); setError(null)
    try { setSelectedActivity(await getAdminActivity(adminKey, id)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
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
      if (next.kind === 'sailor') { setSelectedSailor(next.value); setDrilldown([]) }
      else if (next.kind === 'session') { setSelectedSession(next.value); setDrilldown([]) }
      else if (next.kind === 'ingestion') setDrilldown([next])
      else { setSelectedActivity(next.value); setDrilldown([]) }
      setSection(target.section)
    } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const visibleIngestions = filterAdminIngestions(ingestions, {
    status: ingestionStatus,
    disposition: ingestionDisposition,
    sailor: ingestionSailor,
    search: ingestionSearch,
  })
  const sailorOptions = ingestionSailorOptions(ingestions)
  if (!adminKey) return <AdminAccessForm onEnter={enter} error={error} busy={busy} />

  return <main className="admin-page">
    <header className="admin-header"><div><TackBarBrand inverted /><span>Admin · Real Sailing Pilot</span></div><button onClick={refresh} disabled={busy}>Refresh</button></header>
    <nav className="admin-tabs" aria-label="Admin sections">
      {ADMIN_SECTION_ORDER.map((item) => <button key={item} className={section === item ? 'is-active' : ''} onClick={() => { setSection(item); setDrilldown([]) }}>{item[0].toUpperCase() + item.slice(1)}</button>)}
    </nav>
    {error && <p className="admin-error admin-feedback" role="alert">{error}</p>}
    {section === 'activities' ? <section className="admin-content"><h1>Activities</h1>{activities.length === 0 && <p className="admin-meta">No Activities recorded.</p>}<div className="admin-list admin-activity-list">
      {activities.map((activity) => <ActivityCard key={activity.id} activity={activity} detail={selectedActivity?.id === activity.id ? selectedActivity : null} busy={busy} onSelect={() => void selectActivity(activity.id)} onFollow={(kind, id) => void followRelation(kind, id)} onRecalculate={() => void recalculateManeuvers()} />)}
    </div></section> : section === 'sailors' ? <section className="admin-content"><h1>Sailors</h1><div className="admin-list">
      {sailors.map((sailor) => <article className="admin-card" key={sailor.id}>
        <div className="admin-card__heading"><div><h2>{sailor.name || sailor.email}</h2>{sailor.name && <p>{sailor.email}</p>}</div><span className={`state-badge state-${sailor.operational_group}`}>{consentLabels[sailor.operational_group]}</span></div>
        <p className="admin-meta">Activities: {sailor.activity_count} · Sessions: {sailor.session_count}<br />Last sailing: {sailor.last_sailing_end ? localDate(sailor.last_sailing_start) + '–' + localDate(sailor.last_sailing_end) : '—'}<br />{sailor.operational_group === 'active' ? 'Consent granted' : sailor.operational_group === 'revoked' ? 'Consent revoked' : 'Consent request'}: {localDate(sailor.operational_group === 'active' ? sailor.consent_granted_at : sailor.operational_group === 'revoked' ? sailor.consent_revoked_at : sailor.consent_request_sent_at)}</p>
        <button disabled={busy} onClick={async () => { if (!adminKey) return; setBusy(true); try { setSelectedSailor(await getAdminSailor(adminKey, sailor.id)) } catch (cause) { handleError(cause) } finally { setBusy(false) } }}>View details</button>
        {selectedSailor?.id === sailor.id && <SailorDetail sailor={selectedSailor} activities={activities.filter((activity) => activity.sailor_id === sailor.id)} busy={busy} onActivitySelect={(id) => void followRelation('activity', id)} onSessionSelect={(id) => void followRelation('session', id)} onRequested={() => sailorAction(() => markConsentRequested(adminKey, sailor.id))} onConsentRequestSend={() => sailorAction(() => sendConsentRequest(adminKey, sailor.id))} onConfirm={() => sailorAction(() => confirmConsent(adminKey, sailor.id))} onRevoke={() => { if (window.confirm('Record consent withdrawal?')) void sailorAction(() => revokeConsent(adminKey, sailor.id)) }} onNewCycle={() => confirmNewConsentCycle((message) => window.confirm(message), () => void sailorAction(() => startNewConsentCycle(adminKey, sailor.id)))} onPersonalRegenerate={() => { if (window.confirm('Regenerate personal access? The current personal link will stop working.')) void sailorAction(() => regeneratePersonalCapability(adminKey, sailor.id)) }} onPersonalRevoke={() => { if (window.confirm('Revoke personal access? Consent and shared Sessions will remain unchanged.')) void sailorAction(() => revokePersonalCapability(adminKey, sailor.id)) }} onWelcomeEmailResend={() => void sailorAction(() => resendWelcomeEmail(adminKey, sailor.id))} />}
      </article>)}
    </div></section> : section === 'sessions' ? <section className="admin-content"><h1>Sessions</h1><div className="admin-list">
      {sessions.map((session) => { const displayed = selectedSession?.id === session.id ? selectedSession : session; return <SessionCard key={session.id} session={displayed} activities={activities.filter((activity) => activity.session_id === session.id)} selected={selectedSession?.id === session.id} busy={busy} onActivitySelect={(id) => void followRelation('activity', id)} onSailorSelect={(id) => void followRelation('sailor', id)} onRegenerate={() => { if (window.confirm('Regenerate capability? The current shared link will stop working.')) void sessionAction(() => regenerateCapability(adminKey, session.id)) }} onRevoke={() => { if (window.confirm('Revoke this shared capability?')) void sessionAction(() => revokeCapability(adminKey, session.id)) }} onRenew={(days) => { if (window.confirm(`Set expiry to ${days} days from now?`)) void sessionAction(() => renewSession(adminKey, session.id, days)) }} /> })}
    </div></section> : <section className="admin-content"><IngestionSectionHeader busy={busy} onReview={() => void mailboxAction()} /><IngestionFilters status={ingestionStatus} disposition={ingestionDisposition} sailor={ingestionSailor} search={ingestionSearch} sailors={sailorOptions} busy={busy} onChange={changeIngestionFilters} onSailorChange={(value) => { setIngestionSailor(value); setDrilldown([]) }} onSearchChange={(value) => { setIngestionSearch(value); setDrilldown([]) }} />{reviewSummary && <p className="admin-meta">{reviewSummary}</p>}{<>{visibleIngestions.length === 0 && <p className="admin-meta">No Ingestions match the active filters.</p>}<div className="admin-list admin-ingestion-list">{visibleIngestions.map((item) => {
      const selected = drilldown.length === 1 && drilldown[0].kind === 'ingestion' && drilldown[0].value.id === item.id ? drilldown[0].value : null
      return <IngestionCard key={item.id} ingestion={item} detail={selected} busy={busy} onSelect={() => void selectIngestion(item.id)} onFollow={(kind, id) => void followRelation(kind, id)} onReprocess={() => { if (window.confirm('Reprocess this ingestion from its preserved original?')) void ingestionAction(item.id) }} onDiscard={() => void ingestionDispositionAction(item.id, () => discardIngestion(adminKey!, item.id))} onRestore={() => void ingestionDispositionAction(item.id, () => restoreIngestion(adminKey!, item.id))} />
    })}</div></>}</section>}
  </main>
}

export function IngestionSectionHeader({ busy, onReview }: { busy: boolean, onReview: () => void }) {
  return <div className="admin-ingestion-section-header"><h1>Ingestions</h1><button className="admin-section-action" type="button" disabled={busy} onClick={onReview}>Review mailbox</button></div>
}

export function IngestionFilters({ status, disposition, sailor, search, sailors, busy, onChange, onSailorChange, onSearchChange }: { status: IngestionStatusFilter, disposition: IngestionDispositionFilter, sailor: string, search: string, sailors: Array<{ value: string; label: string }>, busy: boolean, onChange: (status: IngestionStatusFilter, disposition: IngestionDispositionFilter) => void, onSailorChange: (sailor: string) => void, onSearchChange: (search: string) => void }) {
  return <div className="admin-filters"><label className="admin-filters__search">Search<input type="search" value={search} disabled={busy} placeholder="Filename, email or ID" onChange={(event) => onSearchChange(event.target.value)} /></label><label>Status<select value={status} disabled={busy} onChange={(event) => onChange(event.target.value as IngestionStatusFilter, disposition)}><option value="all">All</option><option value="processed">Processed</option><option value="failed">Failed</option></select></label><label>Disposition<select value={disposition} disabled={busy} onChange={(event) => onChange(status, event.target.value as IngestionDispositionFilter)}><option value="all">All</option><option value="active">Active</option><option value="discarded">Discarded</option></select></label><label>Sailor<select value={sailor} disabled={busy} onChange={(event) => onSailorChange(event.target.value)}><option value="all">All sailors</option>{sailors.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
}

function compactId(value: string | null) {
  return value ? `${value.slice(0, 8)}…` : '—'
}

function DiagnosticJson({ value }: { value: Record<string, unknown> }) {
  return <details className="admin-diagnostics"><summary>Read-only JSON</summary><p>This diagnostic representation is read-only.</p><pre>{JSON.stringify(value, null, 2)}</pre></details>
}

function RelationButton({ label, id, value, onFollow }: { label: string, id: string | null, value?: string | null, onFollow: () => void }) {
  return id ? <button className="admin-relation" type="button" onClick={onFollow}><span>{label}</span><strong title={id}>{value || compactId(id)}</strong><span aria-hidden="true">›</span></button> : <div className="admin-relation admin-relation--unavailable"><span>{label}</span><strong>Unavailable</strong></div>
}

export function IngestionCard({ ingestion, detail, busy, onSelect, onFollow, onReprocess, onDiscard, onRestore }: { ingestion: AdminIngestion, detail?: AdminIngestionDetail | null, busy: boolean, onSelect: () => void, onFollow: (kind: AdminDrilldown['kind'], id: string) => void, onReprocess: () => void, onDiscard: () => void, onRestore: () => void }) {
  const hasSailing = Boolean(ingestion.activity_start_time && ingestion.activity_end_time)
  const technicalStatusClass = ingestion.status === 'processed' ? 'active' : 'expired'
  return <article className={`admin-card admin-ingestion-card${detail ? ' is-expanded' : ''}`}>
    <button className="admin-ingestion-summary" type="button" aria-expanded={Boolean(detail)} disabled={busy} onClick={onSelect}>
      <div className="admin-card__heading"><div><h2>{ingestion.attachment_name || 'Unknown attachment'}</h2><p>{ingestion.sender_email || 'Unknown sender'} · {ingestion.provider}</p></div><span className={`state-badge state-${technicalStatusClass}`}>{ingestion.status === 'processed' ? 'Processed' : 'Failed'}</span></div>
      <div className="admin-ingestion-summary__context">{hasSailing ? <span><strong>{sailingDate(ingestion.activity_start_time!)}</strong> · {sailingTime(ingestion.activity_start_time!)}–{sailingTime(ingestion.activity_end_time!)} · {ingestion.activity_sample_count?.toLocaleString() ?? '—'} samples</span> : <span>Sailing context unavailable</span>}<span>Activity {compactId(ingestion.activity_id)} · Session {compactId(ingestion.session_id)}</span>{ingestion.disposition === 'discarded' && <span className="state-badge state-revoked">Discarded</span>}</div>
    </button>
    {detail && <IngestionOperationalDetail ingestion={detail} busy={busy} onFollow={onFollow} onReprocess={onReprocess} onDiscard={onDiscard} onRestore={onRestore} />}
  </article>
}

export function IngestionOperationalDetail({ ingestion, busy, onFollow, onReprocess, onDiscard, onRestore }: { ingestion: AdminIngestionDetail, busy: boolean, onFollow: (kind: AdminDrilldown['kind'], id: string) => void, onReprocess?: () => void, onDiscard?: () => void, onRestore?: () => void }) {
  const notification = ingestion.session_result_notification
  const outcome = ingestion.activity_created_by_ingestion === true ? 'Created by this Ingestion' : ingestion.activity_created_by_ingestion === false ? 'Reused existing Activity' : 'Unknown (legacy provenance)'
  const outboundStatus = !ingestion.session_result_notification_candidate ? 'Not applicable / not attempted' : !notification ? 'Not attempted' : notification.status === 'eligible' ? 'Not attempted' : notification.status[0].toUpperCase() + notification.status.slice(1)
  return <div className="admin-ingestion-detail">
    <div className="admin-detail-grid">
      <section><h3>Sailing</h3>{ingestion.activity_start_time && ingestion.activity_end_time ? <dl><div><dt>Date</dt><dd>{sailingDate(ingestion.activity_start_time)}</dd></div><div><dt>Time</dt><dd>{sailingTime(ingestion.activity_start_time)}–{sailingTime(ingestion.activity_end_time)}</dd></div><div><dt>Duration</dt><dd>{sailingDuration(ingestion.activity_start_time, ingestion.activity_end_time)}</dd></div><div><dt>Samples</dt><dd>{ingestion.activity_sample_count?.toLocaleString() ?? '—'}</dd></div></dl> : <p>Unavailable</p>}</section>
      <section><h3>Source</h3><dl><div><dt>Attachment</dt><dd>{ingestion.attachment_name || '—'}</dd></div><div><dt>Sender</dt><dd>{ingestion.sender_email || '—'}</dd></div><div><dt>Provider</dt><dd>{ingestion.provider}</dd></div></dl></section>
      <section className="admin-detail-grid__wide"><h3>Traceability</h3><div className="admin-relations"><RelationButton label="Sailor" id={ingestion.sailor_id} value={ingestion.sailor_label} onFollow={() => ingestion.sailor_id && onFollow('sailor', ingestion.sailor_id)} /><RelationButton label="Activity" id={ingestion.activity_id} onFollow={() => ingestion.activity_id && onFollow('activity', ingestion.activity_id)} /><RelationButton label="Session" id={ingestion.session_id} onFollow={() => ingestion.session_id && onFollow('session', ingestion.session_id)} /></div><p><strong>Activity outcome:</strong> {outcome}</p></section>
      <section><h3>Processing</h3><dl><div><dt>Technical status</dt><dd>{ingestion.status === 'processed' ? 'Processed' : 'Failed'}</dd></div><div><dt>Disposition</dt><dd>{ingestion.disposition === 'active' ? 'Active' : 'Discarded'}</dd></div><div><dt>Received</dt><dd>{localDate(ingestion.received_at)}</dd></div><div><dt>Attempts</dt><dd>{ingestion.attempts}</dd></div><div><dt>Last attempt</dt><dd>{localDate(ingestion.last_attempt_at)}</dd></div><div><dt>Preserved original</dt><dd>{ingestion.original_available ? 'Available' : 'Unavailable'}</dd></div></dl>{ingestion.last_error && <p className="admin-error">{ingestion.last_error}</p>}</section>
      <section><h3>Outbound result</h3><p><strong>Status:</strong> {outboundStatus}</p>{notification?.attempted_at && <p><strong>Attempted:</strong> {localDate(notification.attempted_at)}</p>}{notification?.sent_at && <p><strong>Sent:</strong> {localDate(notification.sent_at)}</p>}{notification?.last_error && <p className="admin-error">{notification.last_error}</p>}<p className="admin-meta">Outbound delivery does not change the ingestion result.</p></section>
    </div>
    {onReprocess && onDiscard && onRestore && <section className="admin-maintenance"><h3>Actions</h3><div className="admin-actions">{ingestion.original_available && <button disabled={busy} onClick={onReprocess}>Reprocess</button>}<button disabled={busy} onClick={ingestion.disposition === 'active' ? onDiscard : onRestore}>{ingestion.disposition === 'active' ? 'Discard' : 'Restore'}</button></div></section>}
    <details className="admin-advanced"><summary>Advanced details</summary><dl><div><dt>Ingestion ID</dt><dd>{ingestion.id}</dd></div><div><dt>Provider message ID</dt><dd>{ingestion.provider_message_id}</dd></div><div><dt>Activity ID</dt><dd>{ingestion.activity_id || '—'}</dd></div><div><dt>Session ID</dt><dd>{ingestion.session_id || '—'}</dd></div><div><dt>Attachment SHA-256</dt><dd>{ingestion.attachment_sha256 || '—'}</dd></div></dl></details>
    <DiagnosticJson value={ingestion.diagnostic} />
  </div>
}

export function ActivityCard({ activity, detail, busy, onSelect, onFollow, onRecalculate }: { activity: AdminActivitySummary, detail: AdminActivity | null, busy: boolean, onSelect: () => void, onFollow: (kind: AdminDrilldown['kind'], id: string) => void, onRecalculate: () => void }) {
  return <article className={`admin-card admin-activity-card${detail ? ' is-expanded' : ''}`}>
    <button className="admin-activity-summary" type="button" aria-expanded={Boolean(detail)} disabled={busy} onClick={onSelect}>
      <div className="admin-card__heading"><div><h2>{sailingDate(activity.start_time)} · {sailingTime(activity.start_time)}–{sailingTime(activity.end_time)}</h2><p>{activity.sailor_label}</p></div><span className="state-badge">{activity.sample_count.toLocaleString()} samples</span></div>
      <p className="admin-meta">Session {compactId(activity.session_id)}</p>
    </button>
    {detail && <ActivityAdminDetail activity={detail} busy={busy} onFollow={onFollow} onRecalculate={onRecalculate} />}
  </article>
}

export function ActivityAdminDetail({ activity, busy = false, onFollow, onRecalculate = () => undefined }: { activity: AdminActivity, busy?: boolean, onFollow: (kind: AdminDrilldown['kind'], id: string) => void, onRecalculate?: () => void }) {
  const boat = activity.boat ? [activity.boat.name, activity.boat.sailing_class, activity.boat.sail_number].filter(Boolean).join(' · ') : '—'
  const maneuvers = activity.maneuvers
  const detector = maneuvers.detector_status === null ? 'Not available' : maneuvers.detector_status === 'available' ? 'Available' : `Unavailable · ${maneuvers.unavailable_reason?.replaceAll('_', ' ') || 'unknown reason'}`
  return <div className="admin-activity-detail"><div className="admin-detail-grid"><section><h3>Track</h3><dl><div><dt>Date</dt><dd>{sailingDate(activity.start_time)}</dd></div><div><dt>Start</dt><dd>{sailingTime(activity.start_time)}</dd></div><div><dt>End</dt><dd>{sailingTime(activity.end_time)}</dd></div><div><dt>Duration</dt><dd>{sailingDuration(activity.start_time, activity.end_time)}</dd></div><div><dt>Samples</dt><dd>{activity.sample_count.toLocaleString()}</dd></div><div><dt>Normalized track</dt><dd>{activity.track_available ? 'Available' : 'Unavailable'}</dd></div></dl></section><section><h3>Owner / context</h3><dl><div><dt>Boat</dt><dd>{boat}</dd></div></dl><div className="admin-relations"><RelationButton label="Sailor" id={activity.sailor_id} value={activity.sailor_label} onFollow={() => onFollow('sailor', activity.sailor_id)} /><RelationButton label="Session" id={activity.session_id} onFollow={() => activity.session_id && onFollow('session', activity.session_id)} /></div></section><section><h3>Source</h3><dl><div><dt>Provider/source</dt><dd>{activity.source}</dd></div><div><dt>Device</dt><dd>{activity.device_name}</dd></div><div><dt>Original filename</dt><dd>{activity.original_filename}</dd></div></dl><div className="admin-relations"><RelationButton label="Source Ingestion" id={activity.source_ingestion_id} onFollow={() => activity.source_ingestion_id && onFollow('ingestion', activity.source_ingestion_id)} /></div></section><section><h3>Maneuvers</h3><dl><div><dt>Artifact currency</dt><dd>{maneuvers.artifact_currency.toUpperCase()}</dd></div><div><dt>Detector status</dt><dd>{detector}</dd></div><div><dt>Detected event count</dt><dd>{maneuvers.detected_count ?? '—'}</dd></div><div><dt>Persisted algorithm version</dt><dd>{maneuvers.artifact_algorithm_version ?? '—'}</dd></div><div><dt>Current algorithm version</dt><dd>{maneuvers.current_algorithm_version}</dd></div></dl><div className="admin-actions"><button disabled={busy || !activity.track_available} onClick={onRecalculate}>{busy ? 'Recalculating…' : 'Recalculate maneuvers'}</button></div></section></div><details className="admin-advanced"><summary>Advanced details</summary><dl><div><dt>Activity ID</dt><dd>{activity.id}</dd></div><div><dt>Attachment SHA-256</dt><dd>{activity.attachment_sha256}</dd></div></dl></details><DiagnosticJson value={activity.diagnostic} /></div>
}

export function SailorDetail({ sailor, activities = [], busy, onActivitySelect, onSessionSelect, onRequested, onConsentRequestSend, onConfirm, onRevoke, onNewCycle, onPersonalRegenerate, onPersonalRevoke, onWelcomeEmailResend }: { sailor: AdminSailorDetail, activities?: AdminActivitySummary[], busy: boolean, onActivitySelect?: (id: string) => void, onSessionSelect?: (id: string) => void, onRequested: () => void, onConsentRequestSend: () => void, onConfirm: () => void, onRevoke: () => void, onNewCycle: () => void, onPersonalRegenerate: () => void, onPersonalRevoke: () => void, onWelcomeEmailResend: () => void }) {
  const pending = sailor.consent_status === 'PENDING'
  return <div className="admin-detail"><dl><div><dt>Granted</dt><dd>{localDate(sailor.consent_granted_at)}</dd></div><div><dt>Revoked</dt><dd>{localDate(sailor.consent_revoked_at)}</dd></div></dl>
    <ConsentRequestStatus sailor={sailor} busy={busy} onSend={onConsentRequestSend} />
    <div className="admin-actions">{sailor.operational_group === 'pending_needs_request' && <button disabled={busy} onClick={onRequested}>Mark request sent manually</button>}{pending && <><button disabled={busy} onClick={onConfirm}>Confirm consent</button><button disabled={busy} className="danger" onClick={onRevoke}>Record decline</button></>}{sailor.operational_group === 'active' && <button disabled={busy} className="danger" onClick={onRevoke}>Record withdrawal</button>}{sailor.operational_group === 'revoked' && <button disabled={busy} onClick={onNewCycle}>Start new consent cycle</button>}</div>
    <PersonalCapabilityControls key={`${sailor.id}-${sailor.personal_capability_path}-${sailor.personal_capability_state}`} sailor={sailor} busy={busy} onRegenerate={onPersonalRegenerate} onRevoke={onPersonalRevoke} />
    <WelcomeEmailStatus sailor={sailor} busy={busy} onResend={onWelcomeEmailResend} />
    <h3>Activity history</h3><p className="admin-meta">Activities: {sailor.activity_count} · Sessions: {sailor.session_count}<br />Last sailing: {sailor.last_sailing_end ? `${localDate(sailor.last_sailing_start)}–${localDate(sailor.last_sailing_end)}` : '—'}</p>{activities.length > 0 && <div className="admin-relations">{activities.map((activity) => <RelationButton key={activity.id} label="Activity" id={activity.id} value={`${sailingDate(activity.start_time)} · ${sailingTime(activity.start_time)}`} onFollow={() => onActivitySelect?.(activity.id)} />)}</div>}<h3>Sessions</h3>{sailor.sessions.length === 0 ? <p>No Sessions recorded.</p> : <div className="admin-list">{sailor.sessions.map((session) => {
      const sailingStart = session.sailing_start!
      const sailingEnd = session.sailing_end!
      const hasSailing = Boolean(session.sailing_start && session.sailing_end)
      const sameDay = hasSailing && sailingDate(sailingStart) === sailingDate(sailingEnd)
      return <article className="admin-card admin-sailor-session" key={session.session_id}>
        <div className="admin-card__heading"><div>{hasSailing ? <><time className="admin-sailor-session__date" dateTime={sailingStart}>{sailingDate(sailingStart)}</time><p className="admin-sailor-session__interval">{sameDay ? <><time dateTime={sailingStart}>{sailingTime(sailingStart)}</time> – <time dateTime={sailingEnd}>{sailingTime(sailingEnd)}</time></> : <><time dateTime={sailingStart}>{localDate(sailingStart)}</time> – <time dateTime={sailingEnd}>{localDate(sailingEnd)}</time></>}</p></> : <h4>{session.session_id}</h4>}</div><span className={`state-badge state-${session.capability_state}`}>{capabilityLabels[session.capability_state]}</span></div>
        <dl className="admin-sailor-session__details"><div><dt>Activities</dt><dd>{session.sailor_activity_count} {session.sailor_activity_count === 1 ? 'Activity' : 'Activities'}</dd></div><div><dt>Expires</dt><dd>{localDate(session.expires_at)}</dd></div></dl>
        {onSessionSelect && <RelationButton label="Admin Session" id={session.session_id} onFollow={() => onSessionSelect(session.session_id)} />}
        {session.capability_path && sailor.consent_status === 'ACTIVE' && <section className="admin-sailor-session__access" aria-label="Session access"><h4>Session access</h4><div className="admin-actions"><a className="admin-button" href={session.capability_path}>Open session</a></div></section>}
      </article>
    })}</div>}
    <h3>Consent history</h3>{sailor.consent_events.length === 0 ? <p>No consent events recorded.</p> : <ol className="event-list">{sailor.consent_events.map((event, index) => <li key={`${event.timestamp}-${index}`}><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{localDate(event.timestamp)} · {event.source}{event.agreement_version ? ` · ${event.agreement_version}` : ''}</span></li>)}</ol>}
  </div>
}

export function ConsentRequestStatus({ sailor, busy, onSend }: {
  sailor: AdminSailorDetail; busy: boolean; onSend: () => void
}) {
  const request = sailor.consent_request
  const failed = request.delivery_last_error !== null
  const status = request.state === 'none' ? 'Not issued'
    : request.state === 'expired' ? 'Expired'
    : request.state === 'accepted' ? 'Accepted'
    : request.state === 'unusable' ? 'Unavailable'
    : failed ? 'Failed'
    : request.delivery_sent_at ? 'Sent'
    : 'Not sent'
  const action = request.state === 'none' ? 'Send consent request'
    : request.state === 'expired' ? 'Reissue consent request'
    : request.state === 'valid' ? 'Resend consent request'
    : null
  const send = () => confirmConsentRequestSend(
    request.state,
    (message) => window.confirm(message),
    onSend,
  )
  return <section className="admin-consent-request" aria-label="Consent request">
    <h3>Consent request</h3>
    <p><strong>Status:</strong> {status}</p>
    {request.agreement_version && <p><strong>Agreement:</strong> {request.agreement_version}</p>}
    {request.created_at && <p><strong>Created:</strong> {localDate(request.created_at)}</p>}
    {request.expires_at && <p><strong>Expires:</strong> {localDate(request.expires_at)}</p>}
    {request.automatic_delivery_attempted_at && <p><strong>Automatic attempt:</strong> {localDate(request.automatic_delivery_attempted_at)}</p>}
    {request.delivery_sent_at && <p><strong>Last delivery:</strong> {localDate(request.delivery_sent_at)}</p>}
    {failed && <p className="admin-error">{request.delivery_last_error}</p>}
    {sailor.consent_status === 'PENDING' && action && <div className="admin-actions"><button disabled={busy} onClick={send}>{busy ? 'Sending consent request…' : action}</button></div>}
  </section>
}

export function WelcomeEmailStatus({ sailor, busy, onResend }: {
  sailor: AdminSailorDetail; busy: boolean; onResend: () => void
}) {
  const failed = sailor.welcome_email_last_error !== null
  const sent = sailor.welcome_email_sent_at !== null
  const status = failed ? 'Failed' : sent ? 'Sent' : 'Not sent'
  const eligible = sailor.consent_status === 'ACTIVE'
    && sailor.personal_capability_state === 'active'
    && sailor.personal_capability_path !== null
  return <section className="admin-welcome-email" aria-label="Welcome email">
    <h3>Welcome email</h3>
    <p><strong>Welcome email:</strong> {status}</p>
    {sent && <p>Last sent <time dateTime={sailor.welcome_email_sent_at!}>{localDate(sailor.welcome_email_sent_at)}</time></p>}
    {eligible && <div className="admin-actions"><button disabled={busy} onClick={onResend}>{busy ? 'Resending welcome email…' : 'Resend welcome email'}</button></div>}
  </section>
}

export function PersonalCapabilityControls({ sailor, busy, onRegenerate, onRevoke }: {
  sailor: AdminSailorDetail; busy: boolean; onRegenerate: () => void; onRevoke: () => void
}) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const stateLabels = { active: 'Active', revoked: 'Revoked', never_generated: 'Never generated', consent_inactive: 'Unavailable · consent inactive' }
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
    <p>{stateLabels[sailor.personal_capability_state]}</p>
    <div className="admin-actions">
      {sailor.personal_capability_state === 'active' && path && <button disabled={busy} onClick={() => void copyLink()}>Copy link</button>}
      <button disabled={busy} onClick={onRegenerate}>Regenerate</button>
      {(sailor.personal_capability_state === 'active' || sailor.personal_capability_state === 'consent_inactive') && <button className="danger" disabled={busy} onClick={onRevoke}>Revoke</button>}
    </div>
    {copyMessage && <p role="status">{copyMessage}</p>}
  </section>
}

export function SessionCard({ session, activities = [], selected = false, busy, onActivitySelect, onSailorSelect, onRegenerate, onRevoke, onRenew }: { session: AdminSession, activities?: AdminActivitySummary[], selected?: boolean, busy: boolean, onActivitySelect?: (id: string) => void, onSailorSelect?: (id: string) => void, onRegenerate: () => void, onRevoke: () => void, onRenew: (days: number) => void }) {
  const [days, setDays] = useState(30)
  const usable = session.capability_state === 'active' && !!session.capability_path
  const url = usable ? `${window.location.origin}${session.capability_path}` : null
  const sailing = session.sailing_start && session.sailing_end ? (() => { const start = new Date(session.sailing_start); const end = new Date(session.sailing_end); const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }); const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }); return day.format(start) === day.format(end) ? `${day.format(start)} · ${time.format(start)}–${time.format(end)}` : `${localDate(session.sailing_start)}–${localDate(session.sailing_end)}` })() : '—'
  const consentParts: Array<[string, number]> = [['ACTIVE', session.consent_active_count], ['PENDING', session.consent_pending_count], ['REVOKED', session.consent_revoked_count]]
  const consent = consentParts.filter(([, count]) => count > 0).map(([label, count]) => `${label} ${count}`).join(' · ')
  const lifetime = sessionLifetimePresentation(session.expires_at)
  return <article className={`admin-card admin-session-card${selected ? ' is-selected' : ''}`} aria-current={selected ? 'true' : undefined}><div className="admin-card__heading"><div><h2 title={session.id}>Session · {sailing}</h2><p>{session.id} · Created {localDate(session.created_at)}</p></div><span className={`state-badge state-${lifetime.state}`}>{lifetime.state.toUpperCase()}</span></div>
    <p className="admin-session-expiration">{lifetime.expiration}</p>
    <p className="admin-meta"><strong>Sailing:</strong> {sailing}<br /><strong>Sailors:</strong> {session.active_sailors.length === 0 ? '—' : session.active_sailors.map((sailor, index) => <span key={sailor.id}>{index > 0 && ' · '}{onSailorSelect ? <button className="admin-inline-relation" type="button" onClick={() => onSailorSelect(sailor.id)}>{sailor.label}</button> : sailor.label}</span>)}<br /><strong>Consent:</strong> {consent}</p>
    <dl className="session-counts"><div><dt>Internal tracks</dt><dd>{session.total_activity_count}</dd></div><div><dt>Shareable now</dt><dd>{session.visible_activity_count}</dd></div></dl>
    {activities.length > 0 && <section className="admin-session-activities"><h3>Activities</h3><div className="admin-relations">{activities.map((activity) => <RelationButton key={activity.id} label="Activity" id={activity.id} value={`${activity.sailor_label} · ${sailingTime(activity.start_time)}`} onFollow={() => onActivitySelect?.(activity.id)} />)}</div></section>}
    <section className="admin-session-capability"><h3>Shared capability</h3><span className={`state-badge state-${session.capability_state}`}>{capabilityLabels[session.capability_state]}</span>
      {url && !busy && <div className="admin-actions"><button onClick={() => void navigator.clipboard.writeText(url)}>Copy link</button><a className="admin-button" href={session.capability_path!} target="_blank" rel="noreferrer">Open session</a></div>}
      <div className="admin-actions"><button disabled={busy} onClick={onRegenerate}>Regenerate capability</button><button disabled={busy} className="danger" onClick={onRevoke}>Revoke capability</button></div>
    </section>
    <form className="renew-form" onSubmit={(event) => { event.preventDefault(); if (days >= 1 && days <= 365) onRenew(days) }}><label>Renew Session <span>Sets expiry to days from now</span><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /></label><button disabled={busy || days < 1 || days > 365}>Renew</button></form>
  </article>
}
