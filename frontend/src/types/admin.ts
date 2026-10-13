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

export type AdminConsentRequestState = 'none' | 'valid' | 'expired' | 'accepted' | 'unusable'

export interface AdminConsentRequest {
  state: AdminConsentRequestState
  agreement_version: string | null
  created_at: string | null
  expires_at: string | null
  automatic_delivery_attempted_at: string | null
  delivery_sent_at: string | null
  delivery_last_error: string | null
}

export interface AdminSailorDetail extends AdminSailor {
  personal_capability_state: 'never_generated' | 'active' | 'revoked' | 'consent_inactive'
  personal_capability_path: string | null
  welcome_email_sent_at: string | null
  welcome_email_last_error: string | null
  consent_request: AdminConsentRequest
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

export interface AdminSessionSummary {
  id: string
  expires_at: string
  total_activity_count: number
  visible_activity_count: number
  sailing_start: string | null
  sailing_end: string | null
  sailor_count: number
}

export interface AdminSessionActivity {
  id: string
  sailor_id: string
  sailor_label: string
  shareable: boolean
}

export interface AdminTemporarySessionShare {
  id: string
  created_at: string
  expires_at: string
  state: 'VALID' | 'EXPIRED' | 'UNAVAILABLE'
  path: string | null
}

export interface AdminSession extends AdminSessionSummary {
  created_at: string
  capability_state: CapabilityState
  capability_path: string | null
  activities: AdminSessionActivity[]
  temporary_shares: {
    active_count: number
    expired_count: number
    unavailable_count: number
    active_share: AdminTemporarySessionShare | null
  }
  consent_active_count: number
  consent_pending_count: number
  consent_revoked_count: number
  diagnostic: Record<string, unknown>
}

export interface AdminIngestion {
  id: string; provider: string; provider_message_id: string; sender_email: string | null
  received_at: string | null; attachment_name: string | null; status: 'processed' | 'failed'
  disposition: 'active' | 'discarded'
  attempts: number; last_attempt_at: string | null; last_error: string | null
  activity_id: string | null; session_id: string | null; original_available: boolean
  sailor_id: string | null
  sailor_label: string | null
  sailor_email: string | null
  sailor_consent_status: 'PENDING' | 'ACTIVE' | 'REVOKED' | null
  activity_start_time: string | null; activity_end_time: string | null; activity_sample_count: number | null
}

export interface AdminSessionResultNotification {
  status: 'eligible' | 'attempted' | 'sent' | 'failed'
  attempted_at: string | null
  sent_at: string | null
  last_error: string | null
}

export interface AdminIngestionDetail extends AdminIngestion {
  activity_created_by_ingestion: boolean | null
  session_result_notification_candidate: boolean | null
  session_result_notification: AdminSessionResultNotification | null
  attachment_sha256: string | null
  diagnostic: Record<string, unknown>
}

export interface AdminActivitySummary {
  id: string
  sailor_id: string
  sailor_label: string
  start_time: string
  end_time: string
  sample_count: number
  session_id: string | null
}

export interface AdminManeuverState {
  artifact_currency: 'current' | 'stale' | 'missing'
  detector_status: 'available' | 'unavailable' | null
  unavailable_reason: 'missing_hdg' | 'insufficient_hdg' | null
  detected_count: number | null
  artifact_algorithm_version: number | null
  current_algorithm_version: number
}

export interface AdminActivity extends AdminActivitySummary {
  boat: { id: string; name: string | null; sailing_class: string | null; sail_number: string | null } | null
  source: string
  device_name: string
  original_filename: string
  attachment_sha256: string
  track_available: boolean
  source_ingestion_id: string | null
  source_ingestion_resolution: 'authoritative' | 'related' | 'none' | 'ambiguous'
  maneuvers: AdminManeuverState
  diagnostic: Record<string, unknown>
}
export interface AdminMailboxReview { discovered_candidates: number; processed: number; skipped_already_processed: number; known_failed: number; failed: number }
