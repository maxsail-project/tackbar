import type { PersonalTackBar } from '../types/personal'
import type { SessionDetail } from '../types/session'
import type { ActivityTrack } from '../types/track'
import type { PublicConsent } from '../types/consent'
import type { ActivityManeuverAnalytics } from '../types/maneuver'

export class TackBarApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TackBarApiError'
    this.status = status
  }
}

export class PersonalTackBarNotFoundError extends TackBarApiError {
  constructor() {
    super('Personal TackBar not found.', 404)
    this.name = 'PersonalTackBarNotFoundError'
  }
}

export class ConsentUnavailableError extends TackBarApiError {
  constructor() {
    super('Consent request unavailable.', 404)
    this.name = 'ConsentUnavailableError'
  }
}

export function getConsentRequest(token: string, signal?: AbortSignal) {
  return requestJson<PublicConsent>(
    `/api/consent/${encodeURIComponent(token)}`,
    signal,
    () => new ConsentUnavailableError(),
  )
}

export function acceptConsentRequest(token: string) {
  return requestJson<PublicConsent>(
    `/api/consent/${encodeURIComponent(token)}/accept`,
    undefined,
    () => new ConsentUnavailableError(),
    'POST',
  )
}

export function getPersonalTackBar(token: string, signal?: AbortSignal) {
  return requestJson<PersonalTackBar>(
    `/api/me/${encodeURIComponent(token)}`,
    signal,
    () => new PersonalTackBarNotFoundError(),
  )
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

export class ActivityManeuverAnalyticsNotFoundError extends TackBarApiError {
  constructor() {
    super('Activity maneuver analytics not found.', 404)
    this.name = 'ActivityManeuverAnalyticsNotFoundError'
  }
}

async function requestJson<T>(
  path: string,
  signal?: AbortSignal,
  notFoundError?: () => TackBarApiError,
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      method,
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

export function getSharedSession(token: string, signal?: AbortSignal) {
  return requestJson<SessionDetail>(
    `/api/shared/sessions/${encodeURIComponent(token)}`,
    signal,
    () => new SessionNotFoundError(),
  )
}

export function getSharedActivityTrack(
  token: string,
  activityId: string,
  signal?: AbortSignal,
) {
  return requestJson<ActivityTrack>(
    `/api/shared/sessions/${encodeURIComponent(token)}/activities/${encodeURIComponent(activityId)}/track`,
    signal,
    () => new ActivityTrackNotFoundError(),
  )
}

export function getSharedActivityManeuvers(
  token: string,
  activityId: string,
  signal?: AbortSignal,
) {
  return requestJson<ActivityManeuverAnalytics>(
    `/api/shared/sessions/${encodeURIComponent(token)}/activities/${encodeURIComponent(activityId)}/maneuvers`,
    signal,
    () => new ActivityManeuverAnalyticsNotFoundError(),
  )
}
