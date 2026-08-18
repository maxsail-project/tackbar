from app.repositories.participants import ParticipantRepository


def test_finds_known_participant() -> None:
    participant = ParticipantRepository().find_by_email(
        "maxsail.project@gmail.com"
    )

    assert participant is not None
    assert participant.id == "maxi"
    assert participant.name == "Maxi"
    assert participant.boat_name == "URU"
    assert participant.sailing_class == "Snipe"
    assert participant.sail_number is None
    assert participant.category == "dinghy"


def test_email_lookup_is_case_insensitive() -> None:
    participant = ParticipantRepository().find_by_email(
        "  MAXSAIL.PROJECT@GMAIL.COM  "
    )

    assert participant is not None
    assert participant.id == "maxi"


def test_unknown_participant_returns_none() -> None:
    participant = ParticipantRepository().find_by_email(
        "unknown@example.com"
    )

    assert participant is None
