import hashlib
import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.models import Activity, StoredActivity
from app.repositories.participants import normalize_email


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ACTIVITIES_PATH = BACKEND_DIR / "data" / "activities.json"


def calculate_attachment_sha256(attachment_bytes: bytes) -> str:
    return hashlib.sha256(attachment_bytes).hexdigest()


class ActivityRepository:
    def __init__(self, path: str | Path = DEFAULT_ACTIVITIES_PATH) -> None:
        self.path = Path(path)

    def find_or_create(
        self,
        participant_id: str,
        activity: Activity,
        attachment_bytes: bytes,
    ) -> tuple[StoredActivity, bool]:
        normalized_participant_id = normalize_email(participant_id)
        attachment_sha256 = calculate_attachment_sha256(attachment_bytes)
        activities = self._load()

        for stored_activity in activities:
            if (
                stored_activity.participant_id == normalized_participant_id
                and stored_activity.attachment_sha256 == attachment_sha256
            ):
                if _enrich_spatial_metadata(stored_activity, activity):
                    self._save(activities)
                return stored_activity, False

        stored_activity = StoredActivity(
            id=str(uuid4()),
            participant_id=normalized_participant_id,
            source=activity.source,
            device_name=activity.device_name,
            original_filename=activity.original_filename,
            start_time=activity.start_time,
            end_time=activity.end_time,
            start_lat=activity.start_lat,
            start_lon=activity.start_lon,
            end_lat=activity.end_lat,
            end_lon=activity.end_lon,
            center_lat=activity.center_lat,
            center_lon=activity.center_lon,
            min_lat=activity.min_lat,
            max_lat=activity.max_lat,
            min_lon=activity.min_lon,
            max_lon=activity.max_lon,
            sample_count=len(activity.samples),
            attachment_sha256=attachment_sha256,
        )
        activities.append(stored_activity)
        self._save(activities)
        return stored_activity, True

    def all(self) -> list[StoredActivity]:
        return self._load()

    def get_by_id(self, activity_id: str) -> StoredActivity | None:
        return next(
            (
                activity
                for activity in self._load()
                if activity.id == activity_id
            ),
            None,
        )

    def set_track_file(
        self,
        activity_id: str,
        track_file: str,
    ) -> StoredActivity:
        activities = self._load()
        for activity in activities:
            if activity.id == activity_id:
                activity.track_file = track_file
                self._save(activities)
                return activity
        raise ValueError(f"Activity not found: {activity_id}")

    def refresh_track_metadata(
        self,
        activity_id: str,
        parsed_activity: Activity,
        track_file: str,
    ) -> StoredActivity:
        activities = self._load()
        for activity in activities:
            if activity.id != activity_id:
                continue

            activity.device_name = parsed_activity.device_name
            activity.start_time = parsed_activity.start_time
            activity.end_time = parsed_activity.end_time
            activity.start_lat = parsed_activity.start_lat
            activity.start_lon = parsed_activity.start_lon
            activity.end_lat = parsed_activity.end_lat
            activity.end_lon = parsed_activity.end_lon
            activity.center_lat = parsed_activity.center_lat
            activity.center_lon = parsed_activity.center_lon
            activity.min_lat = parsed_activity.min_lat
            activity.max_lat = parsed_activity.max_lat
            activity.min_lon = parsed_activity.min_lon
            activity.max_lon = parsed_activity.max_lon
            activity.sample_count = len(parsed_activity.samples)
            activity.track_file = track_file
            self._save(activities)
            return activity
        raise ValueError(f"Activity not found: {activity_id}")

    def _load(self) -> list[StoredActivity]:
        if not self.path.exists():
            return []

        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Activity storage must contain a JSON list")

        return [
            StoredActivity(
                **{
                    **item,
                    "center_lat": item.get("center_lat"),
                    "center_lon": item.get("center_lon"),
                    "min_lat": item.get("min_lat"),
                    "max_lat": item.get("max_lat"),
                    "min_lon": item.get("min_lon"),
                    "max_lon": item.get("max_lon"),
                    "start_time": _parse_datetime(item["start_time"]),
                    "end_time": _parse_datetime(item["end_time"]),
                }
            )
            for item in data
        ]

    def _save(self, activities: list[StoredActivity]) -> None:
        records = []
        for activity in activities:
            record = asdict(activity)
            record["start_time"] = activity.start_time.isoformat()
            record["end_time"] = activity.end_time.isoformat()
            records.append(record)

        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _enrich_spatial_metadata(
    stored_activity: StoredActivity,
    parsed_activity: Activity,
) -> bool:
    changed = False
    for field_name in (
        "center_lat",
        "center_lon",
        "min_lat",
        "max_lat",
        "min_lon",
        "max_lon",
    ):
        if getattr(stored_activity, field_name) is None:
            setattr(stored_activity, field_name, getattr(parsed_activity, field_name))
            changed = True
    return changed
