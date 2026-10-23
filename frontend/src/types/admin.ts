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
  default_boat: {
    id: string
    name: string | null
    sailing_class: string | null
    sail_number: string | null
  } | null
  diagnostic: Record<string, unknown>
}

export interface AdminSailorSession {
  session_id: string
  sailing_start: string | null
  sailing_end: string | null
  sailor_activity_count: number
  total_activity_count: number
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
  location_label: string | null
  location_country: string | null
}

export interface AdminHistoricalConditionsSource {
  provider: string
  route: string
  retrieved_at: string
  grid_latitude: number
  grid_longitude: number
}

export interface AdminHistoricalConditionsSample {
  time: string
  air_temperature_c: number | null
  wind_speed_10m_kn: number | null
  wind_direction_10m_deg: number | null
  wind_gusts_10m_kn: number | null
  cloud_cover_pct: number | null
  wave_height_m: number | null
  wave_direction_deg: number | null
  wave_period_s: number | null
}

export interface AdminHistoricalConditions {
  coverage_start: string
  coverage_end: string
  requested_latitude: number
  requested_longitude: number
  weather_source: AdminHistoricalConditionsSource | null
  marine_source: AdminHistoricalConditionsSource | null
  hourly: AdminHistoricalConditionsSample[]
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
  location: {
    label: string | null
    region: string | null
    country: string | null
    country_code: string | null
    provider: string
    resolved_at: string
    source_activity_id: string
  } | null
  historical_conditions: AdminHistoricalConditions | null
  diagnostic: Record<string, unknown>
}

export interface AdminIngestion {
  id: string; provider: string; provider_message_id: string | null; sender_email: string | null
  received_at: string | null; attachment_name: string | null; status: 'pending' | 'processing' | 'processed' | 'failed'
  operation_id?: string | null
  owner_sailor_id?: string | null
  accepted_at?: string | null
  disposition: 'active' | 'discarded'
  attempts: number; last_attempt_at: string | null; last_error: string | null
  activity_id: string | null; session_id: string | null; original_available: boolean
  activity_created_by_ingestion: boolean | null
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
  session_result_notification_candidate: boolean | null
  session_result_notification: AdminSessionResultNotification | null
  attachment_sha256: string | null
  diagnostic: Record<string, unknown>
}

export interface AdminActivitySummary {
  id: string
  sailor_id: string
  sailor_label: string
  source: string
  device_name: string
  original_filename: string
  start_time: string
  end_time: string
  sample_count: number
  session_id: string | null
}

export interface AdminManeuverState {
  artifact_currency: 'current' | 'stale' | 'missing'
  detector_status: 'available' | 'unavailable' | null
  detector_mode: 'HIGH' | 'LOW' | null
  unavailable_reason: 'missing_utc' | 'invalid_time' | 'missing_cog' | 'missing_sog'
    | 'insufficient_low_evidence' | 'insufficient_low_speed' | 'insufficient_low_context' | null
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
  related_ingestions: Array<{
    id: string
    attachment_name: string | null
    received_at: string | null
  }>
  technical_track: {
    sample_count: number
    duration_seconds: number
    effective_sample_frequency_hz: number | null
    available_channels: Array<'SOG' | 'COG' | 'HDG' | 'HEEL' | 'TRIM' | 'QUATERNION'>
  } | null
  maneuvers: AdminManeuverState
  diagnostic: Record<string, unknown>
}
export interface AdminMailboxReview { discovered_candidates: number; processed: number; skipped_already_processed: number; known_failed: number; failed: number }
