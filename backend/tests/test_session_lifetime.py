import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.repositories.sessions import SessionRepository
from app.services.session_lifetime import (
    SessionLifetimeOperationError,
    SessionLifetimeService,
)


NOW = datetime(2026, 8, 24, 15, 0, tzinfo=timezone.utc)


def _repository(path: Path) -> SessionRepository:
    path.write_text(
        json.dumps([
            {
                "id": "session-1",
                "activity_ids": ["activity-1"],
                "created_at": "2026-01-01T00:00:00+00:00",
                "expires_at": "2026-09-03T15:00:00+00:00",
                "capability_token": "stable-token",
                "capability_revoked": True,
            }
        ]),
        encoding="utf-8",
    )
    return SessionRepository(path)


def test_renew_session_uses_now_baseline_and_changes_only_expiration(
    temporary_directory: Path,
) -> None:
    repository = _repository(temporary_directory / "sessions.json")
    service = SessionLifetimeService(repository, clock=lambda: NOW)

    renewed = service.renew_session("session-1", days=60)
    repeated = service.renew_session("session-1", days=30)

    assert renewed.expires_at == NOW + timedelta(days=60)
    assert repeated.expires_at == NOW + timedelta(days=30)
    assert repeated.created_at == datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert repeated.activity_ids == ["activity-1"]
    assert repeated.capability_token == "stable-token"
    assert repeated.capability_revoked is True


@pytest.mark.parametrize("days", [0, -1, 366, True])
def test_renew_session_rejects_invalid_days(
    temporary_directory: Path,
    days: int,
) -> None:
    repository = _repository(temporary_directory / "sessions.json")

    with pytest.raises(SessionLifetimeOperationError):
        SessionLifetimeService(repository, clock=lambda: NOW).renew_session(
            "session-1",
            days=days,
        )


@pytest.mark.parametrize("days", [1, 365])
def test_renew_session_accepts_boundary_days(
    temporary_directory: Path,
    days: int,
) -> None:
    repository = _repository(temporary_directory / "sessions.json")

    renewed = SessionLifetimeService(
        repository,
        clock=lambda: NOW,
    ).renew_session("session-1", days=days)

    assert renewed.expires_at == NOW + timedelta(days=days)
