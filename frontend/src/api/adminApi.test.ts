import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AdminApiError,
  listAdminSailors,
  regenerateCapability,
  renewSession,
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
})
