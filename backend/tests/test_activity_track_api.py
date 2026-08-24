import asyncio
import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import pytest

from app.main import app
from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE


ACTIVITY_ID = "10000000-0000-4000-8000-000000000001"
OTHER_ACTIVITY_ID = "10000000-0000-4000-8000-000000000002"
SAILOR_ID = "30000000-0000-4000-8000-000000000001"


@dataclass(frozen=True)
class ApiResponse:
    status_code: int
    json: object
    body: bytes


def _activity_record() -> dict[str, object]:
    return {
        "id": ACTIVITY_ID,
        "sailor_id": SAILOR_ID,
        "boat_id": None,
        "source": "vakaros",
        "device_name": "demo-device",
        "original_filename": "demo.csv.gz",
        "start_time": "2031-06-15T08:00:00+00:00",
        "end_time": "2031-06-15T08:00:02+00:00",
        "start_lat": 0.25,
        "start_lon": -30.75,
        "end_lat": 0.25002,
        "end_lon": -30.74998,
        "center_lat": 0.25001,
        "center_lon": -30.74999,
        "min_lat": 0.25,
        "max_lat": 0.25002,
        "min_lon": -30.75,
        "max_lon": -30.74998,
        "sample_count": 3,
        "attachment_sha256": "a" * 64,
        "track_file": f"tracks/{ACTIVITY_ID}.csv.gz",
    }


def _track_frame() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "activity_id": ACTIVITY_ID,
                "utc": "2031-06-15T08:00:00Z",
                "lat": 0.25,
                "lon": -30.75,
                "cog": None,
                "sog": None,
                "dist": 0.0,
                "hdg": None,
                "heel": None,
                "trim": None,
            },
            {
                "activity_id": ACTIVITY_ID,
                "utc": "2031-06-15T08:00:01Z",
                "lat": 0.25001,
                "lon": -30.74999,
                "cog": 359.0,
                "sog": 4.5,
                "dist": 1.57,
                "hdg": 1.0,
                "heel": -8.0,
                "trim": 2.0,
            },
            {
                "activity_id": ACTIVITY_ID,
                "utc": "2031-06-15T08:00:02Z",
                "lat": 0.25002,
                "lon": -30.74998,
                "cog": 2.0,
                "sog": 4.8,
                "dist": 1.57,
                "hdg": 3.0,
                "heel": -7.5,
                "trim": 1.5,
            },
        ],
        columns=CANONICAL_TRACK_COLUMNS,
    )


def _write_json(path: Path, records: object) -> None:
    path.write_text(
        json.dumps(records, indent=2) + "\n",
        encoding="utf-8",
    )


def _runtime_root(temporary_directory: Path) -> Path:
    root = temporary_directory / "track-api-runtime"
    (root / "tracks").mkdir(parents=True)
    _write_json(root / "activities.json", [_activity_record()])
    _write_json(
        root / "sailors.json",
        [
            {
                "id": SAILOR_ID,
                "email": "sailor-a@example.com",
                "name": "Sailor A",
                "default_boat_id": None,
                "consent_status": "ACTIVE",
            }
        ],
    )
    return root


def _set_consent_status(root: Path, status: str) -> None:
    sailors = json.loads(
        (root / "sailors.json").read_text(encoding="utf-8")
    )
    sailors[0]["consent_status"] = status
    _write_json(root / "sailors.json", sailors)


def _write_track(root: Path, track: pd.DataFrame) -> Path:
    path = root / "tracks" / f"{ACTIVITY_ID}.csv.gz"
    track.to_csv(
        path,
        index=False,
        compression={"method": "gzip", "mtime": 0},
    )
    return path


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
        body=body,
    )


def _use_runtime(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> Path:
    root = _runtime_root(temporary_directory)
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(root))
    return root


def test_valid_complete_track_returns_exact_contract_and_null_sensors(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    _write_track(root, _track_frame())

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    assert response.status_code == 200
    assert set(response.json) == {"activity_id", "samples"}
    assert response.json["activity_id"] == ACTIVITY_ID
    assert len(response.json["samples"]) == 3
    assert set(response.json["samples"][0]) == {
        "utc",
        "lat",
        "lon",
        "cog",
        "sog",
        "dist",
        "hdg",
        "heel",
        "trim",
    }
    assert "activity_id" not in response.json["samples"][0]
    assert response.json["samples"][0] == {
        "utc": "2031-06-15T08:00:00Z",
        "lat": 0.25,
        "lon": -30.75,
        "cog": None,
        "sog": None,
        "dist": 0.0,
        "hdg": None,
        "heel": None,
        "trim": None,
    }
    assert b"NaN" not in response.body
    assert "track_file" not in json.dumps(response.json)
    assert "tracks/" not in json.dumps(response.json)


def test_unknown_activity_returns_404_before_track_loading(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    response = _get(f"/api/activities/{OTHER_ACTIVITY_ID}/track")

    assert response.status_code == 404
    assert response.json == {"detail": "Activity not found"}


@pytest.mark.parametrize("hidden_status", ["PENDING", "REVOKED"])
def test_non_active_activity_returns_404_before_track_loading(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
    hidden_status: str,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    _set_consent_status(root, hidden_status)

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    assert response.status_code == 404
    assert response.json == {"detail": "Activity not found"}


def test_activity_referencing_missing_sailor_returns_generic_500(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    _write_json(root / "sailors.json", [])
    _write_track(root, _track_frame())

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    assert response.status_code == 500
    assert response.json == {
        "detail": "Persisted Activity track data is inconsistent"
    }


def test_known_activity_with_missing_track_returns_generic_500(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    _use_runtime(monkeypatch, temporary_directory)

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    assert response.status_code == 500
    assert response.json == {
        "detail": "Persisted Activity track data is inconsistent"
    }


def test_track_with_wrong_activity_id_returns_generic_500(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    track = _track_frame()
    track.loc[1, "activity_id"] = OTHER_ACTIVITY_ID
    _write_track(root, track)

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    assert response.status_code == 500
    assert response.json == {
        "detail": "Persisted Activity track data is inconsistent"
    }
    assert OTHER_ACTIVITY_ID not in json.dumps(response.json)


@pytest.mark.parametrize("schema_error", ["missing", "extra"])
def test_track_columns_must_exactly_match_canonical_schema(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
    schema_error: str,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    track = _track_frame()
    if schema_error == "missing":
        track = track.drop(columns=["trim"])
    else:
        track["unexpected"] = 1
    _write_track(root, track)

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    assert response.status_code == 500
    assert response.json == {
        "detail": "Persisted Activity track data is inconsistent"
    }


@pytest.mark.parametrize(
    ("field_name", "invalid_value"),
    [
        ("utc", "not-a-timestamp"),
        ("utc", "2031-06-15T08:00:00"),
        ("lat", "not-a-number"),
        ("lon", float("inf")),
        ("dist", -1.0),
    ],
)
def test_malformed_required_canonical_data_returns_generic_500(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
    field_name: str,
    invalid_value: object,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    track = _track_frame()
    track[field_name] = track[field_name].astype(object)
    track.loc[1, field_name] = invalid_value
    _write_track(root, track)

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    assert response.status_code == 500
    assert response.json == {
        "detail": "Persisted Activity track data is inconsistent"
    }


def test_non_finite_optional_sensor_data_returns_generic_500(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    track = _track_frame()
    track.loc[1, "sog"] = float("inf")
    _write_track(root, track)

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    assert response.status_code == 500
    assert response.json == {
        "detail": "Persisted Activity track data is inconsistent"
    }
    assert b"Infinity" not in response.body


def test_track_get_does_not_modify_activity_or_track(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    root = _use_runtime(monkeypatch, temporary_directory)
    track_path = _write_track(root, _track_frame())
    activity_path = root / "activities.json"
    before = {
        "activity": (activity_path.read_bytes(), activity_path.stat().st_mtime_ns),
        "track": (track_path.read_bytes(), track_path.stat().st_mtime_ns),
    }

    response = _get(f"/api/activities/{ACTIVITY_ID}/track")

    after = {
        "activity": (activity_path.read_bytes(), activity_path.stat().st_mtime_ns),
        "track": (track_path.read_bytes(), track_path.stat().st_mtime_ns),
    }
    assert response.status_code == 200
    assert after == before
