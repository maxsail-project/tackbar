// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/adminApi'
import type { AdminActivity, AdminSailorDetail, AdminSession } from '../types/admin'
import AdminPage from './AdminPage'

vi.mock('../api/adminApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/adminApi')>(),
  listAdminSailors: vi.fn(), listAdminSessions: vi.fn(), listAdminIngestions: vi.fn(), listAdminActivities: vi.fn(),
  getAdminSailor: vi.fn(), getAdminSession: vi.fn(), getAdminActivity: vi.fn(), getAdminIngestion: vi.fn(),
}))

const activity = {
  id: 'activity-1', sailor_id: 'sailor-1', sailor_label: 'Pilot', boat_id: null, boat: null,
  source: 'gpx', device_name: '', device_label: null, original_filename: 'track.gpx',
  start_time: '2026-09-05T13:00:00Z', end_time: '2026-09-05T14:00:00Z', sample_count: 20,
  attachment_sha256: 'digest', track_available: true, session_id: 'session-1', source_ingestion_id: null,
  source_ingestion_resolution: 'none', related_ingestions: [], technical_track: null, vkx_record_summary: null,
  maneuvers: { artifact_currency: 'current', detector_status: 'available', detector_mode: 'LOW', unavailable_reason: null,
    detected_count: 0, artifact_algorithm_version: 1, current_algorithm_version: 1 }, diagnostic: { version: 'old' },
} as AdminActivity
const sailor = {
  id: 'sailor-1', name: 'Pilot', email: 'pilot@example.test', consent_status: 'ACTIVE', operational_group: 'active',
  activity_count: 1, session_count: 1, last_sailing_start: null, last_sailing_end: null,
  consent_request_sent_at: null, consent_granted_at: null, consent_revoked_at: null, consent_events: [],
  personal_capability_state: 'never_generated', personal_capability_path: null,
  welcome_email_sent_at: null, welcome_email_last_error: null,
  consent_request: { state: 'none', agreement_version: null, created_at: null, expires_at: null,
    automatic_delivery_attempted_at: null, delivery_sent_at: null, delivery_last_error: null },
  sessions: [], owned_boats: [], default_boat_id: null, default_boat_status: 'none', default_boat: null,
  diagnostic: { version: 'old' },
} as AdminSailorDetail
const session = {
  id: 'session-1', created_at: '2026-09-05T14:00:00Z', expires_at: '2027-01-05T14:00:00Z',
  total_activity_count: 1, visible_activity_count: 1, sailor_count: 1, capability_state: 'active', capability_path: '/s/token',
  sailing_start: activity.start_time, sailing_end: activity.end_time, location_label: null, location_country: null,
  activities: [], temporary_shares: { active_count: 0, expired_count: 0, unavailable_count: 0, active_share: null },
  consent_active_count: 1, consent_pending_count: 0, consent_revoked_count: 0,
  location: null, historical_conditions: null, diagnostic: { version: 'old' },
} as AdminSession

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.mocked(api.listAdminSailors).mockResolvedValue([sailor])
  vi.mocked(api.listAdminSessions).mockResolvedValue([session])
  vi.mocked(api.listAdminActivities).mockResolvedValue([activity])
  vi.mocked(api.listAdminIngestions).mockResolvedValue([])
  vi.mocked(api.getAdminSailor).mockResolvedValue(sailor)
  vi.mocked(api.getAdminSession).mockResolvedValue(session)
  vi.mocked(api.getAdminActivity).mockResolvedValue(activity)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks() })

async function click(selector: string) {
  const button = container.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => button!.click())
}
async function enter() {
  await act(async () => root.render(<AdminPage />))
  const input = container.querySelector<HTMLInputElement>('#admin-key')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'test-key')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => container.querySelector<HTMLFormElement>('form')!.requestSubmit())
}
async function tab(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('.admin-tabs button')].find((item) => item.textContent === label)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

describe('Admin entity detail freshness on section return', () => {
  it.each([
    ['Activities', '.admin-activity-summary', '.admin-activity-detail', api.getAdminActivity],
    ['Sailors', '.admin-sailor-summary', '.admin-sailor-detail', api.getAdminSailor],
    ['Sessions', '.admin-session-summary', '.admin-session-detail', api.getAdminSession],
  ] as const)('closes %s on departure and reopens from a fresh API read', async (section, summary, detail, reader) => {
    await enter(); await tab(section); await click(summary)
    expect(container.querySelector(detail)).not.toBeNull()
    await tab('Ingestions'); await tab(section)
    expect(container.querySelector(detail)).toBeNull()
    expect(container.querySelector(summary)?.getAttribute('aria-expanded')).toBe('false')
    await click(summary)
    expect(reader).toHaveBeenCalledTimes(2)
    expect(container.querySelector(detail)).not.toBeNull()
  })

  it('shows changed persisted detail only after reopening and keeps manual Refresh available', async () => {
    await enter(); await tab('Activities'); await click('.admin-activity-summary')
    expect(container.querySelector('.admin-activity-detail')?.textContent).toContain('track.gpx')
    vi.mocked(api.getAdminActivity).mockResolvedValue({ ...activity, original_filename: 'updated.gpx' })
    await tab('Ingestions'); await tab('Activities')
    expect(container.querySelector('.admin-activity-detail')).toBeNull()
    await click('.admin-activity-summary')
    expect(container.querySelector('.admin-activity-detail')?.textContent).toContain('updated.gpx')
    await click('.admin-header button')
    expect(api.getAdminActivity).toHaveBeenCalledTimes(3)
  })

  it('ignores a detail response that arrives after departure', async () => {
    let resolve!: (value: AdminActivity) => void
    vi.mocked(api.getAdminActivity).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    await enter(); await tab('Activities')
    await act(async () => { container.querySelector<HTMLButtonElement>('.admin-activity-summary')!.click() })
    await tab('Sailors')
    await act(async () => resolve(activity))
    await tab('Activities')
    expect(container.querySelector('.admin-activity-detail')).toBeNull()
  })

  it('does not leave a previous detail visible while a fresh read fails', async () => {
    await enter(); await tab('Activities'); await click('.admin-activity-summary')
    vi.mocked(api.getAdminActivity).mockRejectedValueOnce(new api.AdminApiError(404))
    await tab('Ingestions'); await tab('Activities'); await click('.admin-activity-summary')
    expect(container.querySelector('.admin-activity-detail')).toBeNull()
    expect(container.querySelector('.admin-feedback')).not.toBeNull()
  })

  it('clears protected content when a late detail read reports unauthorized access', async () => {
    let reject!: (reason: Error) => void
    vi.mocked(api.getAdminActivity).mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail }))
    await enter(); await tab('Activities')
    await act(async () => { container.querySelector<HTMLButtonElement>('.admin-activity-summary')!.click() })
    await tab('Sailors')
    await act(async () => reject(new api.AdminApiError(401)))
    expect(container.querySelector('#admin-key')).not.toBeNull()
    expect(container.querySelector('.admin-sailor-summary')).toBeNull()
  })

  it('opens a relationship destination and leaves the origin detail closed on return', async () => {
    await enter(); await tab('Activities'); await click('.admin-activity-summary')
    await click('.admin-activity-detail .admin-relation')
    expect(container.querySelector('.admin-sailor-detail')).not.toBeNull()
    await tab('Activities')
    expect(container.querySelector('.admin-activity-detail')).toBeNull()
  })
})
