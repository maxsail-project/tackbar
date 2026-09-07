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


class AdminSailorDetailResponse(AdminSailorResponse):
    consent_events: list[AdminConsentEventResponse]
    sessions: list["AdminSailorSessionResponse"]


class AdminSailorSessionResponse(BaseModel):
    session_id: str
    sailing_start: datetime | None
    sailing_end: datetime | None
    sailor_activity_count: int
    expires_at: datetime
    capability_state: CapabilityState
    capability_path: str | None


class AdminSessionResponse(BaseModel):
    id: str
    created_at: datetime
    expires_at: datetime
    total_activity_count: int
    visible_activity_count: int
    capability_state: CapabilityState
    capability_token: str | None
    capability_path: str | None
    sailing_start: datetime | None
    sailing_end: datetime | None
    active_sailors: list["AdminSessionSailor"]
    consent_active_count: int
    consent_pending_count: int
    consent_revoked_count: int


class AdminSessionSailor(BaseModel):
    id: str
    label: str


class AdminSessionRenewRequest(BaseModel):
    days: StrictInt = 30


class AdminIngestionResponse(BaseModel):
    id: str
    provider: str
    provider_message_id: str
    sender_email: str | None
    received_at: datetime | None
    attachment_name: str | None
    status: Literal["processed", "failed"]
    attempts: int
    last_attempt_at: datetime | None
    last_error: str | None
    activity_id: str | None
    session_id: str | None
    original_available: bool


class AdminMailboxReviewResponse(BaseModel):
    discovered_candidates: int
    processed: int
    skipped_already_processed: int
    known_failed: int
    failed: int
