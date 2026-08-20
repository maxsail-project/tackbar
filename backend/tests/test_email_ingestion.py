import gzip
from pathlib import Path

import pytest

from app.models import InboundEmail
from app.services.email_ingestion import (
    InboundEmailRejected,
    process_inbound_email,
)


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "VK-Maxi-URU 10-8-2026.csv.gz"
)
VALID_FILENAME = "VK-Maxi-URU 10-8-2026.csv.gz"
UPPERCASE_EXTENSION_FILENAME = "VK-Maxi-URU 10-8-2026.CSV.GZ"


@pytest.fixture
def fixture_bytes() -> bytes:
    assert FIXTURE_PATH.exists(), (
        "Missing real Vakaros fixture. Place it at "
        f"{FIXTURE_PATH}"
    )
    return FIXTURE_PATH.read_bytes()


def test_process_valid_email(fixture_bytes: bytes) -> None:
    email = InboundEmail(
        sender_email="maxi@example.com",
        subject=f"  {UPPERCASE_EXTENSION_FILENAME}  ",
        attachment_filename=UPPERCASE_EXTENSION_FILENAME,
        attachment_bytes=fixture_bytes,
    )

    result = process_inbound_email(email)

    assert result.sender_email == email.sender_email
    assert result.subject == email.subject
    assert result.attachment_filename == email.attachment_filename
    assert result.activity.original_filename == email.attachment_filename
    assert result.activity.device_name == "VK-Maxi-URU"
    assert len(result.activity.samples) == 3613


def test_process_valid_uncompressed_csv_email(fixture_bytes: bytes) -> None:
    filename = "VK-Maxi-URU 10-8-2026.CSV"
    email = InboundEmail(
        sender_email="maxi@example.com",
        subject=f"  {filename}  ",
        attachment_filename=filename,
        attachment_bytes=gzip.decompress(fixture_bytes),
    )

    result = process_inbound_email(email)

    assert result.attachment_filename == filename
    assert result.activity.original_filename == filename
    assert result.activity.device_name == "VK-Maxi-URU"
    assert len(result.activity.samples) == 3613


def test_rejects_email_without_attachment() -> None:
    email = InboundEmail(
        sender_email="maxi@example.com",
        subject=VALID_FILENAME,
        attachment_filename=None,
        attachment_bytes=None,
    )

    with pytest.raises(InboundEmailRejected, match="no attachment"):
        process_inbound_email(email)


def test_rejects_subject_without_supported_csv_suffix(
    fixture_bytes: bytes,
) -> None:
    email = InboundEmail(
        sender_email="maxi@example.com",
        subject="Training session",
        attachment_filename=VALID_FILENAME,
        attachment_bytes=fixture_bytes,
    )

    with pytest.raises(InboundEmailRejected, match="subject"):
        process_inbound_email(email)


def test_rejects_attachment_without_supported_csv_suffix(
    fixture_bytes: bytes,
) -> None:
    email = InboundEmail(
        sender_email="maxi@example.com",
        subject=VALID_FILENAME,
        attachment_filename="VK-Maxi-URU 10-8-2026.txt",
        attachment_bytes=fixture_bytes,
    )

    with pytest.raises(InboundEmailRejected, match="attachment filename"):
        process_inbound_email(email)


def test_rejects_vkx_subject(fixture_bytes: bytes) -> None:
    email = InboundEmail(
        sender_email="maxi@example.com",
        subject="VK-Maxi-URU 10-8-2026.vkx.gz",
        attachment_filename=VALID_FILENAME,
        attachment_bytes=fixture_bytes,
    )

    with pytest.raises(InboundEmailRejected, match="subject"):
        process_inbound_email(email)


def test_rejects_corrupted_attachment() -> None:
    email = InboundEmail(
        sender_email="maxi@example.com",
        subject=VALID_FILENAME,
        attachment_filename=VALID_FILENAME,
        attachment_bytes=b"not a gzip file",
    )

    with pytest.raises(InboundEmailRejected, match="not a valid Vakaros"):
        process_inbound_email(email)
