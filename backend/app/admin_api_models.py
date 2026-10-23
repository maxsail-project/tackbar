from datetime import datetime
from typing import Literal

from pydantic import BaseModel, StrictInt


ConsentOperationalGroup = Literal[
    "pending_needs_request",
    "pending_awaiting_response",
    "active",
    "revoked",
]
CapabilityState = Literal["never_generated", "active", "revoked", "expired"]
TemporaryShareState = Literal["VALID", "EXPIRED", "UNAVAILABLE"]
ConsentRequestAdminState = Literal[
    "none",
    "valid",
    "expired",
    "accepted",
    "unusable",
]


class AdminSailorResponse(BaseModel):
    id: str
    email: str
    name: str | None
    consent_status: str
    consent_request_sent_at: datetime | None
    consent_granted_at: datetime | None
    consent_revoked_at: datetime | None
    operational_group: ConsentOperationalGroup
    activity_count: int
    session_count: int
    last_sailing_start: datetime | None
    last_sailing_end: datetime | None


class AdminConsentEventResponse(BaseModel):
    event_type: str
    timestamp: datetime
    source: str
    agreement_version: str | None


class AdminConsentRequestResponse(BaseModel):
    state: ConsentRequestAdminState
    agreement_version: str | None
    created_at: datetime | None
    expires_at: datetime | None
    automatic_delivery_attempted_at: datetime | None
    delivery_sent_at: datetime | None
    delivery_last_error: str | None


class AdminSailorBoatResponse(BaseModel):
    id: str
    name: str | None
    sailing_class: str | None
    sail_number: str | None


class AdminSailorDetailResponse(AdminSailorResponse):
    personal_capability_state: Literal["never_generated", "active", "revoked", "consent_inactive"]
    personal_capability_path: str | None
    welcome_email_sent_at: datetime | None
    welcome_email_last_error: str | None
    consent_request: AdminConsentRequestResponse
    consent_events: list[AdminConsentEventResponse]
    sessions: list["AdminSailorSessionResponse"]
    default_boat: AdminSailorBoatResponse | None
    diagnostic: dict[str, object]


class AdminSailorSessionResponse(BaseModel):
    session_id: str
    sailing_start: datetime | None
    sailing_end: datetime | None
    sailor_activity_count: int
    total_activity_count: int
    expires_at: datetime
    capability_state: CapabilityState
    capability_path: str | None


class AdminSessionSummaryResponse(BaseModel):
    id: str
    expires_at: datetime
    total_activity_count: int
    visible_activity_count: int
    sailing_start: datetime | None
    sailing_end: datetime | None
    sailor_count: int
    location_label: str | None
    location_country: str | None


class AdminSessionLocationResponse(BaseModel):
    label: str | None
    region: str | None
    country: str | None
    country_code: str | None
    provider: str
    resolved_at: datetime
    source_activity_id: str


class AdminHistoricalConditionsSourceResponse(BaseModel):
    provider: str
    route: str
    retrieved_at: datetime
    grid_latitude: float
    grid_longitude: float


class AdminHistoricalConditionsSampleResponse(BaseModel):
    time: datetime
    air_temperature_c: float | None
    wind_speed_10m_kn: float | None
    wind_direction_10m_deg: float | None
    wind_gusts_10m_kn: float | None
    cloud_cover_pct: float | None
    wave_height_m: float | None
    wave_direction_deg: float | None
    wave_period_s: float | None


class AdminHistoricalConditionsResponse(BaseModel):
    coverage_start: datetime
    coverage_end: datetime
    requested_latitude: float
    requested_longitude: float
    weather_source: AdminHistoricalConditionsSourceResponse | None
    marine_source: AdminHistoricalConditionsSourceResponse | None
    hourly: list[AdminHistoricalConditionsSampleResponse]


class AdminSessionActivityResponse(BaseModel):
    id: str
    sailor_id: str
    sailor_label: str
    shareable: bool


class AdminTemporarySessionShareResponse(BaseModel):
    id: str
    created_at: datetime
    expires_at: datetime
    state: TemporaryShareState
    path: str | None


class AdminTemporarySessionShareSummaryResponse(BaseModel):
    active_count: int
    expired_count: int
    unavailable_count: int
    active_share: AdminTemporarySessionShareResponse | None


class AdminSessionResponse(AdminSessionSummaryResponse):
    created_at: datetime
    capability_state: CapabilityState
    capability_path: str | None
    activities: list[AdminSessionActivityResponse]
    temporary_shares: AdminTemporarySessionShareSummaryResponse
    consent_active_count: int
    consent_pending_count: int
    consent_revoked_count: int
    location: AdminSessionLocationResponse | None
    historical_conditions: AdminHistoricalConditionsResponse | None
    diagnostic: dict[str, object]


class AdminSessionRenewRequest(BaseModel):
    days: StrictInt = 90


class AdminIngestionResponse(BaseModel):
    id: str
    provider: str
    provider_message_id: str | None
    sender_email: str | None
    received_at: datetime | None
    attachment_name: str | None
    status: Literal["pending", "processing", "processed", "failed"]
    operation_id: str | None = None
    owner_sailor_id: str | None = None
    accepted_at: datetime | None = None
    disposition: Literal["active", "discarded"]
    attempts: int
    last_attempt_at: datetime | None
    last_error: str | None
    activity_id: str | None
    session_id: str | None
    activity_created_by_ingestion: bool | None
    sailor_id: str | None
    sailor_label: str | None
    sailor_email: str | None
    sailor_consent_status: Literal["PENDING", "ACTIVE", "REVOKED"] | None
    original_available: bool
    activity_start_time: datetime | None
    activity_end_time: datetime | None
    activity_sample_count: int | None


class AdminSessionResultNotificationResponse(BaseModel):
    status: Literal["eligible", "attempted", "sent", "failed"]
    attempted_at: datetime | None
    sent_at: datetime | None
    last_error: str | None


class AdminIngestionDetailResponse(AdminIngestionResponse):
    session_result_notification_candidate: bool | None
    session_result_notification: AdminSessionResultNotificationResponse | None
    attachment_sha256: str | None
    diagnostic: dict[str, object]


class AdminActivityBoatResponse(BaseModel):
    id: str
    name: str | None
    sailing_class: str | None
    sail_number: str | None


class AdminActivitySummaryResponse(BaseModel):
    id: str
    sailor_id: str
    sailor_label: str
    source: str
    device_name: str
    original_filename: str
    start_time: datetime
    end_time: datetime
    sample_count: int
    session_id: str | None


class AdminManeuverStateResponse(BaseModel):
    artifact_currency: Literal["current", "stale", "missing"]
    detector_status: Literal["available", "unavailable"] | None
    unavailable_reason: Literal[
        "missing_utc", "invalid_time", "missing_cog", "missing_sog",
        "insufficient_low_evidence", "insufficient_low_speed", "insufficient_low_context",
    ] | None
    detected_count: int | None
    artifact_algorithm_version: int | None
    current_algorithm_version: int


class AdminActivityRelatedIngestionResponse(BaseModel):
    id: str
    attachment_name: str | None
    received_at: datetime | None


class AdminActivityTechnicalTrackResponse(BaseModel):
    sample_count: int
    duration_seconds: float
    effective_sample_frequency_hz: float | None
    available_channels: list[
        Literal["SOG", "COG", "HDG", "HEEL", "TRIM", "QUATERNION"]
    ]


class AdminActivityResponse(AdminActivitySummaryResponse):
    boat: AdminActivityBoatResponse | None
    source: str
    device_name: str
    original_filename: str
    attachment_sha256: str
    track_available: bool
    source_ingestion_id: str | None
    source_ingestion_resolution: Literal[
        "authoritative", "related", "none", "ambiguous"
    ]
    related_ingestions: list[AdminActivityRelatedIngestionResponse]
    technical_track: AdminActivityTechnicalTrackResponse | None
    maneuvers: AdminManeuverStateResponse
    diagnostic: dict[str, object]


class AdminMailboxReviewResponse(BaseModel):
    discovered_candidates: int
    processed: int
    skipped_already_processed: int
    known_failed: int
    failed: int
