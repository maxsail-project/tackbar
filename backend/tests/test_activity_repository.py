import hashlib
import json
from dataclasses import fields
from pathlib import Path
from typing import Callable
from uuid import UUID

from app.models import Activity, StoredActivity
from app.parsers.vakaros_csv import parse_vakaros_csv
from app.repositories.activities import (
    ActivityRepository,
    calculate_attachment_sha256,
)


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)


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
        "sailor-a@example.com", parsed, attachment_bytes
    )

    assert created is True
    assert str(UUID(activity.id)) == activity.id
    assert activity.participant_id == "sailor-a@example.com"
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


def test_same_participant_and_attachment_returns_existing_activity(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = ActivityRepository(temporary_json_file("activities", []))
    attachment_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)

    first, first_created = repository.find_or_create(
        "sailor-a@example.com", parsed, attachment_bytes
    )
    second, second_created = repository.find_or_create(
        " SAILOR-A@EXAMPLE.COM ", parsed, attachment_bytes
    )

    assert first_created is True
    assert second_created is False
    assert second.id == first.id


def test_same_participant_and_filename_with_different_bytes_creates_activities(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = ActivityRepository(temporary_json_file("activities", []))
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    first_attachment = FIXTURE_PATH.read_bytes()
    second_attachment = first_attachment + b"different attachment content"

    first, first_created = repository.find_or_create(
        " SAILOR-A@EXAMPLE.COM ", parsed, first_attachment
    )
    second, second_created = repository.find_or_create(
        "sailor-a@example.com", parsed, second_attachment
    )

    assert first_created is True
    assert second_created is True
    assert first.participant_id == second.participant_id == "sailor-a@example.com"
    assert first.original_filename == second.original_filename == FIXTURE_PATH.name
    assert first.attachment_sha256 != second.attachment_sha256
    assert first.id != second.id
    assert len(repository.all()) == 2


def test_same_attachment_for_different_participant_creates_activity(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = ActivityRepository(temporary_json_file("activities", []))
    attachment_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)

    first, _ = repository.find_or_create(
        "sailor-a@example.com", parsed, attachment_bytes
    )
    second, created = repository.find_or_create(
        "crew@example.com", parsed, attachment_bytes
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
        "sailor-a@example.com", parsed, attachment_bytes
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
        "sailor-a@example.com", parsed, attachment_bytes
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
        "sailor-a@example.com", parsed, attachment_bytes
    )
    persisted = json.loads(path.read_text(encoding="utf-8"))[0]

    assert created is False
    assert enriched.id == original.id
    assert len(repository.all()) == 1
    assert persisted["center_lat"] == parsed.center_lat
    assert persisted["center_lon"] == parsed.center_lon
    assert persisted["min_lat"] == parsed.min_lat
    assert persisted["max_lat"] == parsed.max_lat
    assert persisted["min_lon"] == parsed.min_lon
    assert persisted["max_lon"] == parsed.max_lon
