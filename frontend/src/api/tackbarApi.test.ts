import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ActivityTrackNotFoundError,
  getActivityTrack,
  getSession,
  getSessions,
  SessionNotFoundError,
  TackBarApiError,
} from './tackbarApi'

const SESSION = {
  id: 'session-1',
  start_time: '2031-06-15T08:00:00Z',
  end_time: '2031-06-15T10:00:00Z',
  activity_count: 2,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TackBar Session API client', () => {
  it('gets Sessions with GET /api/sessions and returns JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([SESSION]), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSessions()).resolves.toEqual([SESSION])
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
      method: 'GET',
    }))
  })

  it('gets one Session by its encoded id and returns JSON', async () => {
    const detail = { ...SESSION, activities: [] }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(detail), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSession('session/id')).resolves.toEqual(detail)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions/session%2Fid',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('distinguishes a missing Session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(getSession('missing')).rejects.toBeInstanceOf(SessionNotFoundError)
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

    await expect(getActivityTrack('activity/id')).resolves.toEqual(track)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/activities/activity%2Fid/track',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('distinguishes a missing Activity track from a missing Session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(getActivityTrack('missing')).rejects.toBeInstanceOf(
      ActivityTrackNotFoundError,
    )
    await expect(getActivityTrack('missing')).rejects.not.toBeInstanceOf(
      SessionNotFoundError,
    )
  })

  it('reports other non-success responses as controlled API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(getSessions()).rejects.toMatchObject({
      name: 'TackBarApiError',
      status: 503,
    })
  })

  it('wraps network failures in a controlled API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network detail')))

    await expect(getSessions()).rejects.toBeInstanceOf(TackBarApiError)
    await expect(getSessions()).rejects.toThrow('Unable to reach TackBar API.')
  })

  it('preserves AbortError cancellation', async () => {
    const abortError = new DOMException('Request aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    await expect(getActivityTrack('activity-1')).rejects.toBe(abortError)
  })
})
