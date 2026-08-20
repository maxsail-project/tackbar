from dataclasses import fields
from pathlib import Path
from typing import Callable
from uuid import UUID

from app.models import Boat
from app.repositories.boats import BoatRepository


BOAT_ID = "40000000-0000-4000-8000-000000000001"


def test_boat_round_trip_preserves_uuid_and_nullable_metadata(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = BoatRepository(temporary_json_file("boats", []))
    boat = Boat(
        id=BOAT_ID,
        name="Demo Boat",
        sailing_class=None,
        sail_number=None,
    )

    repository.add(boat)

    assert str(UUID(boat.id)) == boat.id
    assert repository.get_by_id(BOAT_ID) == boat
    assert repository.all() == [boat]


def test_boat_has_no_sailor_or_ownership_field() -> None:
    boat_fields = {field.name for field in fields(Boat)}

    assert boat_fields == {"id", "name", "sailing_class", "sail_number"}


def test_same_boat_can_be_referenced_without_ownership_metadata() -> None:
    boat = Boat(
        id=BOAT_ID,
        name="Shared Demo Boat",
        sailing_class="Snipe",
        sail_number="DEMO-1",
    )
    activity_contexts = [
        {"sailor_id": "sailor-a", "boat_id": boat.id},
        {"sailor_id": "sailor-b", "boat_id": boat.id},
    ]

    assert {context["boat_id"] for context in activity_contexts} == {boat.id}
