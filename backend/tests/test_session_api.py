import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pytest

from app.main import app
from app.normalization.track_normalizer import (
    CANONICAL_TRACK_COLUMNS,
    normalize_track,
)
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE
from app.services.maneuver_analytics import MANEUVER_ALGORITHM_VERSION
from app.storage.track_storage import TrackStorage

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


def _maneuver_track(*, with_hdg: bool = True) -> pd.DataFrame:
    start = datetime(2031, 6, 1, 8, 0, tzinfo=timezone.utc)
    heading = 40.0
    samples = []
    for index in range(35):
        if 10 <= index < 24:
            heading += 7.5
        samples.append({
            "utc": (
                start + timedelta(seconds=index * 0.5)
            ).isoformat(timespec="milliseconds"),
            "lat": 0.25,
            "lon": -30.75,
            "hdg": heading if with_hdg else None,
        })
    return normalize_track(ACTIVITY_A, samples)


def _maneuver_path(token: str, activity_id: str) -> str:
    return (
        f"/api/shared/sessions/{token}/activities/"
        f"{activity_id}/maneuvers"
    )


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


def test_shared_maneuvers_returns_public_analytics_contract(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    TrackStorage(root).write_normalized_track(ACTIVITY_A, _maneuver_track())

    response = _get(_maneuver_path(TOKEN, ACTIVITY_A))

    assert response.status_code == 200
    assert set(response.json) == {"activity_id", "status", "maneuvers"}
    assert response.json["activity_id"] == ACTIVITY_A
    assert response.json["status"] == "available"
    assert len(response.json["maneuvers"]) == 1
    assert set(response.json["maneuvers"][0]) == {
        "start_time",
        "center_time",
        "end_time",
        "heading_change_deg",
        "peak_turn_rate_deg_s",
        "peak_turn_rate_time",
        "duration_s",
    }
    assert response.json["maneuvers"][0]["duration_s"] > 0
    assert "algorithm_version" not in json.dumps(response.json)
    assert "track_sha256" not in json.dumps(response.json)
    persisted = json.loads(
        (
            root / "analytics" / f"{ACTIVITY_A}.maneuvers.json"
        ).read_text(encoding="utf-8")
    )
    assert persisted["algorithm_version"] == MANEUVER_ALGORITHM_VERSION
    assert "track_sha256" in persisted


def test_shared_maneuvers_serializes_complementary_metrics(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    def analytics_with_metrics(*_args: object) -> dict[str, object]:
        return {
            "activity_id": ACTIVITY_A,
            "algorithm_version": MANEUVER_ALGORITHM_VERSION,
            "track_sha256": "a" * 64,
            "status": "available",
            "maneuvers": [{
                "start_time": "2031-06-01T08:00:05Z",
                "center_time": "2031-06-01T08:00:10Z",
                "end_time": "2031-06-01T08:00:15Z",
                "heading_change_deg": 82.0,
                "peak_turn_rate_deg_s": 12.0,
                "peak_turn_rate_time": "2031-06-01T08:00:10Z",
                "duration_s": 10.0,
                "sog_entry_kn": 5.2,
                "sog_min_kn": 3.1,
                "sog_exit_kn": 5.1,
                "recovery_time_s": 12.0,
                "speed_loss_distance_m": 8.6,
                "speed_loss_time_s": 3.3,
            }],
        }

    monkeypatch.setattr(
        "app.services.shared_session_reader.get_or_generate_maneuver_analytics",
        analytics_with_metrics,
    )

    response = _get(_maneuver_path(TOKEN, ACTIVITY_A))

    assert response.status_code == 200
    maneuver = response.json["maneuvers"][0]
    assert maneuver["duration_s"] == 10.0
    assert maneuver["sog_entry_kn"] == 5.2
    assert maneuver["sog_min_kn"] == 3.1
    assert maneuver["sog_exit_kn"] == 5.1
    assert maneuver["recovery_time_s"] == 12.0
    assert maneuver["speed_loss_distance_m"] == 8.6
    assert maneuver["speed_loss_time_s"] == 3.3


@pytest.mark.parametrize(
    ("token", "activity_id"),
    [
        (TOKEN, ACTIVITY_B),
        (TOKEN, ACTIVITY_OTHER),
        ("unknown-capability", ACTIVITY_A),
    ],
)
def test_shared_maneuvers_requires_visible_session_activity(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
    token: str,
    activity_id: str,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    response = _get(_maneuver_path(token, activity_id))

    assert response.status_code == 404
    assert response.json == {"detail": "Activity not found"}


def test_shared_maneuvers_returns_unavailable_hdg_as_success(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    TrackStorage(root).write_normalized_track(
        ACTIVITY_A,
        _maneuver_track(with_hdg=False),
    )

    response = _get(_maneuver_path(TOKEN, ACTIVITY_A))

    assert response.status_code == 200
    assert response.json == {
        "activity_id": ACTIVITY_A,
        "status": "unavailable",
        "reason": "missing_hdg",
        "maneuvers": [],
    }


def test_maneuver_failure_does_not_change_session_or_track_endpoints(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    def fail_analytics(*_args: object) -> None:
        raise OSError("simulated analytics failure")

    monkeypatch.setattr(
        "app.services.shared_session_reader.get_or_generate_maneuver_analytics",
        fail_analytics,
    )

    analytics = _get(_maneuver_path(TOKEN, ACTIVITY_A))
    session = _get(f"/api/shared/sessions/{TOKEN}")
    track = _get(
        f"/api/shared/sessions/{TOKEN}/activities/{ACTIVITY_A}/track"
    )

    assert analytics.status_code == 500
    assert analytics.json == {
        "detail": "Persisted maneuver analytics data is inconsistent"
    }
    assert session.status_code == 200
    assert track.status_code == 200


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
