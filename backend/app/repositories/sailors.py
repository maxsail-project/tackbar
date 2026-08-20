import json
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4

from app.identity import normalize_email, require_uuid
from app.models import Sailor
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
        sailors = [Sailor(**item) for item in data]
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

    def _save(self, sailors: list[Sailor]) -> None:
        _validate_sailors(sailors)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(
                [asdict(sailor) for sailor in sailors],
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
