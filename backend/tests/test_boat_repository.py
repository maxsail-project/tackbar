import json
from dataclasses import fields, replace
from pathlib import Path
from typing import Callable
from uuid import UUID

import pytest

from app.models import Boat
from app.repositories.boats import BoatRepository


BOAT_ID = "40000000-0000-4000-8000-000000000001"
SAILOR_A = "30000000-0000-4000-8000-000000000001"
SAILOR_B = "30000000-0000-4000-8000-000000000002"


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


def test_boat_has_optional_sailor_owner_field() -> None:
    boat_fields = {field.name for field in fields(Boat)}

    assert boat_fields == {"id", "name", "sailing_class", "sail_number", "sailor_id"}


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


def test_owned_boat_round_trip_and_sailor_scope(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("boats", [])
    repository = BoatRepository(path)
    boat = Boat(BOAT_ID, "My Boat", "Snipe", None, SAILOR_A)

    assert repository.add_for_sailor(SAILOR_A, boat) == boat
    assert json.loads(path.read_text(encoding="utf-8"))[0]["sailor_id"] == SAILOR_A
    assert BoatRepository(path).list_for_sailor(SAILOR_A) == [boat]
    assert BoatRepository(path).list_for_sailor(SAILOR_B) == []
    assert repository.get_for_sailor(SAILOR_A, BOAT_ID) == boat
    assert repository.get_for_sailor(SAILOR_B, BOAT_ID) is None
    assert repository.get_by_id(BOAT_ID) == boat

    updated = replace(boat, name="Renamed")
    assert repository.replace_for_sailor(SAILOR_A, updated) == updated
    assert BoatRepository(path).get_by_id(BOAT_ID) == updated


def test_cross_sailor_edits_and_ownership_transfers_are_denied(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("boats", [])
    repository = BoatRepository(path)
    boat = repository.add_for_sailor(SAILOR_A, Boat(BOAT_ID, "Mine", None, None, SAILOR_A))
    before = path.read_bytes()

    with pytest.raises(ValueError, match="not owned"):
        repository.replace_for_sailor(SAILOR_B, replace(boat, name="Stolen", sailor_id=SAILOR_B))
    with pytest.raises(ValueError, match="ownership cannot change"):
        repository.replace_for_sailor(SAILOR_A, replace(boat, sailor_id=SAILOR_B))
    with pytest.raises(ValueError, match="owner must match"):
        repository.add_for_sailor(SAILOR_B, boat)
    assert path.read_bytes() == before


def test_legacy_boat_remains_unowned_and_readable_but_not_editable(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("boats", [{"id": BOAT_ID, "name": "Legacy", "sailing_class": None, "sail_number": None}])
    repository = BoatRepository(path)
    before = path.read_bytes()

    assert repository.get_by_id(BOAT_ID).sailor_id is None
    assert repository.list_for_sailor(SAILOR_A) == []
    assert repository.get_for_sailor(SAILOR_A, BOAT_ID) is None
    with pytest.raises(ValueError, match="not owned"):
        repository.replace_for_sailor(SAILOR_A, Boat(BOAT_ID, "Claimed", None, None, SAILOR_A))
    assert path.read_bytes() == before

    owned = Boat("40000000-0000-4000-8000-000000000002", "Owned", None, None, SAILOR_A)
    repository.add_for_sailor(SAILOR_A, owned)
    assert BoatRepository(path).get_by_id(BOAT_ID).sailor_id is None


def test_scoped_operations_reject_invalid_sailor_id(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = BoatRepository(temporary_json_file("boats", []))
    boat = Boat(BOAT_ID, "Boat", None, None, SAILOR_A)
    with pytest.raises(ValueError, match="Invalid Sailor id"):
        repository.list_for_sailor("not-a-uuid")
    with pytest.raises(ValueError, match="Invalid Sailor id"):
        repository.get_for_sailor("not-a-uuid", BOAT_ID)
    with pytest.raises(ValueError, match="Invalid Sailor id"):
        repository.replace_for_sailor("not-a-uuid", boat)


@pytest.mark.parametrize("owner", [None, "", "not-a-uuid", "30000000-0000-4000-8000-00000000000Z"])
def test_new_owned_boat_requires_valid_explicit_owner(
    temporary_json_file: Callable[[str, object], Path], owner: str | None,
) -> None:
    repository = BoatRepository(temporary_json_file("boats", []))
    with pytest.raises(ValueError):
        repository.add_for_sailor(SAILOR_A, Boat(BOAT_ID, "New", None, None, owner))
    if owner is not None:
        with pytest.raises(ValueError, match="Invalid Sailor id"):
            repository.add(Boat(BOAT_ID, "New", None, None, owner))


def test_owned_boat_keeps_metadata_validation(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = BoatRepository(temporary_json_file("boats", []))
    with pytest.raises(ValueError, match="has no metadata"):
        repository.add_for_sailor(SAILOR_A, Boat(BOAT_ID, None, " ", None, SAILOR_A))
