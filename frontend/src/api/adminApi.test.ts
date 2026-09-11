import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AdminApiError,
  listAdminSailors,
  regenerateCapability,
  regeneratePersonalCapability,
  revokePersonalCapability,
  renewSession,
  startNewConsentCycle,
  listAdminIngestions,
  reprocessIngestion,
  discardIngestion,
  restoreIngestion,
} from './adminApi'

afterEach(() => vi.unstubAllGlobals())

describe('Admin API client', () => {
  it('sends the key only in the Admin header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await listAdminSailors('private-admin-key')

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/sailors')
    expect(url).not.toContain('private-admin-key')
    expect(options.headers['X-TackBar-Admin-Key']).toBe('private-admin-key')
  })

  it('distinguishes authorization, unavailable and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 503 })).mockRejectedValueOnce(new TypeError('offline')))

    await expect(listAdminSailors('bad')).rejects.toMatchObject({ status: 401 })
    await expect(listAdminSailors('key')).rejects.toMatchObject({ status: 503 })
    await expect(listAdminSailors('key')).rejects.toEqual(expect.objectContaining<Partial<AdminApiError>>({ status: null }))
  })

  it('sends renewal days as JSON and refetch-compatible mutations use encoded IDs', async () => {
    const session = { id: 'session/id' }
    const fetchMock = vi.fn().mockImplementation(
      () => Promise.resolve(new Response(JSON.stringify(session), { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await renewSession('key', 'session/id', 30)
    await regenerateCapability('key', 'session/id')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/sessions/session%2Fid/renew')
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'POST', body: '{"days":30}' }))
    expect(fetchMock.mock.calls[1][0]).toContain('/capability/regenerate')
  })

  it('starts a new consent cycle through the semantic Admin endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'sailor/id' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await startNewConsentCycle('key', 'sailor/id')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/sailors/sailor%2Fid/consent/new-cycle',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('lists filtered ingestions and sends encoded Admin mutations', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('[]', { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    await listAdminIngestions('key')
    await listAdminIngestions('key', 'failed', 'discarded')
    await reprocessIngestion('key', 'ingestion/id')
    await discardIngestion('key', 'ingestion/id')
    await restoreIngestion('key', 'ingestion/id')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/ingestions?status=all&disposition=all')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/ingestions?status=failed&disposition=discarded')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/admin/ingestions/ingestion%2Fid/reprocess')
    expect(fetchMock.mock.calls[3][0]).toBe('/api/admin/ingestions/ingestion%2Fid/discard')
    expect(fetchMock.mock.calls[4][0]).toBe('/api/admin/ingestions/ingestion%2Fid/restore')
    for (const [, options] of fetchMock.mock.calls.slice(2)) {
      expect(options).toEqual(expect.objectContaining({ method: 'POST' }))
      expect(options.headers['X-TackBar-Admin-Key']).toBe('key')
    }
  })
})


it('regenerates and revokes personal access using protected Sailor endpoints', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"personal_capability_state":"revoked","personal_capability_path":null}')))
  vi.stubGlobal('fetch', fetchMock)
  await regeneratePersonalCapability('admin-key', 'sailor/id')
  const revoked = await revokePersonalCapability('admin-key', 'sailor/id')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/sailors/sailor%2Fid/personal-capability/regenerate')
  expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/sailors/sailor%2Fid/personal-capability/revoke')
  for (const [, options] of fetchMock.mock.calls) {
    expect(options.method).toBe('POST')
    expect(options.headers['X-TackBar-Admin-Key']).toBe('admin-key')
  }
  expect(revoked.personal_capability_state).toBe('revoked')
  expect(revoked.personal_capability_path).toBeNull()
})
