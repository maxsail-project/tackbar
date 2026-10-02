from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

import pytest

from app.models import ConsentEventType, ConsentStatus, InboundEmail
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services import automatic_consent_requests
from app.services.admin_consent_requests import (
    ADMIN_CONSENT_REQUEST_SOURCE,
    AdminConsentRequestService,
)
from app.services.consent_request_delivery import ConsentRequestDeliveryError
from app.services.consent_requests import (
    CONSENT_REQUEST_DELIVERY_FAILURE,
    ConsentRequestService,
)
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_processing import (
    process_provider_email,
    reprocess_ingestion,
)
from app.services.mailbox_review import review_mailbox_now
from app.services.sailor_consent import SailorConsentService


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
FILENAME = "vakaros-demo.csv.gz"
SAILOR_ID = "30000000-0000-4000-8000-000000000001"
BOAT_ID = "40000000-0000-4000-8000-000000000001"
SAILOR = {
    "id": SAILOR_ID,
    "email": "sailor-a@example.com",
    "name": "Sailor A",
    "default_boat_id": BOAT_ID,
}
BOAT = {
    "id": BOAT_ID,
    "name": "Demo Boat A",
    "sailing_class": "Snipe",
    "sail_number": "DEMO-1001",
}


def _email(
    provider_message_id: str,
    sender_email: str = "sailor-a@example.com",
) -> InboundEmail:
    return InboundEmail(
        sender_email=sender_email,
        subject=FILENAME,
        attachment_filename=FILENAME,
        attachment_bytes=FIXTURE_PATH.read_bytes(),
        provider_message_id=provider_message_id,
    )


def _repositories(
    temporary_json_file: Callable[[str, object], Path],
    sailors_data: list[dict] | None = None,
) -> tuple[
    SailorRepository,
    BoatRepository,
    ActivityRepository,
    SessionRepository,
    IngestionHistory,
    ConsentEventRepository,
    ConsentRequestRepository,
]:
    sailors = SailorRepository(
        temporary_json_file(
            "automatic-sailors",
            [SAILOR] if sailors_data is None else sailors_data,
        )
    )
    boats = BoatRepository(temporary_json_file("automatic-boats", [BOAT]))
    activities = ActivityRepository(
        temporary_json_file("automatic-activities", [])
    )
    sessions = SessionRepository(temporary_json_file("automatic-sessions", []))
    history = IngestionHistory(temporary_json_file("automatic-history", []))
    events = ConsentEventRepository(sailors.path.with_name("consent_events.json"))
    requests = ConsentRequestRepository(
        sailors.path.with_name("consent_requests.json")
    )
    return sailors, boats, activities, sessions, history, events, requests


def test_first_valid_track_for_unknown_sailor_sends_and_records_consent_request(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(temporary_json_file, sailors_data=[])
    sailors, boats, activities, sessions, history, events, requests = repositories
    sent: list[tuple[str, str]] = []

    email = _email("101:1", sender_email=" NEW@EXAMPLE.COM ")
    email.subject = "Natural human-written subject"
    result = process_provider_email(
        "ovh",
        email,
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=lambda email, token: sent.append((email, token)),
    )

    assert result is not None
    sailor = sailors.get_by_id(result.sailor.id)
    assert sailor is not None
    assert sailor.consent_status == ConsentStatus.PENDING
    assert sailor.consent_request_sent_at is not None
    assert result.sailor_created is True
    assert len(activities.all()) == 1
    assert len(sessions.all()) == 1
    assert result.session_match.status == "created"
    assert history.records()[0]["status"] == "processed"
    assert len(sent) == 1

    request = requests.all()[0]
    assert sent == [("new@example.com", request.token)]
    assert request.automatic_delivery_attempted_at is not None
    assert request.delivery_sent_at is not None
    assert request.delivery_last_error is None
    consent_events = events.for_sailor(sailor.id)
    assert [event.event_type for event in consent_events] == [
        ConsentEventType.CONSENT_REQUESTED
    ]
    assert consent_events[0].source == "ovh_automatic_consent_request"


def test_invalid_track_does_not_issue_or_send_consent_request(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(temporary_json_file)
    (
        sailors,
        boats,
        activities,
        sessions,
        history,
        events,
        requests,
    ) = repositories
    sent: list[tuple[str, str]] = []
    email = _email("invalid-track")
    email.attachment_bytes = b"not a valid gzip file"

    with pytest.raises(ValueError):
        process_provider_email(
            "gmail",
            email,
            sailors,
            boats,
            activities,
            sessions,
            history,
            consent_events=events,
            consent_request_sender=lambda address, token: sent.append(
                (address, token)
            ),
        )

    assert history.records()[0]["status"] == "failed"
    assert sent == []
    assert requests.all() == []
    assert events.all() == []


def test_pending_cycle_sends_once_across_more_tracks_duplicates_and_reprocessing(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(temporary_json_file)
    (
        sailors,
        boats,
        activities,
        sessions,
        history,
        events,
        requests,
    ) = repositories
    sent: list[tuple[str, str]] = []
    sender = lambda email, token: sent.append((email, token))

    first = process_provider_email(
        "gmail",
        _email("message-1"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=sender,
    )
    second = process_provider_email(
        "gmail",
        _email("message-2"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=sender,
    )
    duplicate = process_provider_email(
        "gmail",
        _email("message-2"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=sender,
    )
    record = history.find_provider_message("gmail", "message-1")
    assert record is not None
    reprocessed = reprocess_ingestion(
        record["id"],
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_request_sender=sender,
    )

    assert first is not None and second is not None
    assert duplicate is None
    assert reprocessed["status"] == "processed"
    assert len(sent) == 1
    assert len(requests.all()) == 1
    assert len(events.for_sailor(SAILOR_ID)) == 1
    assert len(activities.all()) == 1
    assert len(history.records()) == 2


def test_successful_admin_delivery_suppresses_later_automatic_delivery(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(temporary_json_file)
    sailors, boats, activities, sessions, history, events, requests = repositories
    request_service = ConsentRequestService(requests, sailors, events, sessions)
    admin_sent: list[tuple[str, str]] = []
    admin = AdminConsentRequestService(
        request_service,
        sailors,
        SailorConsentService(sailors, events),
        sender=lambda email, token: admin_sent.append((email, token)),
    )
    delivered = admin.send(SAILOR_ID)
    events_after_admin = events.for_sailor(SAILOR_ID)
    automatic_sent: list[tuple[str, str]] = []

    result = process_provider_email(
        "ovh",
        _email("admin-first-track"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=lambda email, token: automatic_sent.append(
            (email, token)
        ),
    )

    assert result is not None
    assert history.records()[0]["status"] == "processed"
    assert admin_sent == [("sailor-a@example.com", delivered.token)]
    assert automatic_sent == []
    assert requests.all() == [delivered]
    assert delivered.delivery_sent_at is not None
    assert delivered.automatic_delivery_attempted_at is None
    assert events.for_sailor(SAILOR_ID) == events_after_admin
    assert [event.event_type for event in events_after_admin] == [
        ConsentEventType.CONSENT_REQUESTED
    ]
    assert events_after_admin[0].source == ADMIN_CONSENT_REQUEST_SOURCE
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    assert sailor.consent_status == ConsentStatus.PENDING


def test_expired_current_request_does_not_fail_or_mutate_later_ingestion(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(temporary_json_file)
    sailors, boats, activities, sessions, history, events, requests = repositories
    issued_at = datetime.now(timezone.utc) - timedelta(days=29)
    request_service = ConsentRequestService(
        requests,
        sailors,
        events,
        sessions,
        clock=lambda: issued_at,
        token_generator=lambda: "expired-request-" + "e" * 40,
    )
    expired = request_service.issue_for_pending_sailor(SAILOR_ID)
    sent: list[tuple[str, str]] = []

    result = process_provider_email(
        "ovh",
        _email("expired-request-track"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=lambda email, token: sent.append((email, token)),
    )

    assert result is not None
    assert history.records()[0]["status"] == "processed"
    assert len(activities.all()) == 1
    assert sent == []
    assert requests.all() == [expired]
    assert expired.automatic_delivery_attempted_at is None
    assert expired.delivery_sent_at is None
    assert events.all() == []
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    assert sailor.consent_status == ConsentStatus.PENDING


def test_active_sailor_does_not_receive_consent_request(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(
        temporary_json_file,
        [{**SAILOR, "consent_status": "ACTIVE"}],
    )
    sailors, boats, activities, sessions, history, events, requests = repositories
    sent: list[tuple[str, str]] = []

    result = process_provider_email(
        "gmail",
        _email("active-message"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=lambda email, token: sent.append((email, token)),
    )

    assert result is not None
    assert result.sailor.consent_status == ConsentStatus.ACTIVE
    assert history.records()[0]["status"] == "processed"
    assert sent == []
    assert requests.all() == []
    assert events.all() == []


def test_revoked_sailor_starts_new_cycle_then_sends_one_request(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(
        temporary_json_file,
        [{**SAILOR, "consent_status": "REVOKED"}],
    )
    sailors, boats, activities, sessions, history, events, requests = repositories
    sent: list[tuple[str, str]] = []

    result = process_provider_email(
        "ovh",
        _email("revoked-message"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=lambda email, token: sent.append((email, token)),
    )

    assert result is not None
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    assert sailor.consent_status == ConsentStatus.PENDING
    assert sailor.consent_request_sent_at is not None
    assert len(sent) == 1
    assert requests.all()[0].consent_cycle_sequence == 1
    assert [event.event_type for event in events.for_sailor(SAILOR_ID)] == [
        ConsentEventType.CONSENT_CYCLE_STARTED,
        ConsentEventType.CONSENT_REQUESTED,
    ]


def test_controlled_delivery_failure_preserves_processed_ingestion_and_is_not_retried(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(temporary_json_file)
    sailors, boats, activities, sessions, history, events, requests = repositories
    attempts = 0

    def fail_delivery(_email: str, token: str) -> None:
        nonlocal attempts
        attempts += 1
        claimed = requests.all()
        assert len(claimed) == 1
        assert claimed[0].automatic_delivery_attempted_at is not None
        raise ConsentRequestDeliveryError(
            f"provider secret and token must stay private: {token}"
        )

    first = process_provider_email(
        "gmail",
        _email("failed-delivery-1"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=fail_delivery,
    )
    second = process_provider_email(
        "gmail",
        _email("failed-delivery-2"),
        sailors,
        boats,
        activities,
        sessions,
        history,
        consent_events=events,
        consent_request_sender=fail_delivery,
    )

    assert first is not None and second is not None
    assert attempts == 1
    assert [record["status"] for record in history.records()] == [
        "processed",
        "processed",
    ]
    assert len(activities.all()) == 1
    assert len(sessions.all()) == 1
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    assert sailor.consent_status == ConsentStatus.PENDING
    assert sailor.consent_request_sent_at is None
    request = requests.all()[0]
    assert request.automatic_delivery_attempted_at is not None
    assert request.delivery_sent_at is None
    assert request.delivery_last_error == CONSENT_REQUEST_DELIVERY_FAILURE
    assert "secret" not in request.delivery_last_error
    assert request.token not in request.delivery_last_error
    assert events.all() == []


def test_unexpected_consent_orchestration_error_surfaces_after_ingestion_is_processed(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    repositories = _repositories(temporary_json_file)
    sailors, boats, activities, sessions, history, events, requests = repositories

    def fail_unexpectedly(_email: str, _token: str) -> None:
        raise RuntimeError("consent orchestration programming error")

    with pytest.raises(RuntimeError, match="programming error"):
        process_provider_email(
            "gmail",
            _email("unexpected-error"),
            sailors,
            boats,
            activities,
            sessions,
            history,
            consent_events=events,
            consent_request_sender=fail_unexpectedly,
        )

    assert history.records()[0]["status"] == "processed"
    assert history.records()[0]["last_error"] is None
    assert len(activities.all()) == 1
    assert len(sessions.all()) == 1
    request = requests.all()[0]
    assert request.automatic_delivery_attempted_at is not None
    assert request.delivery_sent_at is None
    assert request.delivery_last_error is None
    assert events.all() == []


def test_repeated_mailbox_review_does_not_send_again(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        automatic_consent_requests,
        "send_consent_request_email",
        lambda email, token: sent.append((email, token)),
    )
    email = _email("mailbox-message")

    class Provider:
        def get_candidate_emails(self):
            return [email]

    first = review_mailbox_now(provider=Provider())
    second = review_mailbox_now(provider=Provider())

    assert first.processed == 1
    assert second.processed == 0
    assert second.skipped_already_processed == 1
    assert len(sent) == 1
