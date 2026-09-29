import asyncio
import importlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

import pytest

from app.main import app
from app.models import ConsentEventType, ConsentRequestState, ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE
from app.services.consent_requests import ConsentRequestService
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.sailor_consent import SailorConsentService
from app.services.session_capabilities import SessionCapabilityService
from app.services.web_consent import WebConsentService
from app.services.welcome_email_delivery import WelcomeEmailDeliveryError


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
ACTIVITY_ID = "10000000-0000-4000-8000-000000000001"
SESSION_ID = "20000000-0000-4000-8000-000000000001"
REQUEST_TOKEN = "consent-request-" + "r" * 40
PERSONAL_TOKEN = "personal-capability-" + "p" * 32
SESSION_TOKEN = "session-capability-" + "s" * 32
NOW = datetime(2031, 6, 18, 10, 0, tzinfo=timezone.utc)


@dataclass(frozen=True)
class ApiResponse:
    status_code: int
    json: object
    headers: dict[str, str]


@dataclass
class ConsentApiContext:
    requests: ConsentRequestService
    request_repository: ConsentRequestRepository
    sailors: SailorRepository
    events: ConsentEventRepository
    sessions: SessionRepository
    sent: list[tuple[str, str]]
    activation_versions: list[str]
    set_now: Callable[[datetime], None]
    web: WebConsentService


def _write_json(path: Path, records: object) -> None:
    path.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")


def _activity() -> dict[str, object]:
    return {
        "id": ACTIVITY_ID,
        "sailor_id": SAILOR_ID,
        "boat_id": None,
        "source": "vakaros",
        "device_name": "demo",
        "original_filename": "demo.csv.gz",
        "start_time": "2031-06-18T08:00:00+00:00",
        "end_time": "2031-06-18T09:00:00+00:00",
        "start_lat": 0.1,
        "start_lon": -30.1,
        "end_lat": 0.2,
        "end_lon": -30.2,
        "center_lat": 0.15,
        "center_lon": -30.15,
        "min_lat": 0.1,
        "max_lat": 0.2,
        "min_lon": -30.2,
        "max_lon": -30.1,
        "sample_count": 2,
        "attachment_sha256": "a" * 64,
        "track_file": f"tracks/{ACTIVITY_ID}.csv.gz",
    }


def _context(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    agreement_version: str = "agreement-issued-v1",
    welcome_failure: bool = False,
) -> ConsentApiContext:
    root = temporary_directory / "consent-api"
    root.mkdir()
    _write_json(root / "sailors.json", [{
        "id": SAILOR_ID,
        "email": "private-sailor@example.com",
        "name": "Private Sailor",
        "default_boat_id": None,
        "consent_status": "PENDING",
    }])
    _write_json(root / "consent_events.json", [])
    _write_json(root / "consent_requests.json", [])
    _write_json(root / "activities.json", [_activity()])
    _write_json(root / "sessions.json", [{
        "id": SESSION_ID,
        "activity_ids": [ACTIVITY_ID],
        "created_at": NOW.isoformat(),
        "expires_at": (NOW + timedelta(days=60)).isoformat(),
        "capability_token": None,
        "capability_revoked": False,
    }])

    sailors = SailorRepository(root / "sailors.json")
    events = ConsentEventRepository(root / "consent_events.json")
    request_repository = ConsentRequestRepository(root / "consent_requests.json")
    sessions = SessionRepository(root / "sessions.json", clock=lambda: NOW)
    activities = ActivityRepository(root / "activities.json")
    current_time = [NOW]
    requests = ConsentRequestService(
        request_repository,
        sailors,
        events,
        sessions,
        agreement_version=agreement_version,
        clock=lambda: current_time[0],
        token_generator=lambda: REQUEST_TOKEN,
    )
    requests.issue_for_pending_sailor(SAILOR_ID)
    sent: list[tuple[str, str]] = []
    activation_versions: list[str] = []
    session_capabilities = SessionCapabilityService(
        sessions,
        activities,
        sailors,
        clock=lambda: current_time[0],
        token_generator=lambda: SESSION_TOKEN,
    )
    personal_capabilities = PersonalCapabilityService(
        sailors,
        sessions,
        token_generator=lambda: PERSONAL_TOKEN,
    )

    def send_welcome(email: str, path: str) -> None:
        sent.append((email, path))
        if welcome_failure:
            raise WelcomeEmailDeliveryError("controlled delivery failure")

    def activation_factory(version: str) -> SailorConsentService:
        activation_versions.append(version)
        return SailorConsentService(
            sailors,
            events,
            agreement_version=version,
            session_capabilities=session_capabilities,
            personal_capabilities=personal_capabilities,
            welcome_email_sender=send_welcome,
            delivery_clock=lambda: current_time[0],
        )

    web = WebConsentService(requests, sailors, activation_factory)
    main_module = importlib.import_module("app.main")
    monkeypatch.setattr(main_module, "_web_consent_service", lambda: web)
    return ConsentApiContext(
        requests=requests,
        request_repository=request_repository,
        sailors=sailors,
        events=events,
        sessions=sessions,
        sent=sent,
        activation_versions=activation_versions,
        set_now=lambda value: current_time.__setitem__(0, value),
        web=web,
    )


def _request(method: str, path: str) -> ApiResponse:
    messages: list[dict[str, object]] = []

    async def request() -> None:
        received = False

        async def receive() -> dict[str, object]:
            nonlocal received
            if not received:
                received = True
                return {
                    "type": "http.request",
                    "body": b"",
                    "more_body": False,
                }
            return {"type": "http.disconnect"}

        async def send(message: dict[str, object]) -> None:
            messages.append(message)

        await app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": method,
                "scheme": "http",
                "path": path,
                "raw_path": path.encode("ascii"),
                "query_string": b"",
                "headers": [],
                "client": ("test", 1),
                "server": ("test", 80),
                "root_path": "",
            },
            receive,
            send,
        )

    asyncio.run(request())
    start = next(
        message
        for message in messages
        if message["type"] == "http.response.start"
    )
    body = b"".join(
        message.get("body", b"")
        for message in messages
        if message["type"] == "http.response.body"
    )
    headers = {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in start["headers"]
    }
    return ApiResponse(
        status_code=int(start["status"]),
        json=json.loads(body),
        headers=headers,
    )


def _get(token: str) -> ApiResponse:
    return _request("GET", f"/api/consent/{token}")


def _accept(token: str) -> ApiResponse:
    return _request("POST", f"/api/consent/{token}/accept")


def _assert_unavailable(response: ApiResponse) -> None:
    assert response.status_code == 404
    assert response.json == {"detail": "Consent request unavailable"}
    assert response.headers["cache-control"] == "no-store"


def test_get_returns_minimal_context_without_any_side_effect(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(temporary_directory, monkeypatch)
    sailor_before = context.sailors.get_by_id(SAILOR_ID)
    request_before = context.request_repository.get_by_token(REQUEST_TOKEN)
    session_before = context.sessions.get_by_id(SESSION_ID)

    response = _get(REQUEST_TOKEN)

    assert response.status_code == 200
    assert set(response.json) == {"status", "agreement_version", "expires_at"}
    assert response.json["status"] == "ready"
    assert response.json["agreement_version"] == "agreement-issued-v1"
    assert response.headers["cache-control"] == "no-store"
    private_values = (
        SAILOR_ID,
        "private-sailor@example.com",
        ACTIVITY_ID,
        SESSION_ID,
        REQUEST_TOKEN,
        PERSONAL_TOKEN,
        SESSION_TOKEN,
    )
    serialized = json.dumps(response.json)
    assert all(value not in serialized for value in private_values)
    assert context.sailors.get_by_id(SAILOR_ID) == sailor_before
    assert context.request_repository.get_by_token(REQUEST_TOKEN) == request_before
    assert context.sessions.get_by_id(SESSION_ID) == session_before
    assert context.events.all() == []
    assert context.sent == []


def test_first_post_activates_once_using_persisted_agreement_version(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(
        temporary_directory,
        monkeypatch,
        agreement_version="agreement-issued-v1",
    )

    first = _accept(REQUEST_TOKEN)
    accepted = context.request_repository.get_by_token(REQUEST_TOKEN)
    sailor = context.sailors.get_by_id(SAILOR_ID)
    session = context.sessions.get_by_id(SESSION_ID)

    assert first.status_code == 200
    assert first.json["status"] == "confirmed"
    assert first.json["agreement_version"] == "agreement-issued-v1"
    assert first.headers["cache-control"] == "no-store"
    assert accepted is not None and accepted.accepted_at == NOW
    assert sailor is not None and sailor.consent_status == ConsentStatus.ACTIVE
    assert sailor.personal_capability_token == PERSONAL_TOKEN
    assert session is not None and session.capability_token == SESSION_TOKEN
    assert context.sent == [
        ("private-sailor@example.com", f"/me/{PERSONAL_TOKEN}")
    ]
    assert context.activation_versions == ["agreement-issued-v1"]
    events = context.events.for_sailor(SAILOR_ID)
    assert len(events) == 1
    assert events[0].event_type == ConsentEventType.CONSENT_GRANTED
    assert events[0].source == "web_consent"
    assert events[0].agreement_version == "agreement-issued-v1"

    repeated = _accept(REQUEST_TOKEN)

    assert repeated.status_code == 200
    assert repeated.json["status"] == "confirmed"
    assert context.request_repository.get_by_token(REQUEST_TOKEN) == accepted
    assert context.events.for_sailor(SAILOR_ID) == events
    repeated_sailor = context.sailors.get_by_id(SAILOR_ID)
    repeated_session = context.sessions.get_by_id(SESSION_ID)
    assert repeated_sailor is not None
    assert repeated_sailor.personal_capability_token == PERSONAL_TOKEN
    assert repeated_session is not None
    assert repeated_session.capability_token == SESSION_TOKEN
    assert len(context.sent) == 1
    assert context.activation_versions == ["agreement-issued-v1"]


def test_get_after_activation_returns_truthful_confirmed_state(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _context(temporary_directory, monkeypatch)
    _accept(REQUEST_TOKEN)

    response = _get(REQUEST_TOKEN)

    assert response.status_code == 200
    assert response.json["status"] == "confirmed"
    assert response.headers["cache-control"] == "no-store"


def test_accepted_but_pending_get_stays_ready_and_post_retries_activation(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(temporary_directory, monkeypatch)
    accepted = context.requests.mark_accepted(REQUEST_TOKEN)
    assert accepted.accepted_at == NOW
    pending = context.sailors.get_by_id(SAILOR_ID)
    assert pending is not None
    assert pending.consent_status == ConsentStatus.PENDING

    read = _get(REQUEST_TOKEN)
    retried = _accept(REQUEST_TOKEN)

    assert read.status_code == 200
    assert read.json["status"] == "ready"
    assert retried.status_code == 200
    assert retried.json["status"] == "confirmed"
    active = context.sailors.get_by_id(SAILOR_ID)
    assert active is not None
    assert active.consent_status == ConsentStatus.ACTIVE
    assert len(context.events.for_sailor(SAILOR_ID)) == 1
    assert len(context.sent) == 1


def test_post_retry_recovers_when_acceptance_persisted_before_activation(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(temporary_directory, monkeypatch)
    activation_factory = context.web.activation_factory
    attempts = 0

    def fail_once(version: str) -> SailorConsentService:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise ValueError("simulated activation interruption")
        return activation_factory(version)

    context.web.activation_factory = fail_once

    interrupted = _accept(REQUEST_TOKEN)
    accepted = context.request_repository.get_by_token(REQUEST_TOKEN)
    pending = context.sailors.get_by_id(SAILOR_ID)

    assert interrupted.status_code == 500
    assert interrupted.json == {
        "detail": "Persisted consent data is inconsistent"
    }
    assert interrupted.headers["cache-control"] == "no-store"
    assert accepted is not None and accepted.accepted_at == NOW
    assert pending is not None and pending.consent_status == ConsentStatus.PENDING
    assert context.events.all() == []

    recovered = _accept(REQUEST_TOKEN)

    active = context.sailors.get_by_id(SAILOR_ID)
    assert recovered.status_code == 200
    assert recovered.json["status"] == "confirmed"
    assert active is not None and active.consent_status == ConsentStatus.ACTIVE
    assert len(context.events.for_sailor(SAILOR_ID)) == 1
    assert len(context.sent) == 1


@pytest.mark.parametrize(
    "token",
    ["short", "unknown-consent-request-" + "u" * 32],
)
def test_malformed_or_unknown_token_is_safe_and_cannot_mutate_state(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    token: str,
) -> None:
    context = _context(temporary_directory, monkeypatch)
    sailor_before = context.sailors.get_by_id(SAILOR_ID)
    request_before = context.request_repository.get_by_token(REQUEST_TOKEN)

    _assert_unavailable(_get(token))
    _assert_unavailable(_accept(token))

    assert context.sailors.get_by_id(SAILOR_ID) == sailor_before
    assert context.request_repository.get_by_token(REQUEST_TOKEN) == request_before
    assert context.events.all() == []
    assert context.sent == []


def test_expired_unaccepted_request_is_safe_and_cannot_activate(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(temporary_directory, monkeypatch)
    request = context.request_repository.get_by_token(REQUEST_TOKEN)
    assert request is not None
    context.set_now(request.expires_at)

    _assert_unavailable(_get(REQUEST_TOKEN))
    _assert_unavailable(_accept(REQUEST_TOKEN))

    persisted = context.request_repository.get_by_token(REQUEST_TOKEN)
    sailor = context.sailors.get_by_id(SAILOR_ID)
    assert persisted is not None and persisted.accepted_at is None
    assert sailor is not None and sailor.consent_status == ConsentStatus.PENDING
    assert context.events.all() == []


def test_old_cycle_request_is_safe_and_cannot_activate(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(temporary_directory, monkeypatch)
    accepted = context.requests.mark_accepted(REQUEST_TOKEN)
    assert accepted.accepted_at == NOW
    consent = SailorConsentService(context.sailors, context.events)
    consent.revoke_consent(SAILOR_ID, source="declined", timestamp=NOW)
    consent.start_new_consent_cycle(
        SAILOR_ID,
        source="valid_track",
        timestamp=NOW + timedelta(minutes=1),
    )
    event_count = len(context.events.all())

    _assert_unavailable(_get(REQUEST_TOKEN))
    _assert_unavailable(_accept(REQUEST_TOKEN))

    sailor = context.sailors.get_by_id(SAILOR_ID)
    request = context.request_repository.get_by_token(REQUEST_TOKEN)
    assert sailor is not None and sailor.consent_status == ConsentStatus.PENDING
    assert request is not None and request.accepted_at == NOW
    assert len(context.events.all()) == event_count
    assert all(
        event.event_type != ConsentEventType.CONSENT_GRANTED
        for event in context.events.all()
    )
    assert context.sent == []


def test_welcome_delivery_failure_preserves_active_consent(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(
        temporary_directory,
        monkeypatch,
        welcome_failure=True,
    )

    response = _accept(REQUEST_TOKEN)

    sailor = context.sailors.get_by_id(SAILOR_ID)
    assert response.status_code == 200
    assert response.json["status"] == "confirmed"
    assert sailor is not None and sailor.consent_status == ConsentStatus.ACTIVE
    assert sailor.welcome_email_last_error == "Welcome email delivery failed"
    assert len(context.events.for_sailor(SAILOR_ID)) == 1
    assert len(context.sent) == 1


def test_absent_consent_request_storage_is_backward_compatible(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = temporary_directory / "existing-runtime"
    root.mkdir()
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(root))

    response = _get("unknown-consent-request-" + "u" * 32)

    _assert_unavailable(response)
    assert not (root / "consent_requests.json").exists()


def test_persisted_integrity_error_is_generic_and_not_cached(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(temporary_directory, monkeypatch)
    context.request_repository.path.write_text("not-json\n", encoding="utf-8")

    response = _get(REQUEST_TOKEN)

    assert response.status_code == 500
    assert response.json == {
        "detail": "Persisted consent data is inconsistent"
    }
    assert response.headers["cache-control"] == "no-store"
    assert REQUEST_TOKEN not in json.dumps(response.json)
