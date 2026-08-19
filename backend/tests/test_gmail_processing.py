from pathlib import Path
from typing import Callable

import pytest

from app.models import InboundEmail
from app.repositories.activities import ActivityRepository
from app.repositories.participants import ParticipantRepository
from app.services.ingestion_history import IngestionHistory
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
) -> tuple[ParticipantRepository, ActivityRepository, IngestionHistory]:
    return (
        ParticipantRepository(
            temporary_json_file("participants", PARTICIPANTS)
        ),
        ActivityRepository(temporary_json_file("activities", [])),
        IngestionHistory(temporary_json_file("ingestion-history", [])),
    )


def test_provider_and_message_id_deduplicate_ingestion(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, history = _repositories(temporary_json_file)
    email = _email(FIXTURE_PATH.read_bytes())

    first = process_provider_email(
        "gmail", email, participants, activities, history
    )
    second = process_provider_email(
        "gmail", email, participants, activities, history
    )

    assert first is not None
    assert second is None
    assert len(history.records()) == 1


def test_same_message_id_from_different_provider_is_not_skipped(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, history = _repositories(temporary_json_file)
    email = _email(FIXTURE_PATH.read_bytes())

    gmail_result = process_provider_email(
        "gmail", email, participants, activities, history
    )
    other_provider_result = process_provider_email(
        "future-provider", email, participants, activities, history
    )

    assert gmail_result is not None
    assert other_provider_result is not None
    assert other_provider_result.activity_created is False
    assert other_provider_result.activity.id == gmail_result.activity.id
    assert len(history.records()) == 2


def test_processed_history_stores_provider_and_activity_id(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, history = _repositories(temporary_json_file)

    result = process_provider_email(
        "gmail",
        _email(FIXTURE_PATH.read_bytes()),
        participants,
        activities,
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
    participants, activities, history = _repositories(temporary_json_file)

    with pytest.raises(UnknownParticipantError, match="unknown@example.com"):
        process_provider_email(
            "gmail",
            _email(FIXTURE_PATH.read_bytes(), " UNKNOWN@EXAMPLE.COM "),
            participants,
            activities,
            history,
        )

    assert history.records() == []
    assert activities._load() == []


def test_failed_attachment_is_not_processed(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participants, activities, history = _repositories(temporary_json_file)

    with pytest.raises(ValueError):
        process_provider_email(
            "gmail",
            _email(b"not a gzip file"),
            participants,
            activities,
            history,
        )

    assert history.records() == []
    assert activities._load() == []
