import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import pytest

from app.config import CURRENT_CONSENT_AGREEMENT_VERSION
from app.models import ConsentEvent, ConsentEventType, ConsentStatus
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


def test_grant_append_failure_keeps_sailor_pending(
    temporary_json_file: Callable[[str, object], Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, sailors, events = _service(temporary_json_file)
    def fail(_event):
        assert sailors.get_by_id(SAILOR_ID).consent_status == ConsentStatus.PENDING
        raise ValueError("synthetic append failure")
    monkeypatch.setattr(events, "append", fail)

    with pytest.raises(ValueError, match="synthetic append failure"):
        service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")

    assert sailors.get_by_id(SAILOR_ID).consent_status == ConsentStatus.PENDING
    assert events.for_sailor(SAILOR_ID) == []


def test_admin_retry_completes_event_only_grant_once_with_original_evidence(
    temporary_json_file: Callable[[str, object], Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, sailors, events = _service(temporary_json_file)
    original_replace = sailors.replace
    def fail(_sailor):
        assert sailors.get_by_id(SAILOR_ID).consent_status == ConsentStatus.PENDING
        assert len(events.for_sailor(SAILOR_ID)) == 1
        raise ValueError("synthetic activation failure")
    monkeypatch.setattr(sailors, "replace", fail)
    with pytest.raises(ValueError, match="synthetic activation failure"):
        service.confirm_consent(
            SAILOR_ID, source="admin_confirmed_email",
            timestamp=datetime(2031, 6, 18, 11, tzinfo=timezone.utc),
        )
    monkeypatch.setattr(sailors, "replace", original_replace)

    original_event = events.for_sailor(SAILOR_ID)[0]
    recovered = service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")
    assert recovered.consent_status == ConsentStatus.ACTIVE
    assert recovered.consent_granted_at == original_event.timestamp
    assert events.for_sailor(SAILOR_ID) == [original_event]
    with pytest.raises(ValueError, match="expected PENDING"):
        service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")
    assert events.for_sailor(SAILOR_ID) == [original_event]


@pytest.mark.parametrize("source,version,when", [
    ("unrelated_admin", CURRENT_CONSENT_AGREEMENT_VERSION, None),
    ("admin_confirmed_email", CURRENT_CONSENT_AGREEMENT_VERSION,
     datetime(2031, 6, 18, 12, tzinfo=timezone.utc)),
])
def test_event_only_grant_rejects_conflicting_retry(
    temporary_json_file: Callable[[str, object], Path],
    monkeypatch: pytest.MonkeyPatch,
    source: str,
    version: str,
    when: datetime | None,
) -> None:
    service, sailors, events = _service(temporary_json_file)
    original_replace = sailors.replace
    monkeypatch.setattr(sailors, "replace", lambda _sailor: (_ for _ in ()).throw(ValueError("synthetic")))
    with pytest.raises(ValueError, match="synthetic"):
        service.confirm_consent(
            SAILOR_ID, source="admin_confirmed_email",
            timestamp=datetime(2031, 6, 18, 11, tzinfo=timezone.utc),
        )
    monkeypatch.setattr(sailors, "replace", original_replace)
    before = events.for_sailor(SAILOR_ID)
    retry = SailorConsentService(sailors, events, agreement_version=version)
    with pytest.raises(ValueError, match="evidence conflicts"):
        retry.confirm_consent(SAILOR_ID, source=source, timestamp=when)
    assert sailors.get_by_id(SAILOR_ID).consent_status == ConsentStatus.PENDING
    assert events.for_sailor(SAILOR_ID) == before


def test_admin_event_only_retry_preserves_agreement_after_version_change(
    temporary_json_file: Callable[[str, object], Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, sailors, events = _service(temporary_json_file)
    original_replace = sailors.replace
    def fail(_sailor):
        raise ValueError("synthetic")
    monkeypatch.setattr(sailors, "replace", fail)
    with pytest.raises(ValueError, match="synthetic"):
        service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")
    monkeypatch.setattr(sailors, "replace", original_replace)
    original_grant = events.for_sailor(SAILOR_ID)[0]

    retry = SailorConsentService(sailors, events, agreement_version="next-agreement")
    active = retry.confirm_consent(SAILOR_ID, source="admin_confirmed_email")
    assert active.consent_granted_at == original_grant.timestamp
    assert events.for_sailor(SAILOR_ID) == [original_grant]
    assert original_grant.agreement_version == CURRENT_CONSENT_AGREEMENT_VERSION


def test_duplicate_current_cycle_grants_fail_closed(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    at = datetime(2031, 6, 18, 11, tzinfo=timezone.utc)
    grant = ConsentEvent(
        ConsentEventType.CONSENT_GRANTED, at, "admin_confirmed_email",
        SAILOR_ID, CURRENT_CONSENT_AGREEMENT_VERSION,
    )
    events.append(grant)
    events.append(grant)
    with pytest.raises(ValueError, match="evidence conflicts"):
        service.confirm_consent(SAILOR_ID, source="admin_confirmed_email")
    assert sailors.get_by_id(SAILOR_ID).consent_status == ConsentStatus.PENDING
    assert events.for_sailor(SAILOR_ID) == [grant, grant]


def test_prior_cycle_event_only_grant_is_not_reused(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    old_time = datetime(2031, 6, 18, 11, tzinfo=timezone.utc)
    events.append(ConsentEvent(
        ConsentEventType.CONSENT_GRANTED, old_time, "admin_confirmed_email",
        SAILOR_ID, CURRENT_CONSENT_AGREEMENT_VERSION,
    ))
    service.revoke_consent(SAILOR_ID, source="declined")
    service.start_new_consent_cycle(SAILOR_ID, source="new_track")
    new_time = datetime(2031, 6, 19, 11, tzinfo=timezone.utc)
    active = service.confirm_consent(
        SAILOR_ID, source="admin_confirmed_email", timestamp=new_time,
    )
    grants = [event for event in events.for_sailor(SAILOR_ID)
              if event.event_type == ConsentEventType.CONSENT_GRANTED]
    assert active.consent_status == ConsentStatus.ACTIVE
    assert active.consent_granted_at == new_time
    assert [event.timestamp for event in grants] == [old_time, new_time]


def test_active_grant_with_conflicting_cycle_event_cannot_complete(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    service, sailors, events = _service(temporary_json_file)
    at = datetime(2031, 6, 18, 11, tzinfo=timezone.utc)
    service.confirm_consent(SAILOR_ID, source="web_consent", timestamp=at)
    events.append(ConsentEvent(
        ConsentEventType.CONSENT_DECLINED, at, "unrelated", SAILOR_ID,
    ))
    before = sailors.get_by_id(SAILOR_ID)
    with pytest.raises(ValueError, match="does not match"):
        service.complete_activation(
            SAILOR_ID, source="web_consent", timestamp=at,
        )
    assert sailors.get_by_id(SAILOR_ID) == before


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
        source="ovh_valid_track",
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
        source="ovh_valid_track",
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
