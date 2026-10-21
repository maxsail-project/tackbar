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


class ConsentRequestState(str, Enum):
    VALID = "VALID"
    EXPIRED = "EXPIRED"
    ACCEPTED = "ACCEPTED"
    UNUSABLE = "UNUSABLE"
    NOT_FOUND = "NOT_FOUND"


class TemporarySessionShareState(str, Enum):
    VALID = "VALID"
    EXPIRED = "EXPIRED"
    UNAVAILABLE = "UNAVAILABLE"
    NOT_FOUND = "NOT_FOUND"


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
    personal_capability_token: str | None = None
    personal_capability_revoked: bool = False
    welcome_email_sent_at: datetime | None = None
    welcome_email_last_error: str | None = None


@dataclass(frozen=True)
class ConsentEvent:
    event_type: ConsentEventType
    timestamp: datetime
    source: str
    sailor_id: str
    agreement_version: str | None = None


@dataclass(frozen=True)
class ConsentRequest:
    id: str
    sailor_id: str
    token: str
    agreement_version: str
    consent_cycle_sequence: int
    created_at: datetime
    expires_at: datetime
    automatic_delivery_attempted_at: datetime | None = None
    delivery_sent_at: datetime | None = None
    delivery_last_error: str | None = None
    accepted_at: datetime | None = None
    onboarding_activity_id: str | None = None
    onboarding_session_id: str | None = None


@dataclass(frozen=True)
class ConsentRequestResolution:
    state: ConsentRequestState
    request: ConsentRequest | None = None


@dataclass(frozen=True)
class TemporarySessionShare:
    id: str
    token: str
    session_id: str
    originating_capability_fingerprint: str
    created_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class TemporarySessionShareResolution:
    state: TemporarySessionShareState
    share: TemporarySessionShare | None = None
    session: "Session | None" = None


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


@dataclass(frozen=True)
class HistoricalConditionsSource:
    provider: str
    route: str
    retrieved_at: datetime
    grid_latitude: float
    grid_longitude: float


@dataclass(frozen=True)
class HistoricalConditionsSample:
    time: datetime
    air_temperature_c: float | None = None
    wind_speed_10m_kn: float | None = None
    wind_direction_10m_deg: float | None = None
    wind_gusts_10m_kn: float | None = None
    cloud_cover_pct: float | None = None
    wave_height_m: float | None = None
    wave_direction_deg: float | None = None
    wave_period_s: float | None = None


@dataclass(frozen=True)
class HistoricalConditions:
    coverage_start: datetime
    coverage_end: datetime
    requested_latitude: float
    requested_longitude: float
    weather_source: HistoricalConditionsSource | None
    marine_source: HistoricalConditionsSource | None
    hourly: list[HistoricalConditionsSample]


@dataclass
class Session:
    id: str
    activity_ids: list[str]
    created_at: datetime
    expires_at: datetime
    capability_token: str | None = None
    capability_revoked: bool = False
    location_label: str | None = None
    location_region: str | None = None
    location_country: str | None = None
    location_country_code: str | None = None
    location_provider: str | None = None
    location_resolved_at: datetime | None = None
    location_source_activity_id: str | None = None
    historical_conditions: HistoricalConditions | None = None

    @property
    def has_geographic_context(self) -> bool:
        return any(
            isinstance(value, str) and bool(value.strip())
            for value in (
                self.location_label,
                self.location_region,
                self.location_country,
                self.location_country_code,
            )
        )
