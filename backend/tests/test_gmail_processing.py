import gzip
import json
from dataclasses import replace
from pathlib import Path
from typing import Callable

import pytest

from app.models import ConsentStatus, InboundEmail
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.ingestion_history import (
    DEFAULT_HISTORY_PATH,
    IngestionHistory,
)
from app.services.ingestion_processing import (
    process_provider_email,
)


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)
FILENAME = "vakaros-demo.csv.gz"
SAILOR_ID = "30000000-0000-4000-8000-000000000001"
BOAT_ID = "40000000-0000-4000-8000-000000000001"
SAILORS = [
    {
        "id": SAILOR_ID,
        "email": "sailor-a@example.com",
        "name": "Sailor A",
        "default_boat_id": BOAT_ID,
    }
]
BOATS = [
    {
        "id": BOAT_ID,
        "name": "Demo Boat A",
        "sailing_class": "Snipe",
        "sail_number": "DEMO-1001",
    }
]


def test_default_history_path_is_persistent_data() -> None:
    assert DEFAULT_HISTORY_PATH == (
        Path(__file__).resolve().parents[1]
        / "test-data"
        / "ingestion_history.json"
    )


def test_legacy_tmp_history_is_copied_without_deletion(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    legacy_records = [
        {
            "provider": "gmail",
            "provider_message_id": "legacy-message",
            "processed_at": "2031-06-18T10:00:00+00:00",
            "status": "processed",
            "activity_id": "activity-1",
        }
    ]
    legacy_path = temporary_json_file("legacy-history", legacy_records)
    new_path = legacy_path.with_name(f"new-{legacy_path.name}")

    history = IngestionHistory(new_path, legacy_path=legacy_path)

    assert history.records() == legacy_records
    assert new_path.exists()
    assert legacy_path.exists()
    assert IngestionHistory(new_path).records() == legacy_records

    new_path.unlink()


def _email(
    attachment_bytes: bytes,
    sender_email: str = "sailor-a@example.com",
    provider_message_id: str = "gmail-message-1",
    filename: str = FILENAME,
) -> InboundEmail:
    return InboundEmail(
        sender_email=sender_email,
        subject=filename,
        attachment_filename=filename,
        attachment_bytes=attachment_bytes,
        provider_message_id=provider_message_id,
    )


def _repositories(
    temporary_json_file: Callable[[str, object], Path],
) -> tuple[
    SailorRepository,
    BoatRepository,
    ActivityRepository,
    SessionRepository,
    IngestionHistory,
]:
    return (
        SailorRepository(temporary_json_file("sailors", SAILORS)),
        BoatRepository(temporary_json_file("boats", BOATS)),
        ActivityRepository(temporary_json_file("activities", [])),
        SessionRepository(temporary_json_file("sessions", [])),
        IngestionHistory(temporary_json_file("ingestion-history", [])),
    )


def test_provider_and_message_id_deduplicate_ingestion(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    email = _email(FIXTURE_PATH.read_bytes())

    first = process_provider_email(
        "gmail", email, sailors, boats, activities, sessions, history
    )
    second = process_provider_email(
        "gmail", email, sailors, boats, activities, sessions, history
    )

    assert first is not None
    assert first.sailor_created is False
    assert first.activity.track_file == (
        f"tracks/{first.activity.id}.csv.gz"
    )
    assert (activities.path.parent / first.activity.track_file).exists()
    archived_original = (
        activities.path.parent
        / "originals"
        / first.activity.id
        / first.activity.original_filename
    )
    assert archived_original.read_bytes() == email.attachment_bytes
    assert second is None


def test_active_sailor_ingestion_creates_stable_session_capability(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    sailors.replace(replace(sailor, consent_status=ConsentStatus.ACTIVE))

    result = process_provider_email(
        "gmail",
        _email(FIXTURE_PATH.read_bytes()),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )

    assert result is not None
    persisted = sessions.get_by_id(result.session_match.session.id)
    assert persisted is not None
    assert persisted.capability_token is not None
    assert result.session_match.session.capability_token == persisted.capability_token
    assert len(history.records()) == 1


def test_same_message_id_from_different_provider_is_not_skipped(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    email = _email(FIXTURE_PATH.read_bytes())

    gmail_result = process_provider_email(
        "gmail", email, sailors, boats, activities, sessions, history
    )
    other_provider_result = process_provider_email(
        "future-provider", email, sailors, boats, activities, sessions, history
    )

    assert gmail_result is not None
    assert other_provider_result is not None
    assert other_provider_result.activity_created is False
    assert other_provider_result.activity.id == gmail_result.activity.id
    assert len(history.records()) == 2


def test_different_gmail_messages_with_identical_attachment_reuse_activity(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    attachment_bytes = FIXTURE_PATH.read_bytes()

    first = process_provider_email(
        "gmail",
        _email(attachment_bytes, provider_message_id="gmail-message-1"),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )
    second = process_provider_email(
        "gmail",
        _email(attachment_bytes, provider_message_id="gmail-message-2"),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )

    assert first is not None
    assert second is not None
    assert first.activity_created is True
    assert second.activity_created is False
    assert first.activity.id == second.activity.id
    assert first.activity.sailor_id == SAILOR_ID
    assert first.activity.boat_id == BOAT_ID
    assert first.activity.attachment_sha256 == second.activity.attachment_sha256
    assert len(activities.all()) == 1

    records = history.records()
    assert [record["provider"] for record in records] == ["gmail", "gmail"]
    assert [record["provider_message_id"] for record in records] == [
        "gmail-message-1",
        "gmail-message-2",
    ]
    assert [record["activity_id"] for record in records] == [
        first.activity.id,
        first.activity.id,
    ]


def test_csv_ingestion_archives_exact_original_and_reuses_by_raw_sha(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    csv_bytes = gzip.decompress(FIXTURE_PATH.read_bytes())
    csv_filename = "vakaros-demo.csv"

    first = process_provider_email(
        "gmail",
        _email(
            csv_bytes,
            provider_message_id="gmail-csv-1",
            filename=csv_filename,
        ),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )
    second = process_provider_email(
        "gmail",
        _email(
            csv_bytes,
            provider_message_id="gmail-csv-2",
            filename=csv_filename,
        ),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )

    assert first is not None
    assert second is not None
    assert first.activity_created is True
    assert second.activity_created is False
    assert second.activity.id == first.activity.id
    assert first.activity.original_filename == csv_filename
    assert first.activity.sample_count == 3613
    assert first.session_match.session.id == second.session_match.session.id
    archived_original = (
        activities.path.parent
        / "originals"
        / first.activity.id
        / csv_filename
    )
    assert archived_original.read_bytes() == csv_bytes
    assert len(history.records()) == 2
    assert {
        record["activity_id"] for record in history.records()
    } == {first.activity.id}


def test_equivalent_csv_and_csv_gz_keep_raw_attachment_deduplication(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    compressed_bytes = FIXTURE_PATH.read_bytes()
    csv_bytes = gzip.decompress(compressed_bytes)

    compressed = process_provider_email(
        "gmail",
        _email(compressed_bytes, provider_message_id="gmail-gzip"),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )
    uncompressed = process_provider_email(
        "gmail",
        _email(
            csv_bytes,
            provider_message_id="gmail-csv",
            filename="vakaros-demo.csv",
        ),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )

    assert compressed is not None
    assert uncompressed is not None
    assert compressed.activity_created is True
    assert uncompressed.activity_created is True
    assert compressed.activity.id != uncompressed.activity.id
    assert (
        compressed.activity.attachment_sha256
        != uncompressed.activity.attachment_sha256
    )
    assert len(activities.all()) == 2
    assert len(history.records()) == 2


def test_processed_history_stores_provider_and_activity_id(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )

    result = process_provider_email(
        "gmail",
        _email(FIXTURE_PATH.read_bytes()),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )
    record = history.records()[0]

    assert result is not None
    assert record["provider"] == "gmail"
    assert record["provider_message_id"] == "gmail-message-1"
    assert record["activity_id"] == result.activity.id
    assert record["status"] == "processed"
    assert record["processed_at"].endswith("+00:00")


def test_unknown_sailor_is_created_and_full_flow_continues(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )

    result = process_provider_email(
        "gmail",
        _email(FIXTURE_PATH.read_bytes(), " UNKNOWN@EXAMPLE.COM "),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )

    assert result is not None
    assert result.sailor_created is True
    assert result.sailor.email == "unknown@example.com"
    assert result.sailor.consent_status == ConsentStatus.PENDING
    assert result.activity.sailor_id == result.sailor.id
    assert result.activity.boat_id is None
    assert result.session_match.status == "created"
    assert result.activity.id in result.session_match.session.activity_ids
    assert history.is_processed("gmail", "gmail-message-1")


def test_revoked_sailor_reenters_pending_and_ingestion_still_matches_session(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    records = [{**SAILORS[0], "consent_status": "REVOKED"}]
    sailors.path.write_text(
        json.dumps(records, indent=2) + "\n",
        encoding="utf-8",
    )

    result = process_provider_email(
        "gmail",
        _email(FIXTURE_PATH.read_bytes()),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )

    assert result is not None
    assert result.sailor.consent_status == ConsentStatus.PENDING
    assert result.sailor.consent_request_sent_at is None
    assert result.activity.sailor_id == SAILOR_ID
    assert result.session_match.status == "created"
    assert result.activity.id in result.session_match.session.activity_ids
    consent_records = json.loads(
        sailors.path.with_name("consent_events.json").read_text(
            encoding="utf-8"
        )
    )
    assert consent_records[-1]["event_type"] == "consent_cycle_started"


def test_known_sailor_without_default_boat_creates_activity_with_unknown_boat(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    sailor_records = SAILORS.copy()
    sailor_records[0] = {**sailor_records[0], "default_boat_id": None}
    sailors.path.write_text(
        json.dumps(sailor_records, indent=2) + "\n",
        encoding="utf-8",
    )

    result = process_provider_email(
        "gmail",
        _email(FIXTURE_PATH.read_bytes()),
        sailors,
        boats,
        activities,
        sessions,
        history,
    )

    assert result is not None
    assert result.activity.boat_id is None


def test_missing_default_boat_fails_before_activity_creation(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )
    sailor_records = SAILORS.copy()
    sailor_records[0] = {
        **sailor_records[0],
        "default_boat_id": "49999999-9999-4999-8999-999999999999",
    }
    sailors.path.write_text(
        json.dumps(sailor_records, indent=2) + "\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="missing default Boat"):
        process_provider_email(
            "gmail",
            _email(FIXTURE_PATH.read_bytes()),
            sailors,
            boats,
            activities,
            sessions,
            history,
        )

    assert activities.all() == []
    assert history.records() == []


def test_ingestion_is_recorded_only_after_complete_flow_succeeds(
    temporary_json_file: Callable[[str, object], Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )

    def fail_session_matching(*args, **kwargs):
        raise RuntimeError("session persistence failed")

    monkeypatch.setattr(
        "app.services.ingestion_processing.match_activity_to_session",
        fail_session_matching,
    )

    with pytest.raises(RuntimeError, match="session persistence failed"):
        process_provider_email(
            "gmail",
            _email(FIXTURE_PATH.read_bytes(), "new@example.com"),
            sailors,
            boats,
            activities,
            sessions,
            history,
        )

    assert sailors.find_by_email("new@example.com") is not None
    assert history.records() == []


def test_failed_attachment_is_not_processed(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors, boats, activities, sessions, history = _repositories(
        temporary_json_file
    )

    with pytest.raises(ValueError):
        process_provider_email(
            "gmail",
            _email(b"not a gzip file"),
            sailors,
            boats,
            activities,
            sessions,
            history,
        )

    assert history.records() == []
    assert activities.all() == []
    assert sessions.all() == []
