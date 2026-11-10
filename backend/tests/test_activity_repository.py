import hashlib
import json
from dataclasses import fields, replace
from pathlib import Path
from typing import Callable
from uuid import UUID

import pandas as pd
import pytest

from app.models import Activity, StoredActivity
from app.parsers.vakaros_csv import parse_vakaros_csv
from app.parsers.vakaros_vkx import parse_vakaros_vkx
from app.repositories.activities import (
    ActivityRepository,
    calculate_attachment_sha256,
)


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)
SAILOR_A = "30000000-0000-4000-8000-000000000001"
SAILOR_B = "30000000-0000-4000-8000-000000000002"
BOAT_A = "40000000-0000-4000-8000-000000000001"
BOAT_B = "40000000-0000-4000-8000-000000000002"


def test_attachment_sha256_is_calculated_from_bytes() -> None:
    attachment_bytes = FIXTURE_PATH.read_bytes()

    assert calculate_attachment_sha256(attachment_bytes) == hashlib.sha256(
        attachment_bytes
    ).hexdigest()


def test_first_activity_creates_uuid_backed_record(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("activities", [])
    attachment_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)

    activity, created = ActivityRepository(path).find_or_create(
        SAILOR_A, BOAT_A, parsed, attachment_bytes
    )

    assert created is True
    assert str(UUID(activity.id)) == activity.id
    assert activity.sailor_id == SAILOR_A
    assert activity.boat_id == BOAT_A
    assert activity.attachment_sha256 == calculate_attachment_sha256(
        attachment_bytes
    )
    assert activity.end_lat == parsed.end_lat
    assert activity.end_lon == parsed.end_lon
    assert activity.center_lat == parsed.center_lat
    assert activity.center_lon == parsed.center_lon
    assert activity.min_lat == parsed.min_lat
    assert activity.max_lat == parsed.max_lat
    assert activity.min_lon == parsed.min_lon
    assert activity.max_lon == parsed.max_lon


@pytest.mark.parametrize("field_name,value", [
    ("start_time", None),
    ("end_time", pd.NaT),
    ("end_time", float("inf")),
    ("start_lat", None),
    ("end_lon", float("nan")),
    ("center_lat", float("inf")),
    ("max_lon", float("-inf")),
])
@pytest.mark.parametrize("write_path", ["create", "refresh"])
def test_invalid_metadata_does_not_replace_activity_collection(
    temporary_json_file: Callable[[str, object], Path],
    field_name: str, value: object, write_path: str,
) -> None:
    path = temporary_json_file("activities", [])
    repository = ActivityRepository(path)
    content = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    existing, _ = repository.find_or_create(SAILOR_A, BOAT_A, parsed, content)
    previous = path.read_bytes()
    invalid = replace(parsed, **{field_name: value})

    with pytest.raises(ValueError, match=f"Activity {field_name} must be"):
        if write_path == "create":
            repository.find_or_create(SAILOR_A, BOAT_A, invalid, content + b"new")
        else:
            repository.refresh_track_metadata(existing.id, invalid, "tracks/invalid.csv.gz")

    assert path.read_bytes() == previous
    assert repository.get_by_id(existing.id) == existing
    assert len(repository.all()) == 1


def test_same_sailor_and_attachment_returns_existing_activity(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = ActivityRepository(temporary_json_file("activities", []))
    attachment_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)

    first, first_created = repository.find_or_create(
        SAILOR_A, BOAT_A, parsed, attachment_bytes
    )
    second, second_created = repository.find_or_create(
        SAILOR_A, BOAT_B, parsed, attachment_bytes
    )

    assert first_created is True
    assert second_created is False
    assert second.id == first.id
    assert second.boat_id == BOAT_A


def test_same_sailor_and_filename_with_different_bytes_creates_activities(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = ActivityRepository(temporary_json_file("activities", []))
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    first_attachment = FIXTURE_PATH.read_bytes()
    second_attachment = first_attachment + b"different attachment content"

    first, first_created = repository.find_or_create(
        SAILOR_A, BOAT_A, parsed, first_attachment
    )
    second, second_created = repository.find_or_create(
        SAILOR_A, BOAT_A, parsed, second_attachment
    )

    assert first_created is True
    assert second_created is True
    assert first.sailor_id == second.sailor_id == SAILOR_A
    assert first.original_filename == second.original_filename == FIXTURE_PATH.name
    assert first.attachment_sha256 != second.attachment_sha256
    assert first.id != second.id
    assert len(repository.all()) == 2


def test_same_attachment_for_different_sailor_creates_activity(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = ActivityRepository(temporary_json_file("activities", []))
    attachment_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)

    first, _ = repository.find_or_create(
        SAILOR_A, BOAT_A, parsed, attachment_bytes
    )
    second, created = repository.find_or_create(
        SAILOR_B, BOAT_A, parsed, attachment_bytes
    )

    assert created is True
    assert second.id != first.id


def test_persisted_activity_has_only_activity_domain_fields(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("activities", [])
    attachment_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    ActivityRepository(path).find_or_create(
        SAILOR_A, BOAT_A, parsed, attachment_bytes
    )

    record = json.loads(path.read_text(encoding="utf-8"))[0]
    expected_fields = {field.name for field in fields(StoredActivity)}

    assert set(record) == expected_fields
    assert record["center_lat"] == parsed.center_lat
    assert record["center_lon"] == parsed.center_lon
    assert record["min_lat"] == parsed.min_lat
    assert record["max_lat"] == parsed.max_lat
    assert record["min_lon"] == parsed.min_lon
    assert record["max_lon"] == parsed.max_lon
    assert "samples" not in record
    # Historical provider metadata stays in ingestion history, not Activity.
    assert "gmail_message_id" not in record
    assert "provider_message_id" not in record
    assert "gmail_message_id" not in {field.name for field in fields(Activity)}
    assert "provider_message_id" not in {field.name for field in fields(Activity)}


def test_existing_activity_is_enriched_with_spatial_metadata(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("activities", [])
    repository = ActivityRepository(path)
    attachment_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    original, _ = repository.find_or_create(
        SAILOR_A, None, parsed, attachment_bytes
    )

    records = json.loads(path.read_text(encoding="utf-8"))
    for field_name in (
        "center_lat",
        "center_lon",
        "min_lat",
        "max_lat",
        "min_lon",
        "max_lon",
    ):
        records[0].pop(field_name)
    path.write_text(json.dumps(records), encoding="utf-8")

    enriched, created = repository.find_or_create(
        SAILOR_A, BOAT_B, parsed, attachment_bytes
    )
    persisted = json.loads(path.read_text(encoding="utf-8"))[0]

    assert created is False
    assert enriched.id == original.id
    assert enriched.boat_id is None
    assert len(repository.all()) == 1
    assert persisted["center_lat"] == parsed.center_lat
    assert persisted["center_lon"] == parsed.center_lon
    assert persisted["min_lat"] == parsed.min_lat
    assert persisted["max_lat"] == parsed.max_lat
    assert persisted["min_lon"] == parsed.min_lon
    assert persisted["max_lon"] == parsed.max_lon


def test_invalid_duplicate_enrichment_preserves_activity_collection(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("activities", [])
    repository = ActivityRepository(path)
    content = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    original, _ = repository.find_or_create(SAILOR_A, None, parsed, content)
    records = json.loads(path.read_text(encoding="utf-8"))
    records[0].pop("center_lat")
    path.write_text(json.dumps(records), encoding="utf-8")
    previous = path.read_bytes()

    with pytest.raises(ValueError, match="Activity center_lat must be finite"):
        repository.find_or_create(
            SAILOR_A, None, replace(parsed, center_lat=float("nan")), content,
        )

    assert path.read_bytes() == previous
    assert repository.get_by_id(original.id).center_lat is None


def test_personal_context_survives_duplicate_and_track_refresh(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("activities", [])
    repository = ActivityRepository(path)
    content = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    original, _ = repository.find_or_create(SAILOR_A, BOAT_A, parsed, content)
    record = json.loads(path.read_text(encoding="utf-8"))[0]
    record.pop("device_label")
    path.write_text(json.dumps([record]), encoding="utf-8")
    assert repository.get_by_id(original.id).device_label is None

    changed = repository.update_context_for_sailor(
        SAILOR_A, original.id, boat_id=BOAT_B, device_label="My watch",
    )
    assert changed is not None and changed.device_label == "My watch"
    assert repository.update_context_for_sailor(
        SAILOR_B, original.id, boat_id=None, device_label=None,
    ) is None
    reused, created = repository.find_or_create(SAILOR_A, None, parsed, content)
    assert created is False and (reused.boat_id, reused.device_label) == (BOAT_B, "My watch")
    refreshed = repository.refresh_track_metadata(original.id, parsed, "tracks/refreshed.csv.gz")
    assert (refreshed.boat_id, refreshed.device_label) == (BOAT_B, "My watch")
    assert refreshed.device_name == parsed.device_name
    assert refreshed.attachment_sha256 == original.attachment_sha256


def test_vkx_observations_round_trip_and_legacy_missing_collections(
    temporary_json_file: Callable[[str, object], Path],
    vakaros_vkx_shift_angle_bytes: bytes,
    vakaros_vkx_bytes: bytes,
) -> None:
    path = temporary_json_file("activities", [])
    repository = ActivityRepository(path)
    parsed = parse_vakaros_vkx(vakaros_vkx_shift_angle_bytes, "Atlas.vkx")
    created, is_new = repository.find_or_create(
        SAILOR_A, BOAT_A, parsed, vakaros_vkx_shift_angle_bytes,
    )
    assert is_new
    loaded = repository.get_by_id(created.id)
    assert loaded is not None
    assert loaded.race_timer_events == parsed.race_timer_events
    assert loaded.line_positions == parsed.line_positions
    assert loaded.shift_angle_observations == parsed.shift_angle_observations
    assert loaded.shift_angle_observations[0].timestamp.microsecond == 792000
    assert len(loaded.shift_angle_observations) == 3
    assert loaded.race_timer_events[0].timestamp.microsecond == 789000
    assert loaded.line_positions[0].timestamp.microsecond == 790000
    assert len(loaded.race_timer_events) == 2

    legacy = json.loads(path.read_text(encoding="utf-8"))
    del legacy[0]["race_timer_events"]
    del legacy[0]["line_positions"]
    del legacy[0]["shift_angle_observations"]
    path.write_text(json.dumps(legacy), encoding="utf-8")
    reused, is_new = repository.find_or_create(
        SAILOR_A, BOAT_B, parsed, vakaros_vkx_shift_angle_bytes,
    )
    assert not is_new
    assert reused.id == created.id
    assert reused.race_timer_events == []
    assert reused.line_positions == []
    assert reused.shift_angle_observations == []

    refreshed = repository.replace_auxiliary_observations(created.id, parsed)
    assert refreshed.race_timer_events == parsed.race_timer_events
    assert refreshed.line_positions == parsed.line_positions
    assert refreshed.shift_angle_observations == parsed.shift_angle_observations

    empty = parse_vakaros_vkx(vakaros_vkx_bytes, "Atlas.vkx")
    cleared = repository.replace_auxiliary_observations(created.id, empty)
    assert cleared.race_timer_events == []
    assert cleared.line_positions == []
    assert cleared.shift_angle_observations == []
