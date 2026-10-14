import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminActivity, AdminIngestion, AdminIngestionDetail, AdminSailorDetail, AdminSession } from '../types/admin'
import { ActivityAdminDetail, ActivityCard, ADMIN_SECTION_ORDER, AdminAccessForm, AdminSearch, adminNavigationTarget, capabilityLabels, confirmConsentRequestSend, confirmNewConsentCycle, ConsentRequestStatus, consentLabels, DEFAULT_ADMIN_SECTION, filterAdminActivities, filterAdminIngestions, filterAdminSailors, filterAdminSessions, IngestionCard, IngestionFilters, ingestionSailorOptions, IngestionOperationalDetail, IngestionSectionHeader, PersonalCapabilityControls, SailorCard, SailorDetail, sailorIdentity, sessionLifetimePresentation, SessionCard, UNRESOLVED_SAILOR_FILTER, WelcomeEmailStatus } from './AdminPage'

const sailor = (group: AdminSailorDetail['operational_group']): AdminSailorDetail => ({
  id: 'sailor-1', email: 'sailor@example.test', name: 'Test Sailor', consent_status: group === 'active' ? 'ACTIVE' : group === 'revoked' ? 'REVOKED' : 'PENDING',
  consent_request_sent_at: '2026-08-20T10:00:00Z', consent_granted_at: null, consent_revoked_at: null,
  operational_group: group, consent_events: [{ event_type: 'consent_requested', timestamp: '2026-08-20T10:00:00Z', source: 'admin', agreement_version: 'v1' }],
  personal_capability_state: 'never_generated', personal_capability_path: null,
  welcome_email_sent_at: null, welcome_email_last_error: null,
  consent_request: { state: 'none', agreement_version: null, created_at: null, expires_at: null, automatic_delivery_attempted_at: null, delivery_sent_at: null, delivery_last_error: null },
  activity_count: 0, session_count: 0, last_sailing_start: null, last_sailing_end: null, sessions: [], default_boat: null, diagnostic: { sailor: { id: 'sailor-1' } },
})
const session = (state: AdminSession['capability_state']): AdminSession => ({
  id: 'session-123', created_at: '2026-08-01T10:00:00Z', expires_at: '2026-09-30T10:00:00Z',
  total_activity_count: 3, visible_activity_count: 1, capability_state: state,
  capability_path: state === 'active' ? '/s/token' : null,
  sailing_start: '2026-08-01T08:00:00Z', sailing_end: '2026-08-01T10:00:00Z', sailor_count: 2,
  activities: [
    { id: 'activity-123456789', sailor_id: 'sailor-1', sailor_label: 'Test Sailor', shareable: true },
    { id: 'activity-987654321', sailor_id: 'sailor-2', sailor_label: 'Pending Sailor', shareable: false },
  ],
  temporary_shares: { active_count: 1, expired_count: 2, unavailable_count: 1, active_share: { id: 'share-1', created_at: '2026-09-18T10:00:00Z', expires_at: '2026-09-19T10:00:00Z', state: 'VALID', path: '/q/temporary-token' } },
  consent_active_count: 1, consent_pending_count: 1, consent_revoked_count: 0,
  diagnostic: { session: { id: 'session-123' }, temporary_shares: [{ id: 'share-1', state: 'VALID' }] },
})
const activity: AdminActivity = { id: 'activity-123456789', sailor_id: 'sailor-123456789', sailor_label: 'Pilot', boat: { id: 'boat-1', name: 'Zafar', sailing_class: 'Snipe', sail_number: 'ESP 1' }, source: 'vakaros', device_name: 'Atlas 2', original_filename: 'pilot.csv.gz', start_time: '2026-09-05T13:49:00Z', end_time: '2026-09-05T17:21:00Z', sample_count: 25453, attachment_sha256: 'abc123', track_available: true, session_id: 'session-123456789', source_ingestion_id: 'ingestion-123456789', source_ingestion_resolution: 'authoritative', related_ingestions: [], technical_track: { sample_count: 25453, duration_seconds: 12720, effective_sample_frequency_hz: 2, available_channels: ['SOG', 'COG', 'HDG', 'HEEL', 'TRIM'] }, maneuvers: { artifact_currency: 'current', detector_status: 'available', unavailable_reason: null, detected_count: 4, artifact_algorithm_version: 6, current_algorithm_version: 6 }, diagnostic: { id: 'activity-123456789' } }
const sourceIngestion: AdminIngestion = { id: 'ingestion-123456789', provider: 'ovh', provider_message_id: 'message-1', sender_email: 'pilot@example.test', received_at: '2026-09-05T17:25:00Z', attachment_name: 'pilot.csv.gz', status: 'processed', disposition: 'active', attempts: 1, last_attempt_at: '2026-09-05T17:26:00Z', last_error: null, activity_id: activity.id, session_id: activity.session_id, sailor_id: activity.sailor_id, sailor_label: activity.sailor_label, sailor_email: 'pilot@example.test', sailor_consent_status: 'ACTIVE', original_available: true, activity_start_time: activity.start_time, activity_end_time: activity.end_time, activity_sample_count: activity.sample_count }

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
    ['ingestion', 'activities', 'ingestions'],
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
    expect(markup).toContain('admin-entity-summary admin-activity-summary')
    expect(markup).toContain('admin-disclosure-affordance is-expanded')
    expect(markup).toContain('aria-current="true"')
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

  it('uses one Search control pattern without making diagnostic IDs the primary prompt', () => {
    const markup = renderToStaticMarkup(<AdminSearch value="pilot" busy={false} placeholder="Name or email" onChange={() => undefined} />)

    expect(markup).toContain('class="admin-search"')
    expect(markup).toContain('type="search"')
    expect(markup).toContain('value="pilot"')
    expect(markup).toContain('placeholder="Name or email"')
  })

  it('uses operational user-facing state labels', () => {
    expect(consentLabels.pending_needs_request).toContain('request needed')
    expect(consentLabels.pending_awaiting_response).toContain('awaiting response')
    expect(consentLabels.active).toBe('Active')
    expect(consentLabels.revoked).toBe('Revoked')
    expect(capabilityLabels.never_generated).toBe('Never generated')
    expect(capabilityLabels.expired).toBe('Expired')
  })

  it('uses the confirmed Sailor identity fallback order', () => {
    expect(sailorIdentity('Maxi', 'maxi@example.test', 'sailor-123456789')).toBe('Maxi')
    expect(sailorIdentity(null, 'maxi@example.test', 'sailor-123456789')).toBe('maxi@example.test')
    expect(sailorIdentity(null, null, 'sailor-123456789')).toBe('sailor-1…')
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

  it('shows safe read-only Consent Request state without rendering tokens or actions', () => {
    const none = renderToStaticMarkup(<ConsentRequestStatus sailor={sailor('pending_needs_request')} />)
    const validRequest = { state: 'valid' as const, agreement_version: 'v0.6.5', created_at: '2031-06-18T10:00:00Z', expires_at: '2031-07-16T10:00:00Z', automatic_delivery_attempted_at: '2031-06-18T10:01:00Z', delivery_sent_at: '2031-06-18T10:02:00Z', delivery_last_error: null }
    const requestWithUnexpectedToken = { ...validRequest, token: 'secret-consent-token' } as AdminSailorDetail['consent_request']
    const valid = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('pending_awaiting_response'), consent_request: requestWithUnexpectedToken }} />)
    const expired = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('pending_awaiting_response'), consent_request: { state: 'expired', agreement_version: 'v0.6.5', created_at: '2031-05-01T10:00:00Z', expires_at: '2031-05-29T10:00:00Z', automatic_delivery_attempted_at: null, delivery_sent_at: null, delivery_last_error: 'Consent request delivery failed' } }} />)
    const accepted = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('pending_awaiting_response'), consent_request: { ...sailor('pending_awaiting_response').consent_request, state: 'accepted' } }} />)

    expect(none).toContain('Not issued')
    expect(none).not.toContain('<button')
    expect(valid).toContain('Status:</strong> Sent')
    expect(valid).toContain('Agreement:</strong> v0.6.5')
    expect(valid).toContain('Automatic attempt:')
    expect(valid).toContain('Last delivery:')
    expect(valid).not.toContain('<button')
    expect(expired).toContain('Status:</strong> Expired')
    expect(expired).toContain('Consent request delivery failed')
    expect(expired).not.toContain('<button')
    expect(accepted).toContain('Status:</strong> Accepted')
    expect(accepted).not.toContain('<button')
    for (const markup of [none, valid, expired, accepted]) {
      expect(markup).not.toContain('secret-consent-token')
    }
  })

  it('keeps Consent read-only for every Sailor state', () => {
    const request = { state: 'valid' as const, agreement_version: 'v0.6.5', created_at: '2031-06-18T10:00:00Z', expires_at: '2031-07-16T10:00:00Z', automatic_delivery_attempted_at: null, delivery_sent_at: null, delivery_last_error: null }
    const active = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('active'), consent_request: request }} />)
    const revoked = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('revoked'), consent_request: request }} />)
    const pending = renderToStaticMarkup(<ConsentRequestStatus sailor={{ ...sailor('pending_awaiting_response'), consent_request: request }} />)

    expect(active).not.toContain('Resend consent request')
    expect(revoked).not.toContain('Resend consent request')
    expect(pending).not.toContain('<button')
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
    const notSent = renderToStaticMarkup(<WelcomeEmailStatus sailor={sailor('active')} />)
    const sent = renderToStaticMarkup(<WelcomeEmailStatus sailor={{ ...sailor('active'), welcome_email_sent_at: '2031-06-18T12:00:00Z' }} />)
    const failed = renderToStaticMarkup(<WelcomeEmailStatus sailor={{ ...sailor('active'), welcome_email_sent_at: '2031-06-18T12:00:00Z', welcome_email_last_error: 'Welcome email delivery failed' }} />)
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

  it('only offers welcome resend in Maintenance for ACTIVE Sailors with usable Personal TackBar access', () => {
    const actions = { onRequested: () => undefined, onConsentRequestSend: () => undefined, onConfirm: () => undefined, onRevoke: () => undefined, onNewCycle: () => undefined, onPersonalRegenerate: () => undefined, onPersonalRevoke: () => undefined, onWelcomeEmailResend: () => undefined }
    const eligible = renderToStaticMarkup(<SailorDetail sailor={{ ...sailor('active'), personal_capability_state: 'active', personal_capability_path: '/me/personal-token' }} busy={false} {...actions} />)

    expect(eligible).toContain('Resend welcome email')
    for (const unavailable of [
      { ...sailor('pending_needs_request'), consent_status: 'PENDING', personal_capability_state: 'active' as const, personal_capability_path: '/me/personal-token' },
      { ...sailor('revoked'), consent_status: 'REVOKED', personal_capability_state: 'active' as const, personal_capability_path: '/me/personal-token' },
      sailor('active'),
      { ...sailor('active'), personal_capability_state: 'revoked' as const, personal_capability_path: null },
      { ...sailor('active'), personal_capability_state: 'consent_inactive' as const, personal_capability_path: null },
    ]) {
      expect(renderToStaticMarkup(<SailorDetail sailor={unavailable} busy={false} {...actions} />)).not.toContain('Resend welcome email')
    }
    const busy = renderToStaticMarkup(<SailorDetail sailor={{ ...sailor('active'), personal_capability_state: 'active', personal_capability_path: '/me/personal-token' }} busy {...actions} />)
    expect(busy).toContain('Resending welcome email…')
    expect(busy).toContain('disabled=""')
  })

  it('keeps the Session summary compact and expands the ordered operational detail', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const callbacks = { busy: false, onSelect: () => undefined, onRegenerate: () => undefined, onRevoke: () => undefined, onRenew: () => undefined }
    const detail = session('active')
    const collapsed = renderToStaticMarkup(<SessionCard session={detail} {...callbacks} />)
    const markup = renderToStaticMarkup(<SessionCard session={detail} detail={detail} {...callbacks} />)

    expect(collapsed).toContain('aria-expanded="false"')
    expect(collapsed).toContain('admin-entity-summary admin-session-summary')
    expect(collapsed).toContain('admin-disclosure-affordance')
    expect(collapsed).toContain('3 Activities · 1 shareable now · 2 Sailors')
    expect(collapsed).not.toContain('Session ID')
    expect(collapsed).not.toContain('Created')
    expect(collapsed).not.toContain('Shared access')
    expect(markup).toContain('>ACTIVE<')
    expect(markup).toContain('Expires')
    expect(markup).toContain('12 days remaining')
    expect(markup).toContain('Session access')
    expect(markup).toContain('Temporary QR access')
    expect(markup).not.toContain('Shared access')
    expect(markup).toContain('Technical Activities')
    expect(markup).toContain('Shareable now')
    expect(markup).toContain('Copy link')
    expect(markup).toContain('Open session')
    expect(markup).not.toContain('Open shared Session')
    expect(markup).toContain('Sets expiry to days from now')
    expect(markup).toContain('value="90"')
    expect(markup).toContain('<h4>Technical traceability</h4>')
    expect(markup).toContain('<dt>Activity IDs</dt><dd>activity-123456789 · activity-987654321</dd>')
    expect(markup).toContain('<dt>Sailor IDs</dt><dd>sailor-1 · sailor-2</dd>')
    const sectionLabels = ['Membership / traceability', 'Session access', 'Temporary QR access', 'Lifetime', 'Maintenance', '>Advanced<', '>Diagnostic JSON<']
    for (let index = 1; index < sectionLabels.length; index += 1) {
      expect(markup.indexOf(sectionLabels[index - 1])).toBeLessThan(markup.indexOf(sectionLabels[index]))
    }
  })

  it('shows temporary-share counts and only expands the currently active share', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const detail = session('active')
    const markup = renderToStaticMarkup(<SessionCard session={detail} detail={detail} busy={false} onSelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).toContain('Temporary QR access:</strong> Active 1 · Expired 2 · Unavailable 1')
    expect(markup).toContain('aria-label="Session access"')
    expect(markup).toContain('aria-label="Temporary QR access"')
    expect(markup).not.toContain('Temporary Session')
    expect(markup).toContain('Active temporary share')
    expect(markup).toContain('22 h 0 min remaining')
    expect(markup).toContain('>VALID<')
    expect(markup).toContain('href="/q/temporary-token"')
    expect(markup).toContain('Copy temporary link')
    expect(markup).toContain('Open temporary share')
    expect(markup).not.toContain('originating_capability_fingerprint')
    expect(markup).not.toContain('/s/token&quot;')
  })

  it('keeps Sailor Session history as owning-section relations without nested Session detail or runtime access', () => {
    const detail: AdminSailorDetail = {
      ...sailor('active'),
      sessions: [{
        session_id: 'session-123', sailing_start: '2026-08-01T08:00:00Z', sailing_end: '2026-08-01T10:00:00Z',
        sailor_activity_count: 1, total_activity_count: 3, expires_at: '2026-09-30T10:00:00Z', capability_state: 'active', capability_path: '/s/token',
      }, {
        session_id: 'session-456', sailing_start: '2026-08-02T08:00:00Z', sailing_end: '2026-08-02T10:00:00Z',
        sailor_activity_count: 2, total_activity_count: 4, expires_at: '2026-10-30T10:00:00Z', capability_state: 'expired', capability_path: null,
      }],
    }
    const markup = renderToStaticMarkup(<SailorDetail sailor={detail} busy={false} onSessionSelect={() => undefined} onRequested={() => undefined} onConsentRequestSend={() => undefined} onConfirm={() => undefined} onRevoke={() => undefined} onNewCycle={() => undefined} onPersonalRegenerate={() => undefined} onPersonalRevoke={() => undefined} onWelcomeEmailResend={() => undefined} />)

    expect(markup).toContain('>Traceability</h3>')
    expect(markup).toContain('>Session</span>')
    const traceability = markup.slice(markup.indexOf('>Traceability</h3>'), markup.indexOf('>Communication</h3>'))
    expect(traceability).not.toContain('session-123')
    expect(markup).toContain('3 Activities')
    expect(markup).toContain('4 Activities')
    expect(markup).not.toContain(' · 1 Activity</strong>')
    expect(markup).not.toContain(' · 2 Activities</strong>')
    expect(markup).not.toContain('admin-sailor-session')
    expect(markup).not.toContain('Session access')
    expect(markup).not.toContain('href="/s/token"')
    expect(markup).not.toContain('Open session')
    expect(markup).not.toContain('capability')
    expect(markup).toContain('<h4>Technical traceability</h4>')
    expect(markup).toContain('<dt>Session IDs</dt><dd>session-123 · session-456</dd>')
  })

  it('uses the same total-Activity Session identity across Admin traceability sections', () => {
    const relatedSession = {
      ...session('active'),
      id: activity.session_id!,
      sailing_start: activity.start_time,
      sailing_end: activity.end_time,
    }
    const ingestionDetail: AdminIngestionDetail = {
      ...sourceIngestion,
      activity_created_by_ingestion: true,
      session_result_notification_candidate: false,
      session_result_notification: null,
      attachment_sha256: activity.attachment_sha256,
      diagnostic: { id: sourceIngestion.id },
    }
    const sailorDetail: AdminSailorDetail = {
      ...sailor('active'),
      sessions: [{
        session_id: relatedSession.id,
        sailing_start: relatedSession.sailing_start,
        sailing_end: relatedSession.sailing_end,
        sailor_activity_count: 1,
        total_activity_count: relatedSession.total_activity_count,
        expires_at: relatedSession.expires_at,
        capability_state: relatedSession.capability_state,
        capability_path: relatedSession.capability_path,
      }],
    }
    const ingestionMarkup = renderToStaticMarkup(<IngestionOperationalDetail ingestion={ingestionDetail} session={relatedSession} busy={false} onFollow={() => undefined} />)
    const activityMarkup = renderToStaticMarkup(<ActivityAdminDetail activity={activity} session={relatedSession} sourceIngestion={sourceIngestion} onFollow={() => undefined} />)
    const sailorMarkup = renderToStaticMarkup(<SailorDetail sailor={sailorDetail} busy={false} onSessionSelect={() => undefined} onRequested={() => undefined} onConsentRequestSend={() => undefined} onConfirm={() => undefined} onRevoke={() => undefined} onNewCycle={() => undefined} onPersonalRegenerate={() => undefined} onPersonalRevoke={() => undefined} onWelcomeEmailResend={() => undefined} />)
    const sessionIdentity = (markup: string) => markup.match(/<span>Session<\/span><strong>([^<]+)<\/strong>/)?.[1]

    const expected = sessionIdentity(ingestionMarkup)
    expect(expected).toContain('2026')
    expect(expected).toContain('3 Activities')
    expect(sessionIdentity(activityMarkup)).toBe(expected)
    expect(sessionIdentity(sailorMarkup)).toBe(expected)
    expect(expected).not.toContain(relatedSession.id)
  })

  it('keeps Sailor Session history links unavailable when consent or capability conditions do not permit them', () => {
    const unavailable: AdminSailorDetail = {
      ...sailor('pending_needs_request'),
      sessions: [{
        session_id: 'session-123', sailing_start: '2026-08-01T08:00:00Z', sailing_end: '2026-08-01T10:00:00Z',
        sailor_activity_count: 1, total_activity_count: 3, expires_at: '2026-09-30T10:00:00Z', capability_state: 'active', capability_path: '/s/token',
      }],
    }
    const markup = renderToStaticMarkup(<SailorDetail sailor={unavailable} busy={false} onRequested={() => undefined} onConsentRequestSend={() => undefined} onConfirm={() => undefined} onRevoke={() => undefined} onNewCycle={() => undefined} onPersonalRegenerate={() => undefined} onPersonalRevoke={() => undefined} onWelcomeEmailResend={() => undefined} />)

    expect(markup).toContain('>Session</span>')
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
    const revokedSession = session('revoked')
    const expiredSession = { ...session('active'), expires_at: '2026-09-01T10:00:00Z' }
    const revoked = renderToStaticMarkup(<SessionCard session={revokedSession} detail={revokedSession} busy={false} onSelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)
    const expired = renderToStaticMarkup(<SessionCard session={expiredSession} detail={expiredSession} busy={false} onSelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(revoked).toContain('>ACTIVE<')
    expect(revoked).toContain('Session access')
    expect(revoked).toContain('Original capability:</strong> Revoked')
    expect(expired).toContain('>EXPIRED<')
    expect(expired).toContain('Expired')
    expect(expired).toContain('Original capability:</strong> Active')
    expect(expired).toContain('Renew')
  })

  it('marks a cross-navigation Session selection and exposes related Sailors without nesting Sailor detail', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const detail = session('active')
    const markup = renderToStaticMarkup(<SessionCard session={detail} detail={detail} busy={false} onSelect={() => undefined} onSailorSelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).toContain('aria-current="true"')
    expect(markup).toContain('admin-entity-card admin-session-card is-expanded is-selected')
    expect(markup).toContain('<span>Sailor</span><strong>Test Sailor</strong><span aria-hidden="true">›</span>')
    expect(markup).not.toContain('Personal TackBar')
    expect(markup).not.toContain('Consent request')
  })

  it('exposes Activity relationships from Sailor and Session without nesting Activity detail', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const callbacks = { onRequested: () => undefined, onConsentRequestSend: () => undefined, onConfirm: () => undefined, onRevoke: () => undefined, onNewCycle: () => undefined, onPersonalRegenerate: () => undefined, onPersonalRevoke: () => undefined, onWelcomeEmailResend: () => undefined }
    const sailorMarkup = renderToStaticMarkup(<SailorDetail sailor={sailor('active')} activities={[activity]} busy={false} onActivitySelect={() => undefined} {...callbacks} />)
    const detail = session('active')
    const sessionMarkup = renderToStaticMarkup(<SessionCard session={detail} detail={detail} activities={[activity]} busy={false} onSelect={() => undefined} onActivitySelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(sailorMarkup).toContain('>Activity</span>')
    expect(sessionMarkup).toContain('Membership / traceability')
    expect(sessionMarkup).toContain('<span>Activity</span><strong>')
    expect(sessionMarkup).toMatch(/<span>Activity<\/span><strong>[^<]*2026[^<]*<\/strong>/)
    for (const markup of [sailorMarkup, sessionMarkup]) {
      expect(markup).not.toContain('Recalculate maneuvers')
      expect(markup).not.toContain('Read-only JSON')
    }
  })

  it('renders compact Sailor rows and one ordered expanded information architecture', () => {
    const detail = {
      ...sailor('active'),
      default_boat: { id: 'boat-1', name: 'Zafar', sailing_class: 'Snipe', sail_number: 'ESP 1' },
      consent_events: [
        { event_type: 'consent_granted', timestamp: '2026-08-21T10:00:00Z', source: 'admin', agreement_version: 'v1' },
        { event_type: 'consent_requested', timestamp: '2026-08-20T10:00:00Z', source: 'automatic', agreement_version: 'v1' },
      ],
    }
    const actions = { onRequested: () => undefined, onConsentRequestSend: () => undefined, onConfirm: () => undefined, onRevoke: () => undefined, onNewCycle: () => undefined, onPersonalRegenerate: () => undefined, onPersonalRevoke: () => undefined, onWelcomeEmailResend: () => undefined }
    const collapsed = renderToStaticMarkup(<SailorCard sailor={detail} detail={null} activities={[]} busy={false} onSelect={() => undefined} {...actions} />)
    const markup = renderToStaticMarkup(<SailorCard sailor={detail} detail={detail} activities={[activity]} busy={false} onSelect={() => undefined} {...actions} />)

    expect(collapsed).toContain('admin-sailor-summary')
    expect(collapsed).toContain('admin-entity-summary')
    expect(collapsed).toContain('admin-disclosure-affordance')
    expect(collapsed).toContain('aria-expanded="false"')
    expect(collapsed).not.toContain('Current state')
    expect(markup).toContain('aria-current="true"')
    for (const label of ['Current state', 'Consent', 'Consent timeline', 'Personal TackBar', 'Traceability', 'Communication', 'Maintenance', '>Advanced<', '>Diagnostic JSON<']) expect(markup).toContain(label)
    expect(markup.indexOf('Current state')).toBeLessThan(markup.indexOf('<h3>Consent</h3>'))
    expect(markup.indexOf('Consent timeline')).toBeLessThan(markup.indexOf('aria-label="Personal TackBar"'))
    expect(markup.indexOf('>Traceability</h3>')).toBeLessThan(markup.indexOf('>Communication</h3>'))
    expect(markup.indexOf('>Communication</h3>')).toBeLessThan(markup.indexOf('>Maintenance</h3>'))
    expect(markup.indexOf('<summary>Advanced</summary>')).toBeLessThan(markup.indexOf('<summary>Diagnostic JSON</summary>'))
    expect(markup).toContain('Zafar · Snipe · ESP 1')
    expect(markup).toContain('<ul class="event-list">')
    expect(markup).not.toContain('<ol class="event-list">')
    expect(markup.indexOf('consent granted')).toBeLessThan(markup.indexOf('consent requested'))
    expect(markup).toContain('<h4>Technical traceability</h4>')
    expect(markup).toContain('<dt>Sailor ID</dt><dd>sailor-1</dd>')
    expect(markup).toContain('<dt>Default Boat ID</dt><dd>boat-1</dd>')
    expect(markup).toContain(`<dt>Activity IDs</dt><dd>${activity.id}</dd>`)
  })

  it('hides active link actions while a mutation or refresh is pending', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const detail = session('active')
    const markup = renderToStaticMarkup(<SessionCard session={detail} detail={detail} busy onSelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).not.toContain('Copy link')
    expect(markup).not.toContain('Open session')
  })

  it.each(['expired', 'revoked', 'never_generated'] as const)('does not expose a usable link for %s capability', (state) => {
    vi.stubGlobal('window', { location: { origin: 'https://tackbar.test' } })
    const detail = session(state)
    const markup = renderToStaticMarkup(<SessionCard session={detail} detail={detail} busy={false} onSelect={() => undefined} onRegenerate={() => undefined} onRevoke={() => undefined} onRenew={() => undefined} />)

    expect(markup).not.toContain('Copy link')
    expect(markup).not.toContain('Open session')
  })

  it('keeps ingestion rows compact and makes the whole summary the open control', () => {
    const base: AdminIngestion = { id: 'ing-1', provider: 'gmail', provider_message_id: 'message-1', sender_email: 'sailor@example.test', received_at: null, attachment_name: 'track.csv.gz', status: 'failed', disposition: 'active', attempts: 2, last_attempt_at: '2026-08-28T12:00:00Z', last_error: 'Invalid attachment', activity_id: null, session_id: null, sailor_id: null, sailor_label: null, sailor_email: null, sailor_consent_status: null, original_available: true, activity_start_time: null, activity_end_time: null, activity_sample_count: null }
    const actions = { onSelect: () => undefined, onFollow: () => undefined, onReprocess: () => undefined, onDiscard: () => undefined, onRestore: () => undefined }
    const failed = renderToStaticMarkup(<IngestionCard ingestion={base} busy={false} {...actions} />)
    const processed = renderToStaticMarkup(<IngestionCard ingestion={{ ...base, status: 'processed', last_error: null, activity_id: 'activity-123456789', session_id: 'session-123456789', disposition: 'discarded' }} busy={false} {...actions} />)
    expect(failed).toContain('aria-expanded="false"'); expect(failed).toContain('Failed'); expect(failed).toContain('track.csv.gz'); expect(failed).toContain('sailor@example.test'); expect(failed).not.toContain('Invalid attachment'); expect(failed).not.toContain('Received'); expect(failed).not.toContain('Attempts'); expect(failed).not.toContain('Reprocess')
    expect(failed).toContain('admin-entity-summary admin-ingestion-summary')
    expect(failed).toContain('admin-disclosure-affordance')
    expect(processed).toContain('Processed'); expect(processed).toContain('Discarded'); expect(processed).not.toContain('Activity activity…'); expect(processed).not.toContain('Session session-…'); expect(processed).not.toContain('Restore'); expect(processed).not.toContain('Read-only JSON')
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

  it('groups expanded ingestion operations, traceability, outbound notification and diagnostics', () => {
    const detail: AdminIngestionDetail = {
      id: 'ingestion-123456789', provider: 'ovh', provider_message_id: 'provider-message-77', sender_email: 'sailor@example.test', received_at: '2026-09-07T16:13:00Z', attachment_name: 'pilot.csv.gz', status: 'processed', disposition: 'active', attempts: 2, last_attempt_at: '2026-09-10T10:32:00Z', last_error: null, activity_id: 'activity-123456789', session_id: 'session-123456789', sailor_id: 'sailor-123456789', sailor_label: 'Pilot', sailor_email: 'pilot@example.test', sailor_consent_status: 'ACTIVE', original_available: true, activity_start_time: '2026-09-05T13:49:00Z', activity_end_time: '2026-09-05T17:21:00Z', activity_sample_count: 25453,
      activity_created_by_ingestion: false, session_result_notification_candidate: true, session_result_notification: { status: 'sent', attempted_at: '2026-09-10T10:33:00Z', sent_at: '2026-09-10T10:33:01Z', last_error: null }, attachment_sha256: 'abc123', diagnostic: { id: 'ingestion-123456789', status: 'processed' },
    }
    const relatedSession = { ...session('active'), id: detail.session_id! }
    const markup = renderToStaticMarkup(<IngestionOperationalDetail ingestion={detail} session={relatedSession} busy={false} onFollow={() => undefined} onReprocess={() => undefined} onDiscard={() => undefined} onRestore={() => undefined} />)

    for (const heading of ['Sailing', 'Source', 'Traceability', 'Processing', 'Outbound notification', 'Maintenance', 'Advanced details', 'Read-only JSON']) expect(markup).toContain(heading)
    expect(markup).not.toContain('Outbound result')
    expect(markup).toContain('Reused existing Activity')
    expect(markup).toContain('Sent')
    expect(markup).toContain('Outbound notification delivery does not change the technical Ingestion result.')
    expect(markup).toContain('Pilot')
    expect(markup).toMatch(/<span>Activity<\/span><strong>[^<]*2026[^<]*<\/strong>/)
    expect(markup).toContain('3 Activities')
    expect(markup).not.toContain('>activity…</strong>')
    expect(markup).not.toContain('>session-…</strong>')
    expect(markup).toContain('<h4>Technical traceability</h4>')
    expect(markup).toContain('<dt>Sailor ID</dt><dd>sailor-123456789</dd>')
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
    const relatedSession = { ...session('active'), id: activity.session_id! }
    const markup = renderToStaticMarkup(<ActivityAdminDetail activity={activity} session={relatedSession} sourceIngestion={sourceIngestion} onFollow={() => undefined} />)
    const source = markup.slice(markup.indexOf('<h3>Source</h3>'), markup.indexOf('<h3>Traceability</h3>'))
    const traceability = markup.slice(markup.indexOf('<h3>Traceability</h3>'), markup.indexOf('<h3>Maneuvers</h3>'))

    expect(traceability).toContain('Sailor'); expect(traceability).toContain('Pilot'); expect(traceability).toContain('Boat'); expect(traceability).toContain('Zafar · Snipe · ESP 1'); expect(traceability).toContain('Session'); expect(traceability).toContain('<button class="admin-relation" type="button"><span>Source Ingestion</span>')
    expect(traceability).toContain('3 Activities')
    expect(traceability).toContain('pilot.csv.gz')
    expect(traceability).not.toContain('>session-…</strong>')
    expect(traceability).not.toContain('>ingestio…</strong>')
    expect(source).toContain('Provider/source'); expect(source).toContain('Device'); expect(source).toContain('Original filename'); expect(source).not.toContain('Source Ingestion')
    expect(markup).toContain('Track'); expect(markup).toContain('Maneuvers'); expect(markup).toContain('CURRENT'); expect(markup).toContain('>4</dd>'); expect(markup).toContain('Recalculate maneuvers'); expect(markup).toContain('<summary>Advanced</summary>'); expect(markup).toContain('<summary>Diagnostic JSON</summary>')
    expect(markup.indexOf('<h3>Track</h3>')).toBeLessThan(markup.indexOf('<h3>Source</h3>')); expect(markup.indexOf('<h3>Source</h3>')).toBeLessThan(markup.indexOf('<h3>Traceability</h3>')); expect(markup.indexOf('<h3>Traceability</h3>')).toBeLessThan(markup.indexOf('<h3>Maneuvers</h3>')); expect(markup.indexOf('<h3>Maneuvers</h3>')).toBeLessThan(markup.indexOf('<summary>Advanced</summary>')); expect(markup.indexOf('<summary>Advanced</summary>')).toBeLessThan(markup.indexOf('<summary>Diagnostic JSON</summary>'))
    expect(markup).toContain('<h4>Technical traceability</h4>')
    expect(markup).toContain('<h4>Technical track</h4>')
    expect(markup).toContain('<dt>Sample count</dt>')
    expect(markup).toMatch(/<dt>Duration<\/dt><dd>12[,.]720 s<\/dd>/)
    expect(markup).toContain('<dt>Effective sample frequency</dt><dd>2 Hz</dd>')
    expect(markup).toContain('<dt>Available telemetry channels</dt><dd>SOG · COG · HDG · HEEL · TRIM</dd>')
    for (const id of [activity.id, activity.sailor_id, activity.session_id, activity.source_ingestion_id]) expect(markup).toContain(`<dd>${id}</dd>`)
    expect(markup).not.toContain('Map'); expect(markup).not.toContain('Metrics')
  })

  it('shows an absent source Ingestion as unavailable without a navigation control', () => {
    const markup = renderToStaticMarkup(<ActivityAdminDetail activity={{ ...activity, source_ingestion_id: null, source_ingestion_resolution: 'none' }} onFollow={() => undefined} />)
    const traceability = markup.slice(markup.indexOf('<h3>Traceability</h3>'), markup.indexOf('<h3>Maneuvers</h3>'))

    expect(traceability).toContain('<span>Source Ingestion</span><strong>Unavailable</strong>')
    expect(traceability).not.toContain('<button class="admin-relation" type="button"><span>Source Ingestion</span>')
  })

  it('keeps a single related non-authoritative Ingestion navigable without promoting its provenance', () => {
    const markup = renderToStaticMarkup(<ActivityAdminDetail activity={{ ...activity, source_ingestion_resolution: 'related' }} sourceIngestion={sourceIngestion} onFollow={() => undefined} />)
    const traceability = markup.slice(markup.indexOf('<h3>Traceability</h3>'), markup.indexOf('<h3>Maneuvers</h3>'))
    const advanced = markup.slice(markup.indexOf('<summary>Advanced</summary>'), markup.indexOf('<summary>Diagnostic JSON</summary>'))

    expect(traceability).toContain('<button class="admin-relation" type="button"><span>Source Ingestion</span>')
    expect(traceability).toContain('pilot.csv.gz')
    expect(advanced).toContain(`<dt>Source Ingestion ID</dt><dd>${sourceIngestion.id}</dd>`)
    expect(advanced).not.toContain('Related Ingestions')
    expect(markup).not.toContain('AMBIGUOUS')
  })

  it('shows ambiguous related Ingestions without guessing a navigation target', () => {
    const candidates = [
      { id: 'ingestion-candidate-one', attachment_name: 'track-12-09.csv.gz', received_at: '2026-09-12T17:25:00Z' },
      { id: 'ingestion-candidate-two', attachment_name: 'track-copy.csv.gz', received_at: '2026-09-13T17:25:00Z' },
    ]
    const markup = renderToStaticMarkup(<ActivityAdminDetail activity={{ ...activity, source_ingestion_id: null, source_ingestion_resolution: 'ambiguous', related_ingestions: candidates }} onFollow={() => undefined} />)
    const traceability = markup.slice(markup.indexOf('<h3>Traceability</h3>'), markup.indexOf('<h3>Maneuvers</h3>'))
    const advanced = markup.slice(markup.indexOf('<summary>Advanced</summary>'), markup.indexOf('<summary>Diagnostic JSON</summary>'))

    expect(traceability).toContain('<span>Source Ingestion</span><strong>Ambiguous · multiple related Ingestions</strong>')
    expect(traceability).not.toContain('<button class="admin-relation" type="button"><span>Source Ingestion</span>')
    expect(traceability).not.toContain('ingestion-candidate')
    expect(advanced).toContain('<dt>Source Ingestion</dt><dd>AMBIGUOUS</dd>')
    expect(advanced).toContain('Related Ingestions')
    for (const candidate of candidates) {
      expect(advanced).toContain(candidate.attachment_name)
      expect(advanced).toContain(candidate.id)
    }
    expect(advanced).toContain('2026')
    expect(advanced).not.toContain('<button')
    expect(advanced).not.toContain('Source Ingestion ID')
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
    ['Ingestion ID', 'two', 'two'],
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

describe('shared Admin entity search', () => {
  const secondActivity = {
    ...activity,
    id: 'activity-second',
    sailor_id: 'sailor-2',
    sailor_label: 'Leandro Alonso',
    session_id: 'session-july',
    source: 'garmin',
    device_name: 'Quatix',
    original_filename: 'leandro-track.fit',
  }

  it.each([
    ['Sailor identity', 'pilot', activity.id],
    ['Session ID', 'session-july', secondActivity.id],
    ['Activity ID', 'activity-second', secondActivity.id],
    ['source', 'GARMIN', secondActivity.id],
    ['device', 'quatix', secondActivity.id],
    ['original filename', 'leandro-track', secondActivity.id],
  ])('filters Activities by %s', (_field, search, expected) => {
    expect(filterAdminActivities([activity, secondActivity], search).map((item) => item.id)).toEqual([expected])
  })

  it('filters Sailors by name, email and diagnostic ID', () => {
    const sailors = [sailor('active'), { ...sailor('revoked'), id: 'sailor-leandro', name: 'Leandro Alonso', email: 'lea@example.test' }]

    expect(filterAdminSailors(sailors, 'leandro').map((item) => item.id)).toEqual(['sailor-leandro'])
    expect(filterAdminSailors(sailors, 'LEA@').map((item) => item.id)).toEqual(['sailor-leandro'])
    expect(filterAdminSailors(sailors, 'sailor-1').map((item) => item.id)).toEqual(['sailor-1'])
  })

  it.each(['Sep 2026', 'September 2026', 'Sep', 'September'])('matches useful Session date context for %s', (search) => {
    const september = { ...session('active'), id: 'session-september', sailing_start: '2026-09-16T11:45:00Z', sailing_end: '2026-09-16T16:11:00Z' }
    expect(filterAdminSessions([september], [], search).map((item) => item.id)).toEqual(['session-september'])
  })

  it('filters Sessions by ID and represented Sailor or Activity identity', () => {
    const september = { ...session('active'), id: 'session-september', sailing_start: '2026-09-16T11:45:00Z', sailing_end: '2026-09-16T16:11:00Z' }
    const member = { ...activity, session_id: september.id }

    expect(filterAdminSessions([september], [member], 'session-sept').map((item) => item.id)).toEqual([september.id])
    expect(filterAdminSessions([september], [member], 'Pilot').map((item) => item.id)).toEqual([september.id])
    expect(filterAdminSessions([september], [member], 'activity-123').map((item) => item.id)).toEqual([september.id])
  })
})


describe('Admin Personal TackBar controls', () => {
  it('offers only usable Copy/Open actions outside Maintenance', () => {
    const detail: AdminSailorDetail = { ...sailor('active'), personal_capability_state: 'active', personal_capability_path: '/me/personal-token' }
    const markup = renderToStaticMarkup(<PersonalCapabilityControls sailor={detail} busy={false} />)
    expect(markup).toContain('Personal TackBar')
    expect(markup).toContain('Active')
    expect(markup).toContain('Copy link')
    expect(markup).toContain('Open Personal TackBar')
    expect(markup).not.toContain('Regenerate')
    expect(markup).not.toContain('Revoke')
    expect(markup).not.toContain('>Generate<')
    expect(markup).toContain('href="/me/personal-token"')
    const busy = renderToStaticMarkup(<PersonalCapabilityControls sailor={detail} busy />)
    expect(busy.match(/disabled=""/g)).toHaveLength(1)
  })

  it.each(['revoked', 'never_generated', 'consent_inactive'] as const)('does not offer Copy link when %s', (state) => {
    const detail: AdminSailorDetail = { ...sailor('active'), personal_capability_state: state, personal_capability_path: null }
    const markup = renderToStaticMarkup(<PersonalCapabilityControls sailor={detail} busy={false} />)
    expect(markup).not.toContain('Copy link')
    expect(markup).not.toContain('Open Personal TackBar')
    expect(markup).toContain(state === 'revoked' ? 'Revoked' : state === 'never_generated' ? 'Never generated' : 'consent inactive')
  })
})
