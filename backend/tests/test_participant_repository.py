import json
from dataclasses import fields
from pathlib import Path
from typing import Callable

from app.models import Participant
from app.repositories.participants import ParticipantRepository


PARTICIPANTS = [
    {
        "id": "sailor-a@example.com",
        "name": "Sailor A",
        "boat_name": "Demo Boat A",
        "sailing_class": "Snipe",
        "sail_number": "DEMO-1001",
    }
]


def _repository(
    temporary_json_file: Callable[[str, object], Path],
) -> ParticipantRepository:
    return ParticipantRepository(
        temporary_json_file("participants", PARTICIPANTS)
    )


def test_normalized_email_is_participant_id(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participant = _repository(temporary_json_file).find_by_email(
        "sailor-a@example.com"
    )

    assert participant is not None
    assert participant.id == "sailor-a@example.com"


def test_uppercase_email_lookup_succeeds(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participant = _repository(temporary_json_file).find_by_email(
        "SAILOR-A@EXAMPLE.COM"
    )

    assert participant is not None
    assert participant.name == "Sailor A"


def test_whitespace_email_lookup_succeeds(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participant = _repository(temporary_json_file).find_by_email(
        "  sailor-a@example.com  "
    )

    assert participant is not None
    assert participant.id == "sailor-a@example.com"


def test_unknown_participant_returns_none(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participant = _repository(temporary_json_file).find_by_email(
        "unknown@example.com"
    )

    assert participant is None


def test_known_participant_is_reused_without_modification(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = _repository(temporary_json_file)
    original_records = json.loads(repository.path.read_text(encoding="utf-8"))

    participant, created = repository.find_or_create_by_email(
        " SAILOR-A@EXAMPLE.COM "
    )

    assert created is False
    assert participant.name == "Sailor A"
    assert json.loads(repository.path.read_text(encoding="utf-8")) == (
        original_records
    )


def test_unknown_participant_is_created_with_normalized_id_and_null_metadata(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = _repository(temporary_json_file)

    participant, created = repository.find_or_create_by_email(
        "  New.Sailor@Example.COM  "
    )
    persisted = json.loads(repository.path.read_text(encoding="utf-8"))[-1]

    expected = {
        "id": "new.sailor@example.com",
        "name": None,
        "boat_name": None,
        "sailing_class": None,
        "sail_number": None,
    }
    assert created is True
    assert participant.id == "new.sailor@example.com"
    assert persisted == expected
    assert "" not in persisted.values()
    assert "Unknown" not in persisted.values()


def test_repeated_creation_does_not_duplicate_participant(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repository = _repository(temporary_json_file)

    first, first_created = repository.find_or_create_by_email(
        "new.sailor@example.com"
    )
    second, second_created = repository.find_or_create_by_email(
        " NEW.SAILOR@EXAMPLE.COM "
    )
    records = json.loads(repository.path.read_text(encoding="utf-8"))

    assert first_created is True
    assert second_created is False
    assert second == first
    assert sum(
        record["id"] == "new.sailor@example.com" for record in records
    ) == 1


def test_participant_model_has_no_category() -> None:
    participant_fields = {field.name for field in fields(Participant)}

    assert "category" not in participant_fields
    assert "email" not in participant_fields
