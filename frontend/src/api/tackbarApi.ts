import type { PersonalActivity, PersonalActivityPatch, PersonalBoat, PersonalBoatInput, PersonalDefaultBoat, PersonalProfile, PersonalTackBar } from '../types/personal'
import type {
  SessionAccess,
  SharedSessionDetail,
  TemporarySessionDetail,
  TemporarySessionShare,
} from '../types/session'
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

export class BoatClassConfirmationRequiredError extends TackBarApiError {
  readonly submittedClass: string
  readonly suggestedClass: string

  constructor(submittedClass: string, suggestedClass: string) {
    super('Boat Class confirmation required.', 409)
    this.name = 'BoatClassConfirmationRequiredError'
    this.submittedClass = submittedClass
    this.suggestedClass = suggestedClass
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

export function updatePersonalProfile(token: string, name: string | null, signal?: AbortSignal) {
  return requestJson<PersonalProfile>(`/api/me/${encodeURIComponent(token)}/profile`, signal,
    () => new PersonalTackBarNotFoundError(), 'PATCH', undefined, { name })
}

export function getPersonalActivities(token: string, signal?: AbortSignal) {
  return requestJson<PersonalActivity[]>(`/api/me/${encodeURIComponent(token)}/activities`, signal, () => new PersonalTackBarNotFoundError())
}

export function getPersonalBoats(token: string, signal?: AbortSignal) {
  return requestJson<PersonalBoat[]>(`/api/me/${encodeURIComponent(token)}/boats`, signal, () => new PersonalTackBarNotFoundError())
}

export function getPersonalBoatClasses(token: string, signal?: AbortSignal) {
  return requestJson<string[]>(`/api/me/${encodeURIComponent(token)}/boat-classes`, signal, () => new PersonalTackBarNotFoundError())
}

export function createPersonalBoat(token: string, input: PersonalBoatInput, signal?: AbortSignal) {
  return requestJson<PersonalBoat>(`/api/me/${encodeURIComponent(token)}/boats`, signal,
    () => new PersonalTackBarNotFoundError(), 'POST', undefined, input, boatClassConflict)
}

export function updatePersonalBoat(token: string, boatId: string, input: PersonalBoatInput, signal?: AbortSignal) {
  return requestJson<PersonalBoat>(`/api/me/${encodeURIComponent(token)}/boats/${encodeURIComponent(boatId)}`, signal,
    () => new PersonalTackBarNotFoundError(), 'PATCH', undefined, input, boatClassConflict)
}

export function getPersonalDefaultBoat(token: string, signal?: AbortSignal) {
  return requestJson<PersonalDefaultBoat>(`/api/me/${encodeURIComponent(token)}/default-boat`, signal,
    () => new PersonalTackBarNotFoundError())
}

export function updatePersonalDefaultBoat(token: string, defaultBoatId: string | null, signal?: AbortSignal) {
  return requestJson<PersonalDefaultBoat>(`/api/me/${encodeURIComponent(token)}/default-boat`, signal,
    () => new PersonalTackBarNotFoundError(), 'PATCH', undefined, { default_boat_id: defaultBoatId })
}

async function boatClassConflict(response: Response): Promise<TackBarApiError | null> {
  if (response.status !== 409) return null
  try {
    const payload: unknown = await response.json()
    if (typeof payload !== 'object' || payload === null || !('detail' in payload)) return null
    const detail = payload.detail
    if (typeof detail !== 'object' || detail === null || !('code' in detail)
        || !('submitted_class' in detail) || !('suggested_class' in detail)) return null
    if (detail.code !== 'class_confirmation_required'
        || typeof detail.submitted_class !== 'string' || !detail.submitted_class
        || typeof detail.suggested_class !== 'string' || !detail.suggested_class) return null
    return new BoatClassConfirmationRequiredError(detail.submitted_class, detail.suggested_class)
  } catch {
    return null
  }
}

export function updatePersonalActivity(token: string, activityId: string, patch: PersonalActivityPatch, signal?: AbortSignal) {
  return requestJson<PersonalActivity>(
    `/api/me/${encodeURIComponent(token)}/activities/${encodeURIComponent(activityId)}`,
    signal, () => new PersonalTackBarNotFoundError(), 'PATCH', undefined, patch,
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

export class TemporaryAccessNotFoundError extends TackBarApiError {
  constructor() {
    super('Temporary access not found.', 404)
    this.name = 'TemporaryAccessNotFoundError'
  }
}

export class TemporaryAccessExpiredError extends TackBarApiError {
  constructor() {
    super('Temporary access expired.', 410)
    this.name = 'TemporaryAccessExpiredError'
  }
}

export class TemporaryAccessUnavailableError extends TackBarApiError {
  constructor() {
    super('Temporary access no longer available.', 403)
    this.name = 'TemporaryAccessUnavailableError'
  }
}

async function requestJson<T>(
  path: string,
  signal?: AbortSignal,
  notFoundError?: () => TackBarApiError,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  statusError?: (status: number) => TackBarApiError | null,
  body?: object,
  responseError?: (response: Response) => Promise<TackBarApiError | null>,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new TackBarApiError('Unable to reach TackBar API.', null, { cause: error })
  }

  if (!response.ok) {
    const parsedError = await responseError?.(response)
    if (parsedError) throw parsedError
    const mappedError = statusError?.(response.status)
    if (mappedError) throw mappedError
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
  return requestJson<SharedSessionDetail>(
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

export function createTemporarySessionShare(token: string) {
  return requestJson<TemporarySessionShare>(
    `/api/shared/sessions/${encodeURIComponent(token)}/temporary-share`,
    undefined,
    () => new SessionNotFoundError(),
    'POST',
  )
}

function temporaryAccessError(status: number) {
  if (status === 404) return new TemporaryAccessNotFoundError()
  if (status === 410) return new TemporaryAccessExpiredError()
  if (status === 403) return new TemporaryAccessUnavailableError()
  return null
}

export function getTemporarySharedSession(token: string, signal?: AbortSignal) {
  return requestJson<TemporarySessionDetail>(
    `/api/temporary/sessions/${encodeURIComponent(token)}`,
    signal,
    undefined,
    'GET',
    temporaryAccessError,
  )
}

export function getSessionForAccess(access: SessionAccess, signal?: AbortSignal) {
  return access.kind === 'original'
    ? getSharedSession(access.token, signal)
    : getTemporarySharedSession(access.token, signal)
}

export function getActivityTrackForAccess(
  access: SessionAccess,
  activityId: string,
  signal?: AbortSignal,
) {
  if (access.kind === 'original') {
    return getSharedActivityTrack(access.token, activityId, signal)
  }
  return requestJson<ActivityTrack>(
    `/api/temporary/sessions/${encodeURIComponent(access.token)}/activities/${encodeURIComponent(activityId)}/track`,
    signal,
    () => new ActivityTrackNotFoundError(),
    'GET',
    (status) => status === 403 || status === 410
      ? temporaryAccessError(status)
      : null,
  )
}

export function getActivityManeuversForAccess(
  access: SessionAccess,
  activityId: string,
  signal?: AbortSignal,
) {
  if (access.kind === 'original') {
    return getSharedActivityManeuvers(access.token, activityId, signal)
  }
  return requestJson<ActivityManeuverAnalytics>(
    `/api/temporary/sessions/${encodeURIComponent(access.token)}/activities/${encodeURIComponent(activityId)}/maneuvers`,
    signal,
    () => new ActivityManeuverAnalyticsNotFoundError(),
    'GET',
    (status) => status === 403 || status === 410
      ? temporaryAccessError(status)
      : null,
  )
}
