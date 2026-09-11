import TackBarBrand from '../components/TackBarBrand'
import { useState, type FormEvent } from 'react'
import {
  AdminApiError,
  confirmConsent,
  getAdminSailor,
  listAdminSailors,
  listAdminSessions,
  listAdminIngestions,
  markConsentRequested,
  regenerateCapability,
  regeneratePersonalCapability,
  revokePersonalCapability,
  renewSession,
  revokeCapability,
  revokeConsent,
  startNewConsentCycle,
  reprocessIngestion,
  discardIngestion,
  restoreIngestion,
  reviewMailbox,
  type IngestionDispositionFilter,
  type IngestionStatusFilter,
} from '../api/adminApi'
import type { AdminIngestion, AdminSailor, AdminSailorDetail, AdminSession, CapabilityState, ConsentOperationalGroup } from '../types/admin'

type Section = 'sailors' | 'sessions' | 'ingestions'

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

function localDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
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
  const [section, setSection] = useState<Section>('sailors')
  const [sailors, setSailors] = useState<AdminSailor[]>([])
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [ingestions, setIngestions] = useState<AdminIngestion[]>([])
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatusFilter>('all')
  const [ingestionDisposition, setIngestionDisposition] = useState<IngestionDispositionFilter>('all')
  const [reviewSummary, setReviewSummary] = useState<string | null>(null)
  const [selectedSailor, setSelectedSailor] = useState<AdminSailorDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleError = (cause: unknown) => {
    setError(errorMessage(cause))
    if (cause instanceof AdminApiError && cause.status === 401) {
      setAdminKey(null)
      setSailors([])
      setSessions([])
      setSelectedSailor(null)
    }
  }
  const loadAll = async (key: string) => {
    const [nextSailors, nextSessions, nextIngestions] = await Promise.all([listAdminSailors(key), listAdminSessions(key), listAdminIngestions(key, ingestionStatus, ingestionDisposition)])
    setSailors(nextSailors); setSessions(nextSessions); setIngestions(nextIngestions)
  }
  const enter = async (key: string) => {
    setBusy(true); setError(null)
    try { await loadAll(key); setAdminKey(key) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const refresh = async () => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try { await loadAll(adminKey); if (selectedSailor) setSelectedSailor(await getAdminSailor(adminKey, selectedSailor.id)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
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
      setSessions((current) => current.map((session) => session.id === updated.id ? updated : session))
      setSessions(await listAdminSessions(adminKey))
    } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const ingestionAction = async (id: string) => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try { const updated = await reprocessIngestion(adminKey, id); setIngestions((current) => current.map((item) => item.id === id ? updated : item)); setIngestions(await listAdminIngestions(adminKey, ingestionStatus, ingestionDisposition)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const ingestionDispositionAction = async (action: () => Promise<AdminIngestion>) => {
    if (!adminKey) return
    setBusy(true); setError(null)
    try { await action(); setIngestions(await listAdminIngestions(adminKey, ingestionStatus, ingestionDisposition)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const changeIngestionFilters = async (status: IngestionStatusFilter, disposition: IngestionDispositionFilter) => {
    if (!adminKey) return
    setBusy(true); setError(null); setIngestionStatus(status); setIngestionDisposition(disposition)
    try { setIngestions(await listAdminIngestions(adminKey, status, disposition)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const mailboxAction = async () => {
    if (!adminKey) return
    setBusy(true); setError(null); setReviewSummary(null)
    try { const result = await reviewMailbox(adminKey); setReviewSummary(`Mailbox review complete: ${result.processed} processed · ${result.skipped_already_processed} skipped · ${result.known_failed} known failed · ${result.failed} failed`); setIngestions(await listAdminIngestions(adminKey, ingestionStatus, ingestionDisposition)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  if (!adminKey) return <AdminAccessForm onEnter={enter} error={error} busy={busy} />

  return <main className="admin-page">
    <header className="admin-header"><div><TackBarBrand inverted /><span>Admin · Real Sailing Pilot</span></div><button onClick={refresh} disabled={busy}>Refresh</button></header>
    <nav className="admin-tabs" aria-label="Admin sections">
      {(['sailors', 'sessions', 'ingestions'] as Section[]).map((item) => <button key={item} className={section === item ? 'is-active' : ''} onClick={() => setSection(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
    </nav>
    {error && <p className="admin-error admin-feedback" role="alert">{error}</p>}
    {section === 'sailors' ? <section className="admin-content"><h1>Sailors</h1><div className="admin-list">
      {sailors.map((sailor) => <article className="admin-card" key={sailor.id}>
        <div className="admin-card__heading"><div><h2>{sailor.name || sailor.email}</h2>{sailor.name && <p>{sailor.email}</p>}</div><span className={`state-badge state-${sailor.operational_group}`}>{consentLabels[sailor.operational_group]}</span></div>
        <p className="admin-meta">Activities: {sailor.activity_count} · Sessions: {sailor.session_count}<br />Last sailing: {sailor.last_sailing_end ? localDate(sailor.last_sailing_start) + '–' + localDate(sailor.last_sailing_end) : '—'}<br />{sailor.operational_group === 'active' ? 'Consent granted' : sailor.operational_group === 'revoked' ? 'Consent revoked' : 'Consent request'}: {localDate(sailor.operational_group === 'active' ? sailor.consent_granted_at : sailor.operational_group === 'revoked' ? sailor.consent_revoked_at : sailor.consent_request_sent_at)}</p>
        <button disabled={busy} onClick={async () => { if (!adminKey) return; setBusy(true); try { setSelectedSailor(await getAdminSailor(adminKey, sailor.id)) } catch (cause) { handleError(cause) } finally { setBusy(false) } }}>View details</button>
        {selectedSailor?.id === sailor.id && <SailorDetail sailor={selectedSailor} busy={busy} onRequested={() => sailorAction(() => markConsentRequested(adminKey, sailor.id))} onConfirm={() => sailorAction(() => confirmConsent(adminKey, sailor.id))} onRevoke={() => { if (window.confirm('Record consent withdrawal?')) void sailorAction(() => revokeConsent(adminKey, sailor.id)) }} onNewCycle={() => confirmNewConsentCycle((message) => window.confirm(message), () => void sailorAction(() => startNewConsentCycle(adminKey, sailor.id)))} onPersonalRegenerate={() => { if (window.confirm('Regenerate personal access? The current personal link will stop working.')) void sailorAction(() => regeneratePersonalCapability(adminKey, sailor.id)) }} onPersonalRevoke={() => { if (window.confirm('Revoke personal access? Consent and shared Sessions will remain unchanged.')) void sailorAction(() => revokePersonalCapability(adminKey, sailor.id)) }} />}
      </article>)}
    </div></section> : section === 'sessions' ? <section className="admin-content"><h1>Sessions</h1><div className="admin-list">
      {sessions.map((session) => <SessionCard key={session.id} session={session} busy={busy} onRegenerate={() => { if (window.confirm('Regenerate capability? The current shared link will stop working.')) void sessionAction(() => regenerateCapability(adminKey, session.id)) }} onRevoke={() => { if (window.confirm('Revoke this shared capability?')) void sessionAction(() => revokeCapability(adminKey, session.id)) }} onRenew={(days) => { if (window.confirm(`Set expiry to ${days} days from now?`)) void sessionAction(() => renewSession(adminKey, session.id, days)) }} />)}
    </div></section> : <section className="admin-content"><h1>Ingestions</h1><button disabled={busy} onClick={() => void mailboxAction()}>Review mailbox now</button><IngestionFilters status={ingestionStatus} disposition={ingestionDisposition} busy={busy} onChange={changeIngestionFilters} />{reviewSummary && <p className="admin-meta">{reviewSummary}</p>}<div className="admin-list">{ingestions.map((item) => <IngestionCard key={item.id} ingestion={item} busy={busy} onReprocess={() => { if (window.confirm('Reprocess this ingestion from its preserved original?')) void ingestionAction(item.id) }} onDiscard={() => void ingestionDispositionAction(() => discardIngestion(adminKey!, item.id))} onRestore={() => void ingestionDispositionAction(() => restoreIngestion(adminKey!, item.id))} />)}</div></section>}
  </main>
}

export function IngestionFilters({ status, disposition, busy, onChange }: { status: IngestionStatusFilter, disposition: IngestionDispositionFilter, busy: boolean, onChange: (status: IngestionStatusFilter, disposition: IngestionDispositionFilter) => void }) {
  return <div className="admin-filters"><label>Status<select value={status} disabled={busy} onChange={(event) => onChange(event.target.value as IngestionStatusFilter, disposition)}><option value="all">All</option><option value="processed">Processed</option><option value="failed">Failed</option></select></label><label>Disposition<select value={disposition} disabled={busy} onChange={(event) => onChange(status, event.target.value as IngestionDispositionFilter)}><option value="all">All</option><option value="active">Active</option><option value="discarded">Discarded</option></select></label></div>
}

export function IngestionCard({ ingestion, busy, onReprocess, onDiscard, onRestore }: { ingestion: AdminIngestion, busy: boolean, onReprocess: () => void, onDiscard: () => void, onRestore: () => void }) {
  const hasSailing = Boolean(ingestion.activity_start_time && ingestion.activity_end_time)
  return <article className="admin-card"><div className="admin-card__heading"><div><h2>{ingestion.attachment_name || 'Unknown attachment'}</h2><p>{ingestion.sender_email || 'Unknown sender'} · {ingestion.provider}</p></div><span className={`state-badge state-${ingestion.status}`}>{ingestion.status === 'processed' ? 'Processed' : 'Failed'}</span></div>{hasSailing ? <div className="admin-ingestion-sailing"><time className="admin-ingestion-sailing__date" dateTime={ingestion.activity_start_time!}>{sailingDate(ingestion.activity_start_time!)}</time><p className="admin-ingestion-sailing__interval"><time dateTime={ingestion.activity_start_time!}>{sailingTime(ingestion.activity_start_time!)}</time> – <time dateTime={ingestion.activity_end_time!}>{sailingTime(ingestion.activity_end_time!)}</time></p><p className="admin-ingestion-sailing__summary">{sailingDuration(ingestion.activity_start_time!, ingestion.activity_end_time!)} · {ingestion.activity_sample_count?.toLocaleString() ?? '—'} samples</p></div> : <p className="admin-meta"><strong>Sailing:</strong> —</p>}<div className="admin-ingestion-ops"><p><strong>Disposition:</strong> {ingestion.disposition === 'active' ? 'Active' : 'Discarded'}</p><p><strong>Received:</strong> {localDate(ingestion.received_at)}</p><p><strong>Attempts:</strong> {ingestion.attempts} · <strong>Last attempt:</strong> {localDate(ingestion.last_attempt_at)}</p></div>{ingestion.last_error && <p className="admin-error">{ingestion.last_error}</p>}{ingestion.status === 'processed' ? <section className="admin-ingestion-result" aria-label="Ingestion result"><h3>Result</h3><p><strong>Sailor identified:</strong> {ingestion.sender_email || 'Unknown sender'}</p><p><strong>Activity created/reused:</strong> {ingestion.activity_id || '—'}</p><p><strong>Session associated:</strong> {ingestion.session_id || '—'}</p></section> : <p className="admin-meta">Activity: {ingestion.activity_id || '—'}<br />Session: {ingestion.session_id || '—'}</p>}<p className="admin-meta">Original: {ingestion.original_available ? 'Available' : 'Unavailable'}</p><div className="admin-actions">{ingestion.original_available && <button disabled={busy} onClick={onReprocess}>Reprocess</button>}<button disabled={busy} onClick={ingestion.disposition === 'active' ? onDiscard : onRestore}>{ingestion.disposition === 'active' ? 'Discard' : 'Restore'}</button></div></article>
}

export function SailorDetail({ sailor, busy, onRequested, onConfirm, onRevoke, onNewCycle, onPersonalRegenerate, onPersonalRevoke }: { sailor: AdminSailorDetail, busy: boolean, onRequested: () => void, onConfirm: () => void, onRevoke: () => void, onNewCycle: () => void, onPersonalRegenerate: () => void, onPersonalRevoke: () => void }) {
  return <div className="admin-detail"><dl><div><dt>Granted</dt><dd>{localDate(sailor.consent_granted_at)}</dd></div><div><dt>Revoked</dt><dd>{localDate(sailor.consent_revoked_at)}</dd></div></dl>
    <div className="admin-actions">{sailor.operational_group === 'pending_needs_request' && <button disabled={busy} onClick={onRequested}>Mark request sent</button>}{sailor.operational_group === 'pending_awaiting_response' && <><button disabled={busy} onClick={onConfirm}>Confirm consent</button><button disabled={busy} className="danger" onClick={onRevoke}>Record decline</button></>}{sailor.operational_group === 'active' && <button disabled={busy} className="danger" onClick={onRevoke}>Record withdrawal</button>}{sailor.operational_group === 'revoked' && <button disabled={busy} onClick={onNewCycle}>Start new consent cycle</button>}</div>
    <PersonalCapabilityControls key={`${sailor.id}-${sailor.personal_capability_path}-${sailor.personal_capability_state}`} sailor={sailor} busy={busy} onRegenerate={onPersonalRegenerate} onRevoke={onPersonalRevoke} />
    <h3>Activity history</h3><p className="admin-meta">Activities: {sailor.activity_count} · Sessions: {sailor.session_count}<br />Last sailing: {sailor.last_sailing_end ? `${localDate(sailor.last_sailing_start)}–${localDate(sailor.last_sailing_end)}` : '—'}</p><h3>Sessions</h3>{sailor.sessions.length === 0 ? <p>No Sessions recorded.</p> : <div className="admin-list">{sailor.sessions.map((session) => <article className="admin-card" key={session.session_id}><h4>{session.sailing_end ? `${localDate(session.sailing_start)}–${localDate(session.sailing_end)}` : session.session_id}</h4><p className="admin-meta">{session.sailor_activity_count} Activities · Expires: {localDate(session.expires_at)}</p><span className={`state-badge state-${session.capability_state}`}>{capabilityLabels[session.capability_state]}</span>{session.capability_path && sailor.consent_status === 'ACTIVE' && <a className="admin-button" href={session.capability_path}>Open shared Session</a>}</article>)}</div>}
    <h3>Consent history</h3>{sailor.consent_events.length === 0 ? <p>No consent events recorded.</p> : <ol className="event-list">{sailor.consent_events.map((event, index) => <li key={`${event.timestamp}-${index}`}><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{localDate(event.timestamp)} · {event.source}{event.agreement_version ? ` · ${event.agreement_version}` : ''}</span></li>)}</ol>}
  </div>
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

export function SessionCard({ session, busy, onRegenerate, onRevoke, onRenew }: { session: AdminSession, busy: boolean, onRegenerate: () => void, onRevoke: () => void, onRenew: (days: number) => void }) {
  const [days, setDays] = useState(30)
  const usable = session.capability_state === 'active' && !!session.capability_path
  const url = usable ? `${window.location.origin}${session.capability_path}` : null
  const sailing = session.sailing_start && session.sailing_end ? (() => { const start = new Date(session.sailing_start); const end = new Date(session.sailing_end); const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }); const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }); return day.format(start) === day.format(end) ? `${day.format(start)} · ${time.format(start)}–${time.format(end)}` : `${localDate(session.sailing_start)}–${localDate(session.sailing_end)}` })() : '—'
  const consentParts: Array<[string, number]> = [['ACTIVE', session.consent_active_count], ['PENDING', session.consent_pending_count], ['REVOKED', session.consent_revoked_count]]
  const consent = consentParts.filter(([, count]) => count > 0).map(([label, count]) => `${label} ${count}`).join(' · ')
  return <article className="admin-card"><div className="admin-card__heading"><div><h2 title={session.id}>{session.id}</h2><p>Created {localDate(session.created_at)}</p></div><span className={`state-badge state-${session.capability_state}`}>{capabilityLabels[session.capability_state]}</span></div>
    <p className="admin-meta"><strong>Sailing:</strong> {sailing}<br /><strong>Sailors:</strong> {session.active_sailors.map((sailor) => sailor.label).join(' · ') || '—'}<br /><strong>Consent:</strong> {consent}</p>
    <dl className="session-counts"><div><dt>Internal tracks</dt><dd>{session.total_activity_count}</dd></div><div><dt>Shareable now</dt><dd>{session.visible_activity_count}</dd></div></dl>
    <p className="admin-meta"><strong>Expires:</strong> {localDate(session.expires_at)}</p>
    {url && !busy && <div className="admin-actions"><button onClick={() => void navigator.clipboard.writeText(url)}>Copy link</button><a className="admin-button" href={session.capability_path!} target="_blank" rel="noreferrer">Open shared Session</a></div>}
    <div className="admin-actions"><button disabled={busy} onClick={onRegenerate}>Regenerate capability</button><button disabled={busy} className="danger" onClick={onRevoke}>Revoke capability</button></div>
    <form className="renew-form" onSubmit={(event) => { event.preventDefault(); if (days >= 1 && days <= 365) onRenew(days) }}><label>Renew Session <span>Sets expiry to days from now</span><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /></label><button disabled={busy || days < 1 || days > 365}>Renew</button></form>
  </article>
}
