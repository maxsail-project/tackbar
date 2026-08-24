import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import pytest

from app.config import CURRENT_CONSENT_AGREEMENT_VERSION
from app.models import ConsentEventType, ConsentStatus
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.services.sailor_consent import SailorConsentService


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
LEGACY_SAILOR = {
    "id": SAILOR_ID,
    "email": "sailor-a@example.com",
    "name": "Sailor A",
    "default_boat_id": None,
}


def _service(
    temporary_json_file: Callable[[str, object], Path],
) -> tuple[SailorConsentService, SailorRepository, ConsentEventRepository]:
    sailors = SailorRepository(
        temporary_json_file("consent-sailors", [LEGACY_SAILOR])
    )
    events = ConsentEventRepository(
        temporary_json_file("consent-events", [])
    )
    return SailorConsentService(sailors, events), sailors, events


def test_new_sailor_defaults_to_pending_without_request_timestamp(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    sailors = SailorRepository(temporary_json_file("new-sailors", []))

    sailor, created = sailors.find_or_create_by_email("new@example.com")
    persisted = json.loads(sailors.path.read_text(encoding="utf-8"))[0]

    assert created is True
    assert sailor.consent_status == ConsentStatus.PENDING
    assert sailor.consent_request_sent_at is None
    assert persisted["consent_status"] == "PENDING"
    assert persisted["consent_request_sent_at"] is None


def test_legacy_sailor_without_consent_fields_loads_as_safe_pending(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    path = temporary_json_file("legacy-sailors", [LEGACY_SAILOR])

    sailor = SailorRepository(path).get_by_id(SAILOR_ID)

    assert sailor is not None
    assert sailor.consent_status == ConsentStatus.PENDING
    assert sailor.consent_request_sent_at is None
    assert "consent_status" not in json.loads(path.read_text(encoding="utf-8"))[0]


def test_pending_request_timestamp_distinguishes_operational_state(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, _ = _service(temporary_json_file)
    requested_at = datetime(2031, 6, 18, 10, 0, tzinfo=timezone.utc)

    before = sailors.get_by_id(SAILOR_ID)
    after = service.mark_consent_requested(
        SAILOR_ID,
        source="admin_email_sent",
        timestamp=requested_at,
    )

    assert before is not None
    assert before.consent_status == after.consent_status == ConsentStatus.PENDING
    assert before.consent_request_sent_at is None
    assert after.consent_request_sent_at == requested_at


def test_mark_consent_requested_persists_timestamp_and_event(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    requested_at = datetime(2031, 6, 18, 10, 0, tzinfo=timezone.utc)

    service.mark_consent_requested(
        SAILOR_ID,
        source="admin_email_sent",
        timestamp=requested_at,
    )

    persisted = sailors.get_by_id(SAILOR_ID)
    history = events.for_sailor(SAILOR_ID)
    assert persisted is not None
    assert persisted.consent_status == ConsentStatus.PENDING
    assert persisted.consent_request_sent_at == requested_at
    assert len(history) == 1
    assert history[0].event_type == ConsentEventType.CONSENT_REQUESTED
    assert history[0].timestamp == requested_at
    assert history[0].source == "admin_email_sent"


def test_confirm_consent_activates_and_uses_configured_agreement_version(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    granted_at = datetime(2031, 6, 18, 11, 0, tzinfo=timezone.utc)

    confirmed = service.confirm_consent(
        SAILOR_ID,
        source="admin_confirmed_email",
        timestamp=granted_at,
    )

    assert confirmed.consent_status == ConsentStatus.ACTIVE
    assert confirmed.consent_granted_at == granted_at
    assert sailors.get_by_id(SAILOR_ID) == confirmed
    event = events.for_sailor(SAILOR_ID)[0]
    assert event.event_type == ConsentEventType.CONSENT_GRANTED
    assert event.agreement_version == CURRENT_CONSENT_AGREEMENT_VERSION


def test_active_sailor_revocation_appends_revoked_event(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")
    revoked_at = datetime(2031, 6, 18, 12, 0, tzinfo=timezone.utc)

    revoked = service.revoke_consent(
        SAILOR_ID,
        source="admin_recorded_withdrawal",
        timestamp=revoked_at,
    )

    assert revoked.consent_status == ConsentStatus.REVOKED
    assert revoked.consent_revoked_at == revoked_at
    assert sailors.get_by_id(SAILOR_ID) == revoked
    assert events.for_sailor(SAILOR_ID)[-1].event_type == (
        ConsentEventType.CONSENT_REVOKED
    )


def test_pending_sailor_can_decline_without_creating_revoked_event(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    service.mark_consent_requested(SAILOR_ID, source="admin_email_sent")
    declined_at = datetime(2031, 6, 18, 12, 0, tzinfo=timezone.utc)

    declined = service.revoke_consent(
        SAILOR_ID,
        source="admin_recorded_decline",
        timestamp=declined_at,
    )

    assert declined.consent_status == ConsentStatus.REVOKED
    assert declined.consent_revoked_at == declined_at
    assert sailors.get_by_id(SAILOR_ID) == declined
    event_types = [event.event_type for event in events.for_sailor(SAILOR_ID)]
    assert event_types[-1] == ConsentEventType.CONSENT_DECLINED
    assert ConsentEventType.CONSENT_REVOKED not in event_types


def test_declined_sailor_can_start_new_pending_cycle_with_history_intact(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    service.mark_consent_requested(SAILOR_ID, source="first_request")
    service.revoke_consent(SAILOR_ID, source="declined")
    history_before = events.for_sailor(SAILOR_ID)

    pending = service.start_new_consent_cycle(
        SAILOR_ID,
        source="gmail_valid_track",
    )

    assert pending.consent_status == ConsentStatus.PENDING
    assert pending.consent_request_sent_at is None
    assert pending.consent_granted_at is None
    assert pending.consent_revoked_at is None
    assert sailors.get_by_id(SAILOR_ID) == pending
    history_after = events.for_sailor(SAILOR_ID)
    assert history_after[:-1] == history_before
    assert history_after[-1].event_type == (
        ConsentEventType.CONSENT_CYCLE_STARTED
    )


def test_revoked_sailor_can_start_new_pending_cycle_without_losing_history(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    service.mark_consent_requested(SAILOR_ID, source="first_request")
    service.confirm_consent(SAILOR_ID, source="first_acceptance")
    service.revoke_consent(SAILOR_ID, source="withdrawal")
    history_before = events.for_sailor(SAILOR_ID)

    pending = service.start_new_consent_cycle(
        SAILOR_ID,
        source="gmail_valid_track",
    )

    assert pending.consent_status == ConsentStatus.PENDING
    assert pending.consent_request_sent_at is None
    assert pending.consent_granted_at is None
    assert pending.consent_revoked_at is None
    assert sailors.get_by_id(SAILOR_ID) == pending
    history_after = events.for_sailor(SAILOR_ID)
    assert history_after[:-1] == history_before
    assert history_after[-1].event_type == (
        ConsentEventType.CONSENT_CYCLE_STARTED
    )


def test_invalid_consent_transition_is_rejected_clearly(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, _, events = _service(temporary_json_file)

    service.revoke_consent(SAILOR_ID, source="declined")
    event_count = len(events.all())

    with pytest.raises(ValueError, match="expected PENDING or ACTIVE"):
        service.revoke_consent(SAILOR_ID, source="invalid")

    assert len(events.all()) == event_count


def test_invalid_event_is_rejected_before_sailor_state_changes(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    before = sailors.get_by_id(SAILOR_ID)

    with pytest.raises(ValueError, match="source must not be empty"):
        service.confirm_consent(SAILOR_ID, source="  ")

    assert sailors.get_by_id(SAILOR_ID) == before
    assert events.all() == []
