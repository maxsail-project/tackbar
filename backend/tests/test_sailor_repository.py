import json
from pathlib import Path
from typing import Callable
from uuid import UUID

import pytest

from app.repositories.sailors import SailorRepository


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
BOAT_ID = "40000000-0000-4000-8000-000000000001"
SAILORS = [
    {
        "id": SAILOR_ID,
        "email": "sailor-a@example.com",
        "name": "Sailor A",
        "default_boat_id": BOAT_ID,
    }
]


def _repository(
    temporary_json_file: Callable[[str, object], Path],
) -> SailorRepository:
    return SailorRepository(temporary_json_file("sailors", SAILORS))


def test_email_is_normalized_external_identity_separate_from_sailor_id(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailor = _repository(temporary_json_file).find_by_email(
        " SAILOR-A@EXAMPLE.COM "
    )

    assert sailor is not None
    assert sailor.id == SAILOR_ID
    assert str(UUID(sailor.id)) == sailor.id
    assert sailor.email == "sailor-a@example.com"
    assert sailor.id != sailor.email


def test_lookup_by_sailor_id(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailor = _repository(temporary_json_file).get_by_id(SAILOR_ID)

    assert sailor is not None
    assert sailor.name == "Sailor A"


def test_known_sailor_is_reused_without_modification(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = _repository(temporary_json_file)
    original_records = json.loads(repository.path.read_text(encoding="utf-8"))

    sailor, created = repository.find_or_create_by_email(
        " SAILOR-A@EXAMPLE.COM "
    )

    assert created is False
    assert sailor.id == SAILOR_ID
    assert json.loads(repository.path.read_text(encoding="utf-8")) == (
        original_records
    )


def test_unknown_email_creates_uuid_sailor_with_null_metadata(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = _repository(temporary_json_file)

    sailor, created = repository.find_or_create_by_email(
        "  New.Sailor@Example.COM  "
    )
    persisted = json.loads(repository.path.read_text(encoding="utf-8"))[-1]

    assert created is True
    assert str(UUID(sailor.id)) == sailor.id
    assert sailor.email == "new.sailor@example.com"
    assert sailor.name is None
    assert sailor.default_boat_id is None
    assert persisted == {
        "id": sailor.id,
        "email": "new.sailor@example.com",
        "name": None,
        "default_boat_id": None,
        "consent_status": "PENDING",
        "consent_request_sent_at": None,
        "consent_granted_at": None,
        "consent_revoked_at": None,
    }


def test_repeated_find_or_create_does_not_duplicate_sailor(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = _repository(temporary_json_file)

    first, first_created = repository.find_or_create_by_email(
        "new.sailor@example.com"
    )
    second, second_created = repository.find_or_create_by_email(
        " NEW.SAILOR@EXAMPLE.COM "
    )

    assert first_created is True
    assert second_created is False
    assert second == first
    assert sum(
        sailor.email == "new.sailor@example.com"
        for sailor in repository.all()
    ) == 1


def test_duplicate_normalized_emails_are_rejected(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file(
        "duplicate-sailors",
        [
            SAILORS[0],
            {
                "id": "30000000-0000-4000-8000-000000000002",
                "email": "sailor-a@example.com",
                "name": None,
                "default_boat_id": None,
            },
        ],
    )

    with pytest.raises(ValueError, match="Duplicate normalized Sailor email"):
        SailorRepository(path).all()


def test_sailor_id_remains_stable_when_controlled_email_data_changes(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = _repository(temporary_json_file)
    records = json.loads(repository.path.read_text(encoding="utf-8"))
    records[0]["email"] = "new-address@example.com"
    repository.path.write_text(
        json.dumps(records, indent=2) + "\n",
        encoding="utf-8",
    )

    sailor = repository.find_by_email("NEW-ADDRESS@EXAMPLE.COM")

    assert sailor is not None
    assert sailor.id == SAILOR_ID


def test_non_normalized_persisted_email_is_rejected(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    records = [{**SAILORS[0], "email": " Sailor-A@Example.COM "}]
    path = temporary_json_file("non-normalized-sailors", records)

    with pytest.raises(ValueError, match="must be normalized"):
        SailorRepository(path).all()
