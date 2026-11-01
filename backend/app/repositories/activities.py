import hashlib
import json
from dataclasses import asdict, replace
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.models import Activity, LinePosition, RaceTimerEvent, StoredActivity
from app.runtime_paths import runtime_paths


def calculate_attachment_sha256(attachment_bytes: bytes) -> str:
    return hashlib.sha256(attachment_bytes).hexdigest()


class ActivityRepository:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = runtime_paths().activities if path is None else Path(path)

    def find_or_create(
        self,
        sailor_id: str,
        boat_id: str | None,
        activity: Activity,
        attachment_bytes: bytes,
    ) -> tuple[StoredActivity, bool]:
        attachment_sha256 = calculate_attachment_sha256(attachment_bytes)
        activities = self._load()

        for stored_activity in activities:
            if (
                stored_activity.sailor_id == sailor_id
                and stored_activity.attachment_sha256 == attachment_sha256
            ):
                if _enrich_spatial_metadata(stored_activity, activity):
                    self._save(activities)
                return stored_activity, False

        stored_activity = StoredActivity(
            id=str(uuid4()),
            sailor_id=sailor_id,
            boat_id=boat_id,
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
            race_timer_events=list(activity.race_timer_events),
            line_positions=list(activity.line_positions),
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

    def update_context_for_sailor(
        self, sailor_id: str, activity_id: str, *,
        boat_id: str | None, device_label: str | None,
    ) -> StoredActivity | None:
        activities = self._load()
        for index, activity in enumerate(activities):
            if activity.id == activity_id and activity.sailor_id == sailor_id:
                updated = replace(activity, boat_id=boat_id, device_label=device_label)
                activities[index] = updated
                self._save(activities)
                return updated
        return None

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

    def replace_auxiliary_observations(
        self, activity_id: str, parsed_activity: Activity,
    ) -> StoredActivity:
        activities = self._load()
        for activity in activities:
            if activity.id == activity_id:
                activity.race_timer_events = list(parsed_activity.race_timer_events)
                activity.line_positions = list(parsed_activity.line_positions)
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
            activity.race_timer_events = list(parsed_activity.race_timer_events)
            activity.line_positions = list(parsed_activity.line_positions)
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
                    "race_timer_events": [
                        RaceTimerEvent(
                            timestamp=_parse_datetime(event["timestamp"]),
                            event_type=event["event_type"],
                            timer_value_seconds=event["timer_value_seconds"],
                        )
                        for event in item.get("race_timer_events", [])
                    ],
                    "line_positions": [
                        LinePosition(
                            timestamp=_parse_datetime(position["timestamp"]),
                            endpoint_type=position["endpoint_type"],
                            latitude=position["latitude"],
                            longitude=position["longitude"],
                        )
                        for position in item.get("line_positions", [])
                    ],
                }
            )
            for item in data
        ]

    def _save(self, activities: list[StoredActivity]) -> None:
        existing_by_id = {}
        if self.path.exists():
            existing_by_id = {
                item["id"]: item
                for item in json.loads(self.path.read_text(encoding="utf-8"))
            }
        records = []
        for activity in activities:
            record = asdict(activity)
            record["start_time"] = activity.start_time.isoformat()
            record["end_time"] = activity.end_time.isoformat()
            for event in record["race_timer_events"]:
                event["timestamp"] = event["timestamp"].isoformat()
            for position in record["line_positions"]:
                position["timestamp"] = position["timestamp"].isoformat()
            previous = existing_by_id.get(activity.id, {})
            for collection in ("race_timer_events", "line_positions"):
                if previous and collection not in previous and not record[collection]:
                    del record[collection]
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
