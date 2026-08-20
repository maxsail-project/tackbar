import json
from dataclasses import asdict
from pathlib import Path

from app.identity import require_uuid
from app.models import Boat
from app.runtime_paths import runtime_paths


class BoatRepository:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = runtime_paths().boats if path is None else Path(path)

    def all(self) -> list[Boat]:
        if not self.path.exists():
            return []

        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Boat storage must contain a JSON list")
        boats = [Boat(**item) for item in data]
        _validate_boats(boats)
        return boats

    def get_by_id(self, boat_id: str) -> Boat | None:
        return next(
            (boat for boat in self.all() if boat.id == boat_id),
            None,
        )

    def add(self, boat: Boat) -> Boat:
        boats = self.all()
        if any(existing.id == boat.id for existing in boats):
            raise ValueError(f"Duplicate Boat id: {boat.id}")
        boats.append(boat)
        self._save(boats)
        return boat

    def _save(self, boats: list[Boat]) -> None:
        _validate_boats(boats)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(
                [asdict(boat) for boat in boats],
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )


def _validate_boats(boats: list[Boat]) -> None:
    seen_ids: set[str] = set()
    for boat in boats:
        require_uuid(boat.id, "Boat")
        if boat.id in seen_ids:
            raise ValueError(f"Duplicate Boat id: {boat.id}")
        seen_ids.add(boat.id)
        if not any(
            value is not None and value.strip()
            for value in (boat.name, boat.sailing_class, boat.sail_number)
        ):
            raise ValueError(f"Boat {boat.id} has no metadata")
