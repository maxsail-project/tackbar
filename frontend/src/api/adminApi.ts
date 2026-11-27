import type { AdminActivity, AdminActivitySummary, AdminIngestion, AdminIngestionDetail, AdminMailboxReview, AdminManeuverState, AdminSailor, AdminSailorDetail, AdminSession, AdminSessionSummary } from '../types/admin'
import type { AttachedCourseSummary, CourseContextV1, CourseGunSuggestion, CourseImportDraft, CourseSessionCandidate, ReviewedCourse } from '../types/course'

export type IngestionStatusFilter = 'all' | AdminIngestion['status']
export type IngestionDispositionFilter = 'all' | 'active' | 'discarded'

export class AdminApiError extends Error {
  readonly status: number | null
  // Controlled backend error detail (FastAPI `detail`), when the body had one.
  readonly detail: unknown

  constructor(status: number | null, options?: ErrorOptions, detail?: unknown) {
    super('Admin API request failed.', options)
    this.name = 'AdminApiError'
    this.status = status
    this.detail = detail
  }
}

async function adminRequest<T>(
  path: string,
  adminKey: string,
  method = 'GET',
  body?: object | File,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        'X-TackBar-Admin-Key': adminKey,
        ...(body ? { 'Content-Type': body instanceof File ? 'application/octet-stream' : 'application/json' } : {}),
      },
      ...(body ? { body: body instanceof File ? body : JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    })
  } catch (error) {
    throw new AdminApiError(null, { cause: error })
  }
  if (!response.ok) throw new AdminApiError(response.status, undefined, await errorDetail(response))
  try {
    return await response.json() as T
  } catch (error) {
    throw new AdminApiError(response.status, { cause: error })
  }
}

async function errorDetail(response: Response): Promise<unknown> {
  try {
    const body = await response.json() as { detail?: unknown }
    return body?.detail
  } catch {
    return undefined
  }
}

export const listAdminSailors = (key: string) =>
  adminRequest<AdminSailor[]>('/api/admin/sailors', key)
export const getAdminSailor = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}`, key)
export const markConsentRequested = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/consent/requested`, key, 'POST')
export const sendConsentRequest = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/consent/request/send`, key, 'POST')
export const confirmConsent = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/consent/confirm`, key, 'POST')
export const revokeConsent = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/consent/revoke`, key, 'POST')
export const startNewConsentCycle = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/consent/new-cycle`, key, 'POST')
export const regeneratePersonalCapability = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/personal-capability/regenerate`, key, 'POST')
export const revokePersonalCapability = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/personal-capability/revoke`, key, 'POST')
export const resendWelcomeEmail = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/welcome-email/resend`, key, 'POST')
export const listAdminSessions = (key: string) =>
  adminRequest<AdminSessionSummary[]>('/api/admin/sessions', key)
export const getAdminSession = (key: string, id: string) =>
  adminRequest<AdminSession>(`/api/admin/sessions/${encodeURIComponent(id)}`, key)
export const enrichSession = (key: string, id: string) =>
  adminRequest<AdminSession>(`/api/admin/sessions/${encodeURIComponent(id)}/enrich`, key, 'POST')
export const regenerateCapability = (key: string, id: string) =>
  adminRequest<AdminSession>(`/api/admin/sessions/${encodeURIComponent(id)}/capability/regenerate`, key, 'POST')
export const revokeCapability = (key: string, id: string) =>
  adminRequest<AdminSession>(`/api/admin/sessions/${encodeURIComponent(id)}/capability/revoke`, key, 'POST')
export const renewSession = (key: string, id: string, days: number) =>
  adminRequest<AdminSession>(`/api/admin/sessions/${encodeURIComponent(id)}/renew`, key, 'POST', { days })
export const listAdminIngestions = (key: string, status: IngestionStatusFilter = 'all', disposition: IngestionDispositionFilter = 'all', signal?: AbortSignal) =>
  adminRequest<AdminIngestion[]>(`/api/admin/ingestions?status=${status}&disposition=${disposition}`, key, 'GET', undefined, signal)
export const getAdminIngestion = (key: string, id: string, signal?: AbortSignal) =>
  adminRequest<AdminIngestionDetail>(`/api/admin/ingestions/${encodeURIComponent(id)}`, key, 'GET', undefined, signal)
export const uploadAdminTrack = (key: string, sailorId: string, file: File) =>
  adminRequest<AdminIngestion>(`/api/admin/ingestions/upload?${new URLSearchParams({ sailor_id: sailorId, filename: file.name })}`, key, 'POST', file)
export const getAdminActivity = (key: string, id: string) =>
  adminRequest<AdminActivity>(`/api/admin/activities/${encodeURIComponent(id)}`, key)
export const listAdminActivities = (key: string) =>
  adminRequest<AdminActivitySummary[]>('/api/admin/activities', key)
export const recalculateAdminActivityManeuvers = (key: string, id: string) =>
  adminRequest<AdminManeuverState>(`/api/admin/activities/${encodeURIComponent(id)}/maneuvers/recalculate`, key, 'POST')
export const reprocessIngestion = (key: string, id: string) => adminRequest<AdminIngestion>(`/api/admin/ingestions/${encodeURIComponent(id)}/reprocess`, key, 'POST')
export const discardIngestion = (key: string, id: string) => adminRequest<AdminIngestion>(`/api/admin/ingestions/${encodeURIComponent(id)}/discard`, key, 'POST')
export const restoreIngestion = (key: string, id: string) => adminRequest<AdminIngestion>(`/api/admin/ingestions/${encodeURIComponent(id)}/restore`, key, 'POST')
export const reviewMailbox = (key: string) => adminRequest<AdminMailboxReview>('/api/admin/ingestions/review-mailbox', key, 'POST')
export const createGeoRacingCourseDraft = (key: string, file: File) =>
  adminRequest<CourseImportDraft>(`/api/admin/course-imports/georacing/draft?${new URLSearchParams({ filename: file.name })}`, key, 'POST', file)
export const validateCourse = (key: string, course: ReviewedCourse) =>
  adminRequest<{ course: CourseContextV1 }>('/api/admin/course-imports/validate', key, 'POST', course)
export const listSessionCourses = (key: string, sessionId: string) =>
  adminRequest<{ courses: AttachedCourseSummary[] }>(`/api/admin/sessions/${encodeURIComponent(sessionId)}/courses`, key)
export const attachSessionCourse = (key: string, sessionId: string, filename: string, course: ReviewedCourse, originalBase64: string) =>
  adminRequest<{ course: CourseContextV1; replaced_course_ids: string[] }>(
    `/api/admin/sessions/${encodeURIComponent(sessionId)}/courses?${new URLSearchParams({ filename })}`,
    key, 'POST', { course, original_base64: originalBase64 })
export const detachSessionCourse = (key: string, sessionId: string, courseId: string) =>
  adminRequest<{ courses: AttachedCourseSummary[] }>(`/api/admin/sessions/${encodeURIComponent(sessionId)}/courses/${encodeURIComponent(courseId)}/detach`, key, 'POST')
export const updateSessionCourseRaceTimes = (key: string, sessionId: string, courseId: string, times: { gun_utc: string | null; end_utc: string | null }) =>
  adminRequest<{ courses: AttachedCourseSummary[] }>(`/api/admin/sessions/${encodeURIComponent(sessionId)}/courses/${encodeURIComponent(courseId)}/race-times`, key, 'PATCH', times)
export const suggestAttachedCourseGun = (key: string, sessionId: string, courseId: string) =>
  adminRequest<{ suggestion: CourseGunSuggestion | null }>(`/api/admin/sessions/${encodeURIComponent(sessionId)}/courses/${encodeURIComponent(courseId)}/gun-suggestion`, key, 'POST')
export const suggestSessionCourseGun = (key: string, sessionId: string, course: ReviewedCourse) =>
  adminRequest<{ suggestion: CourseGunSuggestion | null }>(`/api/admin/sessions/${encodeURIComponent(sessionId)}/courses/gun-suggestion`, key, 'POST', course)
export const findCourseSessionCandidates = (key: string, course: ReviewedCourse) =>
  adminRequest<{ candidates: CourseSessionCandidate[] }>('/api/admin/course-imports/session-candidates', key, 'POST', course)
