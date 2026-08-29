import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminSailorDetail, AdminSession } from '../types/admin'
import { AdminAccessForm, capabilityLabels, confirmNewConsentCycle, consentLabels, SailorDetail, SessionCard } from './AdminPage'

const sailor = (group: AdminSailorDetail['operational_group']): AdminSailorDetail => ({
  id: 'sailor-1', email: 'sailor@example.test', name: 'Test Sailor', consent_status: group === 'active' ? 'ACTIVE' : 'PENDING',
  consent_request_sent_at: '2026-08-20T10:00:00Z', consent_granted_at: null, consent_revoked_at: null,
  operational_group: group, consent_events: [{ event_type: 'consent_requested', timestamp: '2026-08-20T10:00:00Z', source: 'admin', agreement_version: 'v1' }],
})
const session = (state: AdminSession['capability_state']): AdminSession => ({
  id: 'session-123', created_at: '2026-08-01T10:00:00Z', expires_at: '2026-09-30T10:00:00Z',
  total_activity_count: 3, visible_activity_count: 1, capability_state: state,
  capability_token: state === 'active' ? 'token' : null, capability_path: state === 'active' ? '/s/token' : null,
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
    const callbacks = { busy: false, onRequested: () => undefined, onConfirm: () => undefined, onRevoke: () => undefined, onNewCycle: () => undefined }
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
})
