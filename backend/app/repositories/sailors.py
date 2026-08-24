import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.identity import normalize_email, require_uuid
from app.models import ConsentStatus, Sailor
from app.runtime_paths import runtime_paths


class SailorRepository:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = runtime_paths().sailors if path is None else Path(path)

    def all(self) -> list[Sailor]:
        if not self.path.exists():
            return []

        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Sailor storage must contain a JSON list")
        sailors = [_deserialize_sailor(item) for item in data]
        _validate_sailors(sailors)
        return sailors

    def find_by_email(self, sender_email: str) -> Sailor | None:
        normalized_email = normalize_email(sender_email)
        return next(
            (
                sailor
                for sailor in self.all()
                if sailor.email == normalized_email
            ),
            None,
        )

    def get_by_id(self, sailor_id: str) -> Sailor | None:
        return next(
            (sailor for sailor in self.all() if sailor.id == sailor_id),
            None,
        )

    def find_or_create_by_email(
        self,
        sender_email: str,
    ) -> tuple[Sailor, bool]:
        existing_sailor = self.find_by_email(sender_email)
        if existing_sailor is not None:
            return existing_sailor, False

        sailors = self.all()
        sailor = Sailor(
            id=str(uuid4()),
            email=normalize_email(sender_email),
            name=None,
            default_boat_id=None,
        )
        sailors.append(sailor)
        self._save(sailors)
        return sailor, True

    def replace(self, sailor: Sailor) -> Sailor:
        sailors = self.all()
        for index, existing in enumerate(sailors):
            if existing.id == sailor.id:
                sailors[index] = sailor
                self._save(sailors)
                return sailor
        raise ValueError(f"Sailor not found: {sailor.id}")

    def _save(self, sailors: list[Sailor]) -> None:
        _validate_sailors(sailors)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(
                [_serialize_sailor(sailor) for sailor in sailors],
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )


def _validate_sailors(sailors: list[Sailor]) -> None:
    seen_ids: set[str] = set()
    seen_emails: set[str] = set()
    for sailor in sailors:
        require_uuid(sailor.id, "Sailor")
        if sailor.id in seen_ids:
            raise ValueError(f"Duplicate Sailor id: {sailor.id}")
        seen_ids.add(sailor.id)

        normalized_email = normalize_email(sailor.email)
        if sailor.email != normalized_email:
            raise ValueError(
                f"Sailor email must be normalized: {sailor.id}"
            )
        if normalized_email in seen_emails:
            raise ValueError(
                f"Duplicate normalized Sailor email: {normalized_email}"
            )
        seen_emails.add(normalized_email)


def _deserialize_sailor(item: dict[str, object]) -> Sailor:
    return Sailor(
        id=str(item["id"]),
        email=str(item["email"]),
        name=item.get("name"),
        default_boat_id=item.get("default_boat_id"),
        consent_status=ConsentStatus(
            item.get("consent_status", ConsentStatus.PENDING)
        ),
        consent_request_sent_at=_parse_optional_datetime(
            item.get("consent_request_sent_at")
        ),
        consent_granted_at=_parse_optional_datetime(
            item.get("consent_granted_at")
        ),
        consent_revoked_at=_parse_optional_datetime(
            item.get("consent_revoked_at")
        ),
    )


def _serialize_sailor(sailor: Sailor) -> dict[str, object]:
    record = asdict(sailor)
    record["consent_status"] = sailor.consent_status.value
    for field_name in (
        "consent_request_sent_at",
        "consent_granted_at",
        "consent_revoked_at",
    ):
        value = getattr(sailor, field_name)
        record[field_name] = value.isoformat() if value is not None else None
    return record


def _parse_optional_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Persisted Sailor consent timestamp must be a string")
    return datetime.fromisoformat(value)
