"""Generate and persist one Activity's derived maneuver analytics."""

import hashlib
from math import isfinite
from typing import Any

from app.analytics.maneuver_detector import detect_maneuvers
from app.analytics.maneuver_metrics import calculate_maneuver_metrics
from app.storage.activity_ids import canonical_activity_id
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage
from app.storage.track_storage import TrackStorage


MANEUVER_ALGORITHM_VERSION = 6

_MANEUVER_FIELDS = {
    "start_time",
    "center_time",
    "end_time",
    "heading_change_deg",
    "peak_turn_rate_deg_s",
    "peak_turn_rate_time",
    "duration_s",
    "sog_entry_kn",
    "sog_min_kn",
    "sog_exit_kn",
    "recovery_time_s",
    "speed_loss_distance_m",
    "speed_loss_time_s",
}
_OPTIONAL_METRIC_FIELDS = {
    "sog_entry_kn",
    "sog_min_kn",
    "sog_exit_kn",
    "recovery_time_s",
    "speed_loss_distance_m",
    "speed_loss_time_s",
}
_UNAVAILABLE_REASONS = {"missing_hdg", "insufficient_hdg"}


def get_or_generate_maneuver_analytics(
    activity_id: str,
    track_storage: TrackStorage,
    analytics_storage: ManeuverAnalyticsStorage,
) -> dict[str, Any]:
    activity_id = canonical_activity_id(activity_id)
    track_sha256 = _track_sha256(activity_id, track_storage)

    try:
        artifact = analytics_storage.read(activity_id)
    except (FileNotFoundError, ValueError):
        artifact = None

    if artifact is not None and _is_current_artifact(
        artifact,
        activity_id,
        track_sha256,
    ):
        return artifact

    return _generate_maneuver_analytics(
        activity_id,
        track_sha256,
        track_storage,
        analytics_storage,
    )


def generate_maneuver_analytics(
    activity_id: str,
    track_storage: TrackStorage,
    analytics_storage: ManeuverAnalyticsStorage,
) -> dict[str, Any]:
    activity_id = canonical_activity_id(activity_id)
    track_sha256 = _track_sha256(activity_id, track_storage)
    return _generate_maneuver_analytics(
        activity_id,
        track_sha256,
        track_storage,
        analytics_storage,
    )


def _generate_maneuver_analytics(
    activity_id: str,
    track_sha256: str,
    track_storage: TrackStorage,
    analytics_storage: ManeuverAnalyticsStorage,
) -> dict[str, Any]:
    track = track_storage.read_normalized_track(activity_id)
    result = detect_maneuvers(track)

    artifact: dict[str, Any] = {
        "activity_id": activity_id,
        "algorithm_version": MANEUVER_ALGORITHM_VERSION,
        "track_sha256": track_sha256,
        "status": result.status,
    }
    if result.reason is not None:
        artifact["reason"] = result.reason
    artifact["maneuvers"] = []
    for maneuver in result.maneuvers:
        serialized = maneuver.to_dict()
        serialized.update(calculate_maneuver_metrics(track, maneuver).to_dict())
        artifact["maneuvers"].append(serialized)
    analytics_storage.write(activity_id, artifact)
    return artifact


def _track_sha256(activity_id: str, track_storage: TrackStorage) -> str:
    return hashlib.sha256(
        track_storage.track_path(activity_id).read_bytes()
    ).hexdigest()


def _is_current_artifact(
    artifact: dict[str, Any],
    activity_id: str,
    track_sha256: str,
) -> bool:
    if artifact.get("algorithm_version") != MANEUVER_ALGORITHM_VERSION:
        return False
    if artifact.get("track_sha256") != track_sha256:
        return False
    status = artifact.get("status")
    expected_fields = {
        "activity_id",
        "algorithm_version",
        "track_sha256",
        "status",
        "maneuvers",
    }
    if status == "unavailable":
        expected_fields.add("reason")
    elif status != "available":
        return False
    if set(artifact) != expected_fields:
        return False
    if artifact.get("activity_id") != activity_id:
        return False
    if status == "unavailable" and (
        artifact.get("reason") not in _UNAVAILABLE_REASONS
        or artifact.get("maneuvers") != []
    ):
        return False
    maneuvers = artifact.get("maneuvers")
    return isinstance(maneuvers, list) and all(
        _is_valid_maneuver(item) for item in maneuvers
    )


def _is_valid_maneuver(value: object) -> bool:
    if not isinstance(value, dict) or set(value) != _MANEUVER_FIELDS:
        return False
    if not all(
        isinstance(value[field], str) and bool(value[field])
        for field in (
            "start_time",
            "center_time",
            "end_time",
            "peak_turn_rate_time",
        )
    ):
        return False
    return all(
        _is_finite_number(value[field])
        for field in (
            "heading_change_deg",
            "peak_turn_rate_deg_s",
            "duration_s",
        )
    ) and all(
        value[field] is None or _is_finite_number(value[field])
        for field in _OPTIONAL_METRIC_FIELDS
    )


def _is_finite_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and isfinite(value)
    )
