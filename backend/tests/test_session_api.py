import asyncio
import json
from dataclasses import dataclass
from pathlib import Path

import pytest

from app.main import app
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE


SESSION_OLD = "20000000-0000-4000-8000-000000000001"
SESSION_NEW = "20000000-0000-4000-8000-000000000002"
ACTIVITY_A = "10000000-0000-4000-8000-000000000001"
ACTIVITY_B = "10000000-0000-4000-8000-000000000002"
ACTIVITY_C = "10000000-0000-4000-8000-000000000003"
SAILOR_A = "30000000-0000-4000-8000-000000000001"
SAILOR_B = "30000000-0000-4000-8000-000000000002"
BOAT_A = "40000000-0000-4000-8000-000000000001"
BOAT_B = "40000000-0000-4000-8000-000000000002"


@dataclass(frozen=True)
class ApiResponse:
    status_code: int
    json: object


def _activity(
    activity_id: str,
    sailor_id: str,
    boat_id: str | None,
    start_time: str,
    end_time: str,
) -> dict[str, object]:
    return {
        "id": activity_id,
        "sailor_id": sailor_id,
        "boat_id": boat_id,
        "source": "vakaros",
        "device_name": f"device-{activity_id[-1]}",
        "original_filename": f"activity-{activity_id[-1]}.csv.gz",
        "start_time": start_time,
        "end_time": end_time,
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
        "sample_count": 20,
        "attachment_sha256": activity_id[-1] * 64,
        "track_file": f"tracks/{activity_id}.csv.gz",
    }


def _write_json(path: Path, records: object) -> None:
    path.write_text(
        json.dumps(records, indent=2) + "\n",
        encoding="utf-8",
    )


def _runtime_root(temporary_directory: Path) -> Path:
    root = temporary_directory / "api-runtime"
    root.mkdir()
    _write_json(
        root / "sailors.json",
        [
            {
                "id": SAILOR_A,
                "email": "sailor-a@example.com",
                "name": "Sailor A",
                "default_boat_id": BOAT_B,
            },
            {
                "id": SAILOR_B,
                "email": "sailor-b@example.com",
                "name": None,
                "default_boat_id": None,
            },
        ],
    )
    _write_json(
        root / "boats.json",
        [
            {
                "id": BOAT_A,
                "name": "Demo Boat A",
                "sailing_class": "Snipe",
                "sail_number": "DEMO-1001",
            },
            {
                "id": BOAT_B,
                "name": "Default Boat B",
                "sailing_class": "Snipe",
                "sail_number": "DEMO-1002",
            },
        ],
    )
    _write_json(
        root / "activities.json",
        [
            _activity(
                ACTIVITY_A,
                SAILOR_A,
                BOAT_A,
                "2031-06-15T08:00:00+00:00",
                "2031-06-15T11:00:00+00:00",
            ),
            _activity(
                ACTIVITY_B,
                SAILOR_B,
                None,
                "2031-06-15T09:00:00+00:00",
                "2031-06-15T10:00:00+00:00",
            ),
            _activity(
                ACTIVITY_C,
                SAILOR_A,
                BOAT_A,
                "2031-06-16T08:00:00+00:00",
                "2031-06-16T09:00:00+00:00",
            ),
        ],
    )
    _write_json(
        root / "sessions.json",
        [
            {"id": SESSION_OLD, "activity_ids": [ACTIVITY_B, ACTIVITY_A]},
            {"id": SESSION_NEW, "activity_ids": [ACTIVITY_C]},
        ],
    )
    return root


def _get(path: str) -> ApiResponse:
    messages: list[dict[str, object]] = []

    async def request() -> None:
        request_received = False

        async def receive() -> dict[str, object]:
            nonlocal request_received
            if not request_received:
                request_received = True
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
                "method": "GET",
                "scheme": "http",
                "path": path,
                "raw_path": path.encode("ascii"),
                "query_string": b"",
                "headers": [],
                "client": ("test", 123),
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
    return ApiResponse(
        status_code=int(start["status"]),
        json=json.loads(body),
    )


def _use_runtime(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> Path:
    root = _runtime_root(temporary_directory)
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(root))
    return root


def test_session_list_returns_derived_summaries_newest_first(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    response = _get("/api/sessions")

    assert response.status_code == 200
    assert [session["id"] for session in response.json] == [
        SESSION_NEW,
        SESSION_OLD,
    ]
    assert response.json[0] == {
        "id": SESSION_NEW,
        "start_time": "2031-06-16T08:00:00Z",
        "end_time": "2031-06-16T09:00:00Z",
        "activity_count": 1,
    }
    assert response.json[1] == {
        "id": SESSION_OLD,
        "start_time": "2031-06-15T08:00:00Z",
        "end_time": "2031-06-15T11:00:00Z",
        "activity_count": 2,
    }


def test_empty_session_persistence_returns_empty_list(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    _write_json(root / "sessions.json", [])

    response = _get("/api/sessions")

    assert response.status_code == 200
    assert response.json == []


def test_session_detail_preserves_activity_order_and_resolves_context(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    response = _get(f"/api/sessions/{SESSION_OLD}")

    assert response.status_code == 200
    assert set(response.json) == {"id", "start_time", "end_time", "activities"}
    assert response.json["start_time"] == "2031-06-15T08:00:00Z"
    assert response.json["end_time"] == "2031-06-15T11:00:00Z"
    activities = response.json["activities"]
    assert [activity["id"] for activity in activities] == [
        ACTIVITY_B,
        ACTIVITY_A,
    ]
    assert set(activities[0]) == {
        "id",
        "source",
        "device_name",
        "original_filename",
        "start_time",
        "end_time",
        "sample_count",
        "sailor",
        "boat",
    }
    assert activities[0]["sailor"] == {
        "id": SAILOR_B,
        "name": None,
        "email": "sailor-b@example.com",
    }
    assert activities[0]["boat"] is None
    assert activities[1]["sailor"] == {
        "id": SAILOR_A,
        "name": "Sailor A",
        "email": "sailor-a@example.com",
    }
    assert activities[1]["boat"] == {
        "id": BOAT_A,
        "name": "Demo Boat A",
        "sailing_class": "Snipe",
        "sail_number": "DEMO-1001",
    }
    assert "default_boat_id" not in activities[1]["sailor"]
    assert "attachment_sha256" not in activities[1]
    assert "track_file" not in activities[1]
    assert "sailor_id" not in activities[1]
    assert "boat_id" not in activities[1]


def test_unknown_session_returns_404(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    response = _get("/api/sessions/unknown-session")

    assert response.status_code == 404
    assert response.json == {"detail": "Session not found"}


@pytest.mark.parametrize(
    ("broken_reference", "missing_value"),
    [
        ("activity", "missing-activity"),
        ("sailor", "39999999-9999-4999-8999-999999999999"),
        ("boat", "49999999-9999-4999-8999-999999999999"),
    ],
)
def test_broken_persisted_references_return_generic_500(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
    broken_reference: str,
    missing_value: str,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    if broken_reference == "activity":
        sessions = json.loads(
            (root / "sessions.json").read_text(encoding="utf-8")
        )
        sessions[0]["activity_ids"] = [missing_value]
        _write_json(root / "sessions.json", sessions)
    else:
        activities = json.loads(
            (root / "activities.json").read_text(encoding="utf-8")
        )
        field_name = f"{broken_reference}_id"
        activities[0][field_name] = missing_value
        _write_json(root / "activities.json", activities)

    response = _get(f"/api/sessions/{SESSION_OLD}")

    assert response.status_code == 500
    assert response.json == {
        "detail": "Persisted Session data is inconsistent"
    }
    assert missing_value not in json.dumps(response.json)


def test_session_api_requests_do_not_modify_persistence(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    before = {
        path.name: (path.read_bytes(), path.stat().st_mtime_ns)
        for path in root.iterdir()
        if path.is_file()
    }

    list_response = _get("/api/sessions")
    detail_response = _get(f"/api/sessions/{SESSION_OLD}")

    after = {
        path.name: (path.read_bytes(), path.stat().st_mtime_ns)
        for path in root.iterdir()
        if path.is_file()
    }
    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    assert after == before
