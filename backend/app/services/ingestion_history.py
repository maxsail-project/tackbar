import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_HISTORY_PATH = BACKEND_DIR / "data" / "ingestion_history.json"
LEGACY_HISTORY_PATH = BACKEND_DIR / "tmp" / "ingestion_history.json"


class IngestionHistory:
    def __init__(
        self,
        path: str | Path = DEFAULT_HISTORY_PATH,
        legacy_path: str | Path | None = None,
    ) -> None:
        self.path = Path(path)
        if legacy_path is not None:
            self.legacy_path = Path(legacy_path)
        elif self.path == DEFAULT_HISTORY_PATH:
            self.legacy_path = LEGACY_HISTORY_PATH
        else:
            self.legacy_path = None

    def records(self) -> list[dict[str, Any]]:
        self._migrate_legacy_history()
        if not self.path.exists():
            return []

        return self._read_records(self.path)

    def _migrate_legacy_history(self) -> None:
        if (
            self.path.exists()
            or self.legacy_path is None
            or not self.legacy_path.exists()
        ):
            return

        records = self._read_records(self.legacy_path)
        self._write_records(records)

    @staticmethod
    def _read_records(path: Path) -> list[dict[str, Any]]:
        records = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(records, list):
            raise ValueError("Ingestion history must contain a JSON list")
        return records

    def _write_records(self, records: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    def is_processed(self, provider: str, provider_message_id: str) -> bool:
        return any(
            record.get("provider") == provider
            and record.get("provider_message_id") == provider_message_id
            and record.get("status") == "processed"
            for record in self.records()
        )

    def record_processed(
        self,
        provider: str,
        provider_message_id: str,
        activity_id: str,
    ) -> None:
        records = self.records()
        records.append(
            {
                "provider": provider,
                "provider_message_id": provider_message_id,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "status": "processed",
                "activity_id": activity_id,
            }
        )

        self._write_records(records)
