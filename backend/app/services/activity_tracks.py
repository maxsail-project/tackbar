from app.models import Activity, StoredActivity
from app.normalization.track_gaps import summarize_track_gaps
from app.normalization.track_normalizer import normalize_track
from app.repositories.activities import ActivityRepository
from app.storage.track_storage import TrackStorage


def persist_activity_track(
    stored_activity: StoredActivity,
    parsed_activity: Activity,
    attachment_bytes: bytes,
    activities: ActivityRepository,
    storage: TrackStorage,
) -> StoredActivity:
    storage.archive_original(
        stored_activity.id,
        stored_activity.original_filename,
        attachment_bytes,
    )
    track_file = storage.track_relative_path(stored_activity.id)
    normalized_track = None
    if not storage.track_path(stored_activity.id).exists():
        normalized_track = normalize_track(
            stored_activity.id,
            parsed_activity.samples,
        )
        track_file = storage.write_normalized_track(
            stored_activity.id,
            normalized_track,
        )

    if stored_activity.track_file != track_file:
        stored_activity = activities.set_track_file(stored_activity.id, track_file)
    if normalized_track is not None or stored_activity.gap_summary is None:
        # Derived from the canonical track that is actually persisted (#218 D6).
        if normalized_track is None:
            normalized_track = storage.read_normalized_track(stored_activity.id)
        stored_activity = activities.set_gap_summary(
            stored_activity.id, summarize_track_gaps(normalized_track["utc"]),
        )
    return stored_activity
