export type ConsentOperationalGroup =
  | 'pending_needs_request'
  | 'pending_awaiting_response'
  | 'active'
  | 'revoked'

export type CapabilityState = 'never_generated' | 'active' | 'revoked' | 'expired'

export interface AdminSailor {
  id: string
  email: string
  name: string | null
  consent_status: string
  consent_request_sent_at: string | null
  consent_granted_at: string | null
  consent_revoked_at: string | null
  operational_group: ConsentOperationalGroup
}

export interface AdminConsentEvent {
  event_type: string
  timestamp: string
  source: string
  agreement_version: string | null
}

export interface AdminSailorDetail extends AdminSailor {
  consent_events: AdminConsentEvent[]
}

export interface AdminSession {
  id: string
  created_at: string
  expires_at: string
  total_activity_count: number
  visible_activity_count: number
  capability_state: CapabilityState
  capability_token: string | null
  capability_path: string | null
}

export interface AdminIngestion {
  id: string; provider: string; provider_message_id: string; sender_email: string | null
  received_at: string | null; attachment_name: string | null; status: 'processed' | 'failed'
  attempts: number; last_attempt_at: string | null; last_error: string | null
  activity_id: string | null; session_id: string | null; original_available: boolean
}
