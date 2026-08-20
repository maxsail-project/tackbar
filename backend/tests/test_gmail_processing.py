import gzip
from pathlib import Path
from typing import Callable

import pytest

from app.models import InboundEmail
from app.repositories.activities import ActivityRepository
from app.repositories.participants import ParticipantRepository
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
PARTICIPANTS = [
    {
        "id": "sailor-a@example.com",
        "name": "Sailor A",
        "boat_name": "Demo Boat A",
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
    ParticipantRepository,
    ActivityRepository,
    SessionRepository,
    IngestionHistory,
]:
    return (
        ParticipantRepository(
            temporary_json_file("participants", PARTICIPANTS)
        ),
        ActivityRepository(temporary_json_file("activities", [])),
        SessionRepository(temporary_json_file("sessions", [])),
        IngestionHistory(temporary_json_file("ingestion-history", [])),
    )


def test_provider_and_message_id_deduplicate_ingestion(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, sessions, history = _repositories(
        temporary_json_file
    )
    email = _email(FIXTURE_PATH.read_bytes())

    first = process_provider_email(
        "gmail", email, participants, activities, sessions, history
    )
    second = process_provider_email(
        "gmail", email, participants, activities, sessions, history
    )

    assert first is not None
    assert first.participant_created is False
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
    assert len(history.records()) == 1


def test_same_message_id_from_different_provider_is_not_skipped(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, sessions, history = _repositories(
        temporary_json_file
    )
    email = _email(FIXTURE_PATH.read_bytes())

    gmail_result = process_provider_email(
        "gmail", email, participants, activities, sessions, history
    )
    other_provider_result = process_provider_email(
        "future-provider", email, participants, activities, sessions, history
    )

    assert gmail_result is not None
    assert other_provider_result is not None
    assert other_provider_result.activity_created is False
    assert other_provider_result.activity.id == gmail_result.activity.id
    assert len(history.records()) == 2


def test_different_gmail_messages_with_identical_attachment_reuse_activity(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, sessions, history = _repositories(
        temporary_json_file
    )
    attachment_bytes = FIXTURE_PATH.read_bytes()

    first = process_provider_email(
        "gmail",
        _email(attachment_bytes, provider_message_id="gmail-message-1"),
        participants,
        activities,
        sessions,
        history,
    )
    second = process_provider_email(
        "gmail",
        _email(attachment_bytes, provider_message_id="gmail-message-2"),
        participants,
        activities,
        sessions,
        history,
    )

    assert first is not None
    assert second is not None
    assert first.activity_created is True
    assert second.activity_created is False
    assert first.activity.id == second.activity.id
    assert first.activity.participant_id == "sailor-a@example.com"
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
    participants, activities, sessions, history = _repositories(
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
        participants,
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
        participants,
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
    participants, activities, sessions, history = _repositories(
        temporary_json_file
    )
    compressed_bytes = FIXTURE_PATH.read_bytes()
    csv_bytes = gzip.decompress(compressed_bytes)

    compressed = process_provider_email(
        "gmail",
        _email(compressed_bytes, provider_message_id="gmail-gzip"),
        participants,
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
        participants,
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
    participants, activities, sessions, history = _repositories(
        temporary_json_file
    )

    result = process_provider_email(
        "gmail",
        _email(FIXTURE_PATH.read_bytes()),
        participants,
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


def test_unknown_participant_is_created_and_full_flow_continues(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, sessions, history = _repositories(
        temporary_json_file
    )

    result = process_provider_email(
        "gmail",
        _email(FIXTURE_PATH.read_bytes(), " UNKNOWN@EXAMPLE.COM "),
        participants,
        activities,
        sessions,
        history,
    )

    assert result is not None
    assert result.participant_created is True
    assert result.participant.id == "unknown@example.com"
    assert result.activity.participant_id == "unknown@example.com"
    assert result.session_match.status == "created"
    assert result.activity.id in result.session_match.session.activity_ids
    assert history.is_processed("gmail", "gmail-message-1")


def test_ingestion_is_recorded_only_after_complete_flow_succeeds(
    temporary_json_file: Callable[[str, object], Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    participants, activities, sessions, history = _repositories(
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
            participants,
            activities,
            sessions,
            history,
        )

    assert participants.find_by_email("new@example.com") is not None
    assert history.records() == []


def test_failed_attachment_is_not_processed(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, sessions, history = _repositories(
        temporary_json_file
    )

    with pytest.raises(ValueError):
        process_provider_email(
            "gmail",
            _email(b"not a gzip file"),
            participants,
            activities,
            sessions,
            history,
        )

    assert history.records() == []
    assert activities.all() == []
    assert sessions.all() == []
