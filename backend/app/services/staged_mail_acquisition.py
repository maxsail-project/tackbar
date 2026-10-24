"""Internal OVH receipt acquisition. Not wired to the production review trigger."""

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

from app.email_providers.ovh import (
    MAX_DECODED_SUPPORTED_BYTES, MAX_STAGED_NAMED_PARTS,
    MAX_SUPPORTED_ATTACHMENTS, OVHAdapter, OVHAttachmentOccurrence,
    OVHMessageOutcome, OVHStagedMail,
    OVHUIDValidityMismatch,
)
from app.runtime_paths import require_private_data_root
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_lock import ingestion_lock
from app.services.mail_receipts import MailReceiptStore
from app.services.mailbox_review import MailboxReviewError, _configured_provider
from app.services.ovh_mailbox_cursor import OVHMailboxCursor, OVHMailboxCursorStore
from app.storage.ingestion_original_storage import IngestionOriginalStorage


@dataclass(frozen=True)
class StagedAcquisitionSummary:
    examined: int
    completed: int
    rejected: int
    last_seen_uid: int


def stage_ovh_mailbox_now(provider: OVHAdapter | None = None) -> StagedAcquisitionSummary:
    """Explicit internal boundary; no Activity processing or outbound communication."""
    require_private_data_root()
    adapter = provider if provider is not None else _configured_provider("ovh")
    cursor_store = OVHMailboxCursorStore()
    try:
        initial_cursor = cursor_store.load()
        batch = adapter.acquire_messages(
            last_seen_uid=None if initial_cursor is None else initial_cursor.last_seen_uid,
            expected_uidvalidity=None if initial_cursor is None else initial_cursor.uidvalidity,
            staged=True,
        )
    except Exception as error:
        raise MailboxReviewError("Mailbox acquisition unavailable") from error

    history = IngestionHistory()
    receipts = MailReceiptStore(history.path)
    completed = rejected = 0
    blocked = False
    with ingestion_lock(history.path.parent):
        current = cursor_store.load()
        if current is not None and current.uidvalidity != batch.uidvalidity:
            raise MailboxReviewError("Mailbox UIDVALIDITY changed") from OVHUIDValidityMismatch("Mailbox UIDVALIDITY changed")
        safe_uid = 0 if current is None else current.last_seen_uid
        previous_uid = 0
        for examined in batch.examined_messages:
            if examined.uid <= previous_uid:
                blocked = True
                break
            previous_uid = examined.uid
            if examined.uid <= safe_uid:
                continue
            if examined.outcome == OVHMessageOutcome.UNSUPPORTED:
                safe_uid = examined.uid
                continue
            mail = examined.staged_mail
            if mail is None or mail.provider_message_id != f"{batch.uidvalidity}:{examined.uid}":
                blocked = True
                break
            try:
                _persist_staged_mail(history, receipts, mail)
            except (OSError, ValueError):
                blocked = True
                break
            safe_uid = examined.uid
            if mail.rejection_reason is None:
                completed += 1
            else:
                rejected += 1
        if current is None or safe_uid > current.last_seen_uid:
            try:
                cursor_store.write(OVHMailboxCursor(batch.uidvalidity, safe_uid))
            except Exception as error:
                raise MailboxReviewError("Mailbox cursor unavailable") from error
    if blocked or batch.acquisition_failed:
        raise MailboxReviewError("Mailbox acquisition incomplete")
    return StagedAcquisitionSummary(len(batch.examined_messages), completed, rejected, safe_uid)


def _persist_staged_mail(history: IngestionHistory, receipts: MailReceiptStore, mail: OVHStagedMail) -> None:
    provider, message_id = "ovh", mail.provider_message_id
    receipt = receipts.get(provider, message_id)
    existing = history.find_mail_attachments(provider, message_id)
    if mail.rejection_reason is not None:
        if existing or mail.attachments:
            raise ValueError("Rejected mail conflicts with accepted attachments")
        if receipt is None:
            receipts.add({
                "provider": provider, "provider_message_id": message_id,
                "receipt_state": "rejected", "attachment_ingestion_ids": [],
                "feedback_state": "unreserved", "feedback_attempts": [],
                "rejection_reason": mail.rejection_reason,
            })
        elif receipt["receipt_state"] != "rejected" or receipt.get("rejection_reason") != mail.rejection_reason:
            raise ValueError("Conflicting mail rejection")
        return
    if not mail.attachments:
        raise ValueError("Supported mail has no accounted attachments")
    if len(mail.attachments) > MAX_SUPPORTED_ATTACHMENTS:
        raise ValueError("Supported mail exceeds attachment limit")
    if sum(len(item.content) for item in mail.attachments if item.content is not None) > MAX_DECODED_SUPPORTED_BYTES:
        raise ValueError("Supported mail exceeds decoded payload limit")
    expected_ordinals = [item.ordinal for item in mail.attachments]
    if (
        any(type(ordinal) is not int or ordinal < 1 or ordinal > MAX_STAGED_NAMED_PARTS for ordinal in expected_ordinals)
        or len(set(expected_ordinals)) != len(expected_ordinals)
        or expected_ordinals != sorted(expected_ordinals)
    ):
        raise ValueError("Unstable mail attachment traversal")
    if any((item.content is None) == (item.acquisition_error is None) for item in mail.attachments):
        raise ValueError("Attachment lacks exactly one acquisition outcome")
    if receipt is None:
        if existing:
            raise ValueError("Mail Ingestions exist without a receipt")
        receipt = receipts.add({
            "provider": provider, "provider_message_id": message_id,
            "receipt_state": "incomplete", "attachment_ingestion_ids": [],
            "feedback_state": "unreserved", "feedback_attempts": [],
        })
    elif receipt["receipt_state"] not in ("incomplete", "complete"):
        raise ValueError("Mail receipt cannot acquire attachments")
    if [record["attachment_ordinal"] for record in existing] != expected_ordinals[:len(existing)]:
        raise ValueError("Persisted attachments conflict with MIME traversal")
    stored_ids = receipt["attachment_ingestion_ids"]
    existing_ids = [record["id"] for record in existing]
    if stored_ids != existing_ids[:len(stored_ids)]:
        raise ValueError("Mail receipt attachment order conflicts with history")
    if receipt["receipt_state"] == "complete" and len(existing_ids) != len(mail.attachments):
        raise ValueError("Completed mail receipt lacks attachments")
    originals = IngestionOriginalStorage(history.path.parent)
    ids = []
    for item in mail.attachments:
        record = _persist_occurrence(history, originals, mail, item)
        ids.append(record["id"])
        stored_ids = receipt["attachment_ingestion_ids"]
        if stored_ids[:len(ids)] != ids[:len(stored_ids)]:
            raise ValueError("Mail receipt attachment order conflicts with history")
        if receipt["receipt_state"] == "incomplete" and len(stored_ids) < len(ids):
            receipt = receipts.replace({**receipt, "attachment_ingestion_ids": ids.copy()})
    if receipt["attachment_ingestion_ids"] != ids:
        raise ValueError("Completed mail receipt conflicts with attachments")
    for item in mail.attachments:
        _verify_occurrence(history.find_mail_attachment(provider, message_id, item.ordinal), originals, item)
    if receipt["receipt_state"] == "incomplete":
        receipts.replace({**receipt, "receipt_state": "complete"})


def _persist_occurrence(
    history: IngestionHistory,
    originals: IngestionOriginalStorage,
    mail: OVHStagedMail,
    item: OVHAttachmentOccurrence,
) -> dict:
    if type(item.ordinal) is not int or item.ordinal < 1 or not item.filename:
        raise ValueError("Malformed attachment identity")
    digest = sha256(item.content).hexdigest() if item.content is not None else None
    record = history.find_mail_attachment("ovh", mail.provider_message_id, item.ordinal)
    if record is None:
        record = history.create(
            "ovh", mail.provider_message_id, mail.sender_email, item.filename, digest,
            attachment_ordinal=item.ordinal, status="pending",
        )
    if (
        record["attachment_name"] != item.filename
        or record["attachment_sha256"] != digest
        or record["attachment_ordinal_verified"] is not True
        or record["sender_email"] != mail.sender_email
        or record["status"] not in ("pending", "acquisition_failed")
    ):
        raise ValueError("Conflicting persisted attachment identity")
    received_at = mail.received_at.isoformat() if mail.received_at else None
    if record["received_at"] not in (None, received_at):
        raise ValueError("Conflicting persisted mail received time")
    if record["received_at"] is None and received_at is not None:
        record["received_at"] = received_at
        history.replace(record)
    if item.acquisition_error is not None:
        if record["original_file"] is not None or record["status"] == "pending" and record["attachment_sha256"] is not None:
            raise ValueError("Acquisition failure conflicts with original")
        if record["status"] != "acquisition_failed":
            record.update(status="acquisition_failed", last_error=item.acquisition_error)
            history.replace(record)
    else:
        if item.content is None or record["status"] != "pending":
            raise ValueError("Accepted attachment is unavailable")
        expected = originals.relative_reference(record["id"], item.filename)
        if record["original_file"] not in (None, expected):
            raise ValueError("Conflicting persisted original reference")
        relative = originals.preserve(record["id"], item.filename, item.content)
        if record["original_file"] is None:
            record["original_file"] = relative
            history.replace(record)
    return record


def _verify_occurrence(record: dict | None, originals: IngestionOriginalStorage, item: OVHAttachmentOccurrence) -> None:
    if record is None:
        raise ValueError("Missing acquired attachment")
    if item.acquisition_error is not None:
        if record["status"] != "acquisition_failed" or record["last_error"] != item.acquisition_error or record["original_file"] is not None:
            raise ValueError("Acquisition failure was not durably accounted")
        return
    if record["status"] != "pending" or record["original_file"] is None or item.content is None:
        raise ValueError("Accepted attachment original is incomplete")
    if originals.read(record["original_file"]) != item.content:
        raise ValueError("Accepted attachment original differs from MIME bytes")


def recover_unattempted_ingestions(history_path: str | Path | None = None) -> list[dict]:
    """Read complete receipts independently of the OVH cursor; never process them."""
    history = IngestionHistory(history_path)
    with ingestion_lock(history.path.parent):
        originals = IngestionOriginalStorage(history.path.parent)
        result = []
        for receipt in MailReceiptStore(history.path).receipts():
            if receipt["provider"] != "ovh" or receipt["receipt_state"] != "complete":
                continue
            records = history.find_mail_attachments("ovh", receipt["provider_message_id"])
            if [record["id"] for record in records] != receipt["attachment_ingestion_ids"]:
                raise ValueError("Complete mail receipt conflicts with history")
            for record in records:
                if record["status"] == "pending":
                    if record["attempts"] != 0 or record["original_file"] is None:
                        raise ValueError("Incomplete pending mail Ingestion")
                    content = originals.read(record["original_file"])
                    if sha256(content).hexdigest() != record["attachment_sha256"]:
                        raise ValueError("Pending mail original SHA-256 mismatch")
                    result.append(record)
        return result
