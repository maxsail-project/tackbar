import type { AdminActivity, AdminActivitySummary, AdminIngestion, AdminIngestionDetail, AdminMailboxReview, AdminManeuverState, AdminSailor, AdminSailorDetail, AdminSession, AdminSessionSummary } from '../types/admin'

export type IngestionStatusFilter = 'all' | AdminIngestion['status']
export type IngestionDispositionFilter = 'all' | 'active' | 'discarded'

export class AdminApiError extends Error {
  readonly status: number | null

  constructor(status: number | null, options?: ErrorOptions) {
    super('Admin API request failed.', options)
    this.name = 'AdminApiError'
    this.status = status
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
  if (!response.ok) throw new AdminApiError(response.status)
  try {
    return await response.json() as T
  } catch (error) {
    throw new AdminApiError(response.status, { cause: error })
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
