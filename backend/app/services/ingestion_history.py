import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_HISTORY_PATH = BACKEND_DIR / "tmp" / "ingestion_history.json"


class IngestionHistory:
    def __init__(self, path: str | Path = DEFAULT_HISTORY_PATH) -> None:
        self.path = Path(path)

    def records(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []

        records = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(records, list):
            raise ValueError("Ingestion history must contain a JSON list")
        return records

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

        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
