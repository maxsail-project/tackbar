import type { AdminSailor, AdminSailorDetail, AdminSession } from '../types/admin'

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
  body?: object,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        'X-TackBar-Admin-Key': adminKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
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
export const confirmConsent = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/consent/confirm`, key, 'POST')
export const revokeConsent = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/consent/revoke`, key, 'POST')
export const startNewConsentCycle = (key: string, id: string) =>
  adminRequest<AdminSailorDetail>(`/api/admin/sailors/${encodeURIComponent(id)}/consent/new-cycle`, key, 'POST')
export const listAdminSessions = (key: string) =>
  adminRequest<AdminSession[]>('/api/admin/sessions', key)
export const regenerateCapability = (key: string, id: string) =>
  adminRequest<AdminSession>(`/api/admin/sessions/${encodeURIComponent(id)}/capability/regenerate`, key, 'POST')
export const revokeCapability = (key: string, id: string) =>
  adminRequest<AdminSession>(`/api/admin/sessions/${encodeURIComponent(id)}/capability/revoke`, key, 'POST')
export const renewSession = (key: string, id: string, days: number) =>
  adminRequest<AdminSession>(`/api/admin/sessions/${encodeURIComponent(id)}/renew`, key, 'POST', { days })
