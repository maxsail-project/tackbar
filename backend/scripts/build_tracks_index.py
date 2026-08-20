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
from app.repositories.boats import BoatRepository  # noqa: E402
from app.repositories.sailors import SailorRepository  # noqa: E402
from app.repositories.sessions import SessionRepository  # noqa: E402
from app.storage.track_storage import TrackStorage  # noqa: E402


TRACK_INDEX_COLUMNS = [
    "activity_id",
    "activity_date",
    "start_time_utc",
    "end_time_utc",
    "sailor_id",
    "sailor_email",
    "sailor_name",
    "boat_id",
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
    sailors: SailorRepository,
    boats: BoatRepository,
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
            activity.sailor_id,
            activity.id,
        ),
    )

    rows = [
        _activity_row(
            activity,
            sailors,
            boats,
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
    sailors: SailorRepository,
    boats: BoatRepository,
    session_id: str,
    storage: TrackStorage,
) -> dict[str, object]:
    sailor = sailors.get_by_id(activity.sailor_id)
    boat = (
        boats.get_by_id(activity.boat_id)
        if activity.boat_id is not None
        else None
    )
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
        "sailor_id": activity.sailor_id,
        "sailor_email": sailor.email if sailor else "",
        "sailor_name": (sailor.name or "") if sailor else "",
        "boat_id": activity.boat_id or "",
        "boat_name": (boat.name or "") if boat else "",
        "sailing_class": (boat.sailing_class or "") if boat else "",
        "sail_number": (boat.sail_number or "") if boat else "",
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
        SailorRepository(),
        BoatRepository(),
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
        "Sailors referenced: "
        f"{len({row['sailor_id'] for row in rows})}"
    )


if __name__ == "__main__":
    main()
