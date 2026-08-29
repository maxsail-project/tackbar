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
  renewSession,
  revokeCapability,
  revokeConsent,
  startNewConsentCycle,
  reprocessIngestion,
  reviewMailbox,
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
    <p className="brand">TackBar</p><h1>Admin</h1>
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
    const [nextSailors, nextSessions, nextIngestions] = await Promise.all([listAdminSailors(key), listAdminSessions(key), listAdminIngestions(key)])
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
    try { const updated = await reprocessIngestion(adminKey, id); setIngestions((current) => current.map((item) => item.id === id ? updated : item)); setIngestions(await listAdminIngestions(adminKey)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  const mailboxAction = async () => {
    if (!adminKey) return
    setBusy(true); setError(null); setReviewSummary(null)
    try { const result = await reviewMailbox(adminKey); setReviewSummary(`Mailbox review complete: ${result.processed} processed · ${result.skipped_already_processed} skipped · ${result.known_failed} known failed · ${result.failed} failed`); setIngestions(await listAdminIngestions(adminKey)) } catch (cause) { handleError(cause) } finally { setBusy(false) }
  }
  if (!adminKey) return <AdminAccessForm onEnter={enter} error={error} busy={busy} />

  return <main className="admin-page">
    <header className="admin-header"><div><p className="brand">TackBar</p><span>Admin · Real Sailing Pilot</span></div><button onClick={refresh} disabled={busy}>Refresh</button></header>
    <nav className="admin-tabs" aria-label="Admin sections">
      {(['sailors', 'sessions', 'ingestions'] as Section[]).map((item) => <button key={item} className={section === item ? 'is-active' : ''} onClick={() => setSection(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
    </nav>
    {error && <p className="admin-error admin-feedback" role="alert">{error}</p>}
    {section === 'sailors' ? <section className="admin-content"><h1>Sailors</h1><div className="admin-list">
      {sailors.map((sailor) => <article className="admin-card" key={sailor.id}>
        <div className="admin-card__heading"><div><h2>{sailor.name || sailor.email}</h2>{sailor.name && <p>{sailor.email}</p>}</div><span className={`state-badge state-${sailor.operational_group}`}>{consentLabels[sailor.operational_group]}</span></div>
        <p className="admin-meta">{sailor.operational_group === 'active' ? 'Consent granted' : sailor.operational_group === 'revoked' ? 'Consent revoked' : 'Consent request'}: {localDate(sailor.operational_group === 'active' ? sailor.consent_granted_at : sailor.operational_group === 'revoked' ? sailor.consent_revoked_at : sailor.consent_request_sent_at)}</p>
        <button disabled={busy} onClick={async () => { if (!adminKey) return; setBusy(true); try { setSelectedSailor(await getAdminSailor(adminKey, sailor.id)) } catch (cause) { handleError(cause) } finally { setBusy(false) } }}>View details</button>
        {selectedSailor?.id === sailor.id && <SailorDetail sailor={selectedSailor} busy={busy} onRequested={() => sailorAction(() => markConsentRequested(adminKey, sailor.id))} onConfirm={() => sailorAction(() => confirmConsent(adminKey, sailor.id))} onRevoke={() => { if (window.confirm('Record consent withdrawal?')) void sailorAction(() => revokeConsent(adminKey, sailor.id)) }} onNewCycle={() => confirmNewConsentCycle((message) => window.confirm(message), () => void sailorAction(() => startNewConsentCycle(adminKey, sailor.id)))} />}
      </article>)}
    </div></section> : section === 'sessions' ? <section className="admin-content"><h1>Sessions</h1><div className="admin-list">
      {sessions.map((session) => <SessionCard key={session.id} session={session} busy={busy} onRegenerate={() => { if (window.confirm('Regenerate capability? The current shared link will stop working.')) void sessionAction(() => regenerateCapability(adminKey, session.id)) }} onRevoke={() => { if (window.confirm('Revoke this shared capability?')) void sessionAction(() => revokeCapability(adminKey, session.id)) }} onRenew={(days) => { if (window.confirm(`Set expiry to ${days} days from now?`)) void sessionAction(() => renewSession(adminKey, session.id, days)) }} />)}
    </div></section> : <section className="admin-content"><h1>Ingestions</h1><button disabled={busy} onClick={() => void mailboxAction()}>Review mailbox now</button>{reviewSummary && <p className="admin-meta">{reviewSummary}</p>}<div className="admin-list">{ingestions.map((item) => <IngestionCard key={item.id} ingestion={item} busy={busy} onReprocess={() => { if (window.confirm('Reprocess this ingestion from its preserved original?')) void ingestionAction(item.id) }} />)}</div></section>}
  </main>
}

export function IngestionCard({ ingestion, busy, onReprocess }: { ingestion: AdminIngestion, busy: boolean, onReprocess: () => void }) {
  return <article className="admin-card"><div className="admin-card__heading"><div><h2>{ingestion.attachment_name || 'Unknown attachment'}</h2><p>{ingestion.sender_email || 'Unknown sender'} · {ingestion.provider}</p></div><span className={`state-badge state-${ingestion.status}`}>{ingestion.status === 'processed' ? 'Processed' : 'Failed'}</span></div><p className="admin-meta">Attempts: {ingestion.attempts} · Last attempt: {localDate(ingestion.last_attempt_at)}</p>{ingestion.last_error && <p className="admin-error">{ingestion.last_error}</p>}<p className="admin-meta">Activity: {ingestion.activity_id || '—'}<br />Session: {ingestion.session_id || '—'}<br />Original: {ingestion.original_available ? 'Available' : 'Unavailable'}</p>{ingestion.original_available && <button disabled={busy} onClick={onReprocess}>Reprocess</button>}</article>
}

export function SailorDetail({ sailor, busy, onRequested, onConfirm, onRevoke, onNewCycle }: { sailor: AdminSailorDetail, busy: boolean, onRequested: () => void, onConfirm: () => void, onRevoke: () => void, onNewCycle: () => void }) {
  return <div className="admin-detail"><dl><div><dt>Granted</dt><dd>{localDate(sailor.consent_granted_at)}</dd></div><div><dt>Revoked</dt><dd>{localDate(sailor.consent_revoked_at)}</dd></div></dl>
    <div className="admin-actions">{sailor.operational_group === 'pending_needs_request' && <button disabled={busy} onClick={onRequested}>Mark request sent</button>}{sailor.operational_group === 'pending_awaiting_response' && <><button disabled={busy} onClick={onConfirm}>Confirm consent</button><button disabled={busy} className="danger" onClick={onRevoke}>Record decline</button></>}{sailor.operational_group === 'active' && <button disabled={busy} className="danger" onClick={onRevoke}>Record withdrawal</button>}{sailor.operational_group === 'revoked' && <button disabled={busy} onClick={onNewCycle}>Start new consent cycle</button>}</div>
    <h3>Consent history</h3>{sailor.consent_events.length === 0 ? <p>No consent events recorded.</p> : <ol className="event-list">{sailor.consent_events.map((event, index) => <li key={`${event.timestamp}-${index}`}><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{localDate(event.timestamp)} · {event.source}{event.agreement_version ? ` · ${event.agreement_version}` : ''}</span></li>)}</ol>}
  </div>
}

export function SessionCard({ session, busy, onRegenerate, onRevoke, onRenew }: { session: AdminSession, busy: boolean, onRegenerate: () => void, onRevoke: () => void, onRenew: (days: number) => void }) {
  const [days, setDays] = useState(30)
  const usable = session.capability_state === 'active' && !!session.capability_path
  const url = usable ? `${window.location.origin}${session.capability_path}` : null
  return <article className="admin-card"><div className="admin-card__heading"><div><h2 title={session.id}>{session.id}</h2><p>Created {localDate(session.created_at)}</p></div><span className={`state-badge state-${session.capability_state}`}>{capabilityLabels[session.capability_state]}</span></div>
    <dl className="session-counts"><div><dt>Internal tracks</dt><dd>{session.total_activity_count}</dd></div><div><dt>Shareable now</dt><dd>{session.visible_activity_count}</dd></div></dl>
    <p className="admin-meta"><strong>Expires:</strong> {localDate(session.expires_at)}</p>
    {url && !busy && <div className="admin-actions"><button onClick={() => void navigator.clipboard.writeText(url)}>Copy link</button><a className="admin-button" href={session.capability_path!} target="_blank" rel="noreferrer">Open shared Session</a></div>}
    <div className="admin-actions"><button disabled={busy} onClick={onRegenerate}>Regenerate capability</button><button disabled={busy} className="danger" onClick={onRevoke}>Revoke capability</button></div>
    <form className="renew-form" onSubmit={(event) => { event.preventDefault(); if (days >= 1 && days <= 365) onRenew(days) }}><label>Renew Session <span>Sets expiry to days from now</span><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /></label><button disabled={busy || days < 1 || days > 365}>Renew</button></form>
  </article>
}
