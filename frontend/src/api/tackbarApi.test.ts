import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptConsentRequest,
  ActivityManeuverAnalyticsNotFoundError,
  ActivityTrackNotFoundError,
  ConsentUnavailableError,
  createTemporarySessionShare,
  getActivityManeuversForAccess,
  getActivityTrackForAccess,
  getConsentRequest,
  getSharedActivityManeuvers,
  getSharedActivityTrack,
  getSharedSession,
  getTemporarySharedSession,
  SessionNotFoundError,
  TackBarApiError,
  TemporaryAccessExpiredError,
  TemporaryAccessNotFoundError,
  TemporaryAccessUnavailableError,
} from './tackbarApi'

const SESSION = {
  start_time: '2031-06-15T08:00:00Z',
  end_time: '2031-06-15T10:00:00Z',
  activities: [],
}

const CONSENT = {
  status: 'ready',
  agreement_version: 'v0.6.5',
  expires_at: '2031-07-16T10:00:00Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TackBar Session API client', () => {
  it('gets one Session by its encoded capability token and returns JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SESSION), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSharedSession('capability/token')).resolves.toEqual(SESSION)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/shared/sessions/capability%2Ftoken',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('distinguishes a missing Session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(getSharedSession('missing')).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('gets an encoded Activity track and preserves canonical nullable sensors', async () => {
    const track = {
      activity_id: 'activity/id',
      samples: [{
        utc: '2031-06-15T08:00:00Z',
        lat: 0.25,
        lon: -30.75,
        cog: null,
        sog: null,
        dist: 0,
        hdg: 42.5,
        heel: null,
        trim: null,
      }],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(track), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSharedActivityTrack('token/value', 'activity/id')).resolves.toEqual(track)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/shared/sessions/token%2Fvalue/activities/activity%2Fid/track',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('distinguishes a missing Activity track from a missing Session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(getSharedActivityTrack('token', 'missing')).rejects.toBeInstanceOf(
      ActivityTrackNotFoundError,
    )
    await expect(getSharedActivityTrack('token', 'missing')).rejects.not.toBeInstanceOf(
      SessionNotFoundError,
    )
  })

  it('gets maneuver analytics through encoded capability and Activity ids', async () => {
    const analytics = {
      activity_id: 'activity/id',
      status: 'available',
      maneuvers: [],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(analytics), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getSharedActivityManeuvers('token/value', 'activity/id'),
    ).resolves.toEqual(analytics)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/shared/sessions/token%2Fvalue/activities/activity%2Fid/maneuvers',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('controls a missing maneuver response independently of track loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(
      getSharedActivityManeuvers('token', 'missing'),
    ).rejects.toBeInstanceOf(ActivityManeuverAnalyticsNotFoundError)
    await expect(
      getSharedActivityManeuvers('token', 'missing'),
    ).rejects.not.toBeInstanceOf(ActivityTrackNotFoundError)
  })

  it('keeps a maneuver server failure local as a controlled API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(
      getSharedActivityManeuvers('token', 'activity'),
    ).rejects.toMatchObject({
      name: 'TackBarApiError',
      status: 503,
    })
  })

  it('reports other non-success responses as controlled API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(getSharedSession('token')).rejects.toMatchObject({
      name: 'TackBarApiError',
      status: 503,
    })
  })

  it('wraps network failures in a controlled API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network detail')))

    await expect(getSharedSession('token')).rejects.toBeInstanceOf(TackBarApiError)
    await expect(getSharedSession('token')).rejects.toThrow('Unable to reach TackBar API.')
  })

  it('preserves AbortError cancellation', async () => {
    const abortError = new DOMException('Request aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    await expect(getSharedActivityTrack('token', 'activity-1')).rejects.toBe(abortError)
  })

  it('creates a temporary share only through the original Session endpoint', async () => {
    const share = {
      path: '/q/temporary-token',
      expires_at: '2031-06-17T08:00:00Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(share), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTemporarySessionShare('original/token')).resolves.toEqual(share)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/shared/sessions/original%2Ftoken/temporary-share',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('uses temporary endpoints for the same Viewer data without the original token', async () => {
    const temporarySession = {
      ...SESSION,
      temporary_access_expires_at: '2031-06-17T08:00:00Z',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(temporarySession), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ activity_id: 'activity', samples: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ activity_id: 'activity', status: 'available', maneuvers: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await getTemporarySharedSession('temporary/token')
    await getActivityTrackForAccess(
      { kind: 'temporary', token: 'temporary/token', expiresAt: temporarySession.temporary_access_expires_at },
      'activity',
    )
    await getActivityManeuversForAccess(
      { kind: 'temporary', token: 'temporary/token', expiresAt: temporarySession.temporary_access_expires_at },
      'activity',
    )

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/temporary/sessions/temporary%2Ftoken',
      '/api/temporary/sessions/temporary%2Ftoken/activities/activity/track',
      '/api/temporary/sessions/temporary%2Ftoken/activities/activity/maneuvers',
    ])
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('original')
  })

  it('distinguishes unknown, expired and invalidated temporary access', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 410 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 })))

    await expect(getTemporarySharedSession('unknown')).rejects.toBeInstanceOf(
      TemporaryAccessNotFoundError,
    )
    await expect(getTemporarySharedSession('expired')).rejects.toBeInstanceOf(
      TemporaryAccessExpiredError,
    )
    await expect(getTemporarySharedSession('invalidated')).rejects.toBeInstanceOf(
      TemporaryAccessUnavailableError,
    )
  })
})

describe('TackBar public consent API client', () => {
  it('gets consent with an encoded token, GET only and AbortSignal support', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CONSENT), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await expect(
      getConsentRequest('consent/token?private', controller.signal),
    ).resolves.toEqual(CONSENT)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/consent/consent%2Ftoken%3Fprivate',
      expect.objectContaining({ method: 'GET', signal: controller.signal }),
    )
  })

  it('accepts consent with one encoded-token POST request', async () => {
    const confirmed = { ...CONSENT, status: 'confirmed' }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(confirmed), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(acceptConsentRequest('consent/token?private')).resolves.toEqual(confirmed)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/consent/consent%2Ftoken%3Fprivate/accept',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('maps unavailable consent to its safe public error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{"detail":"private backend detail"}', { status: 404 }),
    ))

    await expect(getConsentRequest('missing')).rejects.toBeInstanceOf(
      ConsentUnavailableError,
    )
    await expect(acceptConsentRequest('missing')).rejects.toThrow(
      'Consent request unavailable.',
    )
  })

  it('keeps network and server failures generic without exposing backend detail', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('private network detail'))
      .mockResolvedValueOnce(new Response(
        '{"detail":"private persisted detail"}',
        { status: 500 },
      )))

    await expect(getConsentRequest('token')).rejects.toThrow(
      'Unable to reach TackBar API.',
    )
    await expect(getConsentRequest('token')).rejects.toMatchObject({
      message: 'TackBar API request failed.',
      status: 500,
    })
  })
})
