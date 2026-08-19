"""Generate a disposable human-readable index of persisted TackBar tracks."""

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
OUTPUT_PATH = BACKEND_DIR / "tmp" / "tracks-index.csv"
sys.path.insert(0, str(BACKEND_DIR))

from app.models import Session, StoredActivity  # noqa: E402
from app.repositories.activities import ActivityRepository  # noqa: E402
from app.repositories.participants import ParticipantRepository  # noqa: E402
from app.repositories.sessions import SessionRepository  # noqa: E402
from app.storage.track_storage import TrackStorage  # noqa: E402


TRACK_INDEX_COLUMNS = [
    "activity_id",
    "activity_date",
    "start_time_utc",
    "end_time_utc",
    "participant_id",
    "participant_name",
    "boat_name",
    "sailing_class",
    "sail_number",
    "source",
    "device_name",
    "original_filename",
    "sample_count",
    "track_file",
    "original_file",
    "session_id",
]


def build_tracks_index(
    participants: ParticipantRepository,
    activities: ActivityRepository,
    sessions: SessionRepository,
    storage: TrackStorage,
    output_path: str | Path,
) -> list[dict[str, object]]:
    session_by_activity = _resolve_sessions(sessions.all())
    stored_activities = sorted(
        activities.all(),
        key=lambda activity: (
            -_as_utc(activity.start_time).timestamp(),
            activity.participant_id,
            activity.id,
        ),
    )

    rows = [
        _activity_row(
            activity,
            participants,
            session_by_activity.get(activity.id, ""),
            storage,
        )
        for activity in stored_activities
    ]

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=TRACK_INDEX_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return rows


def _resolve_sessions(sessions: list[Session]) -> dict[str, str]:
    session_by_activity: dict[str, str] = {}
    for session in sessions:
        for activity_id in session.activity_ids:
            existing_session_id = session_by_activity.get(activity_id)
            if existing_session_id and existing_session_id != session.id:
                raise ValueError(
                    f"Activity {activity_id} belongs to multiple Sessions: "
                    f"{existing_session_id}, {session.id}"
                )
            session_by_activity[activity_id] = session.id
    return session_by_activity


def _activity_row(
    activity: StoredActivity,
    participants: ParticipantRepository,
    session_id: str,
    storage: TrackStorage,
) -> dict[str, object]:
    participant = participants.find_by_email(activity.participant_id)
    start_time = _as_utc(activity.start_time)
    original_path = storage.original_path(
        activity.id,
        activity.original_filename,
    )
    original_file = (
        original_path.relative_to(storage.data_root).as_posix()
        if original_path.exists()
        else ""
    )

    return {
        "activity_id": activity.id,
        "activity_date": start_time.date().isoformat(),
        "start_time_utc": _format_utc(start_time),
        "end_time_utc": _format_utc(activity.end_time),
        "participant_id": activity.participant_id,
        "participant_name": (participant.name or "") if participant else "",
        "boat_name": (participant.boat_name or "") if participant else "",
        "sailing_class": (
            participant.sailing_class or ""
        ) if participant else "",
        "sail_number": (participant.sail_number or "") if participant else "",
        "source": activity.source,
        "device_name": activity.device_name or "",
        "original_filename": activity.original_filename,
        "sample_count": activity.sample_count,
        "track_file": activity.track_file or "",
        "original_file": original_file,
        "session_id": session_id,
    }


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Activity timestamps must include timezone information")
    return value.astimezone(timezone.utc)


def _format_utc(value: datetime) -> str:
    return _as_utc(value).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )


def main() -> None:
    rows = build_tracks_index(
        ParticipantRepository(),
        ActivityRepository(),
        SessionRepository(),
        TrackStorage(),
        OUTPUT_PATH,
    )
    print("Tracks index generated")
    print(f"Path: {OUTPUT_PATH.relative_to(PROJECT_DIR).as_posix()}")
    print(f"Activities: {len(rows)}")
    print(
        "Sessions referenced: "
        f"{len({row['session_id'] for row in rows if row['session_id']})}"
    )
    print(
        "Participants referenced: "
        f"{len({row['participant_id'] for row in rows})}"
    )


if __name__ == "__main__":
    main()
