export type PublicConsentStatus = 'ready' | 'confirmed'

export interface PublicConsent {
  status: PublicConsentStatus
  agreement_version: string
  expires_at: string
}
