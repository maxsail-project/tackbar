import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path

import pytest

from app.admin_auth import ADMIN_KEY_ENVIRONMENT_VARIABLE
from app.admin_routes import router as admin_router
from app.config import CURRENT_CONSENT_AGREEMENT_VERSION
from app.main import app
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE
from app.services.ingestion_history import IngestionHistory
from app.storage.ingestion_original_storage import IngestionOriginalStorage


ADMIN_KEY = "test-admin-key-never-use-in-production"
PENDING_NEEDS = "30000000-0000-4000-8000-000000000001"
PENDING_WAITING = "30000000-0000-4000-8000-000000000002"
ACTIVE = "30000000-0000-4000-8000-000000000003"
REVOKED = "30000000-0000-4000-8000-000000000004"
ACTIVITY_ACTIVE = "10000000-0000-4000-8000-000000000001"
ACTIVITY_PENDING = "10000000-0000-4000-8000-000000000002"
ACTIVITY_REVOKED = "10000000-0000-4000-8000-000000000003"
ACTIVITY_REVOKED_ONLY = "10000000-0000-4000-8000-000000000004"
SESSION_ACTIVE = "session-active"
SESSION_NEVER = "session-never"
SESSION_REVOKED = "session-revoked"
SESSION_EXPIRED = "session-expired"
SESSION_REVOKED_SAILOR = "session-revoked-sailor"
ACTIVE_TOKEN = "admin-api-active-capability-token-000000000000001"
REVOKED_TOKEN = "admin-api-revoked-capability-token-0000000000001"
EXPIRED_TOKEN = "admin-api-expired-capability-token-0000000000001"


@dataclass(frozen=True)
class ApiResponse:
    status_code: int
    json: object


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def _sailor(
    sailor_id: str,
    email: str,
    status: str,
    request_sent_at: str | None = None,
) -> dict[str, object]:
    return {
        "id": sailor_id,
        "email": email,
        "name": email.split("@")[0],
        "default_boat_id": None,
        "consent_status": status,
        "consent_request_sent_at": request_sent_at or (
            "2026-08-01T12:00:00+00:00" if status == "REVOKED" else None
        ),
        "consent_granted_at": (
            "2026-08-02T12:00:00+00:00"
            if status in ("ACTIVE", "REVOKED") else None
        ),
        "consent_revoked_at": (
            "2026-08-03T12:00:00+00:00" if status == "REVOKED" else None
        ),
    }


def _activity(activity_id: str, sailor_id: str) -> dict[str, object]:
    return {
        "id": activity_id,
        "sailor_id": sailor_id,
        "boat_id": None,
        "source": "vakaros",
        "device_name": "demo",
        "original_filename": "demo.csv.gz",
        "start_time": "2026-08-10T09:00:00+00:00",
        "end_time": "2026-08-10T10:00:00+00:00",
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


def _session(
    session_id: str,
    activity_ids: list[str],
    token: str | None,
    revoked: bool = False,
    created_at: str = "2026-01-01T00:00:00+00:00",
    expires_at: str = "2099-03-02T00:00:00+00:00",
) -> dict[str, object]:
    return {
        "id": session_id,
        "activity_ids": activity_ids,
        "created_at": created_at,
        "expires_at": expires_at,
        "capability_token": token,
        "capability_revoked": revoked,
    }


def _runtime_root(temporary_directory: Path) -> Path:
    root = temporary_directory / "admin-api"
    root.mkdir()
    _write_json(root / "sailors.json", [
        _sailor(PENDING_NEEDS, "needs@example.com", "PENDING"),
        _sailor(PENDING_WAITING, "waiting@example.com", "PENDING", "2026-08-01T12:00:00+00:00"),
        _sailor(ACTIVE, "active@example.com", "ACTIVE"),
        _sailor(REVOKED, "revoked@example.com", "REVOKED"),
    ])
    _write_json(root / "boats.json", [])
    _write_json(root / "activities.json", [
        _activity(ACTIVITY_ACTIVE, ACTIVE),
        _activity(ACTIVITY_PENDING, PENDING_NEEDS),
        _activity(ACTIVITY_REVOKED, REVOKED),
        _activity(ACTIVITY_REVOKED_ONLY, REVOKED),
    ])
    _write_json(root / "sessions.json", [
        _session(SESSION_ACTIVE, [ACTIVITY_PENDING, ACTIVITY_ACTIVE, ACTIVITY_REVOKED], ACTIVE_TOKEN),
        _session(SESSION_NEVER, [ACTIVITY_PENDING], None),
        _session(SESSION_REVOKED, [ACTIVITY_ACTIVE], None, revoked=True),
        _session(SESSION_EXPIRED, [ACTIVITY_ACTIVE, ACTIVITY_PENDING], EXPIRED_TOKEN, created_at="2020-01-01T00:00:00+00:00", expires_at="2020-03-01T00:00:00+00:00"),
        _session(SESSION_REVOKED_SAILOR, [ACTIVITY_REVOKED_ONLY], None),
    ])
    _write_json(root / "consent_events.json", [
        {"event_type": "consent_requested", "timestamp": "2026-08-01T12:00:00+00:00", "source": "admin_marked_consent_requested", "sailor_id": PENDING_WAITING, "agreement_version": None},
        {"event_type": "consent_granted", "timestamp": "2026-08-02T12:00:00+00:00", "source": "admin_confirmed_email", "sailor_id": ACTIVE, "agreement_version": CURRENT_CONSENT_AGREEMENT_VERSION},
        {"event_type": "consent_revoked", "timestamp": "2026-08-03T12:00:00+00:00", "source": "admin_recorded_withdrawal", "sailor_id": REVOKED, "agreement_version": None},
    ])
    return root


def _request(
    method: str,
    path: str,
    admin_key: str | None = ADMIN_KEY,
    query_string: str = "",
    json_body: object | None = None,
) -> ApiResponse:
    messages: list[dict[str, object]] = []
    body = b"" if json_body is None else json.dumps(json_body).encode("utf-8")
    headers = [] if admin_key is None else [
        (b"x-tackbar-admin-key", admin_key.encode("utf-8"))
    ]
    if json_body is not None:
        headers.append((b"content-type", b"application/json"))

    async def request() -> None:
        received = False
        async def receive() -> dict[str, object]:
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}
        async def send(message: dict[str, object]) -> None:
            messages.append(message)
        await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method, "scheme": "http", "path": path, "raw_path": path.encode("ascii"), "query_string": query_string.encode("ascii"), "headers": headers, "client": ("test", 1), "server": ("test", 80), "root_path": ""}, receive, send)

    asyncio.run(request())
    start = next(item for item in messages if item["type"] == "http.response.start")
    body = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
    return ApiResponse(int(start["status"]), json.loads(body))


def _use_runtime(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> Path:
    root = _runtime_root(temporary_directory)
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(root))
    monkeypatch.setenv(ADMIN_KEY_ENVIRONMENT_VARIABLE, ADMIN_KEY)
    return root


def test_admin_authorization_fails_closed_and_never_exposes_secret(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    missing = _request("GET", "/api/admin/sailors", admin_key=None)
    wrong = _request("GET", "/api/admin/sailors", admin_key="wrong")
    capability_only = _request("GET", "/api/admin/sailors", admin_key=ACTIVE_TOKEN)
    query_only = _request(
        "GET",
        "/api/admin/sailors",
        admin_key=None,
        query_string=f"admin_key={ADMIN_KEY}",
    )
    monkeypatch.delenv(ADMIN_KEY_ENVIRONMENT_VARIABLE)
    unconfigured = _request("GET", "/api/admin/sailors", admin_key=ADMIN_KEY)
    monkeypatch.setenv(ADMIN_KEY_ENVIRONMENT_VARIABLE, "   ")
    whitespace = _request("GET", "/api/admin/sailors", admin_key="   ")

    assert missing.status_code == wrong.status_code == capability_only.status_code == query_only.status_code == 401
    assert unconfigured.status_code == whitespace.status_code == 503
    for response in (missing, wrong, capability_only, query_only, unconfigured, whitespace):
        assert ADMIN_KEY not in json.dumps(response.json)


def test_every_registered_admin_route_is_protected_and_schema_has_no_secret() -> None:
    assert len(admin_router.routes) == 14
    assert all(len(route.dependencies) == 1 for route in admin_router.routes)
    assert ADMIN_KEY not in json.dumps(app.openapi())


def test_valid_admin_key_and_shared_capability_have_separate_boundaries(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    admin = _request("GET", "/api/admin/sailors")
    shared = _request("GET", f"/api/shared/sessions/{ACTIVE_TOKEN}", admin_key=None)

    assert admin.status_code == 200
    assert shared.status_code == 200


def test_sailor_groups_and_history_are_explicit(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    listing = _request("GET", "/api/admin/sailors")
    detail = _request("GET", f"/api/admin/sailors/{ACTIVE}")

    groups = {item["id"]: item["operational_group"] for item in listing.json}
    assert groups == {
        PENDING_NEEDS: "pending_needs_request",
        PENDING_WAITING: "pending_awaiting_response",
        ACTIVE: "active",
        REVOKED: "revoked",
    }
    assert detail.json["consent_events"] == [{
        "event_type": "consent_granted",
        "timestamp": "2026-08-02T12:00:00Z",
        "source": "admin_confirmed_email",
        "agreement_version": CURRENT_CONSENT_AGREEMENT_VERSION,
    }]


def test_mark_request_and_confirm_use_semantic_service(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    requested = _request("POST", f"/api/admin/sailors/{PENDING_NEEDS}/consent/requested")
    confirmed = _request("POST", f"/api/admin/sailors/{PENDING_NEEDS}/consent/confirm")
    session = _request("GET", f"/api/admin/sessions/{SESSION_NEVER}")

    assert requested.status_code == confirmed.status_code == 200
    assert requested.json["operational_group"] == "pending_awaiting_response"
    assert requested.json["consent_events"][-1]["source"] == "admin_marked_consent_requested"
    assert confirmed.json["consent_status"] == "ACTIVE"
    assert confirmed.json["consent_events"][-1]["agreement_version"] == CURRENT_CONSENT_AGREEMENT_VERSION
    assert confirmed.json["consent_events"][-1]["source"] == "admin_confirmed_email"
    assert session.json["visible_activity_count"] == 1
    assert session.json["capability_state"] == "active"


@pytest.mark.parametrize(
    ("sailor_id", "expected_event"),
    [(PENDING_NEEDS, "consent_declined"), (ACTIVE, "consent_revoked")],
)
def test_revoke_uses_existing_decline_withdrawal_semantics(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path, sailor_id: str, expected_event: str) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    response = _request("POST", f"/api/admin/sailors/{sailor_id}/consent/revoke")

    assert response.status_code == 200
    assert response.json["consent_status"] == "REVOKED"
    assert response.json["consent_events"][-1]["event_type"] == expected_event
    assert response.json["consent_events"][-1]["source"] == "admin_recorded_withdrawal"


def test_invalid_transition_and_unknown_sailor_are_client_errors(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    conflict = _request("POST", f"/api/admin/sailors/{ACTIVE}/consent/confirm")
    missing = _request("GET", "/api/admin/sailors/unknown")
    missing_action = _request("POST", "/api/admin/sailors/unknown/consent/revoke")

    assert conflict.status_code == 409
    assert missing.status_code == missing_action.status_code == 404


def test_admin_starts_new_consent_cycle_without_restoring_shared_visibility(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    before_session = _request("GET", f"/api/admin/sessions/{SESSION_ACTIVE}")
    before_private = _request("GET", f"/api/admin/sessions/{SESSION_REVOKED_SAILOR}")
    response = _request("POST", f"/api/admin/sailors/{REVOKED}/consent/new-cycle")
    after_session = _request("GET", f"/api/admin/sessions/{SESSION_ACTIVE}")
    after_private = _request("GET", f"/api/admin/sessions/{SESSION_REVOKED_SAILOR}")

    assert response.status_code == 200
    assert response.json["consent_status"] == "PENDING"
    assert response.json["operational_group"] == "pending_needs_request"
    assert response.json["consent_request_sent_at"] is None
    assert response.json["consent_granted_at"] is None
    assert response.json["consent_revoked_at"] is None
    assert [event["event_type"] for event in response.json["consent_events"]] == [
        "consent_revoked",
        "consent_cycle_started",
    ]
    assert response.json["consent_events"][-1]["source"] == "admin_started_new_consent_cycle"
    assert after_session.json["visible_activity_count"] == before_session.json["visible_activity_count"]
    assert after_session.json["capability_token"] == before_session.json["capability_token"]
    assert before_private.json["capability_state"] == after_private.json["capability_state"] == "never_generated"
    assert after_private.json["visible_activity_count"] == 0
    assert after_private.json["capability_token"] is None


def test_new_consent_cycle_rejects_invalid_states_unknown_and_unauthorized(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    active = _request("POST", f"/api/admin/sailors/{ACTIVE}/consent/new-cycle")
    pending = _request("POST", f"/api/admin/sailors/{PENDING_NEEDS}/consent/new-cycle")
    missing = _request("POST", "/api/admin/sailors/unknown/consent/new-cycle")
    unauthorized = _request(
        "POST",
        f"/api/admin/sailors/{REVOKED}/consent/new-cycle",
        admin_key=None,
    )

    assert active.status_code == pending.status_code == 409
    assert missing.status_code == 404
    assert unauthorized.status_code == 401


def test_admin_sessions_include_internal_counts_lifetime_and_all_states(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    response = _request("GET", "/api/admin/sessions")
    sessions = {item["id"]: item for item in response.json}

    assert sessions[SESSION_ACTIVE] == {
        "id": SESSION_ACTIVE,
        "created_at": "2026-01-01T00:00:00Z",
        "expires_at": "2099-03-02T00:00:00Z",
        "total_activity_count": 3,
        "visible_activity_count": 1,
        "capability_state": "active",
        "capability_token": ACTIVE_TOKEN,
        "capability_path": f"/s/{ACTIVE_TOKEN}",
    }
    assert sessions[SESSION_NEVER]["capability_state"] == "never_generated"
    assert sessions[SESSION_NEVER]["visible_activity_count"] == 0
    assert sessions[SESSION_NEVER]["capability_token"] is None
    assert sessions[SESSION_NEVER]["capability_path"] is None
    assert sessions[SESSION_REVOKED]["capability_state"] == "revoked"
    assert sessions[SESSION_EXPIRED]["capability_state"] == "expired"
    assert sessions[SESSION_EXPIRED]["total_activity_count"] == 2
    assert sessions[SESSION_EXPIRED]["capability_token"] is None


def test_expired_state_precedes_token_and_revocation_combinations(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    token_present = _request("GET", f"/api/admin/sessions/{SESSION_EXPIRED}")
    sessions = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    expired = next(item for item in sessions if item["id"] == SESSION_EXPIRED)
    expired["capability_revoked"] = True
    _write_json(root / "sessions.json", sessions)
    revoked_and_expired = _request("GET", f"/api/admin/sessions/{SESSION_EXPIRED}")
    expired["capability_token"] = None
    expired["capability_revoked"] = False
    _write_json(root / "sessions.json", sessions)
    null_and_expired = _request("GET", f"/api/admin/sessions/{SESSION_EXPIRED}")
    unexpired_revoked = _request("GET", f"/api/admin/sessions/{SESSION_REVOKED}")

    assert token_present.json["capability_state"] == "expired"
    assert revoked_and_expired.json["capability_state"] == "expired"
    assert null_and_expired.json["capability_state"] == "expired"
    assert unexpired_revoked.json["capability_state"] == "revoked"
    for response in (token_present, revoked_and_expired, null_and_expired, unexpired_revoked):
        assert response.json["capability_token"] is None
        assert response.json["capability_path"] is None


def test_capability_revoke_and_regenerate_are_semantic_and_preserve_lifetime(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    before = _request("GET", f"/api/admin/sessions/{SESSION_ACTIVE}")
    revoked = _request("POST", f"/api/admin/sessions/{SESSION_ACTIVE}/capability/revoke")
    old_shared = _request("GET", f"/api/shared/sessions/{ACTIVE_TOKEN}", admin_key=None)
    regenerated = _request("POST", f"/api/admin/sessions/{SESSION_ACTIVE}/capability/regenerate")
    new_token = regenerated.json["capability_token"]
    new_shared = _request("GET", f"/api/shared/sessions/{new_token}", admin_key=None)

    assert revoked.json["capability_state"] == "revoked"
    assert old_shared.status_code == 404
    assert regenerated.status_code == 200
    assert new_token != ACTIVE_TOKEN
    assert new_shared.status_code == 200
    assert regenerated.json["created_at"] == before.json["created_at"]
    assert regenerated.json["expires_at"] == before.json["expires_at"]


def test_expired_session_is_inspectable_but_cannot_regenerate(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    inspected = _request("GET", f"/api/admin/sessions/{SESSION_EXPIRED}")
    regenerated = _request("POST", f"/api/admin/sessions/{SESSION_EXPIRED}/capability/regenerate")

    assert inspected.status_code == 200
    assert inspected.json["capability_state"] == "expired"
    assert inspected.json["total_activity_count"] == 2
    assert regenerated.status_code == 409


def test_session_renewal_resets_lifetime_from_now_and_preserves_capability_state(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    before = datetime.now(timezone.utc)
    active = _request("POST", f"/api/admin/sessions/{SESSION_ACTIVE}/renew")
    expired = _request(
        "POST",
        f"/api/admin/sessions/{SESSION_EXPIRED}/renew",
        json_body={"days": 60},
    )
    revoked = _request("POST", f"/api/admin/sessions/{SESSION_REVOKED}/renew")
    never = _request("POST", f"/api/admin/sessions/{SESSION_NEVER}/renew")
    after = datetime.now(timezone.utc)

    assert active.status_code == expired.status_code == revoked.status_code == never.status_code == 200
    assert datetime.fromisoformat(active.json["expires_at"].replace("Z", "+00:00")) >= before + timedelta(days=30)
    assert datetime.fromisoformat(active.json["expires_at"].replace("Z", "+00:00")) <= after + timedelta(days=30)
    assert datetime.fromisoformat(expired.json["expires_at"].replace("Z", "+00:00")) >= before + timedelta(days=60)
    assert datetime.fromisoformat(expired.json["expires_at"].replace("Z", "+00:00")) <= after + timedelta(days=60)
    assert active.json["created_at"] == "2026-01-01T00:00:00Z"
    assert active.json["capability_token"] == ACTIVE_TOKEN
    assert expired.json["capability_token"] == EXPIRED_TOKEN
    assert revoked.json["capability_state"] == "revoked"
    assert never.json["capability_state"] == "never_generated"
    assert _request("GET", f"/api/shared/sessions/{EXPIRED_TOKEN}", admin_key=None).status_code == 200


def test_session_renewal_validation_auth_and_explicit_regeneration(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    minimum = _request("POST", f"/api/admin/sessions/{SESSION_ACTIVE}/renew", json_body={"days": 1})
    maximum = _request("POST", f"/api/admin/sessions/{SESSION_ACTIVE}/renew", json_body={"days": 365})
    invalid_zero = _request("POST", f"/api/admin/sessions/{SESSION_ACTIVE}/renew", json_body={"days": 0})
    invalid_large = _request("POST", f"/api/admin/sessions/{SESSION_ACTIVE}/renew", json_body={"days": 366})
    invalid_bodies = [
        _request("POST", f"/api/admin/sessions/{SESSION_ACTIVE}/renew", json_body={"days": value})
        for value in (True, 30.0, "30")
    ]
    missing = _request("POST", "/api/admin/sessions/unknown/renew")
    capability_only = _request(
        "POST",
        f"/api/admin/sessions/{SESSION_ACTIVE}/renew",
        admin_key=ACTIVE_TOKEN,
    )
    renewed_revoked = _request("POST", f"/api/admin/sessions/{SESSION_REVOKED}/renew")
    regenerated = _request("POST", f"/api/admin/sessions/{SESSION_REVOKED}/capability/regenerate")

    assert minimum.status_code == maximum.status_code == 200
    assert invalid_zero.status_code == invalid_large.status_code == 409
    assert all(response.status_code == 422 for response in invalid_bodies)
    assert missing.status_code == 404
    assert capability_only.status_code == 401
    assert renewed_revoked.json["capability_state"] == "revoked"
    assert regenerated.status_code == 200
    assert regenerated.json["capability_state"] == "active"


def test_session_renewal_preserves_active_only_visibility(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    sessions = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    never = next(item for item in sessions if item["id"] == SESSION_NEVER)
    never["capability_token"] = REVOKED_TOKEN
    _write_json(root / "sessions.json", sessions)

    before = _request("GET", f"/api/admin/sessions/{SESSION_NEVER}")
    renewed = _request("POST", f"/api/admin/sessions/{SESSION_NEVER}/renew")
    unavailable = _request(
        "GET",
        f"/api/shared/sessions/{REVOKED_TOKEN}",
        admin_key=None,
    )
    sailors = json.loads((root / "sailors.json").read_text(encoding="utf-8"))
    pending = next(item for item in sailors if item["id"] == PENDING_NEEDS)
    pending["consent_status"] = "ACTIVE"
    pending["consent_granted_at"] = "2026-08-24T12:00:00+00:00"
    _write_json(root / "sailors.json", sailors)
    available = _request(
        "GET",
        f"/api/shared/sessions/{REVOKED_TOKEN}",
        admin_key=None,
    )

    assert renewed.status_code == 200
    assert renewed.json["total_activity_count"] == before.json["total_activity_count"]
    assert renewed.json["visible_activity_count"] == before.json["visible_activity_count"] == 0
    assert unavailable.status_code == 404
    assert available.status_code == 200


def test_capability_revoke_edge_cases_are_idempotent_and_explicit(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    already_revoked = _request("POST", f"/api/admin/sessions/{SESSION_REVOKED}/capability/revoke")
    never_generated = _request("POST", f"/api/admin/sessions/{SESSION_NEVER}/capability/revoke")

    assert already_revoked.status_code == never_generated.status_code == 200
    assert already_revoked.json["capability_state"] == "revoked"
    assert never_generated.json["capability_state"] == "revoked"


def test_capability_regenerate_edge_cases_require_eligible_active_content(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    zero_active = _request("POST", f"/api/admin/sessions/{SESSION_NEVER}/capability/regenerate")
    revoked_eligible = _request("POST", f"/api/admin/sessions/{SESSION_REVOKED}/capability/regenerate")
    sailors = json.loads((root / "sailors.json").read_text(encoding="utf-8"))
    next(item for item in sailors if item["id"] == PENDING_NEEDS)["consent_status"] = "ACTIVE"
    _write_json(root / "sailors.json", sailors)
    never_generated_eligible = _request("POST", f"/api/admin/sessions/{SESSION_NEVER}/capability/regenerate")

    assert zero_active.status_code == 409
    assert revoked_eligible.status_code == 200
    assert revoked_eligible.json["capability_state"] == "active"
    assert never_generated_eligible.status_code == 200
    assert never_generated_eligible.json["capability_state"] == "active"


def test_unknown_session_and_corrupt_internal_membership_are_not_silently_hidden(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    missing = _request("GET", "/api/admin/sessions/unknown")
    sessions = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    sessions[0]["activity_ids"].append("missing-private-activity")
    _write_json(root / "sessions.json", sessions)
    corrupt = _request("GET", "/api/admin/sessions")

    assert missing.status_code == 404
    assert corrupt.status_code == 500
    assert corrupt.json == {"detail": "Persisted Admin data is inconsistent"}
    assert "missing-private-activity" not in json.dumps(corrupt.json)


def test_admin_ingestion_inspection_and_reprocess_are_protected_and_path_safe(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    history = IngestionHistory(root / "ingestion_history.json")
    content = b"invalid preserved track"
    record = history.create("gmail", "message-1", "sailor@example.test", "track.csv.gz", sha256(content).hexdigest())
    record["original_file"] = IngestionOriginalStorage(root).preserve(record["id"], "track.csv.gz", content)
    history.replace(record)

    listing = _request("GET", "/api/admin/ingestions")
    detail = _request("GET", f"/api/admin/ingestions/{record['id']}")
    reprocessed = _request("POST", f"/api/admin/ingestions/{record['id']}/reprocess")
    unauthorized = _request("GET", "/api/admin/ingestions", admin_key=None)
    missing = _request("GET", "/api/admin/ingestions/unknown")

    assert listing.status_code == detail.status_code == reprocessed.status_code == 200
    assert unauthorized.status_code == 401
    assert missing.status_code == 404
    assert listing.json[0]["original_available"] is True
    assert "original_file" not in listing.json[0]
    assert "attachment_sha256" not in listing.json[0]
    assert str(root) not in json.dumps(listing.json)
    assert reprocessed.json["status"] == "failed"
    assert reprocessed.json["attempts"] == 1
    assert reprocessed.json["last_error"]
    assert "/api/admin/mailbox" not in app.openapi()["paths"]


def test_orphan_or_malformed_consent_events_are_generic_integrity_errors(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    events_path = root / "consent_events.json"
    events = json.loads(events_path.read_text(encoding="utf-8"))
    events.append({"event_type": "consent_requested", "timestamp": "2026-08-04T12:00:00+00:00", "source": "admin", "sailor_id": "39999999-9999-4999-8999-999999999999", "agreement_version": None})
    _write_json(events_path, events)
    orphan = _request("GET", "/api/admin/sailors")
    events[-1]["sailor_id"] = PENDING_NEEDS
    events[-1]["timestamp"] = "not-a-timestamp"
    _write_json(events_path, events)
    malformed = _request("POST", f"/api/admin/sailors/{PENDING_NEEDS}/consent/requested")
    sailors = json.loads((root / "sailors.json").read_text(encoding="utf-8"))
    unchanged = next(item for item in sailors if item["id"] == PENDING_NEEDS)

    assert orphan.status_code == malformed.status_code == 500
    assert orphan.json == malformed.json == {"detail": "Persisted Admin data is inconsistent"}
    assert unchanged["consent_status"] == "PENDING"
    assert unchanged["consent_request_sent_at"] is None
