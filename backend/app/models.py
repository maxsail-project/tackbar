from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class ConsentStatus(str, Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


class ConsentEventType(str, Enum):
    CONSENT_REQUESTED = "consent_requested"
    CONSENT_GRANTED = "consent_granted"
    CONSENT_DECLINED = "consent_declined"
    CONSENT_REVOKED = "consent_revoked"
    CONSENT_CYCLE_STARTED = "consent_cycle_started"


@dataclass
class Activity:
    source: str
    original_filename: str
    device_name: str
    start_time: datetime
    end_time: datetime
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    center_lat: float
    center_lon: float
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float
    samples: list[dict[str, Any]]


@dataclass
class InboundEmail:
    sender_email: str
    subject: str
    attachment_filename: str | None
    attachment_bytes: bytes | None
    provider_message_id: str | None = None
    received_at: datetime | None = None


@dataclass
class IngestionResult:
    sender_email: str
    subject: str
    attachment_filename: str
    activity: Activity


@dataclass
class Sailor:
    id: str
    email: str
    name: str | None
    default_boat_id: str | None
    consent_status: ConsentStatus = ConsentStatus.PENDING
    consent_request_sent_at: datetime | None = None
    consent_granted_at: datetime | None = None
    consent_revoked_at: datetime | None = None


@dataclass(frozen=True)
class ConsentEvent:
    event_type: ConsentEventType
    timestamp: datetime
    source: str
    sailor_id: str
    agreement_version: str | None = None


@dataclass
class Boat:
    id: str
    name: str | None
    sailing_class: str | None
    sail_number: str | None


@dataclass
class StoredActivity:
    id: str
    sailor_id: str
    boat_id: str | None
    source: str
    device_name: str
    original_filename: str
    start_time: datetime
    end_time: datetime
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    center_lat: float | None
    center_lon: float | None
    min_lat: float | None
    max_lat: float | None
    min_lon: float | None
    max_lon: float | None
    sample_count: int
    attachment_sha256: str
    track_file: str | None = None


@dataclass
class Session:
    id: str
    activity_ids: list[str]
    created_at: datetime
    expires_at: datetime
    capability_token: str | None = None
    capability_revoked: bool = False
