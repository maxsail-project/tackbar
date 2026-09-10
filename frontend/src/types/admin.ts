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
  activity_count: number
  session_count: number
  last_sailing_start: string | null
  last_sailing_end: string | null
}

export interface AdminConsentEvent {
  event_type: string
  timestamp: string
  source: string
  agreement_version: string | null
}

export interface AdminSailorDetail extends AdminSailor {
  personal_capability_state: 'never_generated' | 'active' | 'revoked' | 'consent_inactive'
  personal_capability_path: string | null
  consent_events: AdminConsentEvent[]
  sessions: AdminSailorSession[]
}

export interface AdminSailorSession {
  session_id: string
  sailing_start: string | null
  sailing_end: string | null
  sailor_activity_count: number
  expires_at: string
  capability_state: CapabilityState
  capability_path: string | null
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
  sailing_start: string | null
  sailing_end: string | null
  active_sailors: { id: string; label: string }[]
  consent_active_count: number
  consent_pending_count: number
  consent_revoked_count: number
}

export interface AdminIngestion {
  id: string; provider: string; provider_message_id: string; sender_email: string | null
  received_at: string | null; attachment_name: string | null; status: 'processed' | 'failed'
  attempts: number; last_attempt_at: string | null; last_error: string | null
  activity_id: string | null; session_id: string | null; original_available: boolean
  activity_start_time: string | null; activity_end_time: string | null; activity_sample_count: number | null
}
export interface AdminMailboxReview { discovered_candidates: number; processed: number; skipped_already_processed: number; known_failed: number; failed: number }
