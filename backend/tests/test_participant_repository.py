from dataclasses import fields
from pathlib import Path
from typing import Callable

from app.models import Participant
from app.repositories.participants import ParticipantRepository


PARTICIPANTS = [
    {
        "id": "mmannise@gmail.com",
        "name": "Maxi URU",
        "boat_name": "Zafar",
        "sailing_class": "Snipe",
        "sail_number": "URU-32115",
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
        "mmannise@gmail.com"
    )

    assert participant is not None
    assert participant.id == "mmannise@gmail.com"


def test_uppercase_email_lookup_succeeds(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participant = _repository(temporary_json_file).find_by_email(
        "MMANNISE@GMAIL.COM"
    )

    assert participant is not None
    assert participant.name == "Maxi URU"


def test_whitespace_email_lookup_succeeds(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participant = _repository(temporary_json_file).find_by_email(
        "  mmannise@gmail.com  "
    )

    assert participant is not None
    assert participant.id == "mmannise@gmail.com"


def test_unknown_participant_returns_none(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    participant = _repository(temporary_json_file).find_by_email(
        "unknown@example.com"
    )

    assert participant is None


def test_participant_model_has_no_category() -> None:
    participant_fields = {field.name for field in fields(Participant)}

    assert "category" not in participant_fields
    assert "email" not in participant_fields
