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
    UnknownParticipantError,
    process_provider_email,
)


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "VK-Maxi-URU 10-8-2026.csv.gz"
)
FILENAME = "VK-Maxi-URU 10-8-2026.csv.gz"
PARTICIPANTS = [
    {
        "id": "mmannise@gmail.com",
        "name": "Maxi URU",
        "boat_name": "Zafar",
        "sailing_class": "Snipe",
        "sail_number": "URU-32115",
    }
]


def test_default_history_path_is_persistent_data() -> None:
    assert DEFAULT_HISTORY_PATH == (
        Path(__file__).resolve().parents[1]
        / "data"
        / "ingestion_history.json"
    )


def test_legacy_tmp_history_is_copied_without_deletion(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    legacy_records = [
        {
            "provider": "gmail",
            "provider_message_id": "legacy-message",
            "processed_at": "2026-08-18T10:00:00+00:00",
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
    sender_email: str = "mmannise@gmail.com",
) -> InboundEmail:
    return InboundEmail(
        sender_email=sender_email,
        subject=FILENAME,
        attachment_filename=FILENAME,
        attachment_bytes=attachment_bytes,
        provider_message_id="gmail-message-1",
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


def test_unknown_participant_is_not_processed(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, sessions, history = _repositories(
        temporary_json_file
    )

    with pytest.raises(UnknownParticipantError, match="unknown@example.com"):
        process_provider_email(
            "gmail",
            _email(FIXTURE_PATH.read_bytes(), " UNKNOWN@EXAMPLE.COM "),
            participants,
            activities,
            sessions,
            history,
        )

    assert history.records() == []
    assert activities.all() == []
    assert sessions.all() == []


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
