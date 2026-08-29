import base64
from email.utils import parseaddr
from pathlib import Path
from typing import Any, Iterator
from datetime import datetime, timezone

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from app.models import InboundEmail
from app.parsers.vakaros_csv import has_vakaros_csv_suffix


SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_CREDENTIALS_PATH = BACKEND_DIR / "secrets" / "credentials.json"
DEFAULT_TOKEN_PATH = BACKEND_DIR / "token.json"


class GmailAdapter:
    def __init__(
        self,
        credentials_path: str | Path = DEFAULT_CREDENTIALS_PATH,
        token_path: str | Path = DEFAULT_TOKEN_PATH,
        service: Any | None = None,
        allow_interactive: bool = False,
    ) -> None:
        self.credentials_path = Path(credentials_path)
        self.token_path = Path(token_path)
        self._service = service
        self.allow_interactive = allow_interactive

    def authenticate(self) -> Any:
        if self._service is not None:
            return self._service

        credentials = None
        if self.token_path.exists():
            credentials = Credentials.from_authorized_user_file(
                self.token_path,
                SCOPES,
            )

        if not credentials or not credentials.valid:
            if credentials and credentials.expired and credentials.refresh_token:
                credentials.refresh(Request())
            else:
                if not self.allow_interactive:
                    raise RuntimeError("Gmail authorization is not prepared")
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_path,
                    SCOPES,
                )
                credentials = flow.run_local_server(port=0)

            self.token_path.write_text(credentials.to_json(), encoding="utf-8")

        self._service = build("gmail", "v1", credentials=credentials)
        return self._service

    def get_candidate_emails(self) -> list[InboundEmail]:
        service = self.authenticate()
        emails = []
        page_token = None
        while True:
            kwargs = {"userId": "me", "q": "has:attachment", "maxResults": 100}
            if page_token:
                kwargs["pageToken"] = page_token
            response = service.users().messages().list(**kwargs).execute()
            for reference in response.get("messages", []):
                message = service.users().messages().get(userId="me", id=reference["id"], format="full").execute()
                emails.extend(self._extract_emails(service, message))
            page_token = response.get("nextPageToken")
            if not page_token:
                break

        if len(emails) > 1:
            raise ValueError("Gmail message contains multiple supported attachments")
        return emails

    def _extract_emails(
        self,
        service: Any,
        message: dict[str, Any],
    ) -> list[InboundEmail]:
        payload = message.get("payload", {})
        headers = {
            header.get("name", "").lower(): header.get("value", "")
            for header in payload.get("headers", [])
        }
        subject = headers.get("subject", "")
        if not has_vakaros_csv_suffix(subject.strip()):
            return []

        sender_header = headers.get("from", "")
        sender_email = parseaddr(sender_header)[1] or sender_header
        emails = []
        received_at = None
        if message.get("internalDate"):
            received_at = datetime.fromtimestamp(int(message["internalDate"]) / 1000, tz=timezone.utc)

        for part in _walk_parts(payload):
            filename = part.get("filename", "")
            if not has_vakaros_csv_suffix(filename):
                continue

            body = part.get("body", {})
            encoded_data = body.get("data")
            if not encoded_data and body.get("attachmentId"):
                attachment = (
                    service.users()
                    .messages()
                    .attachments()
                    .get(
                        userId="me",
                        messageId=message["id"],
                        id=body["attachmentId"],
                    )
                    .execute()
                )
                encoded_data = attachment.get("data")

            if not encoded_data:
                continue

            emails.append(
                InboundEmail(
                    sender_email=sender_email,
                    subject=subject,
                    attachment_filename=filename,
                    attachment_bytes=_decode_base64url(encoded_data),
                    provider_message_id=message["id"],
                    received_at=received_at,
                )
            )

        return emails


def _walk_parts(part: dict[str, Any]) -> Iterator[dict[str, Any]]:
    for child in part.get("parts", []):
        yield child
        yield from _walk_parts(child)


def _decode_base64url(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)
