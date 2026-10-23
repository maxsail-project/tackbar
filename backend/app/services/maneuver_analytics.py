"""Generate and persist one Activity's derived maneuver analytics."""

import hashlib
from dataclasses import dataclass
from math import isfinite
from typing import Any, Literal

import pandas as pd

from app.analytics.maneuver_detector import detect_maneuvers
from app.analytics.low_maneuver_detector import detect_low_maneuvers, low_unavailable_reason
from app.analytics.maneuver_metrics import calculate_maneuver_metrics
from app.storage.activity_ids import canonical_activity_id
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage
from app.storage.track_storage import TrackStorage


MANEUVER_ALGORITHM_VERSION = 7

_MANEUVER_FIELDS = {
    "start_time",
    "center_time",
    "end_time",
    "heading_change_deg",
    "course_change_deg",
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
_UNAVAILABLE_REASONS = {
    "missing_utc", "invalid_time", "missing_cog", "missing_sog",
    "insufficient_low_evidence", "insufficient_low_speed", "insufficient_low_context",
}


@dataclass(frozen=True)
class ManeuverAnalyticsInspection:
    artifact_currency: Literal["current", "stale", "missing"]
    detector_status: Literal["available", "unavailable"] | None
    detector_mode: Literal["HIGH", "LOW"] | None
    unavailable_reason: str | None
    detected_count: int | None
    artifact_algorithm_version: int | None
    current_algorithm_version: int


def inspect_maneuver_analytics(
    activity_id: str,
    track_storage: TrackStorage,
    analytics_storage: ManeuverAnalyticsStorage,
) -> ManeuverAnalyticsInspection:
    """Inspect persisted analytics without generating or replacing an artifact."""
    activity_id = canonical_activity_id(activity_id)
    if not analytics_storage.artifact_path(activity_id).is_file():
        return _inspection("missing")

    try:
        artifact = analytics_storage.read(activity_id)
    except (OSError, ValueError):
        return _inspection("stale")

    version = artifact.get("algorithm_version")
    artifact_version = (
        version
        if isinstance(version, int) and not isinstance(version, bool)
        else None
    )
    if not _is_valid_artifact(artifact, activity_id):
        return _inspection("stale", artifact_algorithm_version=artifact_version)

    try:
        track_sha256 = _track_sha256(activity_id, track_storage)
    except OSError:
        currency: Literal["current", "stale"] = "stale"
    else:
        currency = (
            "current"
            if _is_current_artifact(artifact, activity_id, track_sha256)
            else "stale"
        )
    status = artifact["status"]
    return _inspection(
        currency,
        detector_status=status,
        detector_mode=artifact["detector_mode"] if status == "available" else None,
        unavailable_reason=artifact.get("reason"),
        detected_count=len(artifact["maneuvers"]),
        artifact_algorithm_version=artifact_version,
    )


def _inspection(
    currency: Literal["current", "stale", "missing"],
    *,
    detector_status: Literal["available", "unavailable"] | None = None,
    detector_mode: Literal["HIGH", "LOW"] | None = None,
    unavailable_reason: str | None = None,
    detected_count: int | None = None,
    artifact_algorithm_version: int | None = None,
) -> ManeuverAnalyticsInspection:
    return ManeuverAnalyticsInspection(
        artifact_currency=currency,
        detector_status=detector_status,
        detector_mode=detector_mode,
        unavailable_reason=unavailable_reason,
        detected_count=detected_count,
        artifact_algorithm_version=artifact_algorithm_version,
        current_algorithm_version=MANEUVER_ALGORITHM_VERSION,
    )


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
    mode = "HIGH" if result.status == "available" else None
    reason = None
    basis = list(result.signal_basis) if mode else []
    maneuvers = result.maneuvers if mode else ()
    if mode is None:
        reason = low_unavailable_reason(track)
        if reason is None:
            mode = "LOW"
            basis = ["cog", "sog"]
            maneuvers = detect_low_maneuvers(track)

    artifact: dict[str, Any] = {
        "activity_id": activity_id,
        "algorithm_version": MANEUVER_ALGORITHM_VERSION,
        "track_sha256": track_sha256,
        "status": "available" if mode else "unavailable",
        "detector_mode": mode,
        "signal_basis": basis,
    }
    if reason is not None:
        artifact["reason"] = reason
    artifact["maneuvers"] = []
    for maneuver in maneuvers:
        if mode == "HIGH":
            serialized = {**maneuver.to_dict(), "course_change_deg": None}
        else:
            serialized = {
                "start_time": maneuver.start_time,
                "center_time": maneuver.center_time,
                "end_time": maneuver.end_time,
                "heading_change_deg": None,
                "course_change_deg": maneuver.cog_change_deg,
                "peak_turn_rate_deg_s": None,
                "peak_turn_rate_time": None,
            }
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
    return _is_valid_artifact(artifact, activity_id)


def _is_valid_artifact(
    artifact: dict[str, Any],
    activity_id: str,
) -> bool:
    status = artifact.get("status")
    expected_fields = {
        "activity_id",
        "algorithm_version",
        "track_sha256",
        "status",
        "maneuvers",
        "detector_mode",
        "signal_basis",
    }
    if status == "unavailable":
        expected_fields.add("reason")
    elif status != "available":
        return False
    if set(artifact) != expected_fields:
        return False
    if artifact.get("activity_id") != activity_id:
        return False
    version = artifact.get("algorithm_version")
    if type(version) is not int or version != MANEUVER_ALGORITHM_VERSION:
        return False
    track_sha256 = artifact.get("track_sha256")
    if not isinstance(track_sha256, str) or len(track_sha256) != 64 or any(c not in "0123456789abcdef" for c in track_sha256):
        return False
    mode, basis = artifact.get("detector_mode"), artifact.get("signal_basis")
    if status == "unavailable" and (
        not isinstance(artifact.get("reason"), str)
        or artifact.get("reason") not in _UNAVAILABLE_REASONS
        or artifact.get("maneuvers") != []
        or mode is not None or basis != []
    ):
        return False
    if status == "available":
        if mode == "LOW":
            if basis != ["cog", "sog"]:
                return False
        elif mode == "HIGH":
            if not isinstance(basis, list) or not basis or basis[0] != "hdg":
                return False
            if any(not isinstance(s, str) or s not in ("hdg", "cog", "heel", "sog") for s in basis):
                return False
            if len(set(basis)) != len(basis):
                return False
        else:
            return False
    maneuvers = artifact.get("maneuvers")
    return isinstance(maneuvers, list) and all(
        _is_valid_maneuver(item, mode) for item in maneuvers
    )


def _is_valid_maneuver(value: object, mode: str) -> bool:
    if not isinstance(value, dict) or set(value) != _MANEUVER_FIELDS:
        return False
    if not all(
        isinstance(value[field], str) and bool(value[field])
        for field in (
            "start_time",
            "center_time",
            "end_time",
        )
    ):
        return False
    try:
        start, center, end = (pd.Timestamp(value[f]) for f in ("start_time", "center_time", "end_time"))
        if any(pd.isna(t) or t.tzinfo is None for t in (start, center, end)) or not start < center < end:
            return False
        if not _is_finite_number(value["duration_s"]) or abs(value["duration_s"] - (end - start).total_seconds()) > 1e-6:
            return False
        if mode == "HIGH":
            peak = pd.Timestamp(value["peak_turn_rate_time"])
            if pd.isna(peak) or peak.tzinfo is None or not start <= peak <= end:
                return False
    except (ValueError, TypeError, OverflowError):
        return False
    if mode == "HIGH":
        if value["course_change_deg"] is not None or not _is_finite_number(value["heading_change_deg"]):
            return False
        if not _is_finite_number(value["peak_turn_rate_deg_s"]) or value["peak_turn_rate_deg_s"] <= 0:
            return False
    elif mode == "LOW":
        if value["heading_change_deg"] is not None or not _is_finite_number(value["course_change_deg"]):
            return False
        if not -180 <= value["course_change_deg"] < 180:
            return False
        if value["peak_turn_rate_deg_s"] is not None or value["peak_turn_rate_time"] is not None:
            return False
    else:
        return False
    return all(
        value[field] is None or _is_finite_number(value[field])
        for field in _OPTIONAL_METRIC_FIELDS
    )


def _is_finite_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and isfinite(value)
    )
