import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.models import ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.sailor_consent import SailorConsentService
from app.services.session_capabilities import SessionCapabilityService
from app.services.session_matcher import match_activity_to_session


NOW = datetime(2031, 6, 1, 12, tzinfo=timezone.utc)
SAILOR_ID = "30000000-0000-4000-8000-000000000001"
ACTIVITY_ID = "10000000-0000-4000-8000-000000000001"


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def _activity() -> dict[str, object]:
    return {
        "id": ACTIVITY_ID,
        "sailor_id": SAILOR_ID,
        "boat_id": None,
        "source": "vakaros",
        "device_name": "demo",
        "original_filename": "demo.csv.gz",
        "start_time": "2031-06-01T09:00:00+00:00",
        "end_time": "2031-06-01T10:00:00+00:00",
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


def _repositories(
    root: Path,
    status: ConsentStatus = ConsentStatus.ACTIVE,
    clock=lambda: NOW,
) -> tuple[SessionRepository, ActivityRepository, SailorRepository]:
    _write_json(root / "activities.json", [_activity()])
    _write_json(
        root / "sailors.json",
        [
            {
                "id": SAILOR_ID,
                "email": "sailor@example.com",
                "name": "Sailor",
                "default_boat_id": None,
                "consent_status": status.value,
            }
        ],
    )
    return (
        SessionRepository(root / "sessions.json", clock=clock),
        ActivityRepository(root / "activities.json"),
        SailorRepository(root / "sailors.json"),
    )


def test_new_session_has_fixed_utc_lifetime_and_add_does_not_change_it(
    temporary_directory: Path,
) -> None:
    sessions, _, _ = _repositories(temporary_directory)
    created = sessions.create(ACTIVITY_ID)
    before = (created.created_at, created.expires_at)

    repeated = sessions.add_activity(created.id, "activity-b")

    assert created.created_at == NOW
    assert created.created_at.tzinfo == timezone.utc
    assert created.expires_at == NOW + timedelta(days=60)
    assert (repeated.created_at, repeated.expires_at) == before
    assert repeated.activity_ids == [ACTIVITY_ID, "activity-b"]


def test_legacy_session_is_migrated_once_using_explicit_migration_time(
    temporary_directory: Path,
) -> None:
    path = temporary_directory / "sessions.json"
    _write_json(path, [{"id": "legacy", "activity_ids": [ACTIVITY_ID]}])
    first_time = NOW
    later_time = NOW + timedelta(days=10)

    first = SessionRepository(path, clock=lambda: first_time).all()[0]
    persisted_after_first = path.read_bytes()
    second = SessionRepository(path, clock=lambda: later_time).all()[0]

    assert first.created_at == first_time
    assert first.expires_at == first_time + timedelta(days=60)
    assert second.created_at == first.created_at
    assert second.expires_at == first.expires_at
    assert path.read_bytes() == persisted_after_first


@pytest.mark.parametrize(
    "partial",
    [
        {"created_at": NOW.isoformat()},
        {"expires_at": (NOW + timedelta(days=60)).isoformat()},
    ],
)
def test_partially_migrated_session_is_rejected(
    temporary_directory: Path,
    partial: dict[str, str],
) -> None:
    path = temporary_directory / "sessions.json"
    _write_json(path, [{"id": "partial", "activity_ids": [], **partial}])

    with pytest.raises(ValueError, match="created_at and expires_at"):
        SessionRepository(path, clock=lambda: NOW).all()


def test_capability_created_only_for_active_activity_and_remains_stable(
    temporary_directory: Path,
) -> None:
    sessions, activities, sailors = _repositories(temporary_directory)
    session = sessions.create(ACTIVITY_ID)
    service = SessionCapabilityService(sessions, activities, sailors)

    first = service.ensure_for_session(session.id)
    second = service.ensure_for_session(session.id)
    records = json.loads(
        (temporary_directory / "activities.json").read_text(encoding="utf-8")
    )
    records.append({**_activity(), "id": "activity-b", "attachment_sha256": "b" * 64})
    _write_json(temporary_directory / "activities.json", records)
    sessions.add_activity(session.id, "activity-b")
    after_activity = service.ensure_for_session(session.id)

    assert first.capability_token is not None
    assert len(first.capability_token) >= 32
    assert session.id not in first.capability_token
    assert second.capability_token == first.capability_token
    assert after_activity.capability_token == first.capability_token
    assert second.created_at == session.created_at
    assert second.expires_at == session.expires_at


def test_pending_activity_gets_capability_after_consent_without_rematching(
    temporary_directory: Path,
) -> None:
    sessions, activities, sailors = _repositories(
        temporary_directory,
        ConsentStatus.PENDING,
    )
    session = sessions.create(ACTIVITY_ID)
    capabilities = SessionCapabilityService(sessions, activities, sailors)
    assert capabilities.ensure_for_session(session.id).capability_token is None

    SailorConsentService(
        sailors,
        ConsentEventRepository(temporary_directory / "consent_events.json"),
        session_capabilities=capabilities,
    ).confirm_consent(SAILOR_ID, "admin_confirmed_email", NOW)

    updated = sessions.get_by_id(session.id)
    assert updated is not None
    assert updated.activity_ids == [ACTIVITY_ID]
    assert updated.capability_token is not None


def test_regenerate_revoke_and_expiration_preserve_session_data(
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    sessions, activities, sailors = _repositories(
        temporary_directory,
        clock=lambda: current_time[0],
    )
    session = sessions.create(ACTIVITY_ID)
    service = SessionCapabilityService(
        sessions,
        activities,
        sailors,
        clock=lambda: current_time[0],
    )
    initial = service.ensure_for_session(session.id)
    initial_token = initial.capability_token
    assert initial_token is not None
    resolved = service.resolve(initial_token)
    assert resolved is not None
    assert resolved.id == session.id

    regenerated = service.regenerate_capability(session.id)
    assert regenerated.capability_token != initial_token
    assert service.resolve(initial_token) is None
    assert service.resolve(regenerated.capability_token or "") is not None
    assert regenerated.expires_at == session.expires_at

    service.revoke_capability(session.id)
    assert service.resolve(regenerated.capability_token or "") is None
    revoked = sessions.get_by_id(session.id)
    assert revoked is not None
    assert revoked.activity_ids == [ACTIVITY_ID]
    assert revoked.expires_at == session.expires_at

    restored = service.regenerate_capability(session.id)
    current_time[0] = restored.expires_at
    assert service.resolve(restored.capability_token or "") is None
    persisted = sessions.get_by_id(session.id)
    assert persisted is not None
    assert persisted.activity_ids == [ACTIVITY_ID]


def test_expiration_boundary_and_expired_token_operations(
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    sessions, activities, sailors = _repositories(
        temporary_directory,
        clock=lambda: current_time[0],
    )
    session = sessions.create(ACTIVITY_ID)
    service = SessionCapabilityService(
        sessions,
        activities,
        sailors,
        clock=lambda: current_time[0],
    )
    active = service.ensure_for_session(session.id)
    token = active.capability_token
    assert token is not None

    current_time[0] = active.expires_at - timedelta(microseconds=1)
    assert service.resolve(token) is not None
    current_time[0] = active.expires_at
    assert service.resolve(token) is None
    current_time[0] = active.expires_at + timedelta(seconds=1)
    assert service.resolve(token) is None
    with pytest.raises(ValueError, match="expired Session"):
        service.regenerate_capability(session.id)

    without_token = sessions.replace(replace(active, capability_token=None))
    assert service.ensure_for_session(without_token.id).capability_token is None


def test_revoked_capability_never_auto_regenerates(
    temporary_directory: Path,
) -> None:
    sessions, activities, sailors = _repositories(temporary_directory)
    session = sessions.create(ACTIVITY_ID)
    service = SessionCapabilityService(sessions, activities, sailors)
    assert service.ensure_for_session(session.id).capability_token is not None
    revoked = service.revoke_capability(session.id)

    records = json.loads(
        (temporary_directory / "activities.json").read_text(encoding="utf-8")
    )
    records.append({**_activity(), "id": "activity-b", "attachment_sha256": "b" * 64})
    _write_json(temporary_directory / "activities.json", records)
    sessions.add_activity(session.id, "activity-b")
    after_activity = service.ensure_for_session(session.id)

    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    sailors.replace(replace(sailor, consent_status=ConsentStatus.PENDING))
    SailorConsentService(
        sailors,
        ConsentEventRepository(temporary_directory / "consent_events.json"),
        session_capabilities=service,
    ).confirm_consent(SAILOR_ID, "admin_confirmed_email", NOW)
    after_consent = sessions.get_by_id(session.id)

    assert revoked.capability_revoked is True
    assert revoked.capability_token is None
    assert after_activity.capability_revoked is True
    assert after_activity.capability_token is None
    assert after_consent is not None
    assert after_consent.capability_revoked is True
    assert after_consent.capability_token is None

    regenerated = service.regenerate_capability(session.id)
    assert regenerated.capability_revoked is False
    assert regenerated.capability_token is not None


def test_regeneration_retries_current_and_cross_session_token_collisions(
    temporary_directory: Path,
) -> None:
    sessions, activities, sailors = _repositories(temporary_directory)
    first_session = sessions.create(ACTIVITY_ID)
    initial_service = SessionCapabilityService(sessions, activities, sailors)
    first_session = initial_service.ensure_for_session(first_session.id)
    assert first_session.capability_token is not None
    second_session = sessions.create("activity-other")
    collision = "collision-token-0000000000000000000000000001"
    sessions.replace(replace(second_session, capability_token=collision))
    fresh = "fresh-token-00000000000000000000000000000002"
    generated = iter([first_session.capability_token, collision, fresh])
    service = SessionCapabilityService(
        sessions,
        activities,
        sailors,
        token_generator=lambda: next(generated),
    )

    regenerated = service.regenerate_capability(first_session.id)

    assert regenerated.capability_token == fresh


def test_existing_matcher_can_join_expired_session_without_reactivating_access(
    temporary_directory: Path,
) -> None:
    created_at = NOW - timedelta(days=61)
    sessions, activities, sailors = _repositories(
        temporary_directory,
        clock=lambda: created_at,
    )
    session = sessions.create(ACTIVITY_ID)
    records = json.loads(
        (temporary_directory / "activities.json").read_text(encoding="utf-8")
    )
    records.append({**_activity(), "id": "activity-b", "attachment_sha256": "b" * 64})
    _write_json(temporary_directory / "activities.json", records)
    activity_b = activities.get_by_id("activity-b")
    assert activity_b is not None

    matched = match_activity_to_session(activity_b, activities, sessions)
    capabilities = SessionCapabilityService(
        sessions,
        activities,
        sailors,
        clock=lambda: NOW,
    )
    after_lifecycle = capabilities.ensure_for_session(session.id)

    assert matched.status == "matched"
    assert matched.session.activity_ids == [ACTIVITY_ID, "activity-b"]
    assert after_lifecycle.capability_token is None
    assert after_lifecycle.expires_at < NOW
