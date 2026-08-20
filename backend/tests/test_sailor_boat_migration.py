import json
import sys
from pathlib import Path
from typing import Callable, Iterator

import pytest

from scripts.migrate_sailor_boat import main, migrate_sailor_boat


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
SAILOR_ID_2 = "30000000-0000-4000-8000-000000000002"
BOAT_ID = "40000000-0000-4000-8000-000000000001"
BOAT_ID_2 = "40000000-0000-4000-8000-000000000002"
ACTIVITY_ID = "10000000-0000-4000-8000-000000000001"


def _participant(
    email: str = "sailor-a@example.com",
    boat_name: str | None = "Demo Boat A",
    sailing_class: str | None = "Snipe",
    sail_number: str | None = "DEMO-1001",
) -> dict[str, object]:
    return {
        "id": email,
        "name": "Sailor A",
        "boat_name": boat_name,
        "sailing_class": sailing_class,
        "sail_number": sail_number,
    }


def _activity(
    participant_id: str = "sailor-a@example.com",
    activity_id: str = ACTIVITY_ID,
) -> dict[str, object]:
    return {
        "id": activity_id,
        "participant_id": participant_id,
        "source": "vakaros",
        "device_name": "demo-device",
        "original_filename": "demo.csv.gz",
        "start_time": "2031-06-15T08:00:00+00:00",
        "end_time": "2031-06-15T09:00:00+00:00",
        "start_lat": 0.25,
        "start_lon": -30.75,
        "end_lat": 0.26,
        "end_lon": -30.74,
        "center_lat": 0.255,
        "center_lon": -30.745,
        "min_lat": 0.25,
        "max_lat": 0.26,
        "min_lon": -30.75,
        "max_lon": -30.74,
        "sample_count": 2,
        "attachment_sha256": "a" * 64,
        "track_file": f"tracks/{activity_id}.csv.gz",
    }


def _write_json(path: Path, records: object) -> bytes:
    content = json.dumps(records, indent=2) + "\n"
    path.write_text(content, encoding="utf-8")
    return path.read_bytes()


def _legacy_root(
    temporary_directory: Path,
    participants: list[dict[str, object]] | None = None,
    activities: list[dict[str, object]] | None = None,
) -> tuple[Path, dict[str, bytes]]:
    root = temporary_directory / "legacy-root"
    root.mkdir()
    original = {
        "participants": _write_json(
            root / "participants.json",
            participants if participants is not None else [_participant()],
        ),
        "activities": _write_json(
            root / "activities.json",
            activities if activities is not None else [_activity()],
        ),
        "sessions": _write_json(
            root / "sessions.json",
            [{"id": "session-a", "activity_ids": [ACTIVITY_ID]}],
        ),
        "history": _write_json(
            root / "ingestion_history.json",
            [{"provider": "demo", "activity_id": ACTIVITY_ID}],
        ),
    }
    (root / "tracks").mkdir()
    (root / "originals" / ACTIVITY_ID).mkdir(parents=True)
    (root / "tracks" / f"{ACTIVITY_ID}.csv.gz").write_bytes(b"track")
    (root / "originals" / ACTIVITY_ID / "demo.csv.gz").write_bytes(
        b"original"
    )
    return root, original


def _id_factory(*values: str) -> Callable[[], object]:
    iterator: Iterator[str] = iter(values)
    return lambda: next(iterator)


def test_assign_policy_migrates_sailor_boat_activity_and_preserves_other_state(
    temporary_directory: Path,
) -> None:
    root, original = _legacy_root(temporary_directory)
    track_path = root / "tracks" / f"{ACTIVITY_ID}.csv.gz"
    original_path = root / "originals" / ACTIVITY_ID / "demo.csv.gz"

    summary = migrate_sailor_boat(
        root,
        "assign",
        _id_factory(SAILOR_ID, BOAT_ID),
    )

    sailors = json.loads((root / "sailors.json").read_text(encoding="utf-8"))
    boats = json.loads((root / "boats.json").read_text(encoding="utf-8"))
    activities = json.loads(
        (root / "activities.json").read_text(encoding="utf-8")
    )
    assert sailors == [
        {
            "id": SAILOR_ID,
            "email": "sailor-a@example.com",
            "name": "Sailor A",
            "default_boat_id": BOAT_ID,
        }
    ]
    assert boats == [
        {
            "id": BOAT_ID,
            "name": "Demo Boat A",
            "sailing_class": "Snipe",
            "sail_number": "DEMO-1001",
        }
    ]
    assert activities[0]["id"] == ACTIVITY_ID
    assert activities[0]["sailor_id"] == SAILOR_ID
    assert activities[0]["boat_id"] == BOAT_ID
    assert "participant_id" not in activities[0]
    assert summary.activities_assigned_legacy_boat == 1
    assert summary.activities_with_unknown_boat == 0

    assert not (root / "participants.json").exists()
    assert (root / "participants.legacy.json").read_bytes() == original[
        "participants"
    ]
    assert (root / "activities.legacy.json").read_bytes() == original[
        "activities"
    ]
    assert (root / "sessions.json").read_bytes() == original["sessions"]
    assert (root / "ingestion_history.json").read_bytes() == original["history"]
    assert track_path.read_bytes() == b"track"
    assert original_path.read_bytes() == b"original"


def test_empty_legacy_boat_metadata_creates_no_boat(
    temporary_directory: Path,
) -> None:
    root, _ = _legacy_root(
        temporary_directory,
        participants=[_participant(boat_name=None, sailing_class=None, sail_number=None)],
    )

    summary = migrate_sailor_boat(
        root,
        "assign",
        _id_factory(SAILOR_ID),
    )

    sailor = json.loads((root / "sailors.json").read_text(encoding="utf-8"))[0]
    activity = json.loads(
        (root / "activities.json").read_text(encoding="utf-8")
    )[0]
    assert json.loads((root / "boats.json").read_text(encoding="utf-8")) == []
    assert sailor["default_boat_id"] is None
    assert activity["boat_id"] is None
    assert summary.boats_created == 0


def test_unknown_policy_keeps_default_boat_but_not_historical_assignment(
    temporary_directory: Path,
) -> None:
    root, _ = _legacy_root(temporary_directory)

    summary = migrate_sailor_boat(
        root,
        "unknown",
        _id_factory(SAILOR_ID, BOAT_ID),
    )

    sailor = json.loads((root / "sailors.json").read_text(encoding="utf-8"))[0]
    activity = json.loads(
        (root / "activities.json").read_text(encoding="utf-8")
    )[0]
    assert sailor["default_boat_id"] == BOAT_ID
    assert activity["boat_id"] is None
    assert summary.activities_assigned_legacy_boat == 0
    assert summary.activities_with_unknown_boat == 1


@pytest.mark.parametrize(
    ("participants", "activities", "message"),
    [
        (
            [_participant(), _participant(email=" SAILOR-A@EXAMPLE.COM ")],
            [_activity()],
            "Duplicate normalized legacy Participant email",
        ),
        (
            [_participant()],
            [_activity(participant_id="missing@example.com")],
            "references an unknown Participant",
        ),
    ],
)
def test_invalid_legacy_data_fails_before_writes(
    temporary_directory: Path,
    participants: list[dict[str, object]],
    activities: list[dict[str, object]],
    message: str,
) -> None:
    root, original = _legacy_root(
        temporary_directory,
        participants=participants,
        activities=activities,
    )

    with pytest.raises(ValueError, match=message):
        migrate_sailor_boat(root, "unknown", _id_factory(SAILOR_ID))

    assert (root / "participants.json").read_bytes() == original["participants"]
    assert (root / "activities.json").read_bytes() == original["activities"]
    assert not (root / "sailors.json").exists()
    assert not (root / "boats.json").exists()
    assert not list(root.glob("*.tmp"))


def test_existing_new_schema_file_refuses_rerun_without_overwrite(
    temporary_directory: Path,
) -> None:
    root, original = _legacy_root(temporary_directory)
    (root / "sailors.json").write_text("[]\n", encoding="utf-8")

    with pytest.raises(ValueError, match="Refusing to overwrite"):
        migrate_sailor_boat(root, "assign", _id_factory(SAILOR_ID, BOAT_ID))

    assert (root / "participants.json").read_bytes() == original["participants"]
    assert (root / "activities.json").read_bytes() == original["activities"]
    assert not (root / "boats.json").exists()


def test_identical_legacy_boat_metadata_does_not_merge_boats(
    temporary_directory: Path,
) -> None:
    participants = [
        _participant("sailor-a@example.com"),
        _participant("sailor-b@example.com"),
    ]
    activities = [
        _activity("sailor-a@example.com", ACTIVITY_ID),
        _activity(
            "sailor-b@example.com",
            "10000000-0000-4000-8000-000000000002",
        ),
    ]
    root, _ = _legacy_root(temporary_directory, participants, activities)

    migrate_sailor_boat(
        root,
        "assign",
        _id_factory(SAILOR_ID, BOAT_ID, SAILOR_ID_2, BOAT_ID_2),
    )

    boats = json.loads((root / "boats.json").read_text(encoding="utf-8"))
    assert {boat["id"] for boat in boats} == {BOAT_ID, BOAT_ID_2}


def test_duplicate_generated_ids_fail_before_writes(
    temporary_directory: Path,
) -> None:
    participants = [
        _participant(
            "sailor-a@example.com",
            boat_name=None,
            sailing_class=None,
            sail_number=None,
        ),
        _participant(
            "sailor-b@example.com",
            boat_name=None,
            sailing_class=None,
            sail_number=None,
        ),
    ]
    root, original = _legacy_root(
        temporary_directory,
        participants=participants,
        activities=[_activity()],
    )

    with pytest.raises(ValueError, match="Duplicate generated"):
        migrate_sailor_boat(
            root,
            "assign",
            _id_factory(SAILOR_ID, SAILOR_ID),
        )

    assert (root / "participants.json").read_bytes() == original["participants"]
    assert not (root / "sailors.json").exists()


def test_cli_output_reports_counts_without_identity_values(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root, _ = _legacy_root(temporary_directory)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "migrate_sailor_boat.py",
            "--data-dir",
            str(root),
            "--legacy-boat-policy",
            "unknown",
        ],
    )

    main()

    output = capsys.readouterr().out
    assert "Sailors migrated: 1" in output
    assert "Boats created: 1" in output
    assert "sailor-a@example.com" not in output
    assert "Sailor A" not in output
    assert "DEMO-1001" not in output
