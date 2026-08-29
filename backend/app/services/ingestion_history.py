import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.runtime_paths import BACKEND_DIR, PUBLIC_TEST_DATA_ROOT, runtime_paths

DEFAULT_HISTORY_PATH = PUBLIC_TEST_DATA_ROOT / "ingestion_history.json"
LEGACY_HISTORY_PATH = BACKEND_DIR / "tmp" / "ingestion_history.json"
FIELDS = {"id", "provider", "provider_message_id", "sender_email", "received_at", "attachment_name", "attachment_sha256", "original_file", "status", "attempts", "last_attempt_at", "last_error", "activity_id", "session_id"}


class IngestionHistory:
    def __init__(self, path: str | Path | None = None, legacy_path: str | Path | None = None) -> None:
        default = path is None
        self.path = runtime_paths().ingestion_history if default else Path(path)
        self.legacy_path = Path(legacy_path) if legacy_path is not None else (LEGACY_HISTORY_PATH if default else None)

    def records(self) -> list[dict[str, Any]]:
        if not self.path.exists() and self.legacy_path is not None and self.legacy_path.exists(): self._write(self._read(self.legacy_path))
        if not self.path.exists(): return []
        records, changed = [], False
        for item in self._read(self.path):
            canonical, migrated = _canonical(item); records.append(canonical); changed |= migrated
        if changed: self._write(records)
        return records

    def get(self, record_id: str) -> dict[str, Any] | None:
        return next((r for r in self.records() if r["id"] == record_id), None)

    def find_provider_message(self, provider: str, message_id: str) -> dict[str, Any] | None:
        return next((r for r in self.records() if r["provider"] == provider and r["provider_message_id"] == message_id), None)

    def is_processed(self, provider: str, provider_message_id: str) -> bool:
        record = self.find_provider_message(provider, provider_message_id)
        return record is not None and record["status"] == "processed"

    def create(self, provider: str, provider_message_id: str, sender_email: str, attachment_name: str | None, attachment_sha256: str | None) -> dict[str, Any]:
        records = self.records()
        record = {"id": str(uuid4()), "provider": provider, "provider_message_id": provider_message_id, "sender_email": sender_email, "received_at": None, "attachment_name": attachment_name, "attachment_sha256": attachment_sha256, "original_file": None, "status": "failed", "attempts": 0, "last_attempt_at": None, "last_error": None, "activity_id": None, "session_id": None}
        records.append(record); self._write(records); return record

    def replace(self, replacement: dict[str, Any]) -> dict[str, Any]:
        records = self.records()
        for i, record in enumerate(records):
            if record["id"] == replacement["id"]: records[i] = replacement; self._write(records); return replacement
        raise ValueError(f"Ingestion not found: {replacement['id']}")

    @staticmethod
    def _read(path: Path) -> list[dict[str, Any]]:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list) or any(not isinstance(r, dict) for r in value): raise ValueError("Ingestion history must contain a JSON list of records")
        return value

    def _write(self, records: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True); self.path.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _canonical(item: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    if not {"provider", "provider_message_id", "status"}.issubset(item) or item["status"] not in ("processed", "failed"): raise ValueError("Malformed ingestion record")
    if "id" in item:
        if set(item) != FIELDS or not isinstance(item["attempts"], int) or item["attempts"] < 0: raise ValueError("Malformed ingestion record")
        return dict(item), False
    attempted = item.get("processed_at")
    return {"id": str(uuid4()), "provider": item["provider"], "provider_message_id": item["provider_message_id"], "sender_email": None, "received_at": None, "attachment_name": None, "attachment_sha256": None, "original_file": None, "status": item["status"], "attempts": 1 if attempted else 0, "last_attempt_at": attempted, "last_error": None, "activity_id": item.get("activity_id"), "session_id": None}, True
