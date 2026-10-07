import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptConsentRequest,
  ActivityManeuverAnalyticsNotFoundError,
  ActivityTrackNotFoundError,
  ConsentUnavailableError,
  getConsentRequest,
  getSharedActivityManeuvers,
  getSharedActivityTrack,
  getSharedSession,
  SessionNotFoundError,
  TackBarApiError,
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
