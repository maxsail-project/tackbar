import gzip
from pathlib import Path

import pytest

from app.models import InboundEmail
from app.services.email_ingestion import (
    InboundEmailRejected,
    process_inbound_email,
)


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)
VALID_FILENAME = "vakaros-demo.csv.gz"
UPPERCASE_EXTENSION_FILENAME = "vakaros-demo.CSV.GZ"


@pytest.fixture
def fixture_bytes() -> bytes:
    assert FIXTURE_PATH.exists(), (
        "Missing public demo Vakaros fixture. Place it at "
        f"{FIXTURE_PATH}"
    )
    return FIXTURE_PATH.read_bytes()


def test_process_valid_email(fixture_bytes: bytes) -> None:
    email = InboundEmail(
        sender_email="sailor-a@example.com",
        subject="A normal note from a sailor",
        attachment_filename=UPPERCASE_EXTENSION_FILENAME,
        attachment_bytes=fixture_bytes,
    )

    result = process_inbound_email(email)

    assert result.sender_email == email.sender_email
    assert result.subject == email.subject
    assert result.attachment_filename == email.attachment_filename
    assert result.activity.original_filename == email.attachment_filename
    assert result.activity.device_name == "vakaros-demo"
    assert len(result.activity.samples) == 3613


def test_process_valid_uncompressed_csv_email(fixture_bytes: bytes) -> None:
    filename = "SHIMASAIL 5-7-2026.csv"
    email = InboundEmail(
        sender_email="aquaxsailing@gmail.com",
        subject="SHIMASAIL track ult. día track H. Reina.",
        attachment_filename=filename,
        attachment_bytes=gzip.decompress(fixture_bytes),
    )

    result = process_inbound_email(email)

    assert result.attachment_filename == filename
    assert result.activity.original_filename == filename
    assert result.subject == email.subject
    assert result.activity.device_name == "SHIMASAIL"
    assert len(result.activity.samples) == 3613


def test_rejects_email_without_attachment() -> None:
    email = InboundEmail(
        sender_email="sailor-a@example.com",
        subject=VALID_FILENAME,
        attachment_filename=None,
        attachment_bytes=None,
    )

    with pytest.raises(InboundEmailRejected, match="no attachment"):
        process_inbound_email(email)


def test_subject_suffix_is_informational(
    fixture_bytes: bytes,
) -> None:
    email = InboundEmail(
        sender_email="sailor-a@example.com",
        subject="Training session",
        attachment_filename=VALID_FILENAME,
        attachment_bytes=fixture_bytes,
    )

    result = process_inbound_email(email)

    assert result.subject == "Training session"
    assert result.attachment_filename == VALID_FILENAME


def test_rejects_attachment_without_supported_csv_suffix(
    fixture_bytes: bytes,
) -> None:
    email = InboundEmail(
        sender_email="sailor-a@example.com",
        subject=VALID_FILENAME,
        attachment_filename="vakaros-demo.txt",
        attachment_bytes=fixture_bytes,
    )

    with pytest.raises(InboundEmailRejected, match="attachment filename"):
        process_inbound_email(email)


def test_unsupported_subject_suffix_does_not_override_valid_attachment(
    fixture_bytes: bytes,
) -> None:
    email = InboundEmail(
        sender_email="sailor-a@example.com",
        subject="vakaros-demo.vkx.gz",
        attachment_filename=VALID_FILENAME,
        attachment_bytes=fixture_bytes,
    )

    result = process_inbound_email(email)

    assert result.subject == "vakaros-demo.vkx.gz"
    assert result.attachment_filename == VALID_FILENAME


def test_rejects_corrupted_attachment() -> None:
    email = InboundEmail(
        sender_email="sailor-a@example.com",
        subject=VALID_FILENAME,
        attachment_filename=VALID_FILENAME,
        attachment_bytes=b"not a gzip file",
    )

    with pytest.raises(InboundEmailRejected, match="not a valid Vakaros"):
        process_inbound_email(email)
