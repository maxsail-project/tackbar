"""Migrate one explicit legacy data root from Participant to Sailor/Boat."""

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from uuid import uuid4


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.identity import normalize_email, require_uuid  # noqa: E402


LEGACY_BOAT_POLICIES = ("assign", "unknown")


@dataclass(frozen=True)
class MigrationSummary:
    sailors_migrated: int
    boats_created: int
    activities_migrated: int
    activities_assigned_legacy_boat: int
    activities_with_unknown_boat: int


def migrate_sailor_boat(
    data_root: str | Path,
    legacy_boat_policy: str,
    id_factory: Callable[[], object] = uuid4,
) -> MigrationSummary:
    if legacy_boat_policy not in LEGACY_BOAT_POLICIES:
        raise ValueError(
            "Legacy Boat policy must be one of: "
            + ", ".join(LEGACY_BOAT_POLICIES)
        )

    root = Path(data_root).expanduser().resolve()
    paths = _migration_paths(root)
    _validate_paths(paths)

    legacy_participants = _read_json_list(
        paths["participants"],
        "Legacy Participant storage",
    )
    legacy_activities = _read_json_list(
        paths["activities"],
        "Legacy Activity storage",
    )
    migrated = _build_migrated_state(
        legacy_participants,
        legacy_activities,
        legacy_boat_policy,
        id_factory,
    )

    try:
        _write_and_validate_temporary_json(
            paths["sailors_temp"], migrated["sailors"]
        )
        _write_and_validate_temporary_json(
            paths["boats_temp"], migrated["boats"]
        )
        _write_and_validate_temporary_json(
            paths["activities_temp"], migrated["activities"]
        )
        try:
            paths["participants"].replace(paths["participants_backup"])
            paths["activities"].replace(paths["activities_backup"])
            paths["sailors_temp"].replace(paths["sailors"])
            paths["boats_temp"].replace(paths["boats"])
            paths["activities_temp"].replace(paths["activities"])
        except Exception:
            _rollback_migration(paths)
            raise
    finally:
        _remove_temporary_files(paths)

    return MigrationSummary(
        sailors_migrated=len(migrated["sailors"]),
        boats_created=len(migrated["boats"]),
        activities_migrated=len(migrated["activities"]),
        activities_assigned_legacy_boat=sum(
            activity["boat_id"] is not None
            for activity in migrated["activities"]
        ),
        activities_with_unknown_boat=sum(
            activity["boat_id"] is None
            for activity in migrated["activities"]
        ),
    )


def _migration_paths(root: Path) -> dict[str, Path]:
    return {
        "participants": root / "participants.json",
        "activities": root / "activities.json",
        "sailors": root / "sailors.json",
        "boats": root / "boats.json",
        "participants_backup": root / "participants.legacy.json",
        "activities_backup": root / "activities.legacy.json",
        "sailors_temp": root / "sailors.json.tmp",
        "boats_temp": root / "boats.json.tmp",
        "activities_temp": root / "activities.json.tmp",
    }


def _validate_paths(paths: dict[str, Path]) -> None:
    for legacy_name in ("participants", "activities"):
        if not paths[legacy_name].is_file():
            raise ValueError(
                f"Required legacy file does not exist: {paths[legacy_name]}"
            )

    for new_name in ("sailors", "boats"):
        if paths[new_name].exists():
            raise ValueError(
                f"Refusing to overwrite migrated runtime file: {paths[new_name]}"
            )

    for protected_name in (
        "participants_backup",
        "activities_backup",
        "sailors_temp",
        "boats_temp",
        "activities_temp",
    ):
        if paths[protected_name].exists():
            raise ValueError(
                f"Refusing migration because path already exists: "
                f"{paths[protected_name]}"
            )


def _read_json_list(path: Path, label: str) -> list[dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not all(
        isinstance(record, dict) for record in data
    ):
        raise ValueError(f"{label} must contain a JSON list of objects")
    return data


def _build_migrated_state(
    legacy_participants: list[dict[str, object]],
    legacy_activities: list[dict[str, object]],
    legacy_boat_policy: str,
    id_factory: Callable[[], object],
) -> dict[str, list[dict[str, object]]]:
    participants_by_email: dict[str, dict[str, object]] = {}
    for participant in legacy_participants:
        participant_id = participant.get("id")
        if not isinstance(participant_id, str) or not participant_id.strip():
            raise ValueError("Legacy Participant id must be a non-empty email")
        email = normalize_email(participant_id)
        if email in participants_by_email:
            raise ValueError(
                f"Duplicate normalized legacy Participant email: {email}"
            )
        participants_by_email[email] = participant

    activity_emails: list[str] = []
    activity_ids: set[str] = set()
    for activity in legacy_activities:
        activity_id = activity.get("id")
        if not isinstance(activity_id, str) or not activity_id:
            raise ValueError("Legacy Activity id must be a non-empty string")
        if activity_id in activity_ids:
            raise ValueError(f"Duplicate legacy Activity id: {activity_id}")
        activity_ids.add(activity_id)

        participant_id = activity.get("participant_id")
        if not isinstance(participant_id, str):
            raise ValueError(
                f"Legacy Activity {activity_id} has no participant_id"
            )
        email = normalize_email(participant_id)
        if email not in participants_by_email:
            raise ValueError(
                f"Legacy Activity {activity_id} references an unknown Participant"
            )
        activity_emails.append(email)

    sailors: list[dict[str, object]] = []
    boats: list[dict[str, object]] = []
    sailor_id_by_email: dict[str, str] = {}
    boat_id_by_email: dict[str, str] = {}
    generated_sailor_ids: set[str] = set()
    generated_boat_ids: set[str] = set()

    for email, participant in participants_by_email.items():
        sailor_id = _new_id(id_factory, "Sailor", generated_sailor_ids)
        boat_metadata = _legacy_boat_metadata(participant)
        boat_id = None
        if boat_metadata is not None:
            boat_id = _new_id(id_factory, "Boat", generated_boat_ids)
            boats.append({"id": boat_id, **boat_metadata})
            boat_id_by_email[email] = boat_id

        sailors.append(
            {
                "id": sailor_id,
                "email": email,
                "name": _nullable_text(participant.get("name"), "name"),
                "default_boat_id": boat_id,
            }
        )
        sailor_id_by_email[email] = sailor_id

    migrated_activities = []
    for activity, email in zip(legacy_activities, activity_emails):
        boat_id = (
            boat_id_by_email.get(email)
            if legacy_boat_policy == "assign"
            else None
        )
        migrated_activities.append(
            {
                "id": activity["id"],
                "sailor_id": sailor_id_by_email[email],
                "boat_id": boat_id,
                **{
                    key: value
                    for key, value in activity.items()
                    if key not in {"id", "participant_id"}
                },
            }
        )

    if [activity["id"] for activity in migrated_activities] != [
        activity["id"] for activity in legacy_activities
    ]:
        raise ValueError("Activity identity changed during migration")

    return {
        "sailors": sailors,
        "boats": boats,
        "activities": migrated_activities,
    }


def _legacy_boat_metadata(
    participant: dict[str, object],
) -> dict[str, object] | None:
    metadata = {
        "name": _nullable_text(participant.get("boat_name"), "boat_name"),
        "sailing_class": _nullable_text(
            participant.get("sailing_class"), "sailing_class"
        ),
        "sail_number": _nullable_text(
            participant.get("sail_number"), "sail_number"
        ),
    }
    return metadata if any(metadata.values()) else None


def _nullable_text(value: object, field_name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"Legacy {field_name} must be a string or null")
    return value if value.strip() else None


def _new_id(
    id_factory: Callable[[], object],
    entity_name: str,
    generated_ids: set[str],
) -> str:
    value = str(id_factory())
    require_uuid(value, entity_name)
    if value in generated_ids:
        raise ValueError(f"Duplicate generated {entity_name} id: {value}")
    generated_ids.add(value)
    return value


def _write_and_validate_temporary_json(
    path: Path,
    records: list[dict[str, object]],
) -> None:
    path.write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if _read_json_list(path, f"Temporary migration file {path.name}") != records:
        raise ValueError(f"Temporary migration validation failed: {path}")


def _rollback_migration(paths: dict[str, Path]) -> None:
    for new_name in ("sailors", "boats"):
        if paths[new_name].exists():
            paths[new_name].unlink()
    if paths["activities_backup"].exists():
        if paths["activities"].exists():
            paths["activities"].unlink()
        paths["activities_backup"].replace(paths["activities"])
    if paths["participants_backup"].exists():
        paths["participants_backup"].replace(paths["participants"])


def _remove_temporary_files(paths: dict[str, Path]) -> None:
    for temp_name in ("sailors_temp", "boats_temp", "activities_temp"):
        if paths[temp_name].exists():
            paths[temp_name].unlink()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate one explicit TackBar data root to Sailor/Boat."
    )
    parser.add_argument(
        "--data-dir",
        required=True,
        help="Explicit legacy TackBar data root to migrate",
    )
    parser.add_argument(
        "--legacy-boat-policy",
        required=True,
        choices=LEGACY_BOAT_POLICIES,
        help=(
            "assign preserves the previous TackBar Boat interpretation on "
            "legacy Activities; unknown leaves historical Boat context null"
        ),
    )
    args = parser.parse_args()

    try:
        summary = migrate_sailor_boat(
            args.data_dir,
            args.legacy_boat_policy,
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.exit(1, f"Migration failed: {error}\n")

    print(f"Sailors migrated: {summary.sailors_migrated}")
    print(f"Boats created: {summary.boats_created}")
    print(f"Activities migrated: {summary.activities_migrated}")
    print(
        "Activities assigned legacy Boat context: "
        f"{summary.activities_assigned_legacy_boat}"
    )
    print(
        "Activities with unknown Boat: "
        f"{summary.activities_with_unknown_boat}"
    )


if __name__ == "__main__":
    main()
