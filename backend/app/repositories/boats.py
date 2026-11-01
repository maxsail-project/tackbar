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

    def list_for_sailor(self, sailor_id: str) -> list[Boat]:
        require_uuid(sailor_id, "Sailor")
        return [boat for boat in self.all() if boat.sailor_id == sailor_id]

    def get_for_sailor(self, sailor_id: str, boat_id: str) -> Boat | None:
        require_uuid(sailor_id, "Sailor")
        boat = self.get_by_id(boat_id)
        return boat if boat is not None and boat.sailor_id == sailor_id else None

    def add_for_sailor(self, sailor_id: str, boat: Boat) -> Boat:
        require_uuid(sailor_id, "Sailor")
        if boat.sailor_id != sailor_id:
            raise ValueError("Boat owner must match Sailor")
        return self.add(boat)

    def replace_for_sailor(self, sailor_id: str, boat: Boat) -> Boat:
        require_uuid(sailor_id, "Sailor")
        boats = self.all()
        for index, existing in enumerate(boats):
            if existing.id == boat.id and existing.sailor_id == sailor_id:
                if boat.sailor_id != sailor_id:
                    raise ValueError("Boat ownership cannot change")
                boats[index] = boat
                self._save(boats)
                return boat
        raise ValueError(f"Boat not owned by Sailor: {boat.id}")

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
        if boat.sailor_id is not None:
            require_uuid(boat.sailor_id, "Sailor")
        if boat.id in seen_ids:
            raise ValueError(f"Duplicate Boat id: {boat.id}")
        seen_ids.add(boat.id)
        if not any(
            value is not None and value.strip()
            for value in (boat.name, boat.sailing_class, boat.sail_number)
        ):
            raise ValueError(f"Boat {boat.id} has no metadata")
