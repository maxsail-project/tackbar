import type { SessionDetail, SessionListItem } from '../types/session'
import type { ActivityTrack } from '../types/track'

export class TackBarApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TackBarApiError'
    this.status = status
  }
}

export class SessionNotFoundError extends TackBarApiError {
  constructor() {
    super('Session not found.', 404)
    this.name = 'SessionNotFoundError'
  }
}

export class ActivityTrackNotFoundError extends TackBarApiError {
  constructor() {
    super('Activity track not found.', 404)
    this.name = 'ActivityTrackNotFoundError'
  }
}

async function requestJson<T>(
  path: string,
  signal?: AbortSignal,
  notFoundError?: () => TackBarApiError,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new TackBarApiError('Unable to reach TackBar API.', null, { cause: error })
  }

  if (!response.ok) {
    if (response.status === 404 && notFoundError) {
      throw notFoundError()
    }
    throw new TackBarApiError('TackBar API request failed.', response.status)
  }

  try {
    return await response.json() as T
  } catch (error) {
    throw new TackBarApiError('TackBar API returned an invalid response.', response.status, {
      cause: error,
    })
  }
}

export function getSessions(signal?: AbortSignal) {
  return requestJson<SessionListItem[]>('/api/sessions', signal)
}

export function getSession(sessionId: string, signal?: AbortSignal) {
  return requestJson<SessionDetail>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    signal,
    () => new SessionNotFoundError(),
  )
}

export function getActivityTrack(activityId: string, signal?: AbortSignal) {
  return requestJson<ActivityTrack>(
    `/api/activities/${encodeURIComponent(activityId)}/track`,
    signal,
    () => new ActivityTrackNotFoundError(),
  )
}
