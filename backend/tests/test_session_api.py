import asyncio
import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import pytest

from app.main import app
from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE

SESSION_ID = "20000000-0000-4000-8000-000000000001"
OTHER_SESSION_ID = "20000000-0000-4000-8000-000000000002"
ACTIVITY_A = "10000000-0000-4000-8000-000000000001"
ACTIVITY_B = "10000000-0000-4000-8000-000000000002"
ACTIVITY_OTHER = "10000000-0000-4000-8000-000000000003"
SAILOR_A = "30000000-0000-4000-8000-000000000001"
SAILOR_B = "30000000-0000-4000-8000-000000000002"
BOAT_ID = "40000000-0000-4000-8000-000000000001"
TOKEN = "shared-session-capability-token-000000000000000001"
OTHER_TOKEN = "shared-session-capability-token-000000000000000002"


@dataclass(frozen=True)
class ApiResponse:
    status_code: int
    json: object


def _write_json(path: Path, records: object) -> None:
    path.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")


def _activity(activity_id: str, sailor_id: str, start: str, end: str, boat_id: str | None = None) -> dict[str, object]:
    return {"id": activity_id, "sailor_id": sailor_id, "boat_id": boat_id, "source": "vakaros", "device_name": "demo", "original_filename": "demo.csv.gz", "start_time": start, "end_time": end, "start_lat": 0.1, "start_lon": -30.1, "end_lat": 0.2, "end_lon": -30.2, "center_lat": 0.15, "center_lon": -30.15, "min_lat": 0.1, "max_lat": 0.2, "min_lon": -30.2, "max_lon": -30.1, "sample_count": 2, "attachment_sha256": activity_id[-1] * 64, "track_file": f"tracks/{activity_id}.csv.gz"}


def _runtime_root(temporary_directory: Path) -> Path:
    root = temporary_directory / "shared-api"
    (root / "tracks").mkdir(parents=True)
    _write_json(root / "sailors.json", [
        {"id": SAILOR_A, "email": "active@example.com", "name": "Active", "default_boat_id": None, "consent_status": "ACTIVE"},
        {"id": SAILOR_B, "email": "pending@example.com", "name": "Pending", "default_boat_id": None, "consent_status": "PENDING"},
    ])
    _write_json(root / "boats.json", [{"id": BOAT_ID, "name": "Demo", "sailing_class": None, "sail_number": None}])
    _write_json(root / "activities.json", [
        _activity(ACTIVITY_A, SAILOR_A, "2031-06-01T08:00:00+00:00", "2031-06-01T10:00:00+00:00", BOAT_ID),
        _activity(ACTIVITY_B, SAILOR_B, "2031-06-01T07:00:00+00:00", "2031-06-01T11:00:00+00:00"),
        _activity(ACTIVITY_OTHER, SAILOR_A, "2031-06-02T08:00:00+00:00", "2031-06-02T09:00:00+00:00"),
    ])
    _write_json(root / "sessions.json", [
        {"id": SESSION_ID, "activity_ids": [ACTIVITY_B, ACTIVITY_A], "created_at": "2031-06-01T00:00:00+00:00", "expires_at": "2031-07-31T00:00:00+00:00", "capability_token": TOKEN, "capability_revoked": False},
        {"id": OTHER_SESSION_ID, "activity_ids": [ACTIVITY_OTHER], "created_at": "2031-06-01T00:00:00+00:00", "expires_at": "2031-07-31T00:00:00+00:00", "capability_token": OTHER_TOKEN, "capability_revoked": False},
    ])
    track = pd.DataFrame([
        {"activity_id": ACTIVITY_A, "utc": "2031-06-01T08:00:00Z", "lat": 0.1, "lon": -30.1, "cog": 1.0, "sog": 4.0, "dist": 0.0, "hdg": None, "heel": None, "trim": None},
        {"activity_id": ACTIVITY_A, "utc": "2031-06-01T08:00:01Z", "lat": 0.2, "lon": -30.2, "cog": 2.0, "sog": 4.1, "dist": 1.0, "hdg": None, "heel": None, "trim": None},
    ], columns=CANONICAL_TRACK_COLUMNS)
    track.to_csv(root / "tracks" / f"{ACTIVITY_A}.csv.gz", index=False, compression={"method": "gzip", "mtime": 0})
    return root


def _get(path: str) -> ApiResponse:
    messages: list[dict[str, object]] = []
    async def request() -> None:
        sent = False
        async def receive() -> dict[str, object]:
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": b"", "more_body": False}
            return {"type": "http.disconnect"}
        async def send(message: dict[str, object]) -> None:
            messages.append(message)
        await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET", "scheme": "http", "path": path, "raw_path": path.encode("ascii"), "query_string": b"", "headers": [], "client": ("test", 1), "server": ("test", 80), "root_path": ""}, receive, send)
    asyncio.run(request())
    start = next(message for message in messages if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return ApiResponse(int(start["status"]), json.loads(body))


def _use_runtime(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> Path:
    root = _runtime_root(temporary_directory)
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(root))
    return root


def _set_status(root: Path, sailor_id: str, status: str) -> None:
    sailors = json.loads((root / "sailors.json").read_text(encoding="utf-8"))
    next(item for item in sailors if item["id"] == sailor_id)["consent_status"] = status
    _write_json(root / "sailors.json", sailors)


def test_capability_session_exposes_active_subset_without_internal_id(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    response = _get(f"/api/shared/sessions/{TOKEN}")
    assert response.status_code == 200
    assert set(response.json) == {"start_time", "end_time", "activities"}
    assert response.json["start_time"] == "2031-06-01T08:00:00Z"
    assert response.json["end_time"] == "2031-06-01T10:00:00Z"
    assert [item["id"] for item in response.json["activities"]] == [ACTIVITY_A]
    assert SESSION_ID not in json.dumps(response.json)
    assert ACTIVITY_B not in json.dumps(response.json)


def test_visibility_changes_on_next_capability_read_without_membership_change(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    before = (root / "sessions.json").read_bytes()
    _set_status(root, SAILOR_B, "ACTIVE")
    active = _get(f"/api/shared/sessions/{TOKEN}")
    _set_status(root, SAILOR_A, "REVOKED")
    revoked = _get(f"/api/shared/sessions/{TOKEN}")
    assert [item["id"] for item in active.json["activities"]] == [ACTIVITY_B, ACTIVITY_A]
    assert [item["id"] for item in revoked.json["activities"]] == [ACTIVITY_B]
    assert (root / "sessions.json").read_bytes() == before


def test_visibility_recovers_with_same_non_revoked_token(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    _set_status(root, SAILOR_A, "REVOKED")
    unavailable = _get(f"/api/shared/sessions/{TOKEN}")
    _set_status(root, SAILOR_A, "ACTIVE")
    recovered = _get(f"/api/shared/sessions/{TOKEN}")

    assert unavailable.status_code == 404
    assert recovered.status_code == 200
    assert [item["id"] for item in recovered.json["activities"]] == [ACTIVITY_A]
    persisted = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    assert persisted[0]["capability_token"] == TOKEN
    assert persisted[0]["capability_revoked"] is False


@pytest.mark.parametrize("token", ["unknown-token", TOKEN])
def test_unavailable_or_zero_visible_capability_is_same_404(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path, token: str) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    if token == TOKEN:
        _set_status(root, SAILOR_A, "REVOKED")
    response = _get(f"/api/shared/sessions/{token}")
    assert response.status_code == 404
    assert response.json == {"detail": "Session not found"}
    persisted = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    assert persisted[0]["capability_token"] == TOKEN


@pytest.mark.parametrize("state", ["expired", "revoked"])
def test_expired_or_revoked_capability_is_unavailable_without_deletion(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path, state: str) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    sessions = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    if state == "expired":
        sessions[0]["created_at"] = "2019-11-02T00:00:00+00:00"
        sessions[0]["expires_at"] = "2020-01-01T00:00:00+00:00"
    else:
        sessions[0]["capability_token"] = None
        sessions[0]["capability_revoked"] = True
    _write_json(root / "sessions.json", sessions)

    response = _get(f"/api/shared/sessions/{TOKEN}")

    assert response.status_code == 404
    persisted = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    assert persisted[0]["activity_ids"] == [ACTIVITY_B, ACTIVITY_A]
    assert len(json.loads((root / "activities.json").read_text(encoding="utf-8"))) == 3


def test_capability_track_is_scoped_to_visible_member(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    visible = _get(f"/api/shared/sessions/{TOKEN}/activities/{ACTIVITY_A}/track")
    hidden = _get(f"/api/shared/sessions/{TOKEN}/activities/{ACTIVITY_B}/track")
    other = _get(f"/api/shared/sessions/{TOKEN}/activities/{ACTIVITY_OTHER}/track")
    assert visible.status_code == 200
    assert visible.json["activity_id"] == ACTIVITY_A
    assert hidden.status_code == other.status_code == 404
    assert hidden.json == other.json == {"detail": "Activity not found"}


def test_old_public_routes_do_not_bypass_capability(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> None:
    _use_runtime(monkeypatch, temporary_directory)
    assert _get("/api/sessions").status_code == 404
    assert _get(f"/api/sessions/{SESSION_ID}").status_code == 404
    assert _get(f"/api/activities/{ACTIVITY_A}/track").status_code == 404


@pytest.mark.parametrize("broken", ["activity", "sailor", "boat"])
def test_capability_integrity_errors_are_generic(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path, broken: str) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    missing = "missing-private-reference"
    if broken == "activity":
        sessions = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
        sessions[0]["activity_ids"] = [missing]
        _write_json(root / "sessions.json", sessions)
    else:
        activities = json.loads((root / "activities.json").read_text(encoding="utf-8"))
        activities[0][f"{broken}_id"] = missing
        _write_json(root / "activities.json", activities)
    response = _get(f"/api/shared/sessions/{TOKEN}")
    assert response.status_code == 500
    assert response.json == {"detail": "Persisted Session data is inconsistent"}
    assert missing not in json.dumps(response.json)
