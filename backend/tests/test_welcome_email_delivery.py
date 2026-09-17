from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Callable

import pytest

from app.models import ConsentEventType, ConsentStatus
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.sailor_consent import (
    ConsentTransitionError,
    SailorConsentService,
    WELCOME_EMAIL_DELIVERY_FAILURE,
)
from app.services.welcome_email_delivery import WelcomeEmailDeliveryError


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
TOKEN = "p" * 32
LEGACY_SAILOR = {
    "id": SAILOR_ID,
    "email": "sailor-a@example.com",
    "name": "Sailor A",
    "default_boat_id": None,
}


class RecordingSessionCapabilities:
    def __init__(self, order: list[str]) -> None:
        self.order = order

    def ensure_for_sailor(self, sailor_id: str) -> list[object]:
        self.order.append("session")
        assert sailor_id == SAILOR_ID
        return []


class RecordingPersonalCapabilities:
    def __init__(self, service: PersonalCapabilityService, order: list[str]) -> None:
        self.service = service
        self.order = order

    def ensure_for_sailor(self, sailor_id: str):
        self.order.append("personal")
        return self.service.ensure_for_sailor(sailor_id)


def _service(
    temporary_json_file: Callable[[str, object], Path],
    sender,
    delivery_clock=lambda: datetime(2031, 6, 18, 12, 0, tzinfo=timezone.utc),
) -> tuple[SailorConsentService, SailorRepository, ConsentEventRepository, list[str]]:
    sailors = SailorRepository(temporary_json_file("sailors", [LEGACY_SAILOR]))
    events = ConsentEventRepository(temporary_json_file("consent-events", []))
    order: list[str] = []
    personal = PersonalCapabilityService(
        sailors,
        SessionRepository(temporary_json_file("sessions", [])),
        token_generator=lambda: TOKEN,
    )
    return (
        SailorConsentService(
            sailors,
            events,
            session_capabilities=RecordingSessionCapabilities(order),
            personal_capabilities=RecordingPersonalCapabilities(personal, order),
            welcome_email_sender=sender,
            delivery_clock=delivery_clock,
        ),
        sailors,
        events,
        order,
    )


def test_legacy_sailor_delivery_fields_load_and_new_delivery_state_round_trips(temporary_json_file):
    repository = SailorRepository(temporary_json_file("legacy-sailors", [LEGACY_SAILOR]))
    legacy = repository.get_by_id(SAILOR_ID)

    assert legacy is not None
    assert legacy.welcome_email_sent_at is None
    assert legacy.welcome_email_last_error is None

    sent_at = datetime(2031, 6, 18, 12, 0, tzinfo=timezone.utc)
    repository.replace(replace(legacy, welcome_email_sent_at=sent_at, welcome_email_last_error="safe failure"))
    persisted = json.loads(repository.path.read_text(encoding="utf-8"))[0]
    reloaded = repository.get_by_id(SAILOR_ID)

    assert persisted["welcome_email_sent_at"] == "2031-06-18T12:00:00+00:00"
    assert persisted["welcome_email_last_error"] == "safe failure"
    assert reloaded is not None
    assert reloaded.welcome_email_sent_at == sent_at
    assert reloaded.welcome_email_last_error == "safe failure"


def test_successful_confirmation_ensures_capabilities_then_records_welcome_delivery(temporary_json_file):
    sent: list[tuple[str, str]] = []
    service, sailors, events, order = _service(
        temporary_json_file,
        lambda email, path: (order.append("send"), sent.append((email, path))),
    )
    before = sailors.get_by_id(SAILOR_ID)
    assert before is not None
    sailors.replace(replace(before, welcome_email_last_error="previous safe failure"))

    confirmed = service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")

    assert order == ["session", "personal", "send"]
    assert sent == [("sailor-a@example.com", f"/me/{TOKEN}")]
    assert confirmed.consent_status == ConsentStatus.ACTIVE
    assert confirmed.personal_capability_token == TOKEN
    assert confirmed.welcome_email_sent_at == datetime(2031, 6, 18, 12, 0, tzinfo=timezone.utc)
    assert confirmed.welcome_email_last_error is None
    assert sailors.get_by_id(SAILOR_ID) == confirmed
    assert events.for_sailor(SAILOR_ID)[0].event_type == ConsentEventType.CONSENT_GRANTED


def test_failed_welcome_delivery_preserves_active_consent_and_existing_capability(temporary_json_file):
    previous_sent_at = "2031-06-17T12:00:00+00:00"
    sailor = {
        **LEGACY_SAILOR,
        "personal_capability_token": TOKEN,
        "welcome_email_sent_at": previous_sent_at,
    }
    repository = SailorRepository(temporary_json_file("sailors", [sailor]))
    events = ConsentEventRepository(temporary_json_file("consent-events", []))
    personal = PersonalCapabilityService(repository, SessionRepository(temporary_json_file("sessions", [])))
    service = SailorConsentService(
        repository,
        events,
        session_capabilities=RecordingSessionCapabilities([]),
        personal_capabilities=personal,
        welcome_email_sender=lambda *_: (_ for _ in ()).throw(
            WelcomeEmailDeliveryError(f"provider password secret and /me/{TOKEN}")
        ),
    )

    confirmed = service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")

    assert confirmed.consent_status == ConsentStatus.ACTIVE
    assert confirmed.personal_capability_token == TOKEN
    assert confirmed.personal_capability_revoked is False
    assert confirmed.welcome_email_sent_at is not None
    assert confirmed.welcome_email_sent_at.isoformat() == previous_sent_at
    assert confirmed.welcome_email_last_error == WELCOME_EMAIL_DELIVERY_FAILURE
    assert "secret" not in json.dumps(json.loads(repository.path.read_text(encoding="utf-8")))
    assert TOKEN not in confirmed.welcome_email_last_error
    assert events.for_sailor(SAILOR_ID)[0].event_type == ConsentEventType.CONSENT_GRANTED


def test_unexpected_sender_error_is_not_absorbed(temporary_json_file):
    service, sailors, events, _ = _service(
        temporary_json_file,
        lambda *_: (_ for _ in ()).throw(RuntimeError("programming error")),
    )

    with pytest.raises(RuntimeError, match="programming error"):
        service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")

    persisted = sailors.get_by_id(SAILOR_ID)
    assert persisted is not None
    assert persisted.consent_status == ConsentStatus.ACTIVE
    assert persisted.personal_capability_token == TOKEN
    assert persisted.personal_capability_revoked is False
    assert persisted.welcome_email_last_error is None
    assert events.for_sailor(SAILOR_ID)[0].event_type == ConsentEventType.CONSENT_GRANTED


def test_invalid_delivery_clock_error_is_not_absorbed(temporary_json_file):
    service, sailors, events, _ = _service(
        temporary_json_file,
        lambda *_: None,
        delivery_clock=lambda: datetime(2031, 6, 18, 12, 0),
    )

    with pytest.raises(ValueError, match="UTC-aware"):
        service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")

    persisted = sailors.get_by_id(SAILOR_ID)
    assert persisted is not None
    assert persisted.consent_status == ConsentStatus.ACTIVE
    assert persisted.welcome_email_last_error is None
    assert events.for_sailor(SAILOR_ID)[0].event_type == ConsentEventType.CONSENT_GRANTED


def test_invalid_confirmation_does_not_send_or_modify_delivery_state(temporary_json_file):
    sent: list[tuple[str, str]] = []
    service, sailors, _, _ = _service(
        temporary_json_file,
        lambda email, path: sent.append((email, path)),
    )
    service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")
    before = sailors.get_by_id(SAILOR_ID)

    with pytest.raises(ConsentTransitionError):
        service.confirm_consent(SAILOR_ID, source="invalid_repeat")

    assert sent == [("sailor-a@example.com", f"/me/{TOKEN}")]
    assert sailors.get_by_id(SAILOR_ID) == before


def test_new_consent_cycle_preserves_welcome_delivery_state(temporary_json_file):
    service, sailors, _, _ = _service(temporary_json_file, lambda *_: None)
    confirmed = service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")
    service.revoke_consent(SAILOR_ID, source="withdrawal")

    pending = service.start_new_consent_cycle(SAILOR_ID, source="new_cycle")

    assert pending.consent_status == ConsentStatus.PENDING
    assert pending.welcome_email_sent_at == confirmed.welcome_email_sent_at
    assert pending.welcome_email_last_error == confirmed.welcome_email_last_error
    assert sailors.get_by_id(SAILOR_ID) == pending
