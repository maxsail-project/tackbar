"""Version 1 mail receipts, separate from track results and consent delivery."""

import json
import os
from pathlib import Path
from uuid import uuid4

from app.services.ingestion_history import ADMIN_UPLOAD
from app.services.ingestion_lock import ingestion_lock


SCHEMA_VERSION = 1
RECEIPT_STATES = {"incomplete", "complete", "rejected", "legacy_complete"}
FEEDBACK_STATES = {"unreserved", "attempted", "sent", "failed", "legacy_suppressed"}


def receipt_path(history_path: Path) -> Path:
    return history_path.with_name("mail_receipts.json")


def read_receipts(path: Path) -> list[dict]:
    """Pure read: no lock, normalization, persistent IDs, or artifacts."""
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) != {"schema_version", "receipts"} or type(data["schema_version"]) is not int or data["schema_version"] != SCHEMA_VERSION or not isinstance(data["receipts"], list):
        raise ValueError("Malformed mail receipt collection")
    seen = set()
    for receipt in data["receipts"]:
        validate_receipt(receipt)
        key = (receipt["provider"], receipt["provider_message_id"])
        if key in seen:
            raise ValueError("Duplicate mail receipt identity")
        seen.add(key)
    return data["receipts"]


def validate_receipt(receipt: object) -> None:
    if (
        not isinstance(receipt, dict)
        or set(receipt) != {"provider", "provider_message_id", "receipt_state", "attachment_ingestion_ids", "feedback_state", "feedback_attempts"}
        or not isinstance(receipt["provider"], str) or not receipt["provider"] or receipt["provider"] == ADMIN_UPLOAD
        or not isinstance(receipt["provider_message_id"], str) or not receipt["provider_message_id"]
        or not isinstance(receipt["receipt_state"], str) or receipt["receipt_state"] not in RECEIPT_STATES
        or not isinstance(receipt["attachment_ingestion_ids"], list)
        or any(not isinstance(value, str) or not value for value in receipt["attachment_ingestion_ids"])
        or len(set(receipt["attachment_ingestion_ids"])) != len(receipt["attachment_ingestion_ids"])
        or not isinstance(receipt["feedback_state"], str) or receipt["feedback_state"] not in FEEDBACK_STATES
        or not isinstance(receipt["feedback_attempts"], list)
    ):
        raise ValueError("Malformed mail receipt")
    if receipt["receipt_state"] == "legacy_complete" and (receipt["feedback_state"] != "legacy_suppressed" or receipt["feedback_attempts"]):
        raise ValueError("Historical mail feedback must stay suppressed")
    attempt_ids = set()
    automatic_attempts = []
    for attempt in receipt["feedback_attempts"]:
        if not isinstance(attempt, dict) or set(attempt) != {"id", "kind", "status", "attempted_at", "sent_at", "last_error"}:
            raise ValueError("Malformed mail feedback attempt")
        if (
            not isinstance(attempt["id"], str) or not attempt["id"] or attempt["id"] in attempt_ids
            or attempt["kind"] not in ("automatic", "manual")
            or attempt["status"] not in ("attempted", "sent", "failed")
            or not isinstance(attempt["attempted_at"], str) or not attempt["attempted_at"]
            or (attempt["sent_at"] is not None) != (attempt["status"] == "sent")
            or (attempt["last_error"] is not None) != (attempt["status"] == "failed")
        ):
            raise ValueError("Malformed mail feedback attempt")
        attempt_ids.add(attempt["id"])
        if attempt["kind"] == "automatic":
            automatic_attempts.append(attempt)
    if len(automatic_attempts) > 1:
        raise ValueError("Mail has multiple automatic feedback attempts")
    if receipt["feedback_state"] in ("attempted", "sent", "failed") and (len(automatic_attempts) != 1 or automatic_attempts[0]["status"] != receipt["feedback_state"]):
        raise ValueError("Mail feedback state lacks an automatic attempt")
    if receipt["feedback_state"] in ("unreserved", "legacy_suppressed") and automatic_attempts:
        raise ValueError("Mail feedback state conflicts with automatic attempt")


class MailReceiptStore:
    def __init__(self, history_path: str | Path):
        self.path = receipt_path(Path(history_path))

    def receipts(self) -> list[dict]:
        return read_receipts(self.path)

    def get(self, provider: str, message_id: str) -> dict | None:
        return next((r for r in self.receipts() if (r["provider"], r["provider_message_id"]) == (provider, message_id)), None)

    def add(self, receipt: dict) -> dict:
        validate_receipt(receipt)
        with ingestion_lock(self.path.parent):
            receipts = self.receipts()
            if any((r["provider"], r["provider_message_id"]) == (receipt["provider"], receipt["provider_message_id"]) for r in receipts):
                raise ValueError("Mail receipt already exists")
            write_receipts(self.path, receipts + [receipt])
        return receipt


def write_receipts(path: Path, receipts: list[dict]) -> None:
    for receipt in receipts:
        validate_receipt(receipt)
    encoded = (json.dumps({"schema_version": SCHEMA_VERSION, "receipts": receipts}, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    atomic_bytes(path, encoded)


def atomic_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        with temporary.open("xb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
