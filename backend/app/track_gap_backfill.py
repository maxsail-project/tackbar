"""Idempotent one-off backfill of Activity gap summaries (Issue #218, D9).

The summary is derived from each stored canonical normalized track only: no source
re-parsing, no re-ingestion and no change to any other Activity field. Dry-run is
the default; ``--apply`` writes. Rerunning reports every Activity as unchanged.

    sudo -u <runtime-owner> /path/to/python -m app.track_gap_backfill \\
        --data-dir <runtime-data-dir> --apply
"""

import argparse
from dataclasses import dataclass
from pathlib import Path

from app.normalization.track_gaps import summarize_track_gaps
from app.repositories.activities import ActivityRepository
from app.runtime_paths import runtime_paths
from app.services.ingestion_lock import ingestion_lock
from app.services.runtime_maintenance import (
    RUNTIME_OWNER_GUIDANCE,
    preflight_runtime_mutation,
)
from app.storage.track_storage import TrackStorage


@dataclass(frozen=True)
class TrackGapBackfillSummary:
    activities: int
    updated: int
    unchanged: int
    with_gaps: int
    unavailable_tracks: int
    applied: bool


def backfill_track_gaps(
    data_root: str | Path, *, apply: bool = False,
) -> TrackGapBackfillSummary:
    root = _explicit_data_root(data_root)
    paths = runtime_paths(root)
    if not apply:
        # Read-only: no lock file or other runtime entry is created.
        return _backfill(root, paths.activities, apply=False)
    preflight_runtime_mutation(root, [paths.activities])
    # Cooperate with ingestion writers that rewrite the same Activity collection.
    with ingestion_lock(root):
        return _backfill(root, paths.activities, apply=True)


def _backfill(root: Path, activities_path: Path, *, apply: bool) -> TrackGapBackfillSummary:
    repository = ActivityRepository(activities_path)
    storage = TrackStorage(root)
    activities = repository.all()
    changes = {}
    with_gaps = unavailable = 0
    for activity in activities:
        try:
            track = storage.read_normalized_track(activity.id)
        except (FileNotFoundError, ValueError):
            unavailable += 1
            continue
        summary = summarize_track_gaps(track["utc"])
        with_gaps += summary.count > 0
        if summary != activity.gap_summary:
            changes[activity.id] = summary
    if apply and changes:
        repository.set_gap_summaries(changes)
    return TrackGapBackfillSummary(
        activities=len(activities),
        updated=len(changes),
        unchanged=len(activities) - len(changes) - unavailable,
        with_gaps=with_gaps,
        unavailable_tracks=unavailable,
        applied=apply,
    )


def _explicit_data_root(data_root: str | Path) -> Path:
    if not str(data_root).strip():
        raise ValueError("--data-dir must not be empty")
    root = Path(data_root).expanduser().resolve()
    if root == Path(root.anchor) or not root.is_dir():
        raise ValueError("Selected TackBar data root is not a usable directory")
    return root


def format_summary(summary: TrackGapBackfillSummary) -> str:
    updated_label = "Activities updated" if summary.applied else "Activities to update"
    lines = [
        f"Activities: {summary.activities}",
        f"{updated_label}: {summary.updated}",
        f"Activities unchanged: {summary.unchanged}",
        f"Activities with gaps > 10 s: {summary.with_gaps}",
        f"Activities without a readable normalized track: {summary.unavailable_tracks}",
    ]
    if not summary.applied:
        lines.append("Dry-run: no runtime data changed. Re-run with --apply to write.")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Derive the Activity gap summary from stored canonical tracks. "
            "Dry-run is the default."
        ),
        epilog=RUNTIME_OWNER_GUIDANCE,
    )
    parser.add_argument("--data-dir", required=True, help="Explicit TackBar runtime data root")
    parser.add_argument("--apply", action="store_true", help="Write the derived gap summaries")
    args = parser.parse_args()
    try:
        summary = backfill_track_gaps(args.data_dir, apply=args.apply)
    except (OSError, ValueError) as error:  # includes preflight and JSON errors
        parser.exit(1, f"Gap summary backfill failed: {error}\n")
    print(format_summary(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
