from pathlib import Path
from uuid import uuid4

import pytest

from app.models import InboundEmail
from app.services.gmail_processing import (
    GmailProcessingHistory,
    process_gmail_email,
)


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "VK-Maxi-URU 10-8-2026.csv.gz"
)
FILENAME = "VK-Maxi-URU 10-8-2026.csv.gz"
BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture
def history_path() -> Path:
    path = BACKEND_DIR / "tmp" / f"test-gmail-history-{uuid4()}.json"
    yield path
    if path.exists():
        path.unlink()


def _email(attachment_bytes: bytes) -> InboundEmail:
    return InboundEmail(
        sender_email="maxi@example.com",
        subject=FILENAME,
        attachment_filename=FILENAME,
        attachment_bytes=attachment_bytes,
        provider_message_id="gmail-message-1",
    )


def test_new_message_is_processed_and_recorded(history_path: Path) -> None:
    history = GmailProcessingHistory(history_path)

    result = process_gmail_email(_email(FIXTURE_PATH.read_bytes()), history)

    assert result is not None
    assert result.activity.device_name == "VK-Maxi-URU"
    assert history.is_processed("gmail-message-1")


def test_processed_message_is_skipped_on_second_run(history_path: Path) -> None:
    history = GmailProcessingHistory(history_path)
    email = _email(FIXTURE_PATH.read_bytes())

    assert process_gmail_email(email, history) is not None
    assert process_gmail_email(email, history) is None
    assert len(history.records()) == 1


def test_history_record_contains_readable_metadata(history_path: Path) -> None:
    history = GmailProcessingHistory(history_path)

    process_gmail_email(_email(FIXTURE_PATH.read_bytes()), history)
    record = history.records()[0]

    assert record == {
        "gmail_message_id": "gmail-message-1",
        "sender_email": "maxi@example.com",
        "subject": FILENAME,
        "attachment_filename": FILENAME,
        "device_name": "VK-Maxi-URU",
        "activity_start_time": "2026-08-10T18:08:03.026000+00:00",
        "activity_end_time": "2026-08-10T18:38:09.074000+00:00",
        "sample_count": 3613,
        "processed_at": record["processed_at"],
        "status": "processed",
    }
    assert "samples" not in record
    assert record["processed_at"].endswith("+00:00")


def test_failed_processing_is_not_recorded_as_processed(
    history_path: Path,
) -> None:
    history = GmailProcessingHistory(history_path)

    with pytest.raises(ValueError):
        process_gmail_email(_email(b"not a gzip file"), history)

    assert not history.is_processed("gmail-message-1")
    assert history.records() == []
