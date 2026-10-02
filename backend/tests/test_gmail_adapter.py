import base64
import gzip
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.email_providers.gmail import GmailAdapter


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)


def test_get_candidate_emails_from_gmail_response() -> None:
    fixture_bytes = FIXTURE_PATH.read_bytes()
    encoded_attachment = base64.urlsafe_b64encode(fixture_bytes).decode("ascii")
    service = MagicMock()
    messages = service.users.return_value.messages.return_value
    messages.list.return_value.execute.return_value = {
        "messages": [{"id": "message-1"}]
    }
    messages.get.return_value.execute.return_value = {
        "id": "message-1",
        "payload": {
            "headers": [
                {"name": "From", "value": "Sailor A <sailor-a@example.com>"},
                {
                    "name": "Subject",
                    "value": "A normal note from a sailor",
                },
            ],
            "parts": [
                {
                    "mimeType": "multipart/mixed",
                    "parts": [
                        {
                            "filename": "notes.txt",
                            "body": {"data": "bm90ZXM="},
                        },
                        {
                            "filename": "vakaros-demo.csv.gz",
                            "body": {"attachmentId": "attachment-1"},
                        },
                    ],
                }
            ],
        },
    }
    messages.attachments.return_value.get.return_value.execute.return_value = {
        "data": encoded_attachment.rstrip("=")
    }

    emails = GmailAdapter(service=service).get_candidate_emails()

    assert len(emails) == 1
    assert emails[0].sender_email == "sailor-a@example.com"
    assert emails[0].subject == "A normal note from a sailor"
    assert emails[0].attachment_filename == "vakaros-demo.csv.gz"
    assert emails[0].attachment_bytes == fixture_bytes
    assert emails[0].provider_message_id == "message-1"
    messages.list.assert_called_once_with(
        userId="me",
        q="has:attachment",
        maxResults=100,
    )


def test_multiple_gmail_messages_are_independent_candidates() -> None:
    service = MagicMock()
    messages = service.users.return_value.messages.return_value
    messages.list.return_value.execute.return_value = {
        "messages": [{"id": "message-a"}, {"id": "message-b"}]
    }
    def message(message_id: str) -> dict:
        return {"id": message_id, "payload": {"headers": [
            {"name": "From", "value": "same@example.com"},
            {"name": "Subject", "value": "vakaros.csv"},
        ], "parts": [{"filename": "track.csv", "body": {"data": "dHJhY2s="}}]}}
    messages.get.return_value.execute.side_effect = [message("message-a"), message("message-b")]
    candidates = GmailAdapter(service=service).get_candidate_emails()
    assert [item.provider_message_id for item in candidates] == ["message-a", "message-b"]


def test_get_candidate_uncompressed_csv_from_gmail_response() -> None:
    csv_bytes = gzip.decompress(FIXTURE_PATH.read_bytes())
    encoded_attachment = base64.urlsafe_b64encode(csv_bytes).decode("ascii")
    service = MagicMock()
    messages = service.users.return_value.messages.return_value
    messages.list.return_value.execute.return_value = {
        "messages": [{"id": "message-csv"}]
    }
    messages.get.return_value.execute.return_value = {
        "id": "message-csv",
        "payload": {
            "headers": [
                {"name": "From", "value": "Sailor A <sailor-a@example.com>"},
                {"name": "Subject", "value": "Training on Saturday"},
            ],
            "parts": [
                {
                    "filename": "vakaros-demo.CSV",
                    "body": {"data": encoded_attachment.rstrip("=")},
                }
            ],
        },
    }

    emails = GmailAdapter(service=service).get_candidate_emails()

    assert len(emails) == 1
    assert emails[0].attachment_filename == "vakaros-demo.CSV"
    assert emails[0].attachment_bytes == csv_bytes
    assert emails[0].provider_message_id == "message-csv"
    messages.attachments.return_value.get.assert_not_called()


def test_ignores_unsupported_attachment_even_when_subject_ends_in_csv() -> None:
    service = MagicMock()
    messages = service.users.return_value.messages.return_value
    messages.list.return_value.execute.return_value = {
        "messages": [{"id": "message-1"}]
    }
    messages.get.return_value.execute.return_value = {
        "id": "message-1",
        "payload": {
            "headers": [
                {"name": "From", "value": "sailor-a@example.com"},
                {"name": "Subject", "value": "activity.csv"},
            ],
            "parts": [
                {
                    "filename": "photo.jpg",
                    "body": {"attachmentId": "attachment-1"},
                }
            ],
        },
    }

    assert GmailAdapter(service=service).get_candidate_emails() == []
    messages.attachments.return_value.get.assert_not_called()


def test_ignores_message_without_attachments() -> None:
    service = MagicMock()
    messages = service.users.return_value.messages.return_value
    messages.list.return_value.execute.return_value = {
        "messages": [{"id": "message-empty"}]
    }
    messages.get.return_value.execute.return_value = {
        "id": "message-empty",
        "payload": {
            "headers": [
                {"name": "From", "value": "sailor-a@example.com"},
                {"name": "Subject", "value": "Training session"},
            ],
            "parts": [],
        },
    }

    assert GmailAdapter(service=service).get_candidate_emails() == []


def test_rejects_multiple_supported_attachments() -> None:
    service = MagicMock()
    messages = service.users.return_value.messages.return_value
    messages.list.return_value.execute.return_value = {
        "messages": [{"id": "message-multiple"}]
    }
    messages.get.return_value.execute.return_value = {
        "id": "message-multiple",
        "payload": {
            "headers": [
                {"name": "From", "value": "sailor-a@example.com"},
                {"name": "Subject", "value": "Two tracks"},
            ],
            "parts": [
                {"filename": "one.csv", "body": {"data": "b25l"}},
                {"filename": "two.csv.gz", "body": {"data": "dHdv"}},
            ],
        },
    }

    with pytest.raises(ValueError, match="multiple supported attachments"):
        GmailAdapter(service=service).get_candidate_emails()
