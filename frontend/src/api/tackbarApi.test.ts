import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ActivityTrackNotFoundError,
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
