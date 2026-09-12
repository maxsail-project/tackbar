import imaplib
from datetime import timezone
from email import policy
from email.header import decode_header, make_header
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime

from app.models import InboundEmail
from app.parsers.vakaros_csv import has_vakaros_csv_suffix


class OVHAdapter:
    def __init__(self, host: str, port: int, username: str, password: str) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password

    def get_candidate_emails(self) -> list[InboundEmail]:
        connection = imaplib.IMAP4_SSL(self.host, self.port)
        selected = False
        try:
            connection.login(self.username, self.password)
            status, _ = connection.select("INBOX", readonly=True)
            if status != "OK":
                raise RuntimeError("Could not select mailbox")
            selected = True
            status, values = connection.response("UIDVALIDITY")
            if status != "UIDVALIDITY" or not values or not values[0]:
                raise RuntimeError("Mailbox UIDVALIDITY is unavailable")
            uidvalidity = values[0].decode("ascii") if isinstance(values[0], bytes) else str(values[0])
            if not uidvalidity.isdecimal():
                raise RuntimeError("Mailbox UIDVALIDITY is invalid")

            status, values = connection.uid("SEARCH", None, "ALL")
            if status != "OK":
                raise RuntimeError("Could not search mailbox")
            candidates = []
            for uid in (values[0] if values else b"").split():
                if not uid.isdigit():
                    raise RuntimeError("Mailbox UID is invalid")
                status, response = connection.uid("FETCH", uid, "(BODY.PEEK[])")
                if status != "OK":
                    raise RuntimeError("Could not fetch mailbox message")
                raw = next((part[1] for part in response if isinstance(part, tuple) and isinstance(part[1], bytes)), None)
                if raw is None:
                    raise RuntimeError("Mailbox message body is unavailable")
                candidate = _extract_email(raw, f"{uidvalidity}:{uid.decode('ascii')}")
                if candidate is not None:
                    candidates.append(candidate)
            return candidates
        finally:
            try:
                if selected:
                    connection.close()
            finally:
                connection.logout()


def _header_text(value: str) -> str:
    try:
        return str(make_header(decode_header(value)))
    except (LookupError, ValueError, TypeError):
        return value


def _extract_email(raw: bytes, provider_message_id: str) -> InboundEmail | None:
    message = BytesParser(policy=policy.default).parsebytes(raw)
    subject = _header_text(str(message.get("Subject", "")))
    if not has_vakaros_csv_suffix(subject.strip()):
        return None

    sender_header = _header_text(str(message.get("From", "")))
    sender_email = parseaddr(sender_header)[1] or sender_header
    received_at = None
    date_header = message.get("Date")
    if date_header:
        try:
            received_at = parsedate_to_datetime(str(date_header))
            if received_at.tzinfo is None:
                received_at = received_at.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError, IndexError, OverflowError):
            pass

    attachments = []
    for part in message.walk():
        filename = part.get_filename()
        if not filename:
            continue
        filename = _header_text(filename)
        if has_vakaros_csv_suffix(filename):
            attachments.append((filename, part.get_payload(decode=True)))
    if len(attachments) > 1:
        raise ValueError("OVH message contains multiple supported attachments")
    if not attachments or attachments[0][1] is None:
        return None
    filename, content = attachments[0]
    return InboundEmail(sender_email, subject, filename, content, provider_message_id, received_at)
