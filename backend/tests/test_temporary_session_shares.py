import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException, Response

from app.main import (
    create_temporary_session_share,
    get_temporary_shared_activity_maneuvers,
    get_temporary_shared_activity_track,
    get_temporary_shared_session,
)
from app.normalization.track_normalizer import normalize_track
from app.models import ConsentStatus, TemporarySessionShareState
from app.repositories.activities import ActivityRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.repositories.temporary_session_shares import TemporarySessionShareRepository
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE
from app.services.session_capabilities import SessionCapabilityService
from app.services.session_lifetime import SessionLifetimeService
from app.services.temporary_session_shares import TemporarySessionShareService
from app.storage.track_storage import TrackStorage


NOW = datetime(2031, 6, 1, 12, tzinfo=timezone.utc)
SESSION_ID = "20000000-0000-4000-8000-000000000001"
ACTIVITY_ID = "10000000-0000-4000-8000-000000000001"
SECOND_ACTIVITY_ID = "10000000-0000-4000-8000-000000000002"
SAILOR_ID = "30000000-0000-4000-8000-000000000001"
ORIGINAL_TOKEN = "original-session-capability-token-00000000000001"
NEW_TOKEN = "new-original-session-capability-token-000000000001"
TEMPORARY_TOKEN = "temporary-session-share-token-000000000000000001"
NEXT_TEMPORARY_TOKEN = "temporary-session-share-token-000000000000000002"


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def _activity(activity_id: str = ACTIVITY_ID) -> dict[str, object]:
    return {
        "id": activity_id,
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
        "attachment_sha256": activity_id[-1] * 64,
        "track_file": f"tracks/{activity_id}.csv.gz",
    }


def _runtime(
    root: Path,
    current_time: list[datetime],
    *,
    session_expires_at: datetime | None = None,
    generated_tokens: tuple[str, ...] = (TEMPORARY_TOKEN, NEXT_TEMPORARY_TOKEN),
) -> tuple[
    TemporarySessionShareService,
    SessionCapabilityService,
    SessionRepository,
    SailorRepository,
]:
    _write_json(root / "activities.json", [_activity()])
    _write_json(root / "boats.json", [])
    _write_json(root / "sailors.json", [{
        "id": SAILOR_ID,
        "email": "sailor@example.com",
        "name": "Sailor",
        "default_boat_id": None,
        "consent_status": "ACTIVE",
    }])
    _write_json(root / "sessions.json", [{
        "id": SESSION_ID,
        "activity_ids": [ACTIVITY_ID],
        "created_at": (NOW - timedelta(days=1)).isoformat(),
        "expires_at": (session_expires_at or NOW + timedelta(days=60)).isoformat(),
        "capability_token": ORIGINAL_TOKEN,
        "capability_revoked": False,
        "location_label": "Mahón",
        "historical_conditions": {
            "coverage_start": "2031-06-01T06:00:00+00:00",
            "coverage_end": "2031-06-01T13:00:00+00:00",
            "requested_latitude": 0.15,
            "requested_longitude": -30.15,
            "weather_source": {
                "provider": "open-meteo",
                "route": "forecast",
                "retrieved_at": "2031-06-02T00:00:00+00:00",
                "grid_latitude": 0.15,
                "grid_longitude": -30.15,
            },
            "marine_source": None,
            "hourly": [{
                "time": "2031-06-01T09:00:00+00:00",
                "air_temperature_c": 23.0,
                "wind_speed_10m_kn": 14.0,
                "wind_direction_10m_deg": 92.0,
                "wind_gusts_10m_kn": 19.0,
                "cloud_cover_pct": None,
                "wave_height_m": None,
                "wave_direction_deg": None,
                "wave_period_s": None,
            }],
        },
    }])
    sessions = SessionRepository(root / "sessions.json", clock=lambda: current_time[0])
    sailors = SailorRepository(root / "sailors.json")
    capabilities = SessionCapabilityService(
        sessions,
        ActivityRepository(root / "activities.json"),
        sailors,
        clock=lambda: current_time[0],
        token_generator=lambda: NEW_TOKEN,
    )
    token_iterator = iter(generated_tokens)
    service = TemporarySessionShareService(
        TemporarySessionShareRepository(root / "temporary_session_shares.json"),
        capabilities,
        sailors,
        clock=lambda: current_time[0],
        token_generator=lambda: next(token_iterator),
    )
    return service, capabilities, sessions, sailors


def test_share_creation_reuses_one_valid_share_and_uses_48_hour_lifetime(
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    service, _, _, _ = _runtime(temporary_directory, current_time)

    first = service.create_or_reuse(ORIGINAL_TOKEN)
    current_time[0] += timedelta(hours=2)
    reopened = service.create_or_reuse(ORIGINAL_TOKEN)

    assert first is not None
    assert reopened == first
    assert first.expires_at == NOW + timedelta(hours=48)
    assert len(service.shares.all()) == 1
    persisted = json.loads(service.shares.path.read_text(encoding="utf-8"))
    assert set(persisted[0]) == {
        "id",
        "token",
        "session_id",
        "originating_capability_fingerprint",
        "created_at",
        "expires_at",
    }
    assert persisted[0]["session_id"] == SESSION_ID
    assert persisted[0]["originating_capability_fingerprint"] != ORIGINAL_TOKEN
    assert ORIGINAL_TOKEN not in service.shares.path.read_text(encoding="utf-8")


def test_share_uses_earlier_session_expiry_and_restart_preserves_it(
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    session_expiry = NOW + timedelta(hours=3)
    service, capabilities, _, sailors = _runtime(
        temporary_directory,
        current_time,
        session_expires_at=session_expiry,
    )
    share = service.create_or_reuse(ORIGINAL_TOKEN)
    assert share is not None
    assert share.expires_at == session_expiry

    restarted = TemporarySessionShareService(
        TemporarySessionShareRepository(service.shares.path),
        capabilities,
        sailors,
        clock=lambda: current_time[0],
    )
    resolution = restarted.resolve(share.token)
    assert resolution.state == TemporarySessionShareState.VALID
    assert resolution.share == share


def test_unknown_and_expired_shares_are_distinct_and_expiry_allows_new_share(
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    service, _, _, _ = _runtime(temporary_directory, current_time)
    share = service.create_or_reuse(ORIGINAL_TOKEN)
    assert share is not None
    assert service.resolve("unknown-temporary-share-token-00000000000001").state == (
        TemporarySessionShareState.NOT_FOUND
    )

    current_time[0] = share.expires_at
    assert service.resolve(share.token).state == TemporarySessionShareState.EXPIRED
    replacement = service.create_or_reuse(ORIGINAL_TOKEN)
    assert replacement is not None
    assert replacement.token == NEXT_TEMPORARY_TOKEN
    assert len(service.shares.all()) == 2


@pytest.mark.parametrize("operation", ["regenerate", "revoke"])
def test_originating_capability_change_immediately_invalidates_share(
    temporary_directory: Path,
    operation: str,
) -> None:
    current_time = [NOW]
    service, capabilities, _, _ = _runtime(temporary_directory, current_time)
    share = service.create_or_reuse(ORIGINAL_TOKEN)
    assert share is not None

    if operation == "regenerate":
        capabilities.regenerate_capability(SESSION_ID)
    else:
        capabilities.revoke_capability(SESSION_ID)

    assert service.resolve(share.token).state == TemporarySessionShareState.UNAVAILABLE


def test_session_renewal_does_not_extend_or_revive_existing_share(
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    service, _, sessions, _ = _runtime(
        temporary_directory,
        current_time,
        session_expires_at=NOW + timedelta(hours=3),
    )
    share = service.create_or_reuse(ORIGINAL_TOKEN)
    assert share is not None
    current_time[0] = NOW + timedelta(hours=2)
    SessionLifetimeService(sessions, clock=lambda: current_time[0]).renew_session(
        SESSION_ID
    )

    assert service.resolve(share.token).state == TemporarySessionShareState.VALID
    assert service.resolve(share.token).share.expires_at == NOW + timedelta(hours=3)  # type: ignore[union-attr]
    current_time[0] = NOW + timedelta(hours=3)
    assert service.resolve(share.token).state == TemporarySessionShareState.EXPIRED


def test_content_and_consent_changes_do_not_invalidate_share(
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    service, _, sessions, sailors = _runtime(temporary_directory, current_time)
    share = service.create_or_reuse(ORIGINAL_TOKEN)
    assert share is not None

    records = json.loads((temporary_directory / "activities.json").read_text(encoding="utf-8"))
    records.append(_activity(SECOND_ACTIVITY_ID))
    _write_json(temporary_directory / "activities.json", records)
    sessions.add_activity(SESSION_ID, SECOND_ACTIVITY_ID)
    sailor = sailors.get_by_id(SAILOR_ID)
    assert sailor is not None
    sailors.replace(replace(sailor, consent_status=ConsentStatus.REVOKED))

    assert service.resolve(share.token).state == TemporarySessionShareState.VALID
    assert service.create_or_reuse(ORIGINAL_TOKEN) == share
    assert sessions.get_by_id(SESSION_ID).activity_ids == [  # type: ignore[union-attr]
        ACTIVITY_ID,
        SECOND_ACTIVITY_ID,
    ]


def test_public_api_returns_only_temporary_path_and_distinguishes_unavailable_states(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    service, _, _, _ = _runtime(temporary_directory, current_time)
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(temporary_directory))
    monkeypatch.setattr("app.main._temporary_share_service", lambda: service)

    created = create_temporary_session_share(ORIGINAL_TOKEN, Response())
    assert created.path == f"/q/{TEMPORARY_TOKEN}"
    assert ORIGINAL_TOKEN not in created.path
    loaded = get_temporary_shared_session(TEMPORARY_TOKEN, Response())
    assert loaded.temporary_access_expires_at == NOW + timedelta(hours=48)
    assert set(loaded.model_dump()) == {
        "start_time",
        "end_time",
        "activities",
        "location_label",
        "historical_conditions",
        "temporary_access_expires_at",
    }
    assert "session_access_expires_at" not in loaded.model_dump()
    assert loaded.activities[0].id == ACTIVITY_ID
    assert loaded.location_label == "Mahón"
    assert loaded.historical_conditions is not None
    assert loaded.historical_conditions.weather_source is not None
    assert loaded.historical_conditions.weather_source.provider == "open-meteo"
    assert loaded.historical_conditions.hourly[0].wind_speed_10m_kn == 14.0

    with pytest.raises(HTTPException) as unknown:
        get_temporary_shared_session(
            "unknown-temporary-share-token-00000000000001",
            Response(),
        )
    assert unknown.value.status_code == 404
    assert unknown.value.detail == "Temporary access not found"

    current_time[0] = NOW + timedelta(hours=48)
    with pytest.raises(HTTPException) as expired:
        get_temporary_shared_session(TEMPORARY_TOKEN, Response())
    assert expired.value.status_code == 410
    assert expired.value.detail == "Temporary access expired"


def test_temporary_share_token_cannot_delegate_another_share(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    service, _, _, _ = _runtime(temporary_directory, current_time)
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(temporary_directory))
    monkeypatch.setattr("app.main._temporary_share_service", lambda: service)
    original_share = create_temporary_session_share(ORIGINAL_TOKEN, Response())

    with pytest.raises(HTTPException) as rejected:
        create_temporary_session_share(TEMPORARY_TOKEN, Response())

    assert rejected.value.status_code == 404
    assert rejected.value.detail == "Session not found"
    assert original_share.path == f"/q/{TEMPORARY_TOKEN}"
    assert len(service.shares.all()) == 1


def test_temporary_access_uses_same_visible_track_and_analytics_boundaries(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    current_time = [NOW]
    service, _, _, _ = _runtime(temporary_directory, current_time)
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(temporary_directory))
    monkeypatch.setattr("app.main._temporary_share_service", lambda: service)
    share = service.create_or_reuse(ORIGINAL_TOKEN)
    assert share is not None
    TrackStorage(temporary_directory).write_normalized_track(
        ACTIVITY_ID,
        normalize_track(ACTIVITY_ID, [
            {"utc": "2031-06-01T09:00:00Z", "lat": 0.1, "lon": -30.1},
            {"utc": "2031-06-01T09:00:01Z", "lat": 0.2, "lon": -30.2},
        ]),
    )

    track = get_temporary_shared_activity_track(
        share.token,
        ACTIVITY_ID,
        Response(),
    )
    analytics = get_temporary_shared_activity_maneuvers(
        share.token,
        ACTIVITY_ID,
        Response(),
    )

    assert track.activity_id == ACTIVITY_ID
    assert len(track.samples) == 2
    assert analytics.activity_id == ACTIVITY_ID
    assert analytics.status == "unavailable"
