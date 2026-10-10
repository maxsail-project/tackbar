import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.repositories.activities import ActivityRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services import runtime_maintenance, sailor_deletion
from app.services.ingestion_history import IngestionHistory
from app.services.sailor_deletion import (
    MAILBOX_WARNING,
    SERVICE_WARNING,
    SailorDeletionError,
    apply_sailor_deletion,
    format_sailor_deletion_report,
    plan_sailor_deletion,
)
from scripts.delete_sailor import main


TARGET_SAILOR_ID = "30000000-0000-4000-8000-000000000001"
OTHER_SAILOR_ID = "30000000-0000-4000-8000-000000000002"
BOAT_ID = "40000000-0000-4000-8000-000000000001"
TARGET_ACTIVITY_IDS = (
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
)
OTHER_ACTIVITY_ID = "10000000-0000-4000-8000-000000000004"
DELETE_SESSION_ID = "20000000-0000-4000-8000-000000000001"
SHARED_SESSION_ID = "20000000-0000-4000-8000-000000000002"
TARGET_INGESTION_IDS = (
    "60000000-0000-4000-8000-000000000001",
    "60000000-0000-4000-8000-000000000002",
    "60000000-0000-4000-8000-000000000003",
)
OTHER_INGESTION_ID = "60000000-0000-4000-8000-000000000004"
TARGET_REQUEST_IDS = (
    "50000000-0000-4000-8000-000000000001",
    "50000000-0000-4000-8000-000000000002",
)
OTHER_REQUEST_ID = "50000000-0000-4000-8000-000000000003"
NOW = datetime(2031, 6, 18, 10, 0, tzinfo=timezone.utc)
TARGET_PERSONAL_TOKEN = "target-personal-" + "p" * 40
OTHER_PERSONAL_TOKEN = "other-personal-" + "o" * 40
SHARED_SESSION_TOKEN = "shared-session-" + "s" * 40
TARGET_REQUEST_TOKEN = "target-request-" + "r" * 40
OTHER_REQUEST_TOKEN = "other-request-" + "q" * 40


def _write_json(path: Path, records: object) -> None:
    path.write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _activity(
    activity_id: str,
    sailor_id: str,
    *,
    boat_id: str | None = BOAT_ID,
) -> dict[str, object]:
    return {
        "id": activity_id,
        "sailor_id": sailor_id,
        "boat_id": boat_id,
        "source": "vakaros",
        "device_name": "device",
        "original_filename": f"{activity_id}.csv.gz",
        "start_time": NOW.isoformat(),
        "end_time": (NOW + timedelta(hours=1)).isoformat(),
        "start_lat": 39.8,
        "start_lon": 4.2,
        "end_lat": 39.9,
        "end_lon": 4.3,
        "center_lat": 39.85,
        "center_lon": 4.25,
        "min_lat": 39.8,
        "max_lat": 39.9,
        "min_lon": 4.2,
        "max_lon": 4.3,
        "sample_count": 2,
        "attachment_sha256": activity_id.replace("-", "") * 2,
        "track_file": f"tracks/{activity_id}.csv.gz",
    }


def _ingestion(
    ingestion_id: str,
    sender_email: str | None,
    activity_id: str | None,
    session_id: str | None,
) -> dict[str, object]:
    return {
        "id": ingestion_id,
        "provider": "ovh",
        "provider_message_id": f"message-{ingestion_id}",
        "sender_email": sender_email,
        "received_at": NOW.isoformat(),
        "attachment_name": "track.csv.gz",
        "attachment_sha256": "a" * 64,
        "original_file": (
            f"originals/ingestions/{ingestion_id}/track.csv.gz"
        ),
        "status": "processed" if activity_id else "failed",
        "disposition": "active",
        "attempts": 1,
        "last_attempt_at": NOW.isoformat(),
        "last_error": None if activity_id else "Unsupported attachment",
        "activity_id": activity_id,
        "session_id": session_id,
    }


def _runtime_root(temporary_directory: Path) -> Path:
    root = temporary_directory / "runtime"
    root.mkdir()
    sailors = [
        {
            "id": TARGET_SAILOR_ID,
            "email": "target@example.com",
            "name": "Target Sailor",
            "default_boat_id": BOAT_ID,
            "consent_status": "ACTIVE",
            "personal_capability_token": TARGET_PERSONAL_TOKEN,
            "personal_capability_revoked": False,
            "welcome_email_sent_at": NOW.isoformat(),
        },
        {
            "id": OTHER_SAILOR_ID,
            "email": "other@example.com",
            "name": "Other Sailor",
            "default_boat_id": BOAT_ID,
            "consent_status": "ACTIVE",
            "personal_capability_token": OTHER_PERSONAL_TOKEN,
            "personal_capability_revoked": True,
            "welcome_email_last_error": "Other Sailor state",
        },
    ]
    boats = [{
        "id": BOAT_ID,
        "name": "Shared Boat",
        "sailing_class": "Snipe",
        "sail_number": "ESP-1",
    }]
    activities = [
        *(
            _activity(activity_id, TARGET_SAILOR_ID)
            for activity_id in TARGET_ACTIVITY_IDS
        ),
        _activity(OTHER_ACTIVITY_ID, OTHER_SAILOR_ID),
    ]
    sessions = [
        {
            "id": DELETE_SESSION_ID,
            "activity_ids": [TARGET_ACTIVITY_IDS[0]],
            "created_at": NOW.isoformat(),
            "expires_at": (NOW + timedelta(days=60)).isoformat(),
            "capability_token": "target-only-session-" + "d" * 40,
            "capability_revoked": False,
        },
        {
            "id": SHARED_SESSION_ID,
            "activity_ids": [
                TARGET_ACTIVITY_IDS[1],
                OTHER_ACTIVITY_ID,
                TARGET_ACTIVITY_IDS[2],
            ],
            "created_at": (NOW + timedelta(hours=1)).isoformat(),
            "expires_at": (NOW + timedelta(days=61)).isoformat(),
            "capability_token": SHARED_SESSION_TOKEN,
            "capability_revoked": True,
        },
    ]
    consent_events = [
        {
            "event_type": "consent_requested",
            "timestamp": NOW.isoformat(),
            "source": "admin",
            "sailor_id": TARGET_SAILOR_ID,
            "agreement_version": None,
        },
        {
            "event_type": "consent_granted",
            "timestamp": (NOW + timedelta(minutes=1)).isoformat(),
            "source": "web_consent",
            "sailor_id": TARGET_SAILOR_ID,
            "agreement_version": "v0.6.5",
        },
        {
            "event_type": "consent_granted",
            "timestamp": NOW.isoformat(),
            "source": "admin",
            "sailor_id": OTHER_SAILOR_ID,
            "agreement_version": "v0.6.5",
        },
    ]
    consent_requests = [
        {
            "id": TARGET_REQUEST_IDS[0],
            "sailor_id": TARGET_SAILOR_ID,
            "token": TARGET_REQUEST_TOKEN,
            "agreement_version": "v0.6.5",
            "consent_cycle_sequence": 0,
            "created_at": NOW.isoformat(),
            "expires_at": (NOW + timedelta(days=28)).isoformat(),
            "accepted_at": (NOW + timedelta(minutes=1)).isoformat(),
        },
        {
            "id": TARGET_REQUEST_IDS[1],
            "sailor_id": TARGET_SAILOR_ID,
            "token": "historical-target-" + "h" * 40,
            "agreement_version": "v0.5.0",
            "consent_cycle_sequence": 0,
            "created_at": (NOW - timedelta(days=40)).isoformat(),
            "expires_at": (NOW - timedelta(days=12)).isoformat(),
        },
        {
            "id": OTHER_REQUEST_ID,
            "sailor_id": OTHER_SAILOR_ID,
            "token": OTHER_REQUEST_TOKEN,
            "agreement_version": "v0.6.5",
            "consent_cycle_sequence": 0,
            "created_at": NOW.isoformat(),
            "expires_at": (NOW + timedelta(days=28)).isoformat(),
        },
    ]
    ingestions = [
        _ingestion(
            TARGET_INGESTION_IDS[0],
            "different@example.com",
            TARGET_ACTIVITY_IDS[0],
            DELETE_SESSION_ID,
        ),
        _ingestion(
            TARGET_INGESTION_IDS[1],
            " TARGET@EXAMPLE.COM ",
            None,
            None,
        ),
        _ingestion(
            TARGET_INGESTION_IDS[2],
            "target@example.com",
            TARGET_ACTIVITY_IDS[1],
            SHARED_SESSION_ID,
        ),
        _ingestion(
            OTHER_INGESTION_ID,
            "other@example.com",
            OTHER_ACTIVITY_ID,
            SHARED_SESSION_ID,
        ),
    ]

    for filename, records in (
        ("sailors.json", sailors),
        ("boats.json", boats),
        ("activities.json", activities),
        ("sessions.json", sessions),
        ("consent_events.json", consent_events),
        ("consent_requests.json", consent_requests),
        ("ingestion_history.json", ingestions),
    ):
        _write_json(root / filename, records)

    for activity in activities:
        activity_id = str(activity["id"])
        track = root / "tracks" / f"{activity_id}.csv.gz"
        track.parent.mkdir(exist_ok=True)
        track.write_bytes(f"track-{activity_id}".encode())
        original = (
            root
            / "originals"
            / activity_id
            / str(activity["original_filename"])
        )
        original.parent.mkdir(parents=True)
        original.write_bytes(f"original-{activity_id}".encode())
        if activity_id == TARGET_ACTIVITY_IDS[1]:
            (original.parent / "second-source.csv").write_bytes(b"second")
    for ingestion in ingestions:
        original = root / str(ingestion["original_file"])
        original.parent.mkdir(parents=True)
        original.write_bytes(f"ingestion-{ingestion['id']}".encode())
    return root


def _snapshot(root: Path) -> tuple[set[str], dict[str, bytes]]:
    directories = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_dir()
    }
    files = {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file()
    }
    return directories, files


def test_dry_run_builds_complete_safe_plan_without_writes(
    temporary_directory: Path,
) -> None:
    root = _runtime_root(temporary_directory)
    before = _snapshot(root)

    plan = plan_sailor_deletion(root, " TARGET@EXAMPLE.COM ")
    report = format_sailor_deletion_report(plan, applied=False)

    assert _snapshot(root) == before
    assert plan.normalized_email == "target@example.com"
    assert plan.sailor_id == TARGET_SAILOR_ID
    assert plan.activity_ids == TARGET_ACTIVITY_IDS
    assert plan.consent_event_count == 2
    assert plan.consent_event_identifiers == (
        f"consent_requested@{NOW.isoformat()}",
        f"consent_granted@{(NOW + timedelta(minutes=1)).isoformat()}",
    )
    assert plan.consent_request_ids == TARGET_REQUEST_IDS
    assert plan.ingestion_ids == TARGET_INGESTION_IDS
    assert plan.deleted_session_ids == (DELETE_SESSION_ID,)
    assert plan.retained_session_updates[0].session_id == SHARED_SESSION_ID
    assert plan.retained_session_updates[0].remaining_activity_ids == (
        OTHER_ACTIVITY_ID,
    )
    assert plan.warnings == ()
    assert "Mode: DRY RUN — NO CHANGES" in report
    assert f"DELETE SESSION {DELETE_SESSION_ID}" in report
    assert f"KEEP SESSION {SHARED_SESSION_ID}" in report
    assert SERVICE_WARNING in report
    assert MAILBOX_WARNING in report
    for secret in (
        TARGET_PERSONAL_TOKEN,
        OTHER_PERSONAL_TOKEN,
        SHARED_SESSION_TOKEN,
        TARGET_REQUEST_TOKEN,
        OTHER_REQUEST_TOKEN,
    ):
        assert secret not in report


def test_apply_deletes_only_target_owned_runtime_data(
    temporary_directory: Path,
) -> None:
    root = _runtime_root(temporary_directory)
    other_sailor_before = json.loads(
        (root / "sailors.json").read_text(encoding="utf-8")
    )[1]
    other_activity_before = json.loads(
        (root / "activities.json").read_text(encoding="utf-8")
    )[3]
    shared_before = json.loads(
        (root / "sessions.json").read_text(encoding="utf-8")
    )[1]
    boats_before = (root / "boats.json").read_bytes()

    plan = plan_sailor_deletion(root, "target@example.com")
    result = apply_sailor_deletion(plan)
    report = format_sailor_deletion_report(
        plan,
        applied=True,
        warnings=result.warnings,
    )

    sailors = json.loads((root / "sailors.json").read_text(encoding="utf-8"))
    activities = json.loads(
        (root / "activities.json").read_text(encoding="utf-8")
    )
    sessions = json.loads(
        (root / "sessions.json").read_text(encoding="utf-8")
    )
    assert sailors == [other_sailor_before]
    assert activities == [other_activity_before]
    assert (root / "boats.json").read_bytes() == boats_before
    assert [session["id"] for session in sessions] == [SHARED_SESSION_ID]
    assert sessions[0] == {**shared_before, "activity_ids": [OTHER_ACTIVITY_ID]}
    assert sessions[0]["capability_token"] == SHARED_SESSION_TOKEN
    assert sessions[0]["capability_revoked"] is True

    assert {
        event.sailor_id
        for event in ConsentEventRepository(root / "consent_events.json").all()
    } == {OTHER_SAILOR_ID}
    assert {
        request.sailor_id
        for request in ConsentRequestRepository(
            root / "consent_requests.json"
        ).all()
    } == {OTHER_SAILOR_ID}
    remaining_ingestions = IngestionHistory(
        root / "ingestion_history.json"
    ).records()
    assert [record["id"] for record in remaining_ingestions] == [
        OTHER_INGESTION_ID
    ]

    for activity_id in TARGET_ACTIVITY_IDS:
        assert not (root / "tracks" / f"{activity_id}.csv.gz").exists()
        assert not (root / "originals" / activity_id).exists()
    assert (root / "tracks" / f"{OTHER_ACTIVITY_ID}.csv.gz").exists()
    assert (root / "originals" / OTHER_ACTIVITY_ID).exists()
    for ingestion_id in TARGET_INGESTION_IDS:
        assert not (root / "originals" / "ingestions" / ingestion_id).exists()
    assert (
        root / "originals" / "ingestions" / OTHER_INGESTION_ID
    ).is_dir()

    remaining_activity_ids = {
        activity.id for activity in ActivityRepository(root / "activities.json").all()
    }
    for session in SessionRepository(root / "sessions.json").all():
        assert set(session.activity_ids) <= remaining_activity_ids
        assert not set(session.activity_ids) & set(TARGET_ACTIVITY_IDS)
    assert SailorRepository(root / "sailors.json").get_by_id(
        TARGET_SAILOR_ID
    ) is None
    assert not list(root.glob("*.delete-sailor-*.tmp"))
    assert "Mode: APPLY COMPLETE" in report
    assert MAILBOX_WARNING in report


def test_apply_accepts_a_compatible_runtime_owner(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = _runtime_root(temporary_directory)
    monkeypatch.setattr(
        runtime_maintenance,
        "_effective_user_id",
        lambda: 1001,
    )
    monkeypatch.setattr(
        runtime_maintenance,
        "_owner_user_id",
        lambda _path: 1001,
    )

    plan = plan_sailor_deletion(root, "target@example.com")
    apply_sailor_deletion(plan)

    assert SailorRepository(root / "sailors.json").get_by_id(
        TARGET_SAILOR_ID
    ) is None


def test_cli_apply_rejects_an_owner_mismatch_before_mutation(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _runtime_root(temporary_directory)
    before = _snapshot(root)
    monkeypatch.setattr(
        runtime_maintenance,
        "_effective_user_id",
        lambda: 1001,
    )
    monkeypatch.setattr(
        runtime_maintenance,
        "_owner_user_id",
        lambda _path: 1002,
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "delete_sailor.py",
            "--data-dir",
            str(root),
            "--email",
            "target@example.com",
            "--apply",
        ],
    )

    with pytest.raises(SystemExit) as exit_info:
        main()

    assert exit_info.value.code == 1
    error = capsys.readouterr().err
    assert "Runtime ownership preflight failed" in error
    assert "sudo -u <runtime-owner>" in error
    assert _snapshot(root) == before


def test_apply_rejects_unwritable_runtime_before_mutation(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = _runtime_root(temporary_directory)
    before = _snapshot(root)
    monkeypatch.setattr(
        runtime_maintenance,
        "_effective_user_id",
        lambda: None,
    )
    monkeypatch.setattr(
        runtime_maintenance,
        "_has_access",
        lambda _path, _mode: False,
    )

    plan = plan_sailor_deletion(root, "target@example.com")
    with pytest.raises(
        SailorDeletionError,
        match="Runtime writability preflight failed",
    ):
        apply_sailor_deletion(plan)

    assert _snapshot(root) == before


def test_missing_target_artifacts_warn_without_touching_unrelated_files(
    temporary_directory: Path,
) -> None:
    root = _runtime_root(temporary_directory)
    (root / "tracks" / f"{TARGET_ACTIVITY_IDS[0]}.csv.gz").unlink()
    target_original = root / "originals" / TARGET_ACTIVITY_IDS[1]
    for path in target_original.iterdir():
        path.unlink()
    target_original.rmdir()
    ingestion_original = (
        root
        / "originals"
        / "ingestions"
        / TARGET_INGESTION_IDS[1]
        / "track.csv.gz"
    )
    ingestion_original.unlink()

    plan = plan_sailor_deletion(root, "target@example.com")
    result = apply_sailor_deletion(plan)

    assert any("Missing normalized track" in warning for warning in plan.warnings)
    assert any(
        "Missing Activity original directory" in warning
        for warning in plan.warnings
    )
    assert any("Missing ingestion original" in warning for warning in plan.warnings)
    assert result.warnings == plan.warnings
    assert (root / "tracks" / f"{OTHER_ACTIVITY_ID}.csv.gz").exists()
    assert (root / "originals" / OTHER_ACTIVITY_ID).exists()


def test_unknown_email_fails_without_changes(
    temporary_directory: Path,
) -> None:
    root = _runtime_root(temporary_directory)
    before = _snapshot(root)

    with pytest.raises(SailorDeletionError, match="No Sailor matches"):
        plan_sailor_deletion(root, "unknown@example.com")

    assert _snapshot(root) == before


@pytest.mark.parametrize(
    "unsafe_reference",
    [
        "../outside-secret.bin",
        "originals/ingestions/60000000-0000-4000-8000-000000000099/file.bin",
    ],
)
def test_unsafe_ingestion_original_reference_is_refused_before_writes(
    temporary_directory: Path,
    unsafe_reference: str,
) -> None:
    root = _runtime_root(temporary_directory)
    history_path = root / "ingestion_history.json"
    records = json.loads(history_path.read_text(encoding="utf-8"))
    records[1]["original_file"] = unsafe_reference
    _write_json(history_path, records)
    outside = root.parent / "outside-secret.bin"
    outside.write_bytes(b"must remain")
    before = _snapshot(root)

    with pytest.raises(SailorDeletionError, match="Unsafe ingestion original"):
        plan_sailor_deletion(root, "target@example.com")

    assert _snapshot(root) == before
    assert outside.read_bytes() == b"must remain"


def test_inconsistent_session_membership_aborts_before_writes(
    temporary_directory: Path,
) -> None:
    root = _runtime_root(temporary_directory)
    sessions_path = root / "sessions.json"
    records = json.loads(sessions_path.read_text(encoding="utf-8"))
    records[1]["activity_ids"].append(TARGET_ACTIVITY_IDS[0])
    _write_json(sessions_path, records)
    before = _snapshot(root)

    with pytest.raises(SailorDeletionError, match="multiple Sessions"):
        plan_sailor_deletion(root, "target@example.com")

    assert _snapshot(root) == before


def test_apply_refuses_a_stale_plan_before_mutation(
    temporary_directory: Path,
) -> None:
    root = _runtime_root(temporary_directory)
    plan = plan_sailor_deletion(root, "target@example.com")
    boats_path = root / "boats.json"
    boats_before = boats_path.read_bytes()
    boats_path.write_bytes(boats_before + b" ")
    before_apply = _snapshot(root)

    with pytest.raises(SailorDeletionError, match="changed after"):
        apply_sailor_deletion(plan)

    assert _snapshot(root) == before_apply


def test_metadata_replace_failure_rolls_back_before_file_deletion(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = _runtime_root(temporary_directory)
    plan = plan_sailor_deletion(root, "target@example.com")
    before = _snapshot(root)
    replace = sailor_deletion.os.replace
    failed = False

    def fail_once(source: Path, destination: Path) -> None:
        nonlocal failed
        if not failed and Path(destination).name == "activities.json":
            failed = True
            raise OSError("simulated atomic replacement failure")
        replace(source, destination)

    monkeypatch.setattr(sailor_deletion.os, "replace", fail_once)

    with pytest.raises(OSError, match="simulated atomic replacement failure"):
        apply_sailor_deletion(plan)

    assert _snapshot(root) == before


def test_cli_defaults_to_dry_run_and_prints_only_safe_context(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _runtime_root(temporary_directory)
    before = _snapshot(root)
    monkeypatch.setattr(
        sailor_deletion,
        "preflight_runtime_mutation",
        lambda *_args, **_kwargs: pytest.fail(
            "dry-run must not execute the mutation preflight"
        ),
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "delete_sailor.py",
            "--data-dir",
            str(root),
            "--email",
            " TARGET@EXAMPLE.COM ",
        ],
    )

    main()

    output = capsys.readouterr().out
    assert _snapshot(root) == before
    assert "Mode: DRY RUN — NO CHANGES" in output
    assert "Normalized email: target@example.com" in output
    assert SERVICE_WARNING in output
    assert MAILBOX_WARNING in output
    assert TARGET_REQUEST_TOKEN not in output
    assert TARGET_PERSONAL_TOKEN not in output
    assert SHARED_SESSION_TOKEN not in output


def test_cli_help_explains_safe_apply_invocation(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(sys, "argv", ["delete_sailor.py", "--help"])

    with pytest.raises(SystemExit) as exit_info:
        main()

    assert exit_info.value.code == 0
    output = " ".join(capsys.readouterr().out.split())
    assert "Dry-run is the default" in output
    assert "--apply mutates runtime data" in output
    assert "runtime owner/service-compatible user" in output
    assert "Plain sudo can be unsafe" in output
    assert "sudo -u <runtime-owner>" in output


def test_cli_apply_flag_performs_the_prevalidated_deletion(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _runtime_root(temporary_directory)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "delete_sailor.py",
            "--data-dir",
            str(root),
            "--email",
            "target@example.com",
            "--apply",
        ],
    )

    main()

    output = capsys.readouterr().out
    assert "Mode: APPLY COMPLETE" in output
    assert SailorRepository(root / "sailors.json").get_by_id(
        TARGET_SAILOR_ID
    ) is None
    assert SailorRepository(root / "sailors.json").get_by_id(
        OTHER_SAILOR_ID
    ) is not None


def test_cli_unknown_email_exits_nonzero(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _runtime_root(temporary_directory)
    before = _snapshot(root)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "delete_sailor.py",
            "--data-dir",
            str(root),
            "--email",
            "unknown@example.com",
        ],
    )

    with pytest.raises(SystemExit) as exit_info:
        main()

    assert exit_info.value.code == 1
    assert "No Sailor matches normalized email" in capsys.readouterr().err
    assert _snapshot(root) == before
