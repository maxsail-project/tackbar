import imaplib
import re
from dataclasses import dataclass
from datetime import timezone
from email import policy
from email.header import decode_header, make_header
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from enum import Enum

from app.models import InboundEmail
from app.parsers.track import is_supported_track_attachment


class OVHMessageOutcome(str, Enum):
    SUPPORTED = "supported"
    UNSUPPORTED = "unsupported"
    MALFORMED = "malformed"
    REJECTED = "rejected"


MAX_STAGED_RAW_BYTES = 64 * 1024 * 1024
MAX_STAGED_MIME_PARTS = 256
MAX_STAGED_NAMED_PARTS = 128
MAX_STAGED_FETCH_BATCH = 2
MAX_SUPPORTED_ATTACHMENTS = 12
MAX_DECODED_SUPPORTED_BYTES = 16 * 1024 * 1024


@dataclass(frozen=True)
class OVHAttachmentOccurrence:
    ordinal: int
    filename: str
    content: bytes | None
    acquisition_error: str | None = None


@dataclass(frozen=True)
class OVHStagedMail:
    provider_message_id: str
    sender_email: str
    received_at: object | None
    attachments: tuple[OVHAttachmentOccurrence, ...]
    rejection_reason: str | None = None


@dataclass(frozen=True)
class OVHExaminedMessage:
    uid: int
    candidate: InboundEmail | None
    outcome: OVHMessageOutcome
    error_class: str | None = None
    staged_mail: OVHStagedMail | None = None


@dataclass(frozen=True)
class OVHAcquisitionBatch:
    uidvalidity: int
    examined_messages: tuple[OVHExaminedMessage, ...]
    acquisition_failed: bool = False


class OVHUIDValidityMismatch(RuntimeError):
    pass


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
        *,
        staged: bool = False,
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
            if staged:
                uids = uids[:MAX_STAGED_FETCH_BATCH]

            examined = []
            for uid in uids:
                uid_bytes = str(uid).encode("ascii")
                if staged:
                    try:
                        status, size_response = connection.uid(
                            "FETCH", uid_bytes, "(RFC822.SIZE)"
                        )
                    except Exception:
                        return OVHAcquisitionBatch(uidvalidity, tuple(examined), acquisition_failed=True)
                    if status != "OK" or not isinstance(size_response, (list, tuple)):
                        return OVHAcquisitionBatch(uidvalidity, tuple(examined), acquisition_failed=True)
                    size_parts = [
                        part if isinstance(part, bytes) else part[0]
                        for part in size_response
                        if isinstance(part, bytes) or (isinstance(part, tuple) and part and isinstance(part[0], bytes))
                    ]
                    size_matches = [re.search(rb"RFC822\.SIZE\s+(\d+)", part) for part in size_parts]
                    reported_size = next((int(match.group(1)) for match in size_matches if match), None)
                    if reported_size is None:
                        return OVHAcquisitionBatch(uidvalidity, tuple(examined), acquisition_failed=True)
                    if reported_size > MAX_STAGED_RAW_BYTES:
                        examined.append(OVHExaminedMessage(
                            uid, None, OVHMessageOutcome.REJECTED,
                            staged_mail=OVHStagedMail(f"{uidvalidity}:{uid}", "", None, (), "raw_message_limit"),
                        ))
                        continue
                try:
                    status, response = connection.uid(
                        "FETCH", uid_bytes, "(BODY.PEEK[])"
                    )
                except Exception:
                    if staged:
                        return OVHAcquisitionBatch(uidvalidity, tuple(examined), acquisition_failed=True)
                    raise
                if status != "OK":
                    return OVHAcquisitionBatch(
                        uidvalidity, tuple(examined), acquisition_failed=True
                    )
                if not isinstance(response, (list, tuple)):
                    return OVHAcquisitionBatch(uidvalidity, tuple(examined), acquisition_failed=True)
                raw = next(
                    (
                        part[1]
                        for part in response
                        if isinstance(part, tuple)
                        and len(part) > 1
                        and isinstance(part[1], bytes)
                    ),
                    None,
                )
                if raw is None:
                    return OVHAcquisitionBatch(
                        uidvalidity, tuple(examined), acquisition_failed=True
                    )
                try:
                    message_id = f"{uidvalidity}:{uid}"
                    if staged:
                        staged_mail = _extract_staged_mail(raw, message_id)
                        examined.append(OVHExaminedMessage(
                            uid, None,
                            OVHMessageOutcome.REJECTED if staged_mail is not None and staged_mail.rejection_reason else (OVHMessageOutcome.SUPPORTED if staged_mail is not None else OVHMessageOutcome.UNSUPPORTED),
                            staged_mail=staged_mail,
                        ))
                        continue
                    candidate = _extract_email(raw, message_id)
                except Exception as error:
                    examined.append(
                        OVHExaminedMessage(
                            uid,
                            None,
                            OVHMessageOutcome.MALFORMED,
                            type(error).__name__,
                        )
                    )
                    if staged:
                        return OVHAcquisitionBatch(uidvalidity, tuple(examined), acquisition_failed=True)
                    continue
                outcome = (
                    OVHMessageOutcome.SUPPORTED
                    if candidate is not None
                    else OVHMessageOutcome.UNSUPPORTED
                )
                examined.append(
                    OVHExaminedMessage(uid, candidate, outcome)
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


def _extract_email(raw: bytes, provider_message_id: str) -> InboundEmail | None:
    message = BytesParser(policy=policy.default).parsebytes(raw)
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
        raise ValueError("OVH message contains multiple supported attachments")
    if not attachments:
        return None
    if attachments[0][1] is None:
        raise ValueError("OVH supported attachment body is unavailable")
    filename, content = attachments[0]
    return InboundEmail(sender_email, subject, filename, content, provider_message_id, received_at)


def _extract_staged_mail(raw: bytes, provider_message_id: str) -> OVHStagedMail | None:
    if len(raw) > MAX_STAGED_RAW_BYTES:
        return OVHStagedMail(provider_message_id, "", None, (), "raw_message_limit")
    parts_created = 0

    class TooManyMIMEParts(Exception):
        pass

    def bounded_message_factory(*args, **kwargs):
        nonlocal parts_created
        parts_created += 1
        if parts_created > MAX_STAGED_MIME_PARTS:
            raise TooManyMIMEParts
        return policy.default.message_factory(*args, **kwargs)

    try:
        message = BytesParser(_class=bounded_message_factory, policy=policy.default).parsebytes(raw)
    except TooManyMIMEParts:
        return OVHStagedMail(provider_message_id, "", None, (), "mime_part_limit")
    if message.defects:
        raise ValueError("OVH MIME structure cannot be safely enumerated")
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

    named = []
    for part_number, part in enumerate(message.walk(), start=1):
        if part_number > MAX_STAGED_MIME_PARTS:
            return OVHStagedMail(provider_message_id, sender_email, received_at, (), "mime_part_limit")
        if part.defects and part.is_multipart():
            raise ValueError("OVH MIME structure cannot be safely enumerated")
        filename = part.get_filename()
        if filename:
            named.append((_header_text(filename), part))
            if len(named) > MAX_STAGED_NAMED_PARTS:
                return OVHStagedMail(provider_message_id, sender_email, received_at, (), "named_part_limit")
    supported = [
        (ordinal, filename, part)
        for ordinal, (filename, part) in enumerate(named, start=1)
        if is_supported_track_attachment(filename)
    ]
    if not supported:
        return None
    if len(supported) > MAX_SUPPORTED_ATTACHMENTS:
        return OVHStagedMail(provider_message_id, sender_email, received_at, (), "attachment_count_limit")

    occurrences = []
    cumulative = 0
    for ordinal, filename, part in supported:
        try:
            content = part.get_payload(decode=True)
        except Exception:
            content = None
        if content is None or part.defects:
            occurrences.append(OVHAttachmentOccurrence(ordinal, filename, None, "mime_decode_failed"))
            continue
        cumulative += len(content)
        if cumulative > MAX_DECODED_SUPPORTED_BYTES:
            return OVHStagedMail(provider_message_id, sender_email, received_at, (), "decoded_bytes_limit")
        occurrences.append(OVHAttachmentOccurrence(ordinal, filename, content))
    return OVHStagedMail(provider_message_id, sender_email, received_at, tuple(occurrences))
