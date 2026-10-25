import imaplib
import os
from dataclasses import dataclass
from datetime import timezone
from email import policy
from email.header import decode_header, make_header
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from enum import Enum
import re

from app.models import InboundEmail
from app.parsers.track import is_supported_track_attachment


class OVHMessageOutcome(str, Enum):
    SUPPORTED = "supported"
    UNSUPPORTED = "unsupported"
    MALFORMED = "malformed"
    MULTIPLE_SUPPORTED = "multiple_supported"


@dataclass(frozen=True)
class OVHExaminedMessage:
    uid: int
    candidate: InboundEmail | None
    outcome: OVHMessageOutcome
    error_class: str | None = None
    notice_recipient: str | None = None


@dataclass(frozen=True)
class OVHAcquisitionBatch:
    uidvalidity: int
    examined_messages: tuple[OVHExaminedMessage, ...]
    acquisition_failed: bool = False


class OVHUIDValidityMismatch(RuntimeError):
    pass


class OVHMultipleSupportedAttachments(ValueError):
    def __init__(self, notice_recipient: str | None) -> None:
        super().__init__("OVH message contains multiple supported attachments")
        self.notice_recipient = notice_recipient


class OVHAdapter:
    def __init__(self, host: str, port: int, username: str, password: str) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password

    def get_candidate_emails(self) -> list[InboundEmail]:
        batch = self.acquire_messages()
        if batch.acquisition_failed:
            raise RuntimeError("Could not fetch mailbox message")
        return [
            item.candidate
            for item in batch.examined_messages
            if item.candidate is not None
        ]

    def acquire_messages(
        self,
        last_seen_uid: int | None = None,
        expected_uidvalidity: int | None = None,
    ) -> OVHAcquisitionBatch:
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
            uidvalidity_text = values[0].decode("ascii") if isinstance(values[0], bytes) else str(values[0])
            if not uidvalidity_text.isdecimal():
                raise RuntimeError("Mailbox UIDVALIDITY is invalid")
            uidvalidity = int(uidvalidity_text)
            if uidvalidity <= 0:
                raise RuntimeError("Mailbox UIDVALIDITY is invalid")
            if (
                expected_uidvalidity is not None
                and uidvalidity != expected_uidvalidity
            ):
                raise OVHUIDValidityMismatch("Mailbox UIDVALIDITY changed")

            search = (
                "ALL"
                if last_seen_uid is None
                else f"UID {last_seen_uid + 1}:*"
            )
            status, values = connection.uid("SEARCH", None, search)
            if status != "OK":
                raise RuntimeError("Could not search mailbox")
            uid_values = (values[0] if values else b"").split()
            if any(not uid.isdigit() for uid in uid_values):
                raise RuntimeError("Mailbox UID is invalid")
            uids = sorted({int(uid) for uid in uid_values})
            if last_seen_uid is not None:
                uids = [uid for uid in uids if uid > last_seen_uid]

            examined = []
            for uid in uids:
                uid_bytes = str(uid).encode("ascii")
                status, response = connection.uid(
                    "FETCH", uid_bytes, "(BODY.PEEK[])"
                )
                if status != "OK":
                    return OVHAcquisitionBatch(
                        uidvalidity, tuple(examined), acquisition_failed=True
                    )
                raw = next(
                    (
                        part[1]
                        for part in response
                        if isinstance(part, tuple)
                        and isinstance(part[1], bytes)
                    ),
                    None,
                )
                if raw is None:
                    return OVHAcquisitionBatch(
                        uidvalidity, tuple(examined), acquisition_failed=True
                    )
                try:
                    candidate, notice_recipient = _extract_email(
                        raw, f"{uidvalidity}:{uid}", self.username
                    )
                except OVHMultipleSupportedAttachments as error:
                    examined.append(OVHExaminedMessage(
                        uid, None, OVHMessageOutcome.MULTIPLE_SUPPORTED,
                        notice_recipient=error.notice_recipient,
                    ))
                    continue
                except Exception as error:
                    examined.append(
                        OVHExaminedMessage(
                            uid,
                            None,
                            OVHMessageOutcome.MALFORMED,
                            type(error).__name__,
                        )
                    )
                    continue
                outcome = (
                    OVHMessageOutcome.SUPPORTED
                    if candidate is not None
                    else OVHMessageOutcome.UNSUPPORTED
                )
                examined.append(
                    OVHExaminedMessage(uid, candidate, outcome,
                                       notice_recipient=notice_recipient)
                )
            return OVHAcquisitionBatch(uidvalidity, tuple(examined))
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


def _notice_recipient(message, mailbox_address: str) -> str | None:
    headers = message.get_all("From", [])
    if len(headers) != 1 or getattr(headers[0], "defects", ()):
        return None
    try:
        addresses = getattr(headers[0], "addresses", ())
        if len(addresses) != 1:
            return None
        address = addresses[0].addr_spec
    except (AttributeError, IndexError, TypeError, ValueError):
        return None
    if not isinstance(address, str) or not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+", address):
        return None
    local, domain = address.rsplit("@", 1)
    if not local or "." not in domain or any(not label or label.startswith("-") or label.endswith("-") for label in domain.split(".")):
        return None
    owned = {"share@tackbar.eu", "hello@tackbar.eu", mailbox_address.lower()}
    configured_from = os.environ.get("TACKBAR_OVH_SMTP_FROM")
    if configured_from:
        owned.add(configured_from.strip().lower())
    if address.lower() in owned:
        return None
    if any(str(value).strip() == "<>" for value in message.get_all("Return-Path", [])):
        return None
    if any(name.lower().startswith("list-") for name in message.keys()):
        return None
    if any(message.get_all(name, []) for name in ("X-Auto-Response-Suppress", "X-Loop", "X-BeenThere")):
        return None
    if any(str(value).strip().lower() not in ("", "no") for value in message.get_all("Auto-Submitted", [])):
        return None
    if any(str(value).strip().lower() in {"bulk", "list", "junk"} for value in message.get_all("Precedence", [])):
        return None
    return address


def _extract_email(raw: bytes, provider_message_id: str, mailbox_address: str) -> tuple[InboundEmail | None, str | None]:
    message = BytesParser(policy=policy.default).parsebytes(raw)
    notice_recipient = _notice_recipient(message, mailbox_address)
    subject = _header_text(str(message.get("Subject", "")))

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
        if is_supported_track_attachment(filename):
            attachments.append((filename, part.get_payload(decode=True)))
    if len(attachments) > 1:
        raise OVHMultipleSupportedAttachments(notice_recipient)
    if not attachments:
        return None, None
    if attachments[0][1] is None:
        raise ValueError("OVH supported attachment body is unavailable")
    filename, content = attachments[0]
    return InboundEmail(sender_email, subject, filename, content, provider_message_id, received_at), notice_recipient
