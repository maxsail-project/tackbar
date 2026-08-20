import csv
from pathlib import Path
from typing import Callable

import pytest

from app.repositories.activities import ActivityRepository
from app.repositories.participants import ParticipantRepository
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


def _participant(
    participant_id: str,
    name: str | None = None,
    boat_name: str | None = None,
    sailing_class: str | None = None,
    sail_number: str | None = None,
) -> dict[str, str | None]:
    return {
        "id": participant_id,
        "name": name,
        "boat_name": boat_name,
        "sailing_class": sailing_class,
        "sail_number": sail_number,
    }


def _activity(
    activity_id: str,
    participant_id: str,
    start_time: str,
    original_filename: str = "VK-Test.csv.gz",
    track_file: str | None = None,
) -> dict[str, object]:
    record: dict[str, object] = {
        "id": activity_id,
        "participant_id": participant_id,
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
    participants: list[dict[str, object]],
    activities: list[dict[str, object]],
    sessions: list[dict[str, object]],
) -> tuple[ParticipantRepository, ActivityRepository, SessionRepository]:
    return (
        ParticipantRepository(
            temporary_json_file("index-participants", participants)
        ),
        ActivityRepository(
            temporary_json_file("index-activities", activities)
        ),
        SessionRepository(temporary_json_file("index-sessions", sessions)),
    )


def _read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as csv_file:
        return list(csv.DictReader(csv_file))


def test_known_participant_session_track_and_original_are_indexed(
    temporary_json_file: Callable[[str, object], Path],
    temporary_directory: Path,
) -> None:
    track_file = f"tracks/{ACTIVITY_A}.csv.gz"
    participants, activities, sessions = _repositories(
        temporary_json_file,
        [_participant("sailor-a@example.com", "Sailor A", "Demo Boat A", "Snipe", "DEMO-1")],
        [
            _activity(
                ACTIVITY_A,
                "sailor-a@example.com",
                "2031-06-10T20:08:03+02:00",
                track_file=track_file,
            )
        ],
        [{"id": SESSION_A, "activity_ids": [ACTIVITY_A]}],
    )
    storage = TrackStorage(temporary_directory)
    storage.archive_original(ACTIVITY_A, "VK-Test.csv.gz", b"original")
    output = temporary_directory / "tracks-index.csv"
    output.write_text("stale output", encoding="utf-8")

    build_tracks_index(participants, activities, sessions, storage, output)
    rows = _read_rows(output)

    assert list(rows[0]) == TRACK_INDEX_COLUMNS
    assert rows == [
        {
            "activity_id": ACTIVITY_A,
            "activity_date": "2031-06-10",
            "start_time_utc": "2031-06-10T18:08:03.000000Z",
            "end_time_utc": "2031-06-10T18:08:03.000000Z",
            "participant_id": "sailor-a@example.com",
            "participant_name": "Sailor A",
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


def test_null_participant_metadata_and_missing_files_are_empty(
    temporary_json_file: Callable[[str, object], Path],
    temporary_directory: Path,
) -> None:
    participants, activities, sessions = _repositories(
        temporary_json_file,
        [_participant("new@example.com")],
        [_activity(ACTIVITY_A, "new@example.com", "2031-06-10T10:00:00Z")],
        [],
    )
    output = temporary_directory / "tracks-index.csv"

    build_tracks_index(
        participants,
        activities,
        sessions,
        TrackStorage(temporary_directory),
        output,
    )
    row = _read_rows(output)[0]

    assert row["participant_id"] == "new@example.com"
    assert row["participant_name"] == ""
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
    participants, activities, sessions = _repositories(
        temporary_json_file,
        [
            _participant("a@example.com"),
            _participant("b@example.com"),
            _participant("z@example.com"),
        ],
        [
            _activity(ACTIVITY_E, "z@example.com", "2031-06-12T09:00:00Z"),
            _activity(ACTIVITY_D, "z@example.com", "2031-06-11T11:00:00Z"),
            _activity(ACTIVITY_C, "b@example.com", "2031-06-11T10:00:00Z"),
            _activity(ACTIVITY_B, "a@example.com", "2031-06-11T10:00:00Z"),
            _activity(ACTIVITY_A, "a@example.com", "2031-06-11T10:00:00Z"),
        ],
        [],
    )
    output = temporary_directory / "tracks-index.csv"

    build_tracks_index(
        participants,
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
    participants, activities, sessions = _repositories(
        temporary_json_file,
        [_participant("sailor-a@example.com")],
        [_activity(ACTIVITY_A, "sailor-a@example.com", "2031-06-10T10:00:00Z")],
        [
            {"id": SESSION_A, "activity_ids": [ACTIVITY_A]},
            {"id": SESSION_B, "activity_ids": [ACTIVITY_A]},
        ],
    )

    with pytest.raises(ValueError, match="belongs to multiple Sessions"):
        build_tracks_index(
            participants,
            activities,
            sessions,
            TrackStorage(temporary_directory),
            temporary_directory / "tracks-index.csv",
        )


def test_csv_writer_escapes_names_and_filenames(
    temporary_json_file: Callable[[str, object], Path],
    temporary_directory: Path,
) -> None:
    participant_name = 'Sailor A, "Demo"'
    original_filename = 'track, "fast".csv.gz'
    participants, activities, sessions = _repositories(
        temporary_json_file,
        [_participant("sailor-a@example.com", participant_name)],
        [
            _activity(
                ACTIVITY_A,
                "sailor-a@example.com",
                "2031-06-10T10:00:00Z",
                original_filename=original_filename,
            )
        ],
        [],
    )
    output = temporary_directory / "tracks-index.csv"

    build_tracks_index(
        participants,
        activities,
        sessions,
        TrackStorage(temporary_directory),
        output,
    )
    raw_csv = output.read_text(encoding="utf-8")
    row = _read_rows(output)[0]

    assert row["participant_name"] == participant_name
    assert row["original_filename"] == original_filename
    assert '"Sailor A, ""Demo"""' in raw_csv
    assert '"track, ""fast"".csv.gz"' in raw_csv
