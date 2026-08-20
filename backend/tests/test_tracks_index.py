import csv
from pathlib import Path
from typing import Callable

import pytest

from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.storage.track_storage import TrackStorage
from scripts.build_tracks_index import TRACK_INDEX_COLUMNS, build_tracks_index


ACTIVITY_A = "11111111-1111-4111-8111-111111111111"
ACTIVITY_B = "22222222-2222-4222-8222-222222222222"
ACTIVITY_C = "33333333-3333-4333-8333-333333333333"
ACTIVITY_D = "44444444-4444-4444-8444-444444444444"
ACTIVITY_E = "55555555-5555-4555-8555-555555555555"
SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
SAILOR_A = "30000000-0000-4000-8000-000000000001"
SAILOR_B = "30000000-0000-4000-8000-000000000002"
SAILOR_Z = "30000000-0000-4000-8000-000000000003"
BOAT_A = "40000000-0000-4000-8000-000000000001"


def _sailor(
    sailor_id: str,
    email: str,
    name: str | None = None,
    default_boat_id: str | None = None,
) -> dict[str, str | None]:
    return {
        "id": sailor_id,
        "email": email,
        "name": name,
        "default_boat_id": default_boat_id,
    }


def _boat(
    boat_id: str,
    name: str | None,
    sailing_class: str | None,
    sail_number: str | None,
) -> dict[str, str | None]:
    return {
        "id": boat_id,
        "name": name,
        "sailing_class": sailing_class,
        "sail_number": sail_number,
    }


def _activity(
    activity_id: str,
    sailor_id: str,
    start_time: str,
    boat_id: str | None = None,
    original_filename: str = "VK-Test.csv.gz",
    track_file: str | None = None,
) -> dict[str, object]:
    record: dict[str, object] = {
        "id": activity_id,
        "sailor_id": sailor_id,
        "boat_id": boat_id,
        "source": "vakaros",
        "device_name": "VK-Test",
        "original_filename": original_filename,
        "start_time": start_time,
        "end_time": start_time,
        "start_lat": 0.25,
        "start_lon": -30.75,
        "end_lat": 0.25,
        "end_lon": -30.75,
        "center_lat": 0.25,
        "center_lon": -30.75,
        "min_lat": 0.25,
        "max_lat": 0.25,
        "min_lon": -30.75,
        "max_lon": -30.75,
        "sample_count": 10,
        "attachment_sha256": activity_id.replace("-", ""),
    }
    if track_file is not None:
        record["track_file"] = track_file
    return record


def _repositories(
    temporary_json_file: Callable[[str, object], Path],
    sailors: list[dict[str, object]],
    boats: list[dict[str, object]],
    activities: list[dict[str, object]],
    sessions: list[dict[str, object]],
) -> tuple[
    SailorRepository,
    BoatRepository,
    ActivityRepository,
    SessionRepository,
]:
    return (
        SailorRepository(temporary_json_file("index-sailors", sailors)),
        BoatRepository(temporary_json_file("index-boats", boats)),
        ActivityRepository(
            temporary_json_file("index-activities", activities)
        ),
        SessionRepository(temporary_json_file("index-sessions", sessions)),
    )


def _read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as csv_file:
        return list(csv.DictReader(csv_file))


def test_known_sailor_boat_session_track_and_original_are_indexed(
    temporary_json_file: Callable[[str, object], Path],
    temporary_directory: Path,
) -> None:
    track_file = f"tracks/{ACTIVITY_A}.csv.gz"
    sailors, boats, activities, sessions = _repositories(
        temporary_json_file,
        [_sailor(SAILOR_A, "sailor-a@example.com", "Sailor A", BOAT_A)],
        [_boat(BOAT_A, "Demo Boat A", "Snipe", "DEMO-1")],
        [
            _activity(
                ACTIVITY_A,
                SAILOR_A,
                "2031-06-10T20:08:03+02:00",
                boat_id=BOAT_A,
                track_file=track_file,
            )
        ],
        [{"id": SESSION_A, "activity_ids": [ACTIVITY_A]}],
    )
    storage = TrackStorage(temporary_directory)
    storage.archive_original(ACTIVITY_A, "VK-Test.csv.gz", b"original")
    output = temporary_directory / "tracks-index.csv"
    output.write_text("stale output", encoding="utf-8")

    build_tracks_index(sailors, boats, activities, sessions, storage, output)
    rows = _read_rows(output)

    assert list(rows[0]) == TRACK_INDEX_COLUMNS
    assert rows == [
        {
            "activity_id": ACTIVITY_A,
            "activity_date": "2031-06-10",
            "start_time_utc": "2031-06-10T18:08:03.000000Z",
            "end_time_utc": "2031-06-10T18:08:03.000000Z",
            "sailor_id": SAILOR_A,
            "sailor_email": "sailor-a@example.com",
            "sailor_name": "Sailor A",
            "boat_id": BOAT_A,
            "boat_name": "Demo Boat A",
            "sailing_class": "Snipe",
            "sail_number": "DEMO-1",
            "source": "vakaros",
            "device_name": "VK-Test",
            "original_filename": "VK-Test.csv.gz",
            "sample_count": "10",
            "track_file": track_file,
            "original_file": f"originals/{ACTIVITY_A}/VK-Test.csv.gz",
            "session_id": SESSION_A,
        }
    ]


def test_null_sailor_metadata_unknown_boat_and_missing_files_are_empty(
    temporary_json_file: Callable[[str, object], Path],
    temporary_directory: Path,
) -> None:
    sailors, boats, activities, sessions = _repositories(
        temporary_json_file,
        [_sailor(SAILOR_A, "new@example.com")],
        [],
        [_activity(ACTIVITY_A, SAILOR_A, "2031-06-10T10:00:00Z")],
        [],
    )
    output = temporary_directory / "tracks-index.csv"

    build_tracks_index(
        sailors,
        boats,
        activities,
        sessions,
        TrackStorage(temporary_directory),
        output,
    )
    row = _read_rows(output)[0]

    assert row["sailor_id"] == SAILOR_A
    assert row["sailor_email"] == "new@example.com"
    assert row["sailor_name"] == ""
    assert row["boat_id"] == ""
    assert row["boat_name"] == ""
    assert row["sailing_class"] == ""
    assert row["sail_number"] == ""
    assert row["track_file"] == ""
    assert row["original_file"] == ""
    assert row["session_id"] == ""


def test_multiple_activities_are_sorted_deterministically(
    temporary_json_file: Callable[[str, object], Path],
    temporary_directory: Path,
) -> None:
    sailors, boats, activities, sessions = _repositories(
        temporary_json_file,
        [
            _sailor(SAILOR_A, "a@example.com"),
            _sailor(SAILOR_B, "b@example.com"),
            _sailor(SAILOR_Z, "z@example.com"),
        ],
        [],
        [
            _activity(ACTIVITY_E, SAILOR_Z, "2031-06-12T09:00:00Z"),
            _activity(ACTIVITY_D, SAILOR_Z, "2031-06-11T11:00:00Z"),
            _activity(ACTIVITY_C, SAILOR_B, "2031-06-11T10:00:00Z"),
            _activity(ACTIVITY_B, SAILOR_A, "2031-06-11T10:00:00Z"),
            _activity(ACTIVITY_A, SAILOR_A, "2031-06-11T10:00:00Z"),
        ],
        [],
    )
    output = temporary_directory / "tracks-index.csv"

    build_tracks_index(
        sailors,
        boats,
        activities,
        sessions,
        TrackStorage(temporary_directory),
        output,
    )

    assert [row["activity_id"] for row in _read_rows(output)] == [
        ACTIVITY_E,
        ACTIVITY_D,
        ACTIVITY_A,
        ACTIVITY_B,
        ACTIVITY_C,
    ]


def test_activity_in_multiple_sessions_raises_clear_error(
    temporary_json_file: Callable[[str, object], Path],
    temporary_directory: Path,
) -> None:
    sailors, boats, activities, sessions = _repositories(
        temporary_json_file,
        [_sailor(SAILOR_A, "sailor-a@example.com")],
        [],
        [_activity(ACTIVITY_A, SAILOR_A, "2031-06-10T10:00:00Z")],
        [
            {"id": SESSION_A, "activity_ids": [ACTIVITY_A]},
            {"id": SESSION_B, "activity_ids": [ACTIVITY_A]},
        ],
    )

    with pytest.raises(ValueError, match="belongs to multiple Sessions"):
        build_tracks_index(
            sailors,
            boats,
            activities,
            sessions,
            TrackStorage(temporary_directory),
            temporary_directory / "tracks-index.csv",
        )


def test_csv_writer_escapes_names_and_filenames(
    temporary_json_file: Callable[[str, object], Path],
    temporary_directory: Path,
) -> None:
    sailor_name = 'Sailor A, "Demo"'
    original_filename = 'track, "fast".csv.gz'
    sailors, boats, activities, sessions = _repositories(
        temporary_json_file,
        [_sailor(SAILOR_A, "sailor-a@example.com", sailor_name)],
        [],
        [
            _activity(
                ACTIVITY_A,
                SAILOR_A,
                "2031-06-10T10:00:00Z",
                original_filename=original_filename,
            )
        ],
        [],
    )
    output = temporary_directory / "tracks-index.csv"

    build_tracks_index(
        sailors,
        boats,
        activities,
        sessions,
        TrackStorage(temporary_directory),
        output,
    )
    raw_csv = output.read_text(encoding="utf-8")
    row = _read_rows(output)[0]

    assert row["sailor_name"] == sailor_name
    assert row["original_filename"] == original_filename
    assert '"Sailor A, ""Demo"""' in raw_csv
    assert '"track, ""fast"".csv.gz"' in raw_csv
