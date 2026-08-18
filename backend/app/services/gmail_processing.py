import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models import InboundEmail, IngestionResult
from app.services.email_ingestion import process_inbound_email


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_HISTORY_PATH = BACKEND_DIR / "tmp" / "gmail_processing_history.json"


class GmailProcessingHistory:
    def __init__(self, path: str | Path = DEFAULT_HISTORY_PATH) -> None:
        self.path = Path(path)

    def records(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []

        records = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(records, list):
            raise ValueError("Gmail processing history must contain a JSON list")
        return records

    def is_processed(self, gmail_message_id: str) -> bool:
        return any(
            record.get("gmail_message_id") == gmail_message_id
            and record.get("status") == "processed"
            for record in self.records()
        )

    def record_processed(
        self,
        gmail_message_id: str,
        result: IngestionResult,
    ) -> None:
        activity = result.activity
        records = self.records()
        records.append(
            {
                "gmail_message_id": gmail_message_id,
                "sender_email": result.sender_email,
                "subject": result.subject,
                "attachment_filename": result.attachment_filename,
                "device_name": activity.device_name,
                "activity_start_time": activity.start_time.isoformat(),
                "activity_end_time": activity.end_time.isoformat(),
                "sample_count": len(activity.samples),
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "status": "processed",
            }
        )

        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def process_gmail_email(
    email: InboundEmail,
    history: GmailProcessingHistory,
) -> IngestionResult | None:
    gmail_message_id = email.provider_message_id
    if not gmail_message_id:
        raise ValueError("Gmail message is missing its message ID")

    if history.is_processed(gmail_message_id):
        return None

    result = process_inbound_email(email)
    history.record_processed(gmail_message_id, result)
    return result
