"""Fail-closed, Admin-only persisted-record diagnostic projections."""

import re
from dataclasses import fields, is_dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from app.models import (
    HistoricalConditions, HistoricalConditionsSample, HistoricalConditionsSource,
    LinePosition, RaceTimerEvent, Sailor, Session, ShiftAngleObservation,
    StoredActivity,
)
from app.services.ingestion_history import ADMIN_UPLOAD


REDACTED = "[REDACTED]"

# Every canonical dataclass field must be classified here. A model addition fails
# closed until its Admin diagnostic exposure is reviewed.
SAFE_FIELDS: dict[type, set[str]] = {
    StoredActivity: {
        "id", "sailor_id", "boat_id", "source", "device_name", "original_filename",
        "start_time", "end_time", "start_lat", "start_lon", "end_lat", "end_lon",
        "center_lat", "center_lon", "min_lat", "max_lat", "min_lon", "max_lon",
        "sample_count", "attachment_sha256", "device_label", "race_timer_events",
        "line_positions", "shift_angle_observations",
    },
    RaceTimerEvent: {"timestamp", "event_type", "timer_value_seconds"},
    LinePosition: {"timestamp", "endpoint_type", "latitude", "longitude"},
    ShiftAngleObservation: {"timestamp", "tack_code", "setting_origin_code", "true_heading_degrees", "average_sog_knots"},
    Sailor: {
        "id", "email", "name", "default_boat_id", "consent_status",
        "consent_request_sent_at", "consent_granted_at", "consent_revoked_at",
        "personal_capability_revoked", "welcome_email_sent_at",
    },
    Session: {
        "id", "activity_ids", "created_at", "expires_at", "capability_revoked",
        "location_label", "location_region", "location_country", "location_country_code",
        "location_provider", "location_resolved_at", "location_source_activity_id",
        "historical_conditions",
    },
    HistoricalConditions: {"coverage_start", "coverage_end", "requested_latitude", "requested_longitude", "weather_source", "marine_source", "hourly"},
    HistoricalConditionsSource: {"provider", "route", "retrieved_at", "grid_latitude", "grid_longitude"},
    HistoricalConditionsSample: {"time", "air_temperature_c", "wind_speed_10m_kn", "wind_direction_10m_deg", "wind_gusts_10m_kn", "cloud_cover_pct", "wave_height_m", "wave_direction_deg", "wave_period_s"},
}
SPECIAL_FIELDS: dict[type, set[str]] = {
    StoredActivity: {"track_file"},
    Sailor: {"personal_capability_token", "welcome_email_last_error"},
    Session: {"capability_token"},
}


def _safe_track_reference(value: str | None, activity_id: str) -> str | None:
    if value is None:
        return None
    return value if value == f"tracks/{activity_id}.csv.gz" else REDACTED


def _safe_original_reference(value: str | None, ingestion_id: str) -> str | None:
    if value is None:
        return None
    prefix = f"originals/ingestions/{ingestion_id}/"
    name = value[len(prefix):] if value.startswith(prefix) else ""
    return value if name not in ("", ".", "..") and re.fullmatch(r"[^/\\:]+", name) else REDACTED


def _json_value(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return persisted_model(value)
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            # Preserve a legacy naive timestamp without inventing a UTC offset.
            return value.isoformat(timespec="milliseconds")
        return value.astimezone(timezone.utc).isoformat(timespec="milliseconds")
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, list):
        return [_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _json_value(item) for key, item in value.items()}
    return value


def persisted_model(record: Any) -> dict[str, Any]:
    model = type(record)
    expected = SAFE_FIELDS[model] | SPECIAL_FIELDS.get(model, set())
    actual = {item.name for item in fields(record)}
    if actual != expected:
        raise ValueError(f"Admin diagnostic classification requires review: {model.__name__}")
    result = {
        item.name: _json_value(getattr(record, item.name))
        for item in fields(record) if item.name in SAFE_FIELDS[model]
    }
    if model is StoredActivity:
        result["track_file"] = _safe_track_reference(record.track_file, record.id)
    elif model is Sailor:
        result["personal_capability_token"] = REDACTED if record.personal_capability_token else None
        result["welcome_email_last_error"] = "Delivery failed" if record.welcome_email_last_error else None
    elif model is Session:
        result["capability_token"] = REDACTED if record.capability_token else None
    return result


INGESTION_FIELDS = {
    "id", "provider", "provider_message_id", "sender_email", "received_at",
    "attachment_name", "attachment_sha256", "original_file", "status",
    "disposition", "attempts", "last_attempt_at", "last_error", "activity_id",
    "session_id",
    "activity_created_by_ingestion", "session_result_notification_candidate",
    "session_result_notification", "pending_onboarding_reservation",
}
INGESTION_MANUAL_FIELDS = INGESTION_FIELDS | {
    "operation_id", "owner_sailor_id", "accepted_at",
}
INGESTION_EMAIL_FIELDS = INGESTION_FIELDS | {"technical_notice_reason", "technical_notice_feedback"}
NOTIFICATION_FIELDS = {"status", "attempted_at", "sent_at", "last_error"}
RESERVATION_FIELDS = {"sailor_id", "consent_cycle_sequence", "activity_id", "session_id"}


def persisted_ingestion(record: dict[str, Any]) -> dict[str, Any]:
    expected = INGESTION_MANUAL_FIELDS if record["provider"] == ADMIN_UPLOAD else INGESTION_EMAIL_FIELDS
    if set(record) != expected:
        raise ValueError("Admin ingestion diagnostic classification requires review")
    result = {key: _json_value(value) for key, value in record.items() if key not in {
        "original_file", "last_error", "session_result_notification", "pending_onboarding_reservation",
    }}
    result["original_file"] = _safe_original_reference(record["original_file"], record["id"])
    result["last_error"] = "Processing failed" if record["last_error"] else None
    notification = record["session_result_notification"]
    if notification is not None:
        if set(notification) != NOTIFICATION_FIELDS:
            raise ValueError("Admin notification diagnostic classification requires review")
        result["session_result_notification"] = {**notification, "last_error": "Delivery failed" if notification["last_error"] else None}
    else:
        result["session_result_notification"] = None
    reservation = record["pending_onboarding_reservation"]
    if reservation is not None and set(reservation) != RESERVATION_FIELDS:
        raise ValueError("Admin onboarding diagnostic classification requires review")
    result["pending_onboarding_reservation"] = reservation
    return result
