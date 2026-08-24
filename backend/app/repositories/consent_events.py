import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from app.identity import require_uuid
from app.models import ConsentEvent, ConsentEventType
from app.runtime_paths import runtime_paths


class ConsentEventRepository:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = runtime_paths().consent_events if path is None else Path(path)

    def all(self) -> list[ConsentEvent]:
        if not self.path.exists():
            return []

        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Consent event storage must contain a JSON list")
        events = [_deserialize_event(item) for item in data]
        for event in events:
            self.validate(event)
        return events

    def for_sailor(self, sailor_id: str) -> list[ConsentEvent]:
        return [event for event in self.all() if event.sailor_id == sailor_id]

    def append(self, event: ConsentEvent) -> ConsentEvent:
        self.validate(event)
        events = self.all()
        events.append(event)
        self._save(events)
        return event

    @staticmethod
    def validate(event: ConsentEvent) -> None:
        _validate_event(event)

    def _save(self, events: list[ConsentEvent]) -> None:
        records = []
        for event in events:
            record = asdict(event)
            record["event_type"] = event.event_type.value
            record["timestamp"] = event.timestamp.isoformat()
            records.append(record)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def _deserialize_event(item: dict[str, object]) -> ConsentEvent:
    return ConsentEvent(
        event_type=ConsentEventType(item["event_type"]),
        timestamp=datetime.fromisoformat(str(item["timestamp"])),
        source=str(item["source"]),
        sailor_id=str(item["sailor_id"]),
        agreement_version=(
            str(item["agreement_version"])
            if item.get("agreement_version") is not None
            else None
        ),
    )


def _validate_event(event: ConsentEvent) -> None:
    require_uuid(event.sailor_id, "Consent event Sailor")
    if not event.source.strip():
        raise ValueError("Consent event source must not be empty")
    if (
        event.event_type == ConsentEventType.CONSENT_GRANTED
        and not event.agreement_version
    ):
        raise ValueError("Granted consent event requires agreement version")
