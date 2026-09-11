import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminIngestion, AdminSailorDetail, AdminSession } from '../types/admin'
import { AdminAccessForm, capabilityLabels, confirmNewConsentCycle, consentLabels, IngestionCard, IngestionFilters, PersonalCapabilityControls, SailorDetail, SessionCard } from './AdminPage'

const sailor = (group: AdminSailorDetail['operational_group']): AdminSailorDetail => ({
  id: 'sailor-1', email: 'sailor@example.test', name: 'Test Sailor', consent_status: group === 'active' ? 'ACTIVE' : 'PENDING',
  consent_request_sent_at: '2026-08-20T10:00:00Z', consent_granted_at: null, consent_revoked_at: null,
  operational_group: group, consent_events: [{ event_type: 'consent_requested', timestamp: '2026-08-20T10:00:00Z', source: 'admin', agreement_version: 'v1' }],
  personal_capability_state: 'never_generated', personal_capability_path: null,
  activity_count: 0, session_count: 0, last_sailing_start: null, last_sailing_end: null, sessions: [],
})
const session = (state: AdminSession['capability_state']): AdminSession => ({
  id: 'session-123', created_at: '2026-08-01T10:00:00Z', expires_at: '2026-09-30T10:00:00Z',
  total_activity_count: 3, visible_activity_count: 1, capability_state: state,
  capability_token: state === 'active' ? 'token' : null, capability_path: state === 'active' ? '/s/token' : null,
  sailing_start: '2026-08-01T08:00:00Z', sailing_end: '2026-08-01T10:00:00Z', active_sailors: [{ id: 'sailor-1', label: 'Test Sailor' }], consent_active_count: 1, consent_pending_count: 0, consent_revoked_count: 0,
})

afterEach(() => vi.unstubAllGlobals())

describe('minimal Admin UI', () => {
  it('renders a password credential form without putting a key in markup', () => {
    const markup = renderToStaticMarkup(<AdminAccessForm onEnter={() => undefined} error={null} busy={false} />)

    expect(markup).toContain('TackBar')
    expect(markup).toContain('Admin key')
    expect(markup).toContain('type="password"')
    expect(markup).toContain('Enter Admin')
  })

  it('uses operational user-facing state labels', () => {
    expect(consentLabels.pending_needs_request).toContain('request needed')
    expect(consentLabels.pending_awaiting_response).toContain('awaiting response')
    expect(consentLabels.active).toBe('Active')
    expect(consentLabels.revoked).toBe('Revoked')
    expect(capabilityLabels.never_generated).toBe('Never generated')
    expect(capabilityLabels.expired).toBe('Expired')
  })

  it('shows controlled authorization feedback', () => {
    const markup = renderToStaticMarkup(<AdminAccessForm onEnter={() => undefined} error="Admin authorization failed." busy={false} />)

    expect(markup).toContain('Admin authorization failed.')
    expect(markup).toContain('role="alert"')
  })

  it('renders state-appropriate consent actions and chronological event data', () => {
    const callbacks = { onPersonalRegenerate: () => undefined, onPersonalRevoke: () => undefined, busy: false, onRequested: () => undefined, onConfirm: () => undefined, onRevoke: () => undefined, onNewCycle: () => undefined }
    const needs = renderToStaticMarkup(<SailorDetail sailor={sailor('pending_needs_request')} {...callbacks} />)
    const waiting = renderToStaticMarkup(<SailorDetail sailor={sailor('pending_awaiting_response')} {...callbacks} />)
    const active = renderToStaticMarkup(<SailorDetail sailor={sailor('active')} {...callbacks} />)
    const revoked = renderToStaticMarkup(<SailorDetail sailor={sailor('revoked')} {...callbacks} />)

    expect(needs).toContain('Mark request sent')
    expect(waiting).toContain('Confirm consent')
    expect(waiting).toContain('Record decline')
    expect(active).toContain('Record withdrawal')
    expect(revoked).not.toContain('Confirm consent')
    expect(revoked).not.toContain('Activate')
    expect(revoked).toContain('Start new consent cycle')
    expect(needs).not.toContain('Start new consent cycle')
    expect(waiting).not.toContain('Start new consent cycle')
    expect(active).not.toContain('Start new consent cycle')
    expect(waiting).toContain('consent requested')
    expect(waiting).toContain('admin')
    expect(waiting).toContain('v1')
  })

  it('cancels or confirms a new consent cycle without bypassing confirmation', () => {
    const action = vi.fn()

    confirmNewConsentCycle(() => false, action)
    expect(action).not.toHaveBeenCalled()
    confirmNewConsentCycle(() => true, action)
    expect(action).toHaveBeenCalledOnce()
  })

  it('shows counts, active link actions and renewal-from-now wording', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const callbacks = { busy: false, onRegenerate: () => undefined, onRevoke: () => undefined, onRenew: () => undefined }
    const markup = renderToStaticMarkup(<SessionCard session={session('active')} {...callbacks} />)

    expect(markup).toContain('Internal tracks')
    expect(markup).toContain('Shareable now')
    expect(markup).toContain('Copy link')
    expect(markup).toContain('Open shared Session')
    expect(markup).toContain('Sets expiry to days from now')
    expect(markup).toContain('value="30"')
  })

  it('hides active link actions while a mutation or refresh is pending', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const markup = renderToStaticMarkup(<SessionCard session={session('active')} busy onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).not.toContain('Copy link')
    expect(markup).not.toContain('Open shared Session')
  })

  it.each(['expired', 'revoked', 'never_generated'] as const)('does not expose a usable link for %s capability', (state) => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const markup = renderToStaticMarkup(<SessionCard session={session(state)} busy={false} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).not.toContain('Copy link')
    expect(markup).not.toContain('Open shared Session')
  })

  it('renders operational ingestion success and failure cards', () => {
    const base: AdminIngestion = { id: 'ing-1', provider: 'gmail', provider_message_id: 'message-1', sender_email: 'sailor@example.test', received_at: null, attachment_name: 'track.csv.gz', status: 'failed', disposition: 'active', attempts: 2, last_attempt_at: '2026-08-28T12:00:00Z', last_error: 'Invalid attachment', activity_id: null, session_id: null, original_available: true, activity_start_time: null, activity_end_time: null, activity_sample_count: null }
    const actions = { onReprocess: () => undefined, onDiscard: () => undefined, onRestore: () => undefined }
    const failed = renderToStaticMarkup(<IngestionCard ingestion={base} busy={false} {...actions} />)
    const processed = renderToStaticMarkup(<IngestionCard ingestion={{ ...base, status: 'processed', last_error: null, activity_id: 'activity-1', session_id: 'session-1', disposition: 'discarded' }} busy={false} {...actions} />)
    expect(failed).toContain('Failed'); expect(failed).toContain('Active'); expect(failed).toContain('Discard'); expect(failed).toContain('Invalid attachment'); expect(failed).toContain('Received:'); expect(failed).toContain('Received:</strong> —'); expect(failed).toContain('Attempts:</strong> 2'); expect(failed).toContain('Last attempt:'); expect(failed).toContain('Reprocess')
    expect(processed).toContain('Processed'); expect(processed).toContain('Discarded'); expect(processed).toContain('Restore'); expect(processed).toContain('Reprocess'); expect(processed).toContain('Result'); expect(processed).toContain('Sailor identified:'); expect(processed).toContain('Activity created/reused:'); expect(processed).toContain('Session associated:'); expect(processed).toContain('activity-1'); expect(processed).toContain('session-1')
    expect(failed).not.toContain('Ingestion result')
    expect(failed).not.toContain('Review mailbox')
  })

  it('puts the sailing interval and sample count ahead of operational metadata', () => {
    const ingestion: AdminIngestion = {
      id: 'ing-2', provider: 'gmail', provider_message_id: 'message-2', sender_email: 'leandro@example.test',
      received_at: '2026-09-07T16:13:00Z', attachment_name: 'Vakaros Lea 32050.csv.gz', status: 'processed', disposition: 'active',
      attempts: 1, last_attempt_at: '2026-09-10T10:32:00Z', last_error: null, activity_id: 'activity-2', session_id: 'session-2',
      original_available: true, activity_start_time: '2026-09-05T13:49:00Z', activity_end_time: '2026-09-05T17:21:00Z', activity_sample_count: 25453,
    }
    const markup = renderToStaticMarkup(<IngestionCard ingestion={ingestion} busy={false} onReprocess={() => undefined} onDiscard={() => undefined} onRestore={() => undefined} />)

    expect(markup).toContain('admin-ingestion-sailing')
    expect(markup).toMatch(/25[,.]453 samples/)
    expect(markup.indexOf('admin-ingestion-sailing')).toBeLessThan(markup.indexOf('admin-ingestion-ops'))
    expect(markup).toContain('Disposition:')
    expect(markup).toContain('Attempts:')
  })

  it('exposes independent ingestion status and disposition filters', () => {
    const markup = renderToStaticMarkup(<IngestionFilters status="all" disposition="all" busy={false} onChange={() => undefined} />)
    for (const label of ['Status', 'All', 'Processed', 'Failed', 'Disposition', 'Active', 'Discarded']) expect(markup).toContain(label)
    const busy = renderToStaticMarkup(<IngestionFilters status="all" disposition="all" busy onChange={() => undefined} />)
    expect(busy.match(/disabled=""/g)).toHaveLength(2)
  })
})


describe('Admin Personal TackBar controls', () => {
  const callbacks = { busy: false, onRegenerate: () => undefined, onRevoke: () => undefined }
  it('offers Copy link, Regenerate and Revoke for usable access without Generate', () => {
    const detail: AdminSailorDetail = { ...sailor('active'), personal_capability_state: 'active', personal_capability_path: '/me/personal-token' }
    const markup = renderToStaticMarkup(<PersonalCapabilityControls sailor={detail} {...callbacks} />)
    expect(markup).toContain('Personal TackBar')
    expect(markup).toContain('Active')
    expect(markup).toContain('Copy link')
    expect(markup).toContain('Regenerate')
    expect(markup).toContain('Revoke')
    expect(markup).not.toContain('>Generate<')
    expect(markup).not.toContain('personal-token')
    const busy = renderToStaticMarkup(<PersonalCapabilityControls sailor={detail} {...callbacks} busy />)
    expect(busy.match(/disabled=""/g)).toHaveLength(3)
  })

  it.each(['revoked', 'never_generated', 'consent_inactive'] as const)('does not offer Copy link when %s', (state) => {
    const detail: AdminSailorDetail = { ...sailor('active'), personal_capability_state: state, personal_capability_path: null }
    const markup = renderToStaticMarkup(<PersonalCapabilityControls sailor={detail} {...callbacks} />)
    expect(markup).not.toContain('Copy link')
    expect(markup).toContain('Regenerate')
    expect(markup).toContain(state === 'revoked' ? 'Revoked' : state === 'never_generated' ? 'Never generated' : 'consent inactive')
  })
})
