import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.identity import require_uuid
from app.models import ConsentRequest
from app.runtime_paths import PUBLIC_TEST_DATA_ROOT, runtime_paths
from app.services.ingestion_lock import ingestion_lock

DEFAULT_HISTORY_PATH = PUBLIC_TEST_DATA_ROOT / "ingestion_history.json"
FIELDS = {"id", "provider", "provider_message_id", "sender_email", "received_at", "attachment_name", "attachment_sha256", "original_file", "status", "disposition", "attempts", "last_attempt_at", "last_error", "activity_id", "session_id"}
SESSION_RESULT_DELIVERY_FAILURE = "Session-result email delivery failed"
ADMIN_UPLOAD = "admin_upload"
ADMIN_UPLOAD_INTERRUPTED = "Manual ingestion was interrupted; explicit Reprocess is required"
MANUAL_FIELDS = FIELDS | {
    "operation_id", "owner_sailor_id", "accepted_at",
    "activity_created_by_ingestion", "session_result_notification_candidate",
    "session_result_notification", "pending_onboarding_reservation",
}


class IngestionHistory:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = runtime_paths().ingestion_history if path is None else Path(path)

    def records(self) -> list[dict[str, Any]]:
        # Reads may migrate legacy records and write the complete collection.
        with ingestion_lock(self.path.parent):
            return self._records()

    def _records(self) -> list[dict[str, Any]]:
        if not self.path.exists(): return []
        records, reservations, changed = [], set(), False
        for item in self._read(self.path):
            canonical, migrated = _canonical(item)
            reservation = canonical["pending_onboarding_reservation"]
            if reservation is not None:
                key = (
                    reservation["sailor_id"],
                    reservation["consent_cycle_sequence"],
                )
                if key in reservations:
                    raise ValueError("Consent cycle has multiple onboarding reservations")
                reservations.add(key)
            records.append(canonical); changed |= migrated
        if changed: self._write(records)
        return records

    def get(self, record_id: str) -> dict[str, Any] | None:
        return next((r for r in self.records() if r["id"] == record_id), None)

    def find_provider_message(self, provider: str, message_id: str) -> dict[str, Any] | None:
        return next((r for r in self.records() if r["provider"] == provider and r["provider_message_id"] == message_id), None)

    def is_processed(self, provider: str, provider_message_id: str) -> bool:
        record = self.find_provider_message(provider, provider_message_id)
        return record is not None and record["status"] == "processed"

    def find_pending_onboarding_reservation(
        self,
        sailor_id: str,
        consent_cycle_sequence: int,
    ) -> dict[str, Any] | None:
        return next((
            record["pending_onboarding_reservation"]
            for record in self.records()
            if record["pending_onboarding_reservation"] is not None
            and record["pending_onboarding_reservation"]["sailor_id"] == sailor_id
            and record["pending_onboarding_reservation"]["consent_cycle_sequence"] == consent_cycle_sequence
        ), None)

    def resolve_pending_onboarding_association(
        self,
        sailor_id: str,
        consent_cycle_sequence: int,
        request: ConsentRequest | None,
    ) -> dict[str, Any] | None:
        reservation = self.find_pending_onboarding_reservation(
            sailor_id,
            consent_cycle_sequence,
        )
        if request is None:
            return reservation
        if (
            request.sailor_id != sailor_id
            or request.consent_cycle_sequence != consent_cycle_sequence
        ):
            raise ValueError("Consent request is not from the current consent cycle")
        request_association = (
            request.onboarding_activity_id,
            request.onboarding_session_id,
        )
        if reservation is not None and request_association != (
            reservation["activity_id"],
            reservation["session_id"],
        ):
            raise ValueError(
                "Consent request conflicts with pending onboarding reservation"
            )
        if request.onboarding_activity_id is None:
            return None
        return {
            "sailor_id": sailor_id,
            "consent_cycle_sequence": consent_cycle_sequence,
            "activity_id": request.onboarding_activity_id,
            "session_id": request.onboarding_session_id,
        }

    def create(self, provider: str, provider_message_id: str, sender_email: str, attachment_name: str | None, attachment_sha256: str | None) -> dict[str, Any]:
        with ingestion_lock(self.path.parent):
            return self._create(provider, provider_message_id, sender_email, attachment_name, attachment_sha256)

    def _create(self, provider: str, provider_message_id: str, sender_email: str, attachment_name: str | None, attachment_sha256: str | None) -> dict[str, Any]:
        if provider == ADMIN_UPLOAD:
            raise ValueError("Manual ingestion requires explicit Sailor ownership")
        records = self.records()
        record = {"id": str(uuid4()), "provider": provider, "provider_message_id": provider_message_id, "sender_email": sender_email, "received_at": None, "attachment_name": attachment_name, "attachment_sha256": attachment_sha256, "original_file": None, "status": "failed", "disposition": "active", "attempts": 0, "last_attempt_at": None, "last_error": None, "activity_id": None, "session_id": None}
        record["activity_created_by_ingestion"] = None
        record["session_result_notification_candidate"] = None
        record["session_result_notification"] = None
        record["pending_onboarding_reservation"] = None
        records.append(record); self._write(records); return record

    def replace(self, replacement: dict[str, Any]) -> dict[str, Any]:
        with ingestion_lock(self.path.parent):
            return self._replace(replacement)

    def _replace(self, replacement: dict[str, Any]) -> dict[str, Any]:
        records = self.records()
        for i, record in enumerate(records):
            if record["id"] == replacement["id"]:
                if ADMIN_UPLOAD in (record["provider"], replacement["provider"]):
                    if record["provider"] != replacement["provider"]:
                        raise ValueError("Manual ingestion source is immutable")
                    _validate_manual(replacement)
                    allowed = {
                        "pending": {"pending", "processing", "failed"},
                        "processing": {"processing", "processed", "failed"},
                        "processed": {"processed", "processing"},
                        "failed": {"failed", "processing"},
                    }
                    if replacement["status"] not in allowed[record["status"]]:
                        raise ValueError("Invalid manual ingestion lifecycle transition")
                    expected_attempts = {record["attempts"]}
                    if replacement["status"] == "processing":
                        expected_attempts = {record["attempts"] + 1}
                        if record["status"] == "processing":
                            expected_attempts.add(record["attempts"])
                    if replacement["attempts"] not in expected_attempts:
                        raise ValueError("Invalid manual ingestion attempt count")
                    for field in (
                        "operation_id", "owner_sailor_id", "accepted_at",
                        "attachment_name", "attachment_sha256", "original_file",
                    ):
                        if record[field] != replacement[field]:
                            raise ValueError("Manual ingestion provenance is immutable")
                previous = record["activity_created_by_ingestion"]
                current = replacement["activity_created_by_ingestion"]
                if previous is not None and current != previous:
                    raise ValueError("Ingestion Activity-creation provenance is immutable")
                previous_candidate = record["session_result_notification_candidate"]
                current_candidate = replacement["session_result_notification_candidate"]
                if (
                    previous_candidate is not None
                    and current_candidate != previous_candidate
                ):
                    raise ValueError("Ingestion notification provenance is immutable")
                previous_reservation = record["pending_onboarding_reservation"]
                current_reservation = replacement["pending_onboarding_reservation"]
                _validate_onboarding_reservation(current_reservation)
                if (
                    previous_reservation is not None
                    and current_reservation != previous_reservation
                ):
                    raise ValueError("Pending onboarding reservation is immutable")
                if current_reservation is not None and previous_reservation is None:
                    key = (
                        current_reservation["sailor_id"],
                        current_reservation["consent_cycle_sequence"],
                    )
                    if any(
                        other["id"] != replacement["id"]
                        and other["pending_onboarding_reservation"] is not None
                        and (
                            other["pending_onboarding_reservation"]["sailor_id"],
                            other["pending_onboarding_reservation"]["consent_cycle_sequence"],
                        ) == key
                        for other in records
                    ):
                        raise ValueError("Consent cycle already has an onboarding reservation")
                records[i] = replacement; self._write(records); return replacement
        raise ValueError(f"Ingestion not found: {replacement['id']}")

    def set_disposition(self, record_id: str, disposition: str) -> dict[str, Any]:
        with ingestion_lock(self.path.parent):
            return self._set_disposition(record_id, disposition)

    def _set_disposition(self, record_id: str, disposition: str) -> dict[str, Any]:
        if disposition not in ("active", "discarded"):
            raise ValueError("Invalid ingestion disposition")
        record = self.get(record_id)
        if record is None:
            raise ValueError(f"Ingestion not found: {record_id}")
        record["disposition"] = disposition
        return self.replace(record)

    @staticmethod
    def _read(path: Path) -> list[dict[str, Any]]:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list) or any(not isinstance(r, dict) for r in value): raise ValueError("Ingestion history must contain a JSON list of records")
        return value

    def _write(self, records: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.{uuid4().hex}.tmp")
        try:
            with temporary.open("xb") as output:
                output.write(
                    (json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
                )
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def add_manual(self, record: dict[str, Any]) -> dict[str, Any]:
        """Persist a pending operation only after its original has been preserved."""
        _validate_manual(record)
        if record["status"] != "pending" or record["attempts"] != 0:
            raise ValueError("New manual ingestion must be pending")
        with ingestion_lock(self.path.parent):
            records = self.records()
            if any(other["id"] == record["id"] for other in records):
                raise ValueError("Manual ingestion operation already exists")
            records.append(record)
            self._write(records)
        return record

    def fail_interrupted_manual(self) -> list[str]:
        """Explicit reconciliation only; never retry or change pending operations.

        Processing owns this same lock for its whole lifetime. A processing record
        still present after we obtain ownership cannot belong to a live writer.
        """
        with ingestion_lock(self.path.parent):
            records = self.records()
            interrupted = []
            for record in records:
                if record["provider"] == ADMIN_UPLOAD and record["status"] == "processing":
                    record.update(status="failed", last_error=ADMIN_UPLOAD_INTERRUPTED)
                    interrupted.append(record["id"])
            if interrupted:
                self._write(records)
            return interrupted


def _canonical(item: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    if item.get("provider") == ADMIN_UPLOAD:
        _validate_manual(item)
        return dict(item), False
    activity_created = item.get("activity_created_by_ingestion")
    if activity_created is not None and not isinstance(activity_created, bool):
        raise ValueError("Malformed ingestion Activity-creation provenance")
    notification_candidate = item.get("session_result_notification_candidate")
    if notification_candidate is not None and not isinstance(notification_candidate, bool):
        raise ValueError("Malformed ingestion notification provenance")
    notification = item.get("session_result_notification")
    _validate_notification(notification)
    onboarding_reservation = item.get("pending_onboarding_reservation")
    _validate_onboarding_reservation(onboarding_reservation)
    item = {
        key: value for key, value in item.items()
        if key not in (
            "activity_created_by_ingestion",
            "session_result_notification_candidate",
            "session_result_notification",
            "pending_onboarding_reservation",
        )
    }
    if not {"provider", "provider_message_id", "status"}.issubset(item) or item["status"] not in ("processed", "failed"): raise ValueError("Malformed ingestion record")
    if "id" in item:
        if set(item) == FIELDS - {"disposition"}:
            item = {**item, "disposition": "active"}
            return {**item, "activity_created_by_ingestion": activity_created, "session_result_notification_candidate": notification_candidate, "session_result_notification": notification, "pending_onboarding_reservation": onboarding_reservation}, True
        if set(item) != FIELDS or item.get("disposition") not in ("active", "discarded") or not isinstance(item["attempts"], int) or item["attempts"] < 0: raise ValueError("Malformed ingestion record")
        return {**item, "activity_created_by_ingestion": activity_created, "session_result_notification_candidate": notification_candidate, "session_result_notification": notification, "pending_onboarding_reservation": onboarding_reservation}, False
    attempted = item.get("processed_at")
    return {"id": str(uuid4()), "provider": item["provider"], "provider_message_id": item["provider_message_id"], "sender_email": None, "received_at": None, "attachment_name": None, "attachment_sha256": None, "original_file": None, "status": item["status"], "disposition": "active", "attempts": 1 if attempted else 0, "last_attempt_at": attempted, "last_error": None, "activity_id": item.get("activity_id"), "session_id": None, "activity_created_by_ingestion": None, "session_result_notification_candidate": None, "session_result_notification": notification, "pending_onboarding_reservation": None}, True


def _validate_manual(record: dict[str, Any]) -> None:
    if (
        set(record) != MANUAL_FIELDS or record["provider"] != ADMIN_UPLOAD
        or record["operation_id"] != record["id"]
        or any(record[field] is not None for field in ("provider_message_id", "sender_email", "received_at"))
        or record["status"] not in ("pending", "processing", "processed", "failed")
        or record["disposition"] not in ("active", "discarded")
        or type(record["attempts"]) is not int or record["attempts"] < 0
        or record["session_result_notification_candidate"] is not False
        or record["session_result_notification"] is not None
        or record["pending_onboarding_reservation"] is not None
        or (record["activity_created_by_ingestion"] is not None and type(record["activity_created_by_ingestion"]) is not bool)
        or not isinstance(record["attachment_name"], str) or not record["attachment_name"]
        or not isinstance(record["original_file"], str) or not record["original_file"]
        or not isinstance(record["attachment_sha256"], str)
        or len(record["attachment_sha256"]) != 64
        or any(char not in "0123456789abcdef" for char in record["attachment_sha256"])
    ):
        raise ValueError("Malformed manual ingestion record")
    require_uuid(record["id"], "Manual ingestion")
    require_uuid(record["owner_sailor_id"], "Manual ingestion Sailor")
    if not record["original_file"].startswith(f"originals/ingestions/{record['id']}/"):
        raise ValueError("Malformed manual ingestion original reference")
    if record["status"] == "pending" and (
        record["attempts"] != 0 or record["last_attempt_at"] is not None
        or record["activity_id"] is not None or record["session_id"] is not None
    ):
        raise ValueError("Malformed pending manual ingestion")
    if record["status"] in ("processing", "processed") and (
        record["attempts"] < 1 or record["last_attempt_at"] is None
    ):
        raise ValueError("Malformed manual ingestion attempt")
    if record["status"] == "processed" and (
        record["activity_id"] is None or record["session_id"] is None
        or record["activity_created_by_ingestion"] is None
    ):
        raise ValueError("Malformed processed manual ingestion")
    if record["status"] in ("pending", "processed") and record["last_error"] is not None:
        raise ValueError("Malformed manual ingestion error state")
    try:
        accepted = datetime.fromisoformat(record["accepted_at"])
        if accepted.tzinfo is None or accepted.utcoffset().total_seconds() != 0:
            raise ValueError
    except (TypeError, ValueError):
        raise ValueError("Malformed manual ingestion acceptance time") from None


def _validate_onboarding_reservation(reservation: object) -> None:
    if reservation is None:
        return
    if (
        not isinstance(reservation, dict)
        or set(reservation) != {
            "sailor_id",
            "consent_cycle_sequence",
            "activity_id",
            "session_id",
        }
        or isinstance(reservation["consent_cycle_sequence"], bool)
        or not isinstance(reservation["consent_cycle_sequence"], int)
        or reservation["consent_cycle_sequence"] < 0
    ):
        raise ValueError("Malformed pending onboarding reservation")
    require_uuid(reservation["sailor_id"], "Onboarding reservation Sailor")
    require_uuid(reservation["activity_id"], "Onboarding reservation Activity")
    require_uuid(reservation["session_id"], "Onboarding reservation Session")


def _validate_notification(notification: object) -> None:
    # Missing/null is backward-compatible and means no notification required.
    if notification is None:
        return
    if (
        not isinstance(notification, dict)
        or set(notification) != {"status", "attempted_at", "sent_at", "last_error"}
        or notification["status"] not in ("eligible", "attempted", "sent", "failed")
        or notification["last_error"] not in (None, SESSION_RESULT_DELIVERY_FAILURE)
    ):
        raise ValueError("Malformed Session-result notification state")
    status = notification["status"]
    if (
        (notification["attempted_at"] is not None) != (status != "eligible")
        or (notification["sent_at"] is not None) != (status == "sent")
        or (notification["last_error"] is not None) != (status == "failed")
    ):
        raise ValueError("Inconsistent Session-result notification state")
