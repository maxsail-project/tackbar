import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterator

import pytest

from app.config import CURRENT_CONSENT_AGREEMENT_VERSION
from app.models import ConsentRequest, ConsentRequestState, ConsentStatus
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.consent_requests import (
    CONSENT_REQUEST_DELIVERY_FAILURE,
    ConsentRequestOperationError,
    ConsentRequestService,
)
from app.services.sailor_consent import SailorConsentService


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
PERSONAL_TOKEN = "personal-" + "p" * 40
SESSION_TOKEN = "session-" + "s" * 40
FIRST_TOKEN = "request-" + "r" * 40
SECOND_TOKEN = "request-" + "n" * 40
NOW = datetime(2031, 6, 18, 10, 0, tzinfo=timezone.utc)


def _sailor(status: ConsentStatus = ConsentStatus.PENDING) -> dict[str, object]:
    return {
        "id": SAILOR_ID,
        "email": "sailor-a@example.com",
        "name": "Sailor A",
        "default_boat_id": None,
        "consent_status": status.value,
        "personal_capability_token": PERSONAL_TOKEN,
    }


def _service(
    temporary_json_file: Callable[[str, object], Path],
    *,
    now: datetime = NOW,
    tokens: Iterator[str] | None = None,
    status: ConsentStatus = ConsentStatus.PENDING,
    agreement_version: str | None = None,
) -> tuple[
    ConsentRequestService,
    ConsentRequestRepository,
    SailorRepository,
    ConsentEventRepository,
]:
    sailors = SailorRepository(
        temporary_json_file("consent-request-sailors", [_sailor(status)])
    )
    events = ConsentEventRepository(
        temporary_json_file("consent-request-events", [])
    )
    sessions = SessionRepository(
        temporary_json_file(
            "consent-request-sessions",
            [{
                "id": "session-one",
                "activity_ids": [],
                "created_at": NOW.isoformat(),
                "expires_at": (NOW + timedelta(days=60)).isoformat(),
                "capability_token": SESSION_TOKEN,
                "capability_revoked": False,
            }],
        )
    )
    requests = ConsentRequestRepository(
        temporary_json_file("consent-requests", [])
    )
    service = ConsentRequestService(
        requests,
        sailors,
        events,
        sessions,
        agreement_version=agreement_version,
        clock=lambda: now,
        token_generator=(lambda: next(tokens)) if tokens is not None else None,
    )
    return service, requests, sailors, events


def test_issues_persisted_request_for_pending_sailor_with_fixed_lifetime(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, sailors, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN]),
    )
    sailor_before = sailors.get_by_id(SAILOR_ID)

    issued = service.issue_for_pending_sailor(SAILOR_ID)
    persisted = requests.get_by_id(issued.id)

    assert CURRENT_CONSENT_AGREEMENT_VERSION == "v0.6.5"
    assert issued == persisted
    assert issued.sailor_id == SAILOR_ID
    assert issued.created_at == NOW
    assert issued.created_at.tzinfo == timezone.utc
    assert issued.expires_at == NOW + timedelta(days=28)
    assert issued.agreement_version == CURRENT_CONSENT_AGREEMENT_VERSION
    assert issued.consent_cycle_sequence == 0
    assert issued.token == FIRST_TOKEN
    assert issued.token != issued.id
    assert issued.token != issued.sailor_id
    assert len(issued.token) >= 32
    assert sailors.get_by_id(SAILOR_ID) == sailor_before
    assert issued.automatic_delivery_attempted_at is None
    assert issued.delivery_sent_at is None
    assert issued.delivery_last_error is None
    assert issued.accepted_at is None


def test_issue_is_idempotent_for_current_pending_cycle(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, _, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN, SECOND_TOKEN]),
    )

    first = service.issue_for_pending_sailor(SAILOR_ID)
    repeated = service.issue_for_pending_sailor(SAILOR_ID)

    assert repeated == first
    assert requests.all() == [first]


@pytest.mark.parametrize("status", [ConsentStatus.ACTIVE, ConsentStatus.REVOKED])
def test_issue_rejects_non_pending_sailor(
    temporary_json_file: Callable[[str, object], Path],
    status: ConsentStatus,
) -> None:
    service, requests, _, _ = _service(temporary_json_file, status=status)

    with pytest.raises(ConsentRequestOperationError, match="PENDING"):
        service.issue_for_pending_sailor(SAILOR_ID)

    assert requests.all() == []


def test_issue_rejects_naive_clock_without_persisting(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, _, _ = _service(
        temporary_json_file,
        now=NOW.replace(tzinfo=None),
        tokens=iter([FIRST_TOKEN]),
    )

    with pytest.raises(ValueError, match="UTC-aware"):
        service.issue_for_pending_sailor(SAILOR_ID)

    assert requests.all() == []


def test_agreement_version_is_captured_at_issuance(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, _, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN]),
        agreement_version="agreement-v1",
    )
    issued = service.issue_for_pending_sailor(SAILOR_ID)

    replacement_service = ConsentRequestService(
        requests,
        service.sailors,
        service.events,
        service.sessions,
        agreement_version="agreement-v2",
        clock=lambda: NOW,
    )

    assert replacement_service.find_current_for_sailor(SAILOR_ID) == issued
    assert requests.get_by_id(issued.id).agreement_version == "agreement-v1"


def test_generated_token_has_256_bit_urlsafe_entropy(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, _, _, _ = _service(temporary_json_file)

    issued = service.issue_for_pending_sailor(SAILOR_ID)

    assert len(issued.token) >= 43
    assert all(character.isalnum() or character in "-_" for character in issued.token)


def test_generation_avoids_request_sailor_personal_and_session_tokens(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, sailors, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN]),
    )
    existing = service.issue_for_pending_sailor(SAILOR_ID)
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    sailors.replace(
        replace(sailor, consent_status=ConsentStatus.REVOKED)
    )
    consent = SailorConsentService(sailors, service.events)
    consent.start_new_consent_cycle(SAILOR_ID, source="valid_track", timestamp=NOW)
    service.token_generator = lambda: next(candidates)
    candidates = iter([
        existing.token,
        SAILOR_ID,
        PERSONAL_TOKEN,
        SESSION_TOKEN,
        SECOND_TOKEN,
    ])

    issued = service.issue_for_pending_sailor(SAILOR_ID)

    assert issued.token == SECOND_TOKEN
    assert len({request.token for request in requests.all()}) == 2


def test_resolves_valid_expired_and_unknown_tokens_safely(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, _, _, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN]),
    )
    issued = service.issue_for_pending_sailor(SAILOR_ID)

    assert service.resolve(issued.token).state == ConsentRequestState.VALID
    assert service.resolve(issued.token).request == issued
    service.clock = lambda: issued.expires_at
    expired = service.resolve(issued.token)
    assert expired.state == ConsentRequestState.EXPIRED
    assert expired.request is None
    assert service.resolve("malformed/token").state == ConsentRequestState.NOT_FOUND
    assert service.resolve("unknown-" + "u" * 40).state == ConsentRequestState.NOT_FOUND


def test_old_cycle_request_is_unusable_and_new_cycle_has_new_current_request(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, sailors, events = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN, SECOND_TOKEN]),
    )
    first = service.issue_for_pending_sailor(SAILOR_ID)
    consent = SailorConsentService(sailors, events)
    consent.revoke_consent(SAILOR_ID, source="declined", timestamp=NOW)
    consent.start_new_consent_cycle(
        SAILOR_ID,
        source="valid_track",
        timestamp=NOW + timedelta(minutes=1),
    )
    second = service.issue_for_pending_sailor(SAILOR_ID)

    assert first.consent_cycle_sequence == 0
    assert second.consent_cycle_sequence == 1
    assert second.id != first.id
    assert service.find_current_for_sailor(SAILOR_ID) == second
    assert service.resolve(first.token).state == ConsentRequestState.UNUSABLE
    assert service.resolve(second.token).state == ConsentRequestState.VALID
    assert len(requests.all()) == 2


def test_acceptance_is_request_level_idempotent_without_activating_sailor(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, sailors, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN]),
    )
    issued = service.issue_for_pending_sailor(SAILOR_ID)
    accepted_at = NOW + timedelta(hours=1)

    accepted = service.mark_accepted(issued.token, timestamp=accepted_at)
    repeated = service.mark_accepted(
        issued.token,
        timestamp=accepted_at + timedelta(hours=1),
    )

    assert accepted.accepted_at == accepted_at
    assert repeated == accepted
    assert requests.get_by_id(issued.id) == accepted
    assert service.resolve(issued.token).state == ConsentRequestState.ACCEPTED
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    assert sailor.consent_status == ConsentStatus.PENDING


def test_expired_request_cannot_be_accepted_and_can_be_explicitly_reissued(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, _, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN, SECOND_TOKEN]),
    )
    first = service.issue_for_pending_sailor(SAILOR_ID)
    service.clock = lambda: first.expires_at

    with pytest.raises(ConsentRequestOperationError, match="not usable"):
        service.mark_accepted(first.token)

    replacement = service.reissue_expired_for_pending_sailor(SAILOR_ID)
    assert replacement.id != first.id
    assert replacement.token == SECOND_TOKEN
    assert service.find_current_for_sailor(SAILOR_ID) == replacement
    assert service.resolve(first.token).state == ConsentRequestState.UNUSABLE
    assert len(requests.all()) == 2


def test_delivery_state_claims_one_automatic_attempt_without_smtp(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, requests, sailors, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN]),
    )
    issued = service.issue_for_pending_sailor(SAILOR_ID)
    attempted_at = NOW + timedelta(minutes=1)

    attempted = service.mark_automatic_delivery_attempted(
        issued.id,
        timestamp=attempted_at,
    )
    failed = service.mark_delivery_failed(issued.id)

    assert attempted.automatic_delivery_attempted_at == attempted_at
    assert failed.delivery_last_error == CONSENT_REQUEST_DELIVERY_FAILURE
    assert failed.delivery_sent_at is None
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    assert sailor.consent_request_sent_at is None
    with pytest.raises(ConsentRequestOperationError, match="already attempted"):
        service.mark_automatic_delivery_attempted(
            issued.id,
            timestamp=attempted_at + timedelta(minutes=1),
        )

    sent_at = NOW + timedelta(minutes=2)
    delivered = service.mark_delivery_succeeded(issued.id, timestamp=sent_at)
    assert delivered.delivery_sent_at == sent_at
    assert delivered.delivery_last_error is None
    assert requests.get_by_id(issued.id) == delivered


def test_reissue_does_not_allow_a_second_automatic_attempt_in_same_cycle(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, _, _, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN, SECOND_TOKEN]),
    )
    first = service.issue_for_pending_sailor(SAILOR_ID)
    service.mark_automatic_delivery_attempted(
        first.id,
        timestamp=NOW + timedelta(minutes=1),
    )
    service.clock = lambda: first.expires_at
    replacement = service.reissue_expired_for_pending_sailor(SAILOR_ID)

    assert service.automatic_delivery_was_attempted_for_current_cycle(
        SAILOR_ID
    ) is True
    with pytest.raises(ConsentRequestOperationError, match="already attempted"):
        service.mark_automatic_delivery_attempted(
            replacement.id,
            timestamp=replacement.created_at + timedelta(minutes=1),
        )


def test_repository_round_trip_and_absent_file_compatibility(
    temporary_directory: Path,
) -> None:
    path = temporary_directory / "consent_requests.json"
    repository = ConsentRequestRepository(path)

    assert repository.all() == []
    assert not path.exists()

    request = ConsentRequest(
        id="50000000-0000-4000-8000-000000000001",
        sailor_id=SAILOR_ID,
        token=FIRST_TOKEN,
        agreement_version="agreement-v1",
        consent_cycle_sequence=2,
        created_at=NOW,
        expires_at=NOW + timedelta(days=28),
        automatic_delivery_attempted_at=NOW + timedelta(minutes=1),
        delivery_sent_at=NOW + timedelta(minutes=2),
        accepted_at=NOW + timedelta(hours=1),
    )
    repository.add(request)

    assert ConsentRequestRepository(path).all() == [request]


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("token", "short", "token"),
        ("agreement_version", "", "agreement version"),
        ("consent_cycle_sequence", -1, "cycle sequence"),
        ("created_at", "2031-06-18T10:00:00", "UTC-aware"),
        ("expires_at", (NOW + timedelta(days=27)).isoformat(), "28 days"),
        ("accepted_at", (NOW + timedelta(days=28)).isoformat(), "precede expiry"),
        ("delivery_last_error", 123, "delivery error"),
    ],
)
def test_malformed_persisted_request_fails_clearly(
    temporary_json_file: Callable[[str, object], Path],
    field: str,
    value: object,
    message: str,
) -> None:
    record: dict[str, object] = {
        "id": "50000000-0000-4000-8000-000000000001",
        "sailor_id": SAILOR_ID,
        "token": FIRST_TOKEN,
        "agreement_version": "agreement-v1",
        "consent_cycle_sequence": 0,
        "created_at": NOW.isoformat(),
        "expires_at": (NOW + timedelta(days=28)).isoformat(),
        "automatic_delivery_attempted_at": None,
        "delivery_sent_at": None,
        "delivery_last_error": None,
        "accepted_at": None,
    }
    record[field] = value
    path = temporary_json_file("malformed-consent-request", [record])

    with pytest.raises(ValueError, match=message):
        ConsentRequestRepository(path).all()


def test_non_list_storage_and_duplicate_tokens_fail_clearly(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    invalid_shape = temporary_json_file("consent-request-object", {})
    with pytest.raises(ValueError, match="JSON list"):
        ConsentRequestRepository(invalid_shape).all()

    request = {
        "id": "50000000-0000-4000-8000-000000000001",
        "sailor_id": SAILOR_ID,
        "token": FIRST_TOKEN,
        "agreement_version": "agreement-v1",
        "consent_cycle_sequence": 0,
        "created_at": NOW.isoformat(),
        "expires_at": (NOW + timedelta(days=28)).isoformat(),
    }
    duplicate = temporary_json_file(
        "duplicate-consent-request-token",
        [
            request,
            {**request, "id": "50000000-0000-4000-8000-000000000002"},
        ],
    )
    with pytest.raises(ValueError, match="Duplicate consent request token"):
        ConsentRequestRepository(duplicate).all()


def test_request_for_missing_sailor_is_unusable(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, _, sailors, _ = _service(
        temporary_json_file,
        tokens=iter([FIRST_TOKEN]),
    )
    issued = service.issue_for_pending_sailor(SAILOR_ID)
    sailors.path.write_text("[]\n", encoding="utf-8")

    resolution = service.resolve(issued.token)

    assert resolution.state == ConsentRequestState.UNUSABLE
    assert resolution.request is None
