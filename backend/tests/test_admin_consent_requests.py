import json
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterator

import pytest

from app.config import CURRENT_CONSENT_AGREEMENT_VERSION
from app.models import ConsentEventType, ConsentStatus
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.admin_consent_requests import (
    ADMIN_CONSENT_REQUEST_SOURCE,
    AdminConsentRequestEligibilityError,
    AdminConsentRequestService,
)
from app.services.consent_request_delivery import ConsentRequestDeliveryError
from app.services.consent_requests import (
    CONSENT_REQUEST_DELIVERY_FAILURE,
    ConsentRequestService,
)
from app.services.sailor_consent import SailorConsentService


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
FIRST_TOKEN = "admin-request-" + "r" * 40
SECOND_TOKEN = "admin-request-" + "n" * 40
NOW = datetime(2031, 6, 18, 10, 0, tzinfo=timezone.utc)


@dataclass
class Context:
    root: Path
    sailors: SailorRepository
    events: ConsentEventRepository
    request_repository: ConsentRequestRepository
    requests: ConsentRequestService
    admin: AdminConsentRequestService
    sent: list[tuple[str, str]]
    set_now: Callable[[datetime], None]


def _context(
    temporary_directory: Path,
    *,
    status: ConsentStatus = ConsentStatus.PENDING,
    tokens: Iterator[str] | None = None,
) -> Context:
    root = temporary_directory / f"admin-consent-{status.value.lower()}"
    root.mkdir()
    (root / "sailors.json").write_text(
        json.dumps([{
            "id": SAILOR_ID,
            "email": "sailor@example.test",
            "name": "Sailor",
            "default_boat_id": None,
            "consent_status": status.value,
        }]),
        encoding="utf-8",
    )
    (root / "consent_events.json").write_text("[]\n", encoding="utf-8")
    (root / "sessions.json").write_text("[]\n", encoding="utf-8")
    (root / "activities.json").write_text("[]\n", encoding="utf-8")
    sailors = SailorRepository(root / "sailors.json")
    events = ConsentEventRepository(root / "consent_events.json")
    request_repository = ConsentRequestRepository(root / "consent_requests.json")
    current_time = [NOW]
    token_values = tokens or iter([FIRST_TOKEN, SECOND_TOKEN])
    requests = ConsentRequestService(
        request_repository,
        sailors,
        events,
        SessionRepository(root / "sessions.json"),
        clock=lambda: current_time[0],
        token_generator=lambda: next(token_values),
    )
    sent: list[tuple[str, str]] = []
    admin = AdminConsentRequestService(
        requests,
        sailors,
        SailorConsentService(sailors, events),
        sender=lambda email, token: sent.append((email, token)),
    )
    return Context(
        root,
        sailors,
        events,
        request_repository,
        requests,
        admin,
        sent,
        lambda value: current_time.__setitem__(0, value),
    )


def test_explicit_send_issues_request_without_granting_consent(
    temporary_directory: Path,
) -> None:
    context = _context(temporary_directory)

    delivered = context.admin.send(SAILOR_ID)

    sailor = context.sailors.get_by_id(SAILOR_ID)
    events = context.events.for_sailor(SAILOR_ID)
    assert sailor is not None and sailor.consent_status == ConsentStatus.PENDING
    assert sailor.consent_request_sent_at == NOW
    assert delivered.delivery_sent_at == NOW
    assert delivered.automatic_delivery_attempted_at is None
    assert context.sent == [("sailor@example.test", delivered.token)]
    assert len(context.request_repository.all()) == 1
    assert [event.event_type for event in events] == [
        ConsentEventType.CONSENT_REQUESTED
    ]
    assert events[0].source == ADMIN_CONSENT_REQUEST_SOURCE
    assert all(
        event.event_type != ConsentEventType.CONSENT_GRANTED
        for event in events
    )


def test_valid_resend_reuses_immutable_request_and_automatic_attempt_marker(
    temporary_directory: Path,
) -> None:
    context = _context(temporary_directory)
    issued = context.requests.issue_for_pending_sailor(SAILOR_ID)
    issued = context.request_repository.replace(
        replace(issued, agreement_version="agreement-issued-earlier")
    )
    attempted_at = NOW + timedelta(minutes=1)
    context.requests.mark_automatic_delivery_attempted(
        issued.id,
        timestamp=attempted_at,
    )
    context.requests.mark_delivery_failed(issued.id)
    resend_at = NOW + timedelta(minutes=2)
    context.set_now(resend_at)

    delivered = context.admin.send(SAILOR_ID)

    assert delivered.id == issued.id
    assert delivered.token == issued.token
    assert delivered.created_at == issued.created_at
    assert delivered.expires_at == issued.expires_at
    assert delivered.agreement_version == issued.agreement_version
    assert delivered.automatic_delivery_attempted_at == attempted_at
    assert delivered.delivery_sent_at == resend_at
    assert delivered.delivery_last_error is None
    assert context.request_repository.all() == [delivered]
    assert context.sent == [("sailor@example.test", issued.token)]


def test_expired_request_is_reissued_with_new_token_and_preserved_history(
    temporary_directory: Path,
) -> None:
    context = _context(temporary_directory)
    expired = context.requests.issue_for_pending_sailor(SAILOR_ID)
    context.requests.mark_delivery_failed(expired.id)
    expired_before = context.request_repository.get_by_id(expired.id)
    reissued_at = expired.expires_at + timedelta(minutes=1)
    context.set_now(reissued_at)

    delivered = context.admin.send(SAILOR_ID)

    assert delivered.id != expired.id
    assert delivered.token == SECOND_TOKEN
    assert delivered.created_at == reissued_at
    assert delivered.expires_at - delivered.created_at == timedelta(days=28)
    assert delivered.agreement_version == CURRENT_CONSENT_AGREEMENT_VERSION
    assert delivered.automatic_delivery_attempted_at is None
    assert context.request_repository.get_by_id(expired.id) == expired_before
    assert context.request_repository.all() == [expired_before, delivered]
    assert context.sent == [("sailor@example.test", SECOND_TOKEN)]


def test_controlled_failure_is_safe_and_explicit_retry_is_permitted(
    temporary_directory: Path,
) -> None:
    context = _context(temporary_directory)
    sailors_before = (context.root / "sailors.json").read_bytes()
    sessions_before = (context.root / "sessions.json").read_bytes()
    activities_before = (context.root / "activities.json").read_bytes()
    attempts: list[tuple[str, str]] = []

    def fail(email: str, token: str) -> None:
        attempts.append((email, token))
        raise ConsentRequestDeliveryError(
            f"provider secret must not persist with {token}"
        )

    context.admin.sender = fail
    failed = context.admin.send(SAILOR_ID)

    sailor = context.sailors.get_by_id(SAILOR_ID)
    assert sailor is not None and sailor.consent_status == ConsentStatus.PENDING
    assert sailor.consent_request_sent_at is None
    assert failed.delivery_last_error == CONSENT_REQUEST_DELIVERY_FAILURE
    assert failed.delivery_sent_at is None
    assert failed.automatic_delivery_attempted_at is None
    assert context.requests.resolve(failed.token).request == failed
    assert context.events.all() == []
    assert (context.root / "sailors.json").read_bytes() == sailors_before
    assert (context.root / "sessions.json").read_bytes() == sessions_before
    assert (context.root / "activities.json").read_bytes() == activities_before

    retry_at = NOW + timedelta(minutes=1)
    context.set_now(retry_at)
    context.admin.sender = lambda email, token: attempts.append((email, token))
    delivered = context.admin.send(SAILOR_ID)

    assert delivered.id == failed.id
    assert delivered.token == failed.token
    assert delivered.automatic_delivery_attempted_at is None
    assert delivered.delivery_sent_at == retry_at
    assert delivered.delivery_last_error is None
    assert attempts == [
        ("sailor@example.test", failed.token),
        ("sailor@example.test", failed.token),
    ]
    assert context.sailors.get_by_id(SAILOR_ID).consent_status == (
        ConsentStatus.PENDING
    )


def test_unexpected_sender_error_surfaces_without_delivery_state_rewrite(
    temporary_directory: Path,
) -> None:
    context = _context(temporary_directory)

    def fail_unexpectedly(_email: str, _token: str) -> None:
        raise RuntimeError("programming error")

    context.admin.sender = fail_unexpectedly

    with pytest.raises(RuntimeError, match="programming error"):
        context.admin.send(SAILOR_ID)

    request = context.request_repository.all()[0]
    sailor = context.sailors.get_by_id(SAILOR_ID)
    assert request.delivery_sent_at is None
    assert request.delivery_last_error is None
    assert sailor is not None
    assert sailor.consent_status == ConsentStatus.PENDING
    assert sailor.consent_request_sent_at is None
    assert context.events.all() == []


@pytest.mark.parametrize("status", [ConsentStatus.ACTIVE, ConsentStatus.REVOKED])
def test_non_pending_sailor_is_ineligible(
    temporary_directory: Path,
    status: ConsentStatus,
) -> None:
    context = _context(temporary_directory, status=status)

    with pytest.raises(AdminConsentRequestEligibilityError, match="PENDING"):
        context.admin.send(SAILOR_ID)

    assert context.request_repository.all() == []
    assert context.sent == []


def test_accepted_request_is_not_resent_as_pending(
    temporary_directory: Path,
) -> None:
    context = _context(temporary_directory)
    issued = context.requests.issue_for_pending_sailor(SAILOR_ID)
    context.requests.mark_accepted(
        issued.token,
        timestamp=NOW + timedelta(minutes=1),
    )
    context.set_now(NOW + timedelta(minutes=2))

    with pytest.raises(AdminConsentRequestEligibilityError, match="not eligible"):
        context.admin.send(SAILOR_ID)

    assert context.sent == []
    assert context.events.all() == []
