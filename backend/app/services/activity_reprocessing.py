from app.models import Activity, StoredActivity
from app.normalization.track_normalizer import normalize_track
from app.parsers.vakaros_csv import parse_vakaros_csv
from app.repositories.activities import (
    ActivityRepository,
    calculate_attachment_sha256,
)
from app.storage.track_storage import TrackStorage


def reprocess_activity(
    activity_id: str,
    activities: ActivityRepository,
    storage: TrackStorage,
) -> StoredActivity:
    stored_activity = activities.get_by_id(activity_id)
    if stored_activity is None:
        raise ValueError(f"Activity not found: {activity_id}")

    original_path = storage.original_path(
        stored_activity.id,
        stored_activity.original_filename,
    )
    if not original_path.exists():
        raise FileNotFoundError(
            f"Archived original not found for Activity {activity_id}: "
            f"{original_path}"
        )

    original_bytes = original_path.read_bytes()
    if calculate_attachment_sha256(original_bytes) != stored_activity.attachment_sha256:
        raise ValueError(
            f"Archived original SHA-256 does not match Activity {activity_id}"
        )

    parsed_activity = _parse_original(stored_activity, original_bytes)
    normalized_track = normalize_track(
        stored_activity.id,
        parsed_activity.samples,
    )
    track_file = storage.write_normalized_track(
        stored_activity.id,
        normalized_track,
    )
    return activities.refresh_track_metadata(
        stored_activity.id,
        parsed_activity,
        track_file,
    )


def _parse_original(
    stored_activity: StoredActivity,
    original_bytes: bytes,
) -> Activity:
    if stored_activity.source == "vakaros":
        return parse_vakaros_csv(
            original_bytes,
            original_filename=stored_activity.original_filename,
        )
    raise ValueError(
        f"Unsupported Activity source for reprocessing: {stored_activity.source}"
    )
