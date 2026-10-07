"""Generate and persist one Activity's derived maneuver analytics."""

import hashlib
from typing import Any

from app.analytics.maneuver_detector import detect_maneuvers
from app.storage.activity_ids import canonical_activity_id
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage
from app.storage.track_storage import TrackStorage


MANEUVER_ALGORITHM_VERSION = 1


def generate_maneuver_analytics(
    activity_id: str,
    track_storage: TrackStorage,
    analytics_storage: ManeuverAnalyticsStorage,
) -> dict[str, Any]:
    activity_id = canonical_activity_id(activity_id)
    track_path = track_storage.track_path(activity_id)
    track_bytes = track_path.read_bytes()
    track_sha256 = hashlib.sha256(track_bytes).hexdigest()
    result = detect_maneuvers(
        track_storage.read_normalized_track(activity_id)
    )

    artifact: dict[str, Any] = {
        "activity_id": activity_id,
        "algorithm_version": MANEUVER_ALGORITHM_VERSION,
        "track_sha256": track_sha256,
        "status": result.status,
    }
    if result.reason is not None:
        artifact["reason"] = result.reason
    artifact["maneuvers"] = [
        maneuver.to_dict() for maneuver in result.maneuvers
    ]
    analytics_storage.write(activity_id, artifact)
    return artifact
