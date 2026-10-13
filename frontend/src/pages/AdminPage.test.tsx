import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminActivity, AdminIngestion, AdminIngestionDetail, AdminSailorDetail, AdminSession } from '../types/admin'
import { ActivityAdminDetail, ActivityCard, ADMIN_SECTION_ORDER, AdminAccessForm, adminNavigationTarget, capabilityLabels, confirmConsentRequestSend, confirmNewConsentCycle, ConsentRequestStatus, consentLabels, DEFAULT_ADMIN_SECTION, filterAdminIngestions, IngestionCard, IngestionFilters, ingestionSailorOptions, IngestionOperationalDetail, IngestionSectionHeader, PersonalCapabilityControls, SailorDetail, sessionLifetimePresentation, SessionCard, UNRESOLVED_SAILOR_FILTER, WelcomeEmailStatus } from './AdminPage'

const sailor = (group: AdminSailorDetail['operational_group']): AdminSailorDetail => ({
  id: 'sailor-1', email: 'sailor@example.test', name: 'Test Sailor', consent_status: group === 'active' ? 'ACTIVE' : group === 'revoked' ? 'REVOKED' : 'PENDING',
  consent_request_sent_at: '2026-08-20T10:00:00Z', consent_granted_at: null, consent_revoked_at: null,
  operational_group: group, consent_events: [{ event_type: 'consent_requested', timestamp: '2026-08-20T10:00:00Z', source: 'admin', agreement_version: 'v1' }],
  personal_capability_state: 'never_generated', personal_capability_path: null,
  welcome_email_sent_at: null, welcome_email_last_error: null,
  consent_request: { state: 'none', agreement_version: null, created_at: null, expires_at: null, automatic_delivery_attempted_at: null, delivery_sent_at: null, delivery_last_error: null },
  activity_count: 0, session_count: 0, last_sailing_start: null, last_sailing_end: null, sessions: [],
})
const session = (state: AdminSession['capability_state']): AdminSession => ({
  id: 'session-123', created_at: '2026-08-01T10:00:00Z', expires_at: '2026-09-30T10:00:00Z',
  total_activity_count: 3, visible_activity_count: 1, capability_state: state,
  capability_token: state === 'active' ? 'token' : null, capability_path: state === 'active' ? '/s/token' : null,
  sailing_start: '2026-08-01T08:00:00Z', sailing_end: '2026-08-01T10:00:00Z', active_sailors: [{ id: 'sailor-1', label: 'Test Sailor' }], consent_active_count: 1, consent_pending_count: 0, consent_revoked_count: 0,
})
const activity: AdminActivity = { id: 'activity-123456789', sailor_id: 'sailor-123456789', sailor_label: 'Pilot', boat: { id: 'boat-1', name: 'Zafar', sailing_class: 'Snipe', sail_number: 'ESP 1' }, source: 'vakaros', device_name: 'Atlas 2', original_filename: 'pilot.csv.gz', start_time: '2026-09-05T13:49:00Z', end_time: '2026-09-05T17:21:00Z', sample_count: 25453, attachment_sha256: 'abc123', track_available: true, session_id: 'session-123456789', source_ingestion_id: 'ingestion-123456789', maneuvers: { artifact_currency: 'current', detector_status: 'available', unavailable_reason: null, detected_count: 4, artifact_algorithm_version: 6, current_algorithm_version: 6 }, diagnostic: { id: 'activity-123456789' } }

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('minimal Admin UI', () => {
  it('presents the Admin sections in operational order and starts at Ingestions', () => {
    expect(ADMIN_SECTION_ORDER).toEqual(['ingestions', 'activities', 'sailors', 'sessions'])
    expect(DEFAULT_ADMIN_SECTION).toBe('ingestions')
  })

  it.each([
    ['sailor', 'ingestions', 'sailors'],
    ['session', 'ingestions', 'sessions'],
    ['sailor', 'sessions', 'sailors'],
    ['session', 'sailors', 'sessions'],
    ['sailor', 'ingestions', 'sailors'],
    ['session', 'ingestions', 'sessions'],
    ['ingestion', 'sessions', 'ingestions'],
    ['activity', 'ingestions', 'activities'],
    ['activity', 'sailors', 'activities'],
    ['activity', 'sessions', 'activities'],
  ] as const)('routes %s from %s to its %s home section and preserves the selected ID', (kind, origin, expectedSection) => {
    expect(adminNavigationTarget(kind, `${kind}-123`, origin)).toEqual({
      section: expectedSection,
      selected: { kind, id: `${kind}-123` },
      contextual: false,
    })
  })

  it('routes Activity to its own section and renders no contextual foreign detail shell', () => {
    const target = adminNavigationTarget('activity', activity.id, 'ingestions')
    const markup = renderToStaticMarkup(<ActivityCard activity={activity} detail={activity} busy={false} onSelect={() => undefined} onFollow={() => undefined} onRecalculate={() => undefined} />)

    expect(target).toEqual({ section: 'activities', selected: { kind: 'activity', id: activity.id }, contextual: false })
    expect(markup).not.toContain('Back to Ingestion')
    expect(markup).toContain('Source Ingestion')
    expect(markup).not.toContain('Personal TackBar')
    expect(markup).not.toContain('Shared capability')
    expect(markup).not.toContain('Outbound result')
  })

  it('groups the Ingestions title and secondary mailbox action in a responsive section header', () => {
    const markup = renderToStaticMarkup(<IngestionSectionHeader busy={false} onReview={() => undefined} />)
    const busy = renderToStaticMarkup(<IngestionSectionHeader busy onReview={() => undefined} />)

    expect(markup).toContain('admin-ingestion-section-header')
    expect(markup).toContain('<h1>Ingestions</h1>')
    expect(markup).toContain('class="admin-section-action"')
    expect(markup).toContain('>Review mailbox</button>')
    expect(markup).not.toContain('Review mailbox now')
    expect(markup.indexOf('Ingestions')).toBeLessThan(markup.indexOf('Review mailbox'))
    expect(busy).toContain('disabled=""')
  })

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
    const callbacks = { onPersonalRegenerate: () => undefined, onPersonalRevoke: () => undefined, onWelcomeEmailResend: () => undefined, busy: false, onRequested: () => undefined, onConsentRequestSend: () => undefined, onConfirm: () => undefined, onRevoke: () => undefined, onNewCycle: () => undefined }
    const needs = renderToStaticMarkup(<SailorDetail sailor={sailor('pending_needs_request')} {...callbacks} />)
    const waiting = renderToStaticMarkup(<SailorDetail sailor={sailor('pending_awaiting_response')} {...callbacks} />)
    const failedPending = renderToStaticMarkup(<SailorDetail sailor={{ ...sailor('pending_needs_request'), consent_request: { state: 'valid', agreement_version: 'v0.6.5', created_at: '2031-06-18T10:00:00Z', expires_at: '2031-07-16T10:00:00Z', automatic_delivery_attempted_at: '2031-06-18T10:01:00Z', delivery_sent_at: null, delivery_last_error: 'Consent request delivery failed' } }} {...callbacks} />)
    const active = renderToStaticMarkup(<SailorDetail sailor={sailor('active')} {...callbacks} />)
    const revoked = renderToStaticMarkup(<SailorDetail sailor={sailor('revoked')} {...callbacks} />)

    expect(needs).toContain('Mark request sent manually')
    expect(needs).toContain('Confirm consent')
    expect(waiting).toContain('Confirm consent')
    expect(waiting).toContain('Record decline')
    expect(failedPending).toContain('Status:</strong> Failed')
    expect(failedPending).toContain('Confirm consent')
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

  it('shows safe Consent Request recovery states and actions without rendering tokens', () => {
    const callbacks = { busy: false, onSend: () => undefined }
    const none = renderToStaticMarkup(<ConsentRequestStatus sailor={sailor('pending_needs_request')} {...callbacks} />)
    const validRequest = { state: 'valid' as const, agreement_version: 'v0.6.5', created_at: '2031-06-18T10:00:00Z', expires_at: '2031-07-16T10:00:00Z', automatic_delivery_attempted_at: '2031-06-18T10:01:00Z', delivery_sent_at: '2031-06-18T10:02:00Z', delivery_last_error: null }
    const requestWithUnexpectedToken = { ...validRequest, token: 'secret-consent-token' } as AdminSailorDetail['consent_request']
    const valid = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('pending_awaiting_response'), consent_request: requestWithUnexpectedToken }} {...callbacks} />)
    const expired = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('pending_awaiting_response'), consent_request: { state: 'expired', agreement_version: 'v0.6.5', created_at: '2031-05-01T10:00:00Z', expires_at: '2031-05-29T10:00:00Z', automatic_delivery_attempted_at: null, delivery_sent_at: null, delivery_last_error: 'Consent request delivery failed' } }} {...callbacks} />)
    const accepted = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('pending_awaiting_response'), consent_request: { ...sailor('pending_awaiting_response').consent_request, state: 'accepted' } }} {...callbacks} />)

    expect(none).toContain('Not issued')
    expect(none).toContain('Send consent request')
    expect(valid).toContain('Status:</strong> Sent')
    expect(valid).toContain('Agreement:</strong> v0.6.5')
    expect(valid).toContain('Automatic attempt:')
    expect(valid).toContain('Last delivery:')
    expect(valid).toContain('Resend consent request')
    expect(expired).toContain('Status:</strong> Expired')
    expect(expired).toContain('Consent request delivery failed')
    expect(expired).toContain('Reissue consent request')
    expect(accepted).toContain('Status:</strong> Accepted')
    expect(accepted).not.toContain('<button')
    for (const markup of [none, valid, expired, accepted]) {
      expect(markup).not.toContain('secret-consent-token')
    }
  })

  it('does not offer request recovery to ACTIVE or REVOKED Sailors and disables it while busy', () => {
    const request = { state: 'valid' as const, agreement_version: 'v0.6.5', created_at: '2031-06-18T10:00:00Z', expires_at: '2031-07-16T10:00:00Z', automatic_delivery_attempted_at: null, delivery_sent_at: null, delivery_last_error: null }
    const active = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('active'), consent_request: request }} busy={false} onSend={() => undefined} />)
    const revoked = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('revoked'), consent_request: request }} busy={false} onSend={() => undefined} />)
    const busy = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('pending_awaiting_response'), consent_request: request }} busy onSend={() => undefined} />)

    expect(active).not.toContain('Resend consent request')
    expect(revoked).not.toContain('Resend consent request')
    expect(busy).toContain('Sending consent request…')
    expect(busy).toContain('disabled=""')
  })

  it('only asks for confirmation when reissuing an expired request', () => {
    const confirm = vi.fn(() => false)
    const action = vi.fn()

    confirmConsentRequestSend('valid', confirm, action)
    expect(confirm).not.toHaveBeenCalled()
    expect(action).toHaveBeenCalledOnce()
    action.mockClear()
    confirmConsentRequestSend('expired', confirm, action)
    expect(confirm).toHaveBeenCalledOnce()
    expect(action).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    confirmConsentRequestSend('expired', confirm, action)
    expect(action).toHaveBeenCalledOnce()
  })

  it('cancels or confirms a new consent cycle without bypassing confirmation', () => {
    const action = vi.fn()

    confirmNewConsentCycle(() => false, action)
    expect(action).not.toHaveBeenCalled()
    confirmNewConsentCycle(() => true, action)
    expect(action).toHaveBeenCalledOnce()
  })

  it('presents welcome-email operational states separately from consent and Personal TackBar', () => {
    const callbacks = { busy: false, onResend: () => undefined }
    const notSent = renderToStaticMarkup(<WelcomeEmailStatus sailor={sailor('active')} {...callbacks} />)
    const sent = renderToStaticMarkup(<WelcomeEmailStatus sailor={{ ...sailor('active'), welcome_email_sent_at: '2031-06-18T12:00:00Z' }} {...callbacks} />)
    const failed = renderToStaticMarkup(<WelcomeEmailStatus sailor={{ ...sailor('active'), welcome_email_sent_at: '2031-06-18T12:00:00Z', welcome_email_last_error: 'Welcome email delivery failed' }} {...callbacks} />)
    const detail = renderToStaticMarkup(<SailorDetail sailor={{ ...sailor('active'), personal_capability_state: 'active', personal_capability_path: '/me/personal-token', welcome_email_last_error: 'Welcome email delivery failed' }} busy={false} onRequested={() => undefined} onConsentRequestSend={() => undefined} onConfirm={() => undefined} onRevoke={() => undefined} onNewCycle={() => undefined} onPersonalRegenerate={() => undefined} onPersonalRevoke={() => undefined} onWelcomeEmailResend={() => undefined} />)

    expect(notSent).toContain('Welcome email:</strong> Not sent')
    expect(notSent).not.toContain('Last sent')
    expect(sent).toContain('Welcome email:</strong> Sent')
    expect(sent).toContain('Last sent')
    expect(sent).toContain('dateTime="2031-06-18T12:00:00Z"')
    expect(failed).toContain('Welcome email:</strong> Failed')
    expect(failed).toContain('Last sent')
    expect(failed).not.toContain('Welcome email delivery failed')
    expect(detail).toContain('Personal TackBar')
    expect(detail).toContain('Welcome email:</strong> Failed')
    expect(detail.indexOf('Personal TackBar')).toBeLessThan(detail.indexOf('Welcome email:</strong> Failed'))
  })

  it('only offers resend for ACTIVE Sailors with usable Personal TackBar access', () => {
    const callbacks = { busy: false, onResend: () => undefined }
    const eligible = renderToStaticMarkup(<WelcomeEmailStatus sailor={{ ...sailor('active'), personal_capability_state: 'active', personal_capability_path: '/me/personal-token' }} {...callbacks} />)

    expect(eligible).toContain('Resend welcome email')
    for (const unavailable of [
      { ...sailor('pending_needs_request'), consent_status: 'PENDING', personal_capability_state: 'active' as const, personal_capability_path: '/me/personal-token' },
      { ...sailor('revoked'), consent_status: 'REVOKED', personal_capability_state: 'active' as const, personal_capability_path: '/me/personal-token' },
      sailor('active'),
      { ...sailor('active'), personal_capability_state: 'revoked' as const, personal_capability_path: null },
      { ...sailor('active'), personal_capability_state: 'consent_inactive' as const, personal_capability_path: null },
    ]) {
      expect(renderToStaticMarkup(<WelcomeEmailStatus sailor={unavailable} {...callbacks} />)).not.toContain('Resend welcome email')
    }
    const busy = renderToStaticMarkup(<WelcomeEmailStatus sailor={{ ...sailor('active'), personal_capability_state: 'active', personal_capability_path: '/me/personal-token' }} busy onResend={() => undefined} />)
    expect(busy).toContain('Resending welcome email…')
    expect(busy).toContain('disabled=""')
  })

  it('shows counts, active link actions and renewal-from-now wording', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const callbacks = { busy: false, onRegenerate: () => undefined, onRevoke: () => undefined, onRenew: () => undefined }
    const markup = renderToStaticMarkup(<SessionCard session={session('active')} {...callbacks} />)

    expect(markup).toContain('>ACTIVE<')
    expect(markup).toContain('Expires')
    expect(markup).toContain('12 days remaining')
    expect(markup).toContain('Shared capability')
    expect(markup).toContain('Internal tracks')
    expect(markup).toContain('Shareable now')
    expect(markup).toContain('Copy link')
    expect(markup).toContain('Open session')
    expect(markup).not.toContain('Open shared Session')
    expect(markup).toContain('Sets expiry to days from now')
    expect(markup).toContain('value="30"')
  })

  it('organizes Sailor Session history around sailing, details and access without changing the capability href', () => {
    const detail: AdminSailorDetail = {
      ...sailor('active'),
      sessions: [{
        session_id: 'session-123', sailing_start: '2026-08-01T08:00:00Z', sailing_end: '2026-08-01T10:00:00Z',
        sailor_activity_count: 1, expires_at: '2026-09-30T10:00:00Z', capability_state: 'active', capability_path: '/s/token',
      }, {
        session_id: 'session-456', sailing_start: '2026-08-02T08:00:00Z', sailing_end: '2026-08-02T10:00:00Z',
        sailor_activity_count: 2, expires_at: '2026-10-30T10:00:00Z', capability_state: 'expired', capability_path: null,
      }],
    }
    const markup = renderToStaticMarkup(<SailorDetail sailor={detail} busy={false} onSessionSelect={() => undefined} onRequested={() => undefined} onConsentRequestSend={() => undefined} onConfirm={() => undefined} onRevoke={() => undefined} onNewCycle={() => undefined} onPersonalRegenerate={() => undefined} onPersonalRevoke={() => undefined} onWelcomeEmailResend={() => undefined} />)

    expect(markup).toContain('admin-sailor-session__date')
    expect(markup).toContain('admin-sailor-session__interval')
    expect(markup).toContain('>Active<')
    expect(markup).toContain('>Expired<')
    expect(markup).toContain('>Activities</dt><dd>1 Activity</dd>')
    expect(markup).toContain('>Activities</dt><dd>2 Activities</dd>')
    expect(markup).toContain('>Expires</dt>')
    expect(markup).toContain('Session access')
    expect(markup.indexOf('Session access')).toBeGreaterThan(markup.indexOf('>Expires</dt>'))
    expect(markup).toContain('href="/s/token"')
    expect(markup).toContain('>Open session</a>')
    expect(markup).toContain('Admin Session')
    expect(markup).not.toContain('Open shared Session')
  })

  it('keeps Sailor Session history links unavailable when consent or capability conditions do not permit them', () => {
    const unavailable: AdminSailorDetail = {
      ...sailor('pending_needs_request'),
      sessions: [{
        session_id: 'session-123', sailing_start: '2026-08-01T08:00:00Z', sailing_end: '2026-08-01T10:00:00Z',
        sailor_activity_count: 1, expires_at: '2026-09-30T10:00:00Z', capability_state: 'active', capability_path: '/s/token',
      }],
    }
    const markup = renderToStaticMarkup(<SailorDetail sailor={unavailable} busy={false} onRequested={() => undefined} onConsentRequestSend={() => undefined} onConfirm={() => undefined} onRevoke={() => undefined} onNewCycle={() => undefined} onPersonalRegenerate={() => undefined} onPersonalRevoke={() => undefined} onWelcomeEmailResend={() => undefined} />)

    expect(markup).toContain('>Active<')
    expect(markup).not.toContain('Session access')
    expect(markup).not.toContain('Open session')
    expect(markup).not.toContain('href="/s/token"')
  })

  it('presents Session lifetime from expiry independently of shared capability', () => {
    const now = new Date('2026-09-18T12:00:00Z')
    expect(sessionLifetimePresentation('2026-09-18T13:00:00Z', now)).toMatchObject({ state: 'active', expiration: expect.stringContaining('1 days remaining') })
    expect(sessionLifetimePresentation('2026-09-18T12:00:00Z', now)).toMatchObject({ state: 'expired', expiration: expect.stringContaining('Expired') })

    vi.useFakeTimers(); vi.setSystemTime(now)
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const revoked = renderToStaticMarkup(<SessionCard session={session('revoked')} busy={false} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)
    const expired = renderToStaticMarkup(<SessionCard session={{ ...session('active'), expires_at: '2026-09-01T10:00:00Z' }} busy={false} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(revoked).toContain('>ACTIVE<')
    expect(revoked).toContain('Shared capability')
    expect(revoked).toContain('>Revoked<')
    expect(expired).toContain('>EXPIRED<')
    expect(expired).toContain('Expired')
    expect(expired).toContain('>Active<')
    expect(expired).toContain('Renew')
  })

  it('marks a cross-navigation Session selection and exposes related Sailors without nesting Sailor detail', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const markup = renderToStaticMarkup(<SessionCard session={session('active')} selected busy={false} onSailorSelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).toContain('aria-current="true"')
    expect(markup).toContain('admin-session-card is-selected')
    expect(markup).toContain('>Test Sailor</button>')
    expect(markup).not.toContain('Personal TackBar')
    expect(markup).not.toContain('Consent request')
  })

  it('exposes Activity relationships from Sailor and Session without nesting Activity detail', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const callbacks = { onRequested: () => undefined, onConsentRequestSend: () => undefined, onConfirm: () => undefined, onRevoke: () => undefined, onNewCycle: () => undefined, onPersonalRegenerate: () => undefined, onPersonalRevoke: () => undefined, onWelcomeEmailResend: () => undefined }
    const sailorMarkup = renderToStaticMarkup(<SailorDetail sailor={sailor('active')} activities={[activity]} busy={false} onActivitySelect={() => undefined} {...callbacks} />)
    const sessionMarkup = renderToStaticMarkup(<SessionCard session={session('active')} activities={[activity]} busy={false} onActivitySelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(sailorMarkup).toContain('>Activity</span>')
    expect(sessionMarkup).toContain('<h3>Activities</h3>')
    expect(sessionMarkup).toContain('Pilot')
    for (const markup of [sailorMarkup, sessionMarkup]) {
      expect(markup).not.toContain('Recalculate maneuvers')
      expect(markup).not.toContain('Read-only JSON')
    }
  })

  it('hides active link actions while a mutation or refresh is pending', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const markup = renderToStaticMarkup(<SessionCard session={session('active')} busy onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).not.toContain('Copy link')
    expect(markup).not.toContain('Open session')
  })

  it.each(['expired', 'revoked', 'never_generated'] as const)('does not expose a usable link for %s capability', (state) => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const markup = renderToStaticMarkup(<SessionCard session={session(state)} busy={false} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).not.toContain('Copy link')
    expect(markup).not.toContain('Open session')
  })

  it('keeps ingestion rows compact and makes the whole summary the open control', () => {
    const base: AdminIngestion = { id: 'ing-1', provider: 'gmail', provider_message_id: 'message-1', sender_email: 'sailor@example.test', received_at: null, attachment_name: 'track.csv.gz', status: 'failed', disposition: 'active', attempts: 2, last_attempt_at: '2026-08-28T12:00:00Z', last_error: 'Invalid attachment', activity_id: null, session_id: null, sailor_id: null, sailor_label: null, sailor_email: null, sailor_consent_status: null, original_available: true, activity_start_time: null, activity_end_time: null, activity_sample_count: null }
    const actions = { onSelect: () => undefined, onFollow: () => undefined, onReprocess: () => undefined, onDiscard: () => undefined, onRestore: () => undefined }
    const failed = renderToStaticMarkup(<IngestionCard ingestion={base} busy={false} {...actions} />)
    const processed = renderToStaticMarkup(<IngestionCard ingestion={{ ...base, status: 'processed', last_error: null, activity_id: 'activity-123456789', session_id: 'session-123456789', disposition: 'discarded' }} busy={false} {...actions} />)
    expect(failed).toContain('aria-expanded="false"'); expect(failed).toContain('Failed'); expect(failed).toContain('track.csv.gz'); expect(failed).toContain('sailor@example.test'); expect(failed).not.toContain('Invalid attachment'); expect(failed).not.toContain('Received'); expect(failed).not.toContain('Attempts'); expect(failed).not.toContain('Reprocess')
    expect(processed).toContain('Processed'); expect(processed).toContain('Discarded'); expect(processed).toContain('Activity activity…'); expect(processed).toContain('Session session-…'); expect(processed).not.toContain('Restore'); expect(processed).not.toContain('Read-only JSON')
    expect(failed).toContain('state-badge state-expired')
    expect(processed).toContain('state-badge state-active')
  })

  it('puts the sailing interval and sample count ahead of operational metadata', () => {
    const ingestion: AdminIngestion = {
      id: 'ing-2', provider: 'gmail', provider_message_id: 'message-2', sender_email: 'leandro@example.test',
      received_at: '2026-09-07T16:13:00Z', attachment_name: 'Vakaros Lea 32050.csv.gz', status: 'processed', disposition: 'active',
      attempts: 1, last_attempt_at: '2026-09-10T10:32:00Z', last_error: null, activity_id: 'activity-2', session_id: 'session-2',
      sailor_id: 'sailor-2', sailor_label: 'Leandro', sailor_email: 'leandro@example.test', sailor_consent_status: 'ACTIVE', original_available: true, activity_start_time: '2026-09-05T13:49:00Z', activity_end_time: '2026-09-05T17:21:00Z', activity_sample_count: 25453,
    }
    const markup = renderToStaticMarkup(<IngestionCard ingestion={ingestion} busy={false} onSelect={() => undefined} onFollow={() => undefined} onReprocess={() => undefined} onDiscard={() => undefined} onRestore={() => undefined} />)

    expect(markup).toContain('admin-ingestion-summary__context')
    expect(markup).toMatch(/25[,.]453 samples/)
    expect(markup).not.toContain('Received')
    expect(markup).not.toContain('Attempts')
  })

  it('groups expanded ingestion operations, traceability, outbound result and diagnostics', () => {
    const detail: AdminIngestionDetail = {
      id: 'ingestion-123456789', provider: 'ovh', provider_message_id: 'provider-message-77', sender_email: 'sailor@example.test', received_at: '2026-09-07T16:13:00Z', attachment_name: 'pilot.csv.gz', status: 'processed', disposition: 'active', attempts: 2, last_attempt_at: '2026-09-10T10:32:00Z', last_error: null, activity_id: 'activity-123456789', session_id: 'session-123456789', sailor_id: 'sailor-123456789', sailor_label: 'Pilot', sailor_email: 'pilot@example.test', sailor_consent_status: 'ACTIVE', original_available: true, activity_start_time: '2026-09-05T13:49:00Z', activity_end_time: '2026-09-05T17:21:00Z', activity_sample_count: 25453,
      activity_created_by_ingestion: false, session_result_notification_candidate: true, session_result_notification: { status: 'sent', attempted_at: '2026-09-10T10:33:00Z', sent_at: '2026-09-10T10:33:01Z', last_error: null }, attachment_sha256: 'abc123', diagnostic: { id: 'ingestion-123456789', status: 'processed' },
    }
    const markup = renderToStaticMarkup(<IngestionOperationalDetail ingestion={detail} busy={false} onFollow={() => undefined} onReprocess={() => undefined} onDiscard={() => undefined} onRestore={() => undefined} />)

    for (const heading of ['Sailing', 'Source', 'Traceability', 'Processing', 'Outbound result', 'Actions', 'Advanced details', 'Read-only JSON']) expect(markup).toContain(heading)
    expect(markup).toContain('Reused existing Activity')
    expect(markup).toContain('Sent')
    expect(markup).toContain('Outbound delivery does not change the ingestion result.')
    expect(markup).toContain('Pilot')
    expect(markup).toContain('activity…')
    expect(markup).toContain('session-…')
    expect(markup).toContain('&quot;status&quot;: &quot;processed&quot;')
    const notApplicable = renderToStaticMarkup(<IngestionOperationalDetail ingestion={{ ...detail, session_result_notification_candidate: false, session_result_notification: null }} busy={false} onFollow={() => undefined} />)
    const attempted = renderToStaticMarkup(<IngestionOperationalDetail ingestion={{ ...detail, session_result_notification: { status: 'attempted', attempted_at: '2026-09-10T10:33:00Z', sent_at: null, last_error: null } }} busy={false} onFollow={() => undefined} />)
    const failed = renderToStaticMarkup(<IngestionOperationalDetail ingestion={{ ...detail, session_result_notification: { status: 'failed', attempted_at: '2026-09-10T10:33:00Z', sent_at: null, last_error: 'Session-result email delivery failed' } }} busy={false} onFollow={() => undefined} />)
    expect(notApplicable).toContain('Not applicable / not attempted')
    expect(attempted).toContain('Attempted')
    expect(failed).toContain('Failed')
    expect(failed).toContain('Session-result email delivery failed')
  })

  it('separates Activity traceability relationships from source metadata', () => {
    const markup = renderToStaticMarkup(<ActivityAdminDetail activity={activity} onFollow={() => undefined} />)
    const traceability = markup.slice(markup.indexOf('<h3>Traceability</h3>'), markup.indexOf('<h3>Source</h3>'))
    const source = markup.slice(markup.indexOf('<h3>Source</h3>'), markup.indexOf('<h3>Maneuvers</h3>'))

    expect(traceability).toContain('Sailor'); expect(traceability).toContain('Pilot'); expect(traceability).toContain('Boat'); expect(traceability).toContain('Zafar · Snipe · ESP 1'); expect(traceability).toContain('Session'); expect(traceability).toContain('<button class="admin-relation" type="button"><span>Source Ingestion</span>')
    expect(source).toContain('Provider/source'); expect(source).toContain('Device'); expect(source).toContain('Original filename'); expect(source).not.toContain('Source Ingestion')
    expect(markup).toContain('Track'); expect(markup).toContain('Maneuvers'); expect(markup).toContain('CURRENT'); expect(markup).toContain('>4</dd>'); expect(markup).toContain('Recalculate maneuvers'); expect(markup).toContain('<summary>Advanced</summary>'); expect(markup).toContain('<summary>Diagnostic JSON</summary>')
    expect(markup.indexOf('<h3>Track</h3>')).toBeLessThan(markup.indexOf('<h3>Traceability</h3>')); expect(markup.indexOf('<h3>Traceability</h3>')).toBeLessThan(markup.indexOf('<h3>Source</h3>')); expect(markup.indexOf('<h3>Source</h3>')).toBeLessThan(markup.indexOf('<h3>Maneuvers</h3>')); expect(markup.indexOf('<h3>Maneuvers</h3>')).toBeLessThan(markup.indexOf('<summary>Advanced</summary>')); expect(markup.indexOf('<summary>Advanced</summary>')).toBeLessThan(markup.indexOf('<summary>Diagnostic JSON</summary>'))
    expect(markup).not.toContain('Map'); expect(markup).not.toContain('Metrics')
  })

  it('shows authoritative source Ingestion as unavailable without a navigation control', () => {
    const markup = renderToStaticMarkup(<ActivityAdminDetail activity={{ ...activity, source_ingestion_id: null }} onFollow={() => undefined} />)
    const traceability = markup.slice(markup.indexOf('<h3>Traceability</h3>'), markup.indexOf('<h3>Source</h3>'))

    expect(traceability).toContain('<span>Source Ingestion</span><strong>Unavailable</strong>')
    expect(traceability).not.toContain('title="ingestion-')
  })

  it('exposes independent ingestion status and disposition filters', () => {
    const props = { status: 'all' as const, disposition: 'all' as const, sailor: 'all', search: '', sailors: [{ value: 'sailor-1', label: 'Maxi · maxi@example.test' }], onChange: () => undefined, onSailorChange: () => undefined, onSearchChange: () => undefined }
    const markup = renderToStaticMarkup(<IngestionFilters {...props} busy={false} />)
    for (const label of ['Search', 'Status', 'All', 'Processed', 'Failed', 'Disposition', 'Active', 'Discarded', 'Sailor', 'All sailors', 'Maxi']) expect(markup).toContain(label)
    const busy = renderToStaticMarkup(<IngestionFilters {...props} busy />)
    expect(busy.match(/disabled=""/g)).toHaveLength(4)
  })
})

describe('Admin Ingestion search and Sailor filters', () => {
  const ingestion = (overrides: Partial<AdminIngestion>): AdminIngestion => ({
    id: 'ingestion-1', provider: 'ovh', provider_message_id: 'message-1', sender_email: 'sender@example.test', received_at: null, attachment_name: 'track.csv.gz', status: 'processed', disposition: 'active', attempts: 1, last_attempt_at: null, last_error: null, activity_id: 'activity-alpha', session_id: 'session-alpha', sailor_id: 'sailor-maxi', sailor_label: 'Maxi', sailor_email: 'maxi@example.test', sailor_consent_status: 'ACTIVE', original_available: true, activity_start_time: null, activity_end_time: null, activity_sample_count: null,
    ...overrides,
  })
  const records = [
    ingestion({ id: 'one', attachment_name: 'Shim training.csv.gz' }),
    ingestion({ id: 'two', status: 'failed', disposition: 'discarded', sender_email: 'juan@example.test', attachment_name: 'other.csv.gz', activity_id: 'activity-bravo', session_id: 'session-bravo', sailor_id: 'sailor-juan', sailor_label: 'Juan Pérez', sailor_email: 'juan.perez@example.test' }),
    ingestion({ id: 'three', status: 'failed', sender_email: 'unknown@example.test', attachment_name: 'unresolved.csv.gz', activity_id: null, session_id: null, sailor_id: null, sailor_label: null, sailor_email: null, sailor_consent_status: null }),
  ]
  const all = { status: 'all' as const, disposition: 'all' as const, sailor: 'all', search: '' }

  it('builds represented Sailor choices and includes unresolved only when applicable', () => {
    expect(ingestionSailorOptions(records)).toEqual([
      { value: 'sailor-juan', label: 'Juan Pérez · juan.perez@example.test' },
      { value: 'sailor-maxi', label: 'Maxi · maxi@example.test' },
      { value: UNRESOLVED_SAILOR_FILTER, label: 'Unknown / unresolved' },
    ])
    expect(ingestionSailorOptions(records.slice(0, 2))).not.toContainEqual(expect.objectContaining({ value: UNRESOLVED_SAILOR_FILTER }))
  })

  it('filters by the resolved Sailor and by unresolved relationships', () => {
    expect(filterAdminIngestions(records, { ...all, sailor: 'sailor-maxi' }).map((item) => item.id)).toEqual(['one'])
    expect(filterAdminIngestions(records, { ...all, sailor: UNRESOLVED_SAILOR_FILTER }).map((item) => item.id)).toEqual(['three'])
  })

  it.each([
    ['attachment name', 'shim', 'one'],
    ['sender email', 'JUAN@EXAMPLE', 'two'],
    ['resolved Sailor name', 'pérez', 'two'],
    ['resolved Sailor email', 'juan.perez@', 'two'],
    ['Activity ID', 'activity-bravo', 'two'],
    ['Session ID', 'session-alpha', 'one'],
  ])('matches operational search by %s', (_field, search, expected) => {
    expect(filterAdminIngestions(records, { ...all, search }).map((item) => item.id)).toEqual([expected])
  })

  it('composes Search, Status, Disposition and Sailor while preserving existing filters', () => {
    expect(filterAdminIngestions(records, { status: 'failed', disposition: 'discarded', sailor: 'sailor-juan', search: 'BRAVO' }).map((item) => item.id)).toEqual(['two'])
    expect(filterAdminIngestions(records, { ...all, status: 'failed' }).map((item) => item.id)).toEqual(['two', 'three'])
    expect(filterAdminIngestions(records, { ...all, disposition: 'discarded' }).map((item) => item.id)).toEqual(['two'])
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
