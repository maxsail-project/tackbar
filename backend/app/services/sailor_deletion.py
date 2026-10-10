"""Plan and apply one explicit Sailor runtime-data deletion."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.identity import normalize_email
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.runtime_paths import RuntimePaths, runtime_paths
from app.services.ingestion_history import IngestionHistory
from app.services.runtime_maintenance import (
    RuntimeMutationPreflightError,
    preflight_runtime_mutation,
)
from app.storage.track_storage import TrackStorage


MAILBOX_WARNING = (
    "Deleting TackBar ingestion history does not delete the source mailbox "
    "message. If the original provider message remains discoverable, a future "
    "mailbox review may ingest it again."
)
SERVICE_WARNING = (
    "--apply is intended to run with tackbar.service stopped so there is no "
    "concurrent writer."
)

_METADATA_NAMES = (
    "sailors",
    "boats",
    "activities",
    "sessions",
    "ingestion_history",
    "consent_events",
    "consent_requests",
)


class SailorDeletionError(ValueError):
    """Raised when a Sailor deletion cannot be planned or applied safely."""


@dataclass(frozen=True)
class RetainedSessionUpdate:
    session_id: str
    removed_activity_ids: tuple[str, ...]
    remaining_activity_ids: tuple[str, ...]


@dataclass(frozen=True)
class SailorDeletionPlan:
    data_root: Path
    normalized_email: str
    sailor_id: str
    activity_ids: tuple[str, ...]
    consent_event_count: int
    consent_event_identifiers: tuple[str, ...]
    consent_request_ids: tuple[str, ...]
    ingestion_ids: tuple[str, ...]
    normalized_track_activity_ids: tuple[str, ...]
    activity_original_ids: tuple[str, ...]
    activity_original_file_count: int
    ingestion_original_ids: tuple[str, ...]
    deleted_session_ids: tuple[str, ...]
    retained_session_updates: tuple[RetainedSessionUpdate, ...]
    warnings: tuple[str, ...]
    _original_bytes: dict[str, bytes | None] = field(
        repr=False,
        compare=False,
    )
    _updated_records: dict[str, list[dict[str, Any]]] = field(
        repr=False,
        compare=False,
    )
    _track_paths: tuple[Path, ...] = field(repr=False, compare=False)
    _activity_original_directories: tuple[Path, ...] = field(
        repr=False,
        compare=False,
    )
    _activity_original_snapshots: dict[Path, tuple[str, ...]] = field(
        repr=False,
        compare=False,
    )
    _ingestion_original_paths: tuple[Path, ...] = field(
        repr=False,
        compare=False,
    )
    _ingestion_original_directories: tuple[Path, ...] = field(
        repr=False,
        compare=False,
    )


@dataclass(frozen=True)
class SailorDeletionResult:
    plan: SailorDeletionPlan
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class _ValidatedState:
    records: dict[str, list[dict[str, Any]]]
    original_bytes: dict[str, bytes | None]
    sailors: list[Any]
    boats: list[Any]
    activities: list[Any]
    sessions: list[Any]
    ingestion_records: list[dict[str, Any]]
    consent_events: list[Any]
    consent_requests: list[Any]


def plan_sailor_deletion(
    data_root: str | Path,
    email: str,
) -> SailorDeletionPlan:
    root = _explicit_data_root(data_root)
    paths = runtime_paths(root)
    state = _load_validated_state(paths)
    target_email = normalize_email(email)
    target = next(
        (sailor for sailor in state.sailors if sailor.email == target_email),
        None,
    )
    if target is None:
        raise SailorDeletionError(
            f"No Sailor matches normalized email: {target_email}"
        )

    target_activities = tuple(
        activity
        for activity in state.activities
        if activity.sailor_id == target.id
    )
    target_activity_ids = tuple(
        activity.id for activity in target_activities
    )
    target_activity_id_set = set(target_activity_ids)
    target_event_count = sum(
        event.sailor_id == target.id for event in state.consent_events
    )
    target_event_identifiers = tuple(
        f"{event.event_type.value}@{event.timestamp.isoformat()}"
        for event in state.consent_events
        if event.sailor_id == target.id
    )
    target_request_ids = tuple(
        request.id
        for request in state.consent_requests
        if request.sailor_id == target.id
    )

    target_ingestion_ids = tuple(
        str(record["id"])
        for record in state.ingestion_records
        if _ingestion_belongs_to_target(
            record,
            target_activity_id_set,
            target_email,
        )
    )
    target_ingestion_id_set = set(target_ingestion_ids)
    ingestion_paths = _validated_ingestion_original_paths(
        root,
        state.ingestion_records,
    )
    _reject_shared_ingestion_originals(
        ingestion_paths,
        target_ingestion_id_set,
    )

    updated_sessions: list[dict[str, Any]] = []
    deleted_session_ids: list[str] = []
    retained_updates: list[RetainedSessionUpdate] = []
    for record, session in zip(state.records["sessions"], state.sessions):
        removed = tuple(
            activity_id
            for activity_id in session.activity_ids
            if activity_id in target_activity_id_set
        )
        if not removed:
            updated_sessions.append(record)
            continue
        remaining = tuple(
            activity_id
            for activity_id in session.activity_ids
            if activity_id not in target_activity_id_set
        )
        if not remaining:
            deleted_session_ids.append(session.id)
            continue
        updated_sessions.append({**record, "activity_ids": list(remaining)})
        retained_updates.append(
            RetainedSessionUpdate(session.id, removed, remaining)
        )

    updated_records = {
        **state.records,
        "sailors": [
            record
            for record in state.records["sailors"]
            if record.get("id") != target.id
        ],
        "activities": [
            record
            for record in state.records["activities"]
            if record.get("id") not in target_activity_id_set
        ],
        "sessions": updated_sessions,
        "consent_events": [
            record
            for record in state.records["consent_events"]
            if record.get("sailor_id") != target.id
        ],
        "consent_requests": [
            record
            for record in state.records["consent_requests"]
            if record.get("sailor_id") != target.id
        ],
        "ingestion_history": [
            record
            for record in state.records["ingestion_history"]
            if str(record.get("id")) not in target_ingestion_id_set
        ],
    }
    _validate_records(updated_records)

    storage = TrackStorage(root)
    for activity in state.activities:
        expected_track_file = storage.track_relative_path(activity.id)
        if activity.track_file not in (None, expected_track_file):
            raise SailorDeletionError(
                f"Activity {activity.id} has an unsafe normalized-track reference"
            )
    warnings: list[str] = []
    track_paths: list[Path] = []
    original_directories: list[Path] = []
    original_snapshots: dict[Path, tuple[str, ...]] = {}
    normalized_track_activity_ids: list[str] = []
    activity_original_ids: list[str] = []
    activity_original_file_count = 0
    for activity in target_activities:
        activity_id = activity.id
        track_path = storage.track_path(activity_id)
        _validate_deletion_path(track_path, root, expected_kind="file")
        track_paths.append(track_path)
        if track_path.exists():
            normalized_track_activity_ids.append(activity_id)
        else:
            warnings.append(
                f"Missing normalized track for Activity {activity_id}"
            )

        original_directory = storage.originals_root / activity_id
        _validate_deletion_path(
            original_directory,
            root,
            expected_kind="directory",
        )
        original_directories.append(original_directory)
        snapshot = _directory_snapshot(original_directory, root)
        original_snapshots[original_directory] = snapshot
        if original_directory.exists():
            activity_original_ids.append(activity_id)
            activity_original_file_count += sum(
                (original_directory / relative).is_file()
                for relative in snapshot
            )
            if not snapshot:
                warnings.append(
                    f"Activity original directory is empty for Activity {activity_id}"
                )
            expected_original = storage.original_path(
                activity_id,
                activity.original_filename,
            )
            if not expected_original.is_file():
                warnings.append(
                    f"Missing expected Activity original for Activity {activity_id}"
                )
        else:
            warnings.append(
                f"Missing Activity original directory for Activity {activity_id}"
            )

    ingestion_original_paths: list[Path] = []
    ingestion_original_ids: list[str] = []
    ingestion_original_directories: set[Path] = set()
    for ingestion_id in target_ingestion_ids:
        original_path = ingestion_paths.get(ingestion_id)
        if original_path is None:
            continue
        ingestion_original_paths.append(original_path)
        ingestion_original_directories.add(
            root / "originals" / "ingestions" / ingestion_id
        )
        if original_path.exists():
            ingestion_original_ids.append(ingestion_id)
        else:
            warnings.append(
                f"Missing ingestion original for Ingestion {ingestion_id}"
            )

    return SailorDeletionPlan(
        data_root=root,
        normalized_email=target_email,
        sailor_id=target.id,
        activity_ids=target_activity_ids,
        consent_event_count=target_event_count,
        consent_event_identifiers=target_event_identifiers,
        consent_request_ids=target_request_ids,
        ingestion_ids=target_ingestion_ids,
        normalized_track_activity_ids=tuple(normalized_track_activity_ids),
        activity_original_ids=tuple(activity_original_ids),
        activity_original_file_count=activity_original_file_count,
        ingestion_original_ids=tuple(ingestion_original_ids),
        deleted_session_ids=tuple(deleted_session_ids),
        retained_session_updates=tuple(retained_updates),
        warnings=tuple(warnings),
        _original_bytes=state.original_bytes,
        _updated_records=updated_records,
        _track_paths=tuple(track_paths),
        _activity_original_directories=tuple(original_directories),
        _activity_original_snapshots=original_snapshots,
        _ingestion_original_paths=tuple(dict.fromkeys(ingestion_original_paths)),
        _ingestion_original_directories=tuple(
            sorted(ingestion_original_directories, key=str)
        ),
    )


def apply_sailor_deletion(plan: SailorDeletionPlan) -> SailorDeletionResult:
    root = _explicit_data_root(plan.data_root)
    paths = runtime_paths(root)
    changed_names = tuple(
        name
        for name in _METADATA_NAMES
        if plan._updated_records[name]
        != _records_from_snapshot(plan._original_bytes[name], name)
    )
    try:
        preflight_runtime_mutation(
            root,
            _sailor_deletion_mutation_paths(plan, paths, changed_names),
        )
    except RuntimeMutationPreflightError as error:
        raise SailorDeletionError(str(error)) from error

    _verify_plan_is_current(plan, paths)
    _validate_records(plan._updated_records)

    staged: dict[str, Path] = {}
    replaced: list[str] = []
    try:
        for name in changed_names:
            destination = _metadata_path(paths, name)
            staged[name] = _write_sibling_temporary(
                destination,
                _encode_records(plan._updated_records[name]),
            )
        for name in changed_names:
            destination = _metadata_path(paths, name)
            os.replace(staged[name], destination)
            replaced.append(name)
        _verify_metadata_matches_plan(plan, paths)
    except Exception:
        _restore_metadata(paths, plan._original_bytes, replaced)
        raise
    finally:
        for temporary_path in staged.values():
            if temporary_path.exists():
                temporary_path.unlink()

    runtime_warnings = list(plan.warnings)
    try:
        for track_path in plan._track_paths:
            if track_path.exists():
                track_path.unlink()
        for original_directory in plan._activity_original_directories:
            if original_directory.exists():
                shutil.rmtree(original_directory)
        for original_path in plan._ingestion_original_paths:
            if original_path.exists():
                original_path.unlink()
        for original_directory in plan._ingestion_original_directories:
            if original_directory.exists():
                try:
                    original_directory.rmdir()
                except OSError:
                    runtime_warnings.append(
                        "Ingestion original directory retained because it "
                        f"contains unreferenced files: {original_directory.name}"
                    )
    except OSError as error:
        raise SailorDeletionError(
            "Metadata was updated, but target-owned filesystem cleanup failed"
        ) from error

    _verify_post_deletion(plan, paths)
    return SailorDeletionResult(plan, tuple(dict.fromkeys(runtime_warnings)))


def _sailor_deletion_mutation_paths(
    plan: SailorDeletionPlan,
    paths: RuntimePaths,
    changed_names: tuple[str, ...],
) -> tuple[Path, ...]:
    mutation_paths = [
        *(_metadata_path(paths, name) for name in changed_names),
        *plan._track_paths,
        *plan._activity_original_directories,
        *plan._ingestion_original_paths,
        *plan._ingestion_original_directories,
    ]
    try:
        for directory in plan._activity_original_directories:
            if directory.exists():
                mutation_paths.extend(directory.rglob("*"))
    except OSError as error:
        raise SailorDeletionError(
            "Runtime preflight could not inspect Activity originals"
        ) from error
    return tuple(dict.fromkeys(mutation_paths))


def format_sailor_deletion_report(
    plan: SailorDeletionPlan,
    *,
    applied: bool,
    warnings: tuple[str, ...] | None = None,
) -> str:
    mode = "APPLY COMPLETE" if applied else "DRY RUN — NO CHANGES"
    lines = [
        f"Mode: {mode}",
        f"Data root: {plan.data_root}",
        f"Normalized email: {plan.normalized_email}",
        SERVICE_WARNING,
        f"Sailor: DELETE {plan.sailor_id}",
        _identified_count("Activities", plan.activity_ids),
        _identified_count(
            "Consent Events",
            plan.consent_event_identifiers,
        ),
        _identified_count("Consent Requests", plan.consent_request_ids),
        _identified_count("Ingestion records", plan.ingestion_ids),
        _identified_count(
            "Normalized track files",
            plan.normalized_track_activity_ids,
        ),
        (
            "Activity archived-original directories: DELETE "
            f"{len(plan.activity_original_ids)} "
            f"({plan.activity_original_file_count} contained files)"
            + (
                f": {', '.join(plan.activity_original_ids)}"
                if plan.activity_original_ids
                else ""
            )
        ),
        _identified_count(
            "Ingestion-original files",
            plan.ingestion_original_ids,
        ),
        "Sessions:",
    ]
    if not plan.deleted_session_ids and not plan.retained_session_updates:
        lines.append("  No Session membership changes")
    for session_id in plan.deleted_session_ids:
        lines.append(f"  DELETE SESSION {session_id}")
    for update in plan.retained_session_updates:
        removed = ", ".join(update.removed_activity_ids)
        lines.append(
            f"  KEEP SESSION {update.session_id} / "
            f"REMOVE TARGET ACTIVITIES {removed}"
        )
    lines.append("Boats: unchanged")
    report_warnings = plan.warnings if warnings is None else warnings
    if report_warnings:
        lines.append("Warnings:")
        lines.extend(f"  {warning}" for warning in report_warnings)
    lines.append(f"WARNING: {MAILBOX_WARNING}")
    if not applied:
        lines.append("Re-run with --apply to perform this exact deletion plan.")
    return "\n".join(lines)


def _explicit_data_root(data_root: str | Path) -> Path:
    raw = str(data_root)
    if not raw.strip():
        raise SailorDeletionError("--data-dir must not be empty")
    root = Path(data_root).expanduser().resolve()
    if root == Path(root.anchor):
        raise SailorDeletionError("Refusing to use a filesystem root as data root")
    if not root.is_dir():
        raise SailorDeletionError("Selected TackBar data root is not a directory")
    return root


def _load_validated_state(paths: RuntimePaths) -> _ValidatedState:
    records: dict[str, list[dict[str, Any]]] = {}
    originals: dict[str, bytes | None] = {}
    for name in _METADATA_NAMES:
        path = _metadata_path(paths, name)
        if path.is_symlink():
            raise SailorDeletionError(
                f"Refusing symlinked runtime metadata: {path.name}"
            )
        originals[name] = path.read_bytes() if path.exists() else None
        records[name] = _read_records(path, name)
    validated = _validate_records(records)
    return _ValidatedState(records, originals, **validated)


def _validate_records(
    records: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="tackbar-sailor-deletion-") as name:
        root = Path(name)
        paths = runtime_paths(root)
        for metadata_name in _METADATA_NAMES:
            _metadata_path(paths, metadata_name).write_bytes(
                _encode_records(records[metadata_name])
            )

        sailors = SailorRepository(paths.sailors).all()
        boats = BoatRepository(paths.boats).all()
        activities = ActivityRepository(paths.activities).all()

        sessions_before = paths.sessions.read_bytes()
        sessions = SessionRepository(
            paths.sessions,
            clock=lambda: datetime.now(timezone.utc),
        ).all()
        if paths.sessions.read_bytes() != sessions_before:
            raise SailorDeletionError(
                "Session persistence requires migration before Sailor deletion"
            )

        history_before = paths.ingestion_history.read_bytes()
        ingestion_records = IngestionHistory(paths.ingestion_history).records()
        if paths.ingestion_history.read_bytes() != history_before:
            raise SailorDeletionError(
                "Ingestion history requires migration before Sailor deletion"
            )

        consent_events = ConsentEventRepository(paths.consent_events).all()
        consent_requests = ConsentRequestRepository(paths.consent_requests).all()

    _validate_relationships(
        sailors,
        boats,
        activities,
        sessions,
        ingestion_records,
        consent_events,
        consent_requests,
    )
    return {
        "sailors": sailors,
        "boats": boats,
        "activities": activities,
        "sessions": sessions,
        "ingestion_records": ingestion_records,
        "consent_events": consent_events,
        "consent_requests": consent_requests,
    }


def _validate_relationships(
    sailors: list[Any],
    boats: list[Any],
    activities: list[Any],
    sessions: list[Any],
    ingestion_records: list[dict[str, Any]],
    consent_events: list[Any],
    consent_requests: list[Any],
) -> None:
    sailor_ids = {sailor.id for sailor in sailors}
    boat_ids = {boat.id for boat in boats}
    activity_ids = {activity.id for activity in activities}
    session_ids = {session.id for session in sessions}
    if len(activity_ids) != len(activities):
        raise SailorDeletionError("Duplicate Activity id in runtime persistence")
    if len(session_ids) != len(sessions):
        raise SailorDeletionError("Duplicate Session id in runtime persistence")

    for sailor in sailors:
        if (
            sailor.default_boat_id is not None
            and sailor.default_boat_id not in boat_ids
        ):
            raise SailorDeletionError(
                f"Sailor {sailor.id} references a missing default Boat"
            )
    for activity in activities:
        if activity.sailor_id not in sailor_ids:
            raise SailorDeletionError(
                f"Activity {activity.id} references a missing Sailor"
            )
        if activity.boat_id is not None and activity.boat_id not in boat_ids:
            raise SailorDeletionError(
                f"Activity {activity.id} references a missing Boat"
            )

    session_by_activity: dict[str, str] = {}
    membership_by_session: dict[str, set[str]] = {}
    for session in sessions:
        if len(session.activity_ids) != len(set(session.activity_ids)):
            raise SailorDeletionError(
                f"Session {session.id} contains duplicate Activity membership"
            )
        membership_by_session[session.id] = set(session.activity_ids)
        for activity_id in session.activity_ids:
            if activity_id not in activity_ids:
                raise SailorDeletionError(
                    f"Session {session.id} references a missing Activity"
                )
            previous = session_by_activity.get(activity_id)
            if previous is not None and previous != session.id:
                raise SailorDeletionError(
                    f"Activity {activity_id} is referenced by multiple Sessions"
                )
            session_by_activity[activity_id] = session.id

    for event in consent_events:
        if event.sailor_id not in sailor_ids:
            raise SailorDeletionError(
                "Consent Event references a missing Sailor"
            )
    for request in consent_requests:
        if request.sailor_id not in sailor_ids:
            raise SailorDeletionError(
                "Consent Request references a missing Sailor"
            )
    for record in ingestion_records:
        activity_id = record.get("activity_id")
        session_id = record.get("session_id")
        sender_email = record.get("sender_email")
        if sender_email is not None and not isinstance(sender_email, str):
            raise SailorDeletionError("Ingestion sender email must be text or null")
        if activity_id is not None and activity_id not in activity_ids:
            raise SailorDeletionError(
                "Ingestion record references a missing Activity"
            )
        if session_id is not None and session_id not in session_ids:
            raise SailorDeletionError(
                "Ingestion record references a missing Session"
            )
        if activity_id is not None and session_id is not None and (
            activity_id not in membership_by_session[session_id]
        ):
            raise SailorDeletionError(
                "Ingestion Activity and Session references are inconsistent"
            )


def _ingestion_belongs_to_target(
    record: dict[str, Any],
    activity_ids: set[str],
    target_email: str,
) -> bool:
    if record.get("activity_id") in activity_ids:
        return True
    sender_email = record.get("sender_email")
    return (
        isinstance(sender_email, str)
        and normalize_email(sender_email) == target_email
    )


def _validated_ingestion_original_paths(
    root: Path,
    records: list[dict[str, Any]],
) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for record in records:
        relative = record.get("original_file")
        if relative is None:
            continue
        ingestion_id = str(record["id"])
        if not isinstance(relative, str):
            raise SailorDeletionError(
                f"Unsafe ingestion original reference for Ingestion {ingestion_id}"
            )
        normalized = relative.replace("\\", "/")
        relative_path = Path(normalized)
        parts = relative_path.parts
        if (
            relative != normalized
            or relative_path.is_absolute()
            or ".." in parts
            or len(parts) < 4
            or parts[:3] != ("originals", "ingestions", ingestion_id)
        ):
            raise SailorDeletionError(
                f"Unsafe ingestion original reference for Ingestion {ingestion_id}"
            )
        path = root.joinpath(*parts)
        _validate_deletion_path(path, root, expected_kind="file")
        paths[ingestion_id] = path
    return paths


def _reject_shared_ingestion_originals(
    paths: dict[str, Path],
    target_ingestion_ids: set[str],
) -> None:
    owners: dict[Path, set[str]] = {}
    for ingestion_id, path in paths.items():
        owners.setdefault(path.resolve(strict=False), set()).add(ingestion_id)
    for path_owners in owners.values():
        if path_owners & target_ingestion_ids and path_owners - target_ingestion_ids:
            raise SailorDeletionError(
                "Target and retained ingestions share one original file"
            )


def _validate_deletion_path(
    path: Path,
    root: Path,
    *,
    expected_kind: str,
) -> None:
    _reject_symlink_components(path, root)
    try:
        path.resolve(strict=False).relative_to(root)
    except ValueError as error:
        raise SailorDeletionError(
            "Refusing a deletion path outside the selected data root"
        ) from error
    if not path.exists():
        return
    if expected_kind == "file" and not path.is_file():
        raise SailorDeletionError("Expected deletion target is not a file")
    if expected_kind == "directory" and not path.is_dir():
        raise SailorDeletionError("Expected deletion target is not a directory")


def _reject_symlink_components(path: Path, root: Path) -> None:
    try:
        relative = path.relative_to(root)
    except ValueError as error:
        raise SailorDeletionError(
            "Refusing a deletion path outside the selected data root"
        ) from error
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise SailorDeletionError("Refusing symlinked deletion target")


def _directory_snapshot(directory: Path, root: Path) -> tuple[str, ...]:
    if not directory.exists():
        return ()
    entries: list[str] = []
    for path in directory.rglob("*"):
        _validate_deletion_path(
            path,
            root,
            expected_kind="directory" if path.is_dir() else "file",
        )
        entries.append(path.relative_to(directory).as_posix())
    return tuple(sorted(entries))


def _verify_plan_is_current(
    plan: SailorDeletionPlan,
    paths: RuntimePaths,
) -> None:
    for name in _METADATA_NAMES:
        path = _metadata_path(paths, name)
        current = path.read_bytes() if path.exists() else None
        if current != plan._original_bytes[name]:
            raise SailorDeletionError(
                "Runtime metadata changed after the deletion plan was built"
            )
    for directory, snapshot in plan._activity_original_snapshots.items():
        if _directory_snapshot(directory, plan.data_root) != snapshot:
            raise SailorDeletionError(
                "Activity originals changed after the deletion plan was built"
            )


def _verify_metadata_matches_plan(
    plan: SailorDeletionPlan,
    paths: RuntimePaths,
) -> None:
    state = _load_validated_state(paths)
    for name in _METADATA_NAMES:
        if state.records[name] != plan._updated_records[name]:
            raise SailorDeletionError(
                f"Post-write validation failed for {name}"
            )


def _verify_post_deletion(
    plan: SailorDeletionPlan,
    paths: RuntimePaths,
) -> None:
    _verify_metadata_matches_plan(plan, paths)
    state = _load_validated_state(paths)
    if any(sailor.id == plan.sailor_id for sailor in state.sailors):
        raise SailorDeletionError("Target Sailor remains after deletion")
    if any(
        activity.sailor_id == plan.sailor_id
        for activity in state.activities
    ):
        raise SailorDeletionError("Target Activity remains after deletion")
    if any(
        event.sailor_id == plan.sailor_id for event in state.consent_events
    ):
        raise SailorDeletionError("Target Consent Event remains after deletion")
    if any(
        request.sailor_id == plan.sailor_id
        for request in state.consent_requests
    ):
        raise SailorDeletionError("Target Consent Request remains after deletion")
    if any(path.exists() for path in plan._track_paths):
        raise SailorDeletionError("Target normalized track remains after deletion")
    if any(
        path.exists() for path in plan._activity_original_directories
    ):
        raise SailorDeletionError("Target Activity original remains after deletion")
    if any(path.exists() for path in plan._ingestion_original_paths):
        raise SailorDeletionError("Target ingestion original remains after deletion")


def _restore_metadata(
    paths: RuntimePaths,
    original_bytes: dict[str, bytes | None],
    replaced_names: list[str],
) -> None:
    for name in reversed(replaced_names):
        path = _metadata_path(paths, name)
        content = original_bytes[name]
        if content is None:
            if path.exists():
                path.unlink()
        else:
            temporary = _write_sibling_temporary(path, content)
            os.replace(temporary, path)


def _write_sibling_temporary(destination: Path, content: bytes) -> Path:
    temporary = destination.with_name(
        f".{destination.name}.delete-sailor-{uuid4().hex}.tmp"
    )
    try:
        with temporary.open("xb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
    except Exception:
        if temporary.exists():
            temporary.unlink()
        raise
    return temporary


def _metadata_path(paths: RuntimePaths, name: str) -> Path:
    return getattr(paths, name)


def _read_records(path: Path, label: str) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or any(
        not isinstance(record, dict) for record in value
    ):
        raise SailorDeletionError(
            f"{label} persistence must contain a JSON list of objects"
        )
    return value


def _records_from_snapshot(
    content: bytes | None,
    label: str,
) -> list[dict[str, Any]]:
    if content is None:
        return []
    value = json.loads(content.decode("utf-8"))
    if not isinstance(value, list) or any(
        not isinstance(record, dict) for record in value
    ):
        raise SailorDeletionError(
            f"{label} persistence must contain a JSON list of objects"
        )
    return value


def _encode_records(records: list[dict[str, Any]]) -> bytes:
    return (
        json.dumps(records, indent=2, ensure_ascii=False) + "\n"
    ).encode("utf-8")


def _identified_count(label: str, identifiers: tuple[str, ...]) -> str:
    suffix = f": {', '.join(identifiers)}" if identifiers else ""
    return f"{label}: DELETE {len(identifiers)}{suffix}"
