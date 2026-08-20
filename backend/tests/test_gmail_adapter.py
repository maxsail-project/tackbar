import base64
import gzip
from pathlib import Path
from unittest.mock import MagicMock

from app.email_providers.gmail import GmailAdapter


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "VK-Maxi-URU 10-8-2026.csv.gz"
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
                {"name": "From", "value": "Maxi <maxi@example.com>"},
                {
                    "name": "Subject",
                    "value": "  VK-Maxi-URU 10-8-2026.CSV.GZ  ",
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
                            "filename": "VK-Maxi-URU 10-8-2026.csv.gz",
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
    assert emails[0].sender_email == "maxi@example.com"
    assert emails[0].subject == "  VK-Maxi-URU 10-8-2026.CSV.GZ  "
    assert emails[0].attachment_filename == "VK-Maxi-URU 10-8-2026.csv.gz"
    assert emails[0].attachment_bytes == fixture_bytes
    assert emails[0].provider_message_id == "message-1"
    messages.list.assert_called_once_with(
        userId="me",
        q="is:unread has:attachment",
        maxResults=10,
    )


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
                {"name": "From", "value": "Maxi <maxi@example.com>"},
                {"name": "Subject", "value": "VK-Maxi-URU 10-8-2026.CSV"},
            ],
            "parts": [
                {
                    "filename": "VK-Maxi-URU 10-8-2026.CSV",
                    "body": {"data": encoded_attachment.rstrip("=")},
                }
            ],
        },
    }

    emails = GmailAdapter(service=service).get_candidate_emails()

    assert len(emails) == 1
    assert emails[0].attachment_filename == "VK-Maxi-URU 10-8-2026.CSV"
    assert emails[0].attachment_bytes == csv_bytes
    assert emails[0].provider_message_id == "message-csv"
    messages.attachments.return_value.get.assert_not_called()


def test_ignores_message_with_unsupported_subject() -> None:
    service = MagicMock()
    messages = service.users.return_value.messages.return_value
    messages.list.return_value.execute.return_value = {
        "messages": [{"id": "message-1"}]
    }
    messages.get.return_value.execute.return_value = {
        "id": "message-1",
        "payload": {
            "headers": [
                {"name": "From", "value": "maxi@example.com"},
                {"name": "Subject", "value": "Training session"},
            ],
            "parts": [
                {
                    "filename": "VK-Maxi-URU 10-8-2026.csv.gz",
                    "body": {"attachmentId": "attachment-1"},
                }
            ],
        },
    }

    assert GmailAdapter(service=service).get_candidate_emails() == []
    messages.attachments.return_value.get.assert_not_called()
