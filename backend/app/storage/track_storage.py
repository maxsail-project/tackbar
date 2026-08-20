import re
from pathlib import Path
from uuid import UUID

import pandas as pd

from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS
from app.runtime_paths import runtime_paths


class TrackStorage:
    def __init__(self, data_root: str | Path | None = None) -> None:
        self.data_root = (
            runtime_paths().root if data_root is None else Path(data_root)
        )
        self.originals_root = self.data_root / "originals"
        self.tracks_root = self.data_root / "tracks"

    def archive_original(
        self,
        activity_id: str,
        original_filename: str,
        attachment_bytes: bytes,
    ) -> Path:
        path = self.original_path(activity_id, original_filename)
        path.parent.mkdir(parents=True, exist_ok=True)

        if path.exists():
            if path.read_bytes() != attachment_bytes:
                raise ValueError(
                    f"Archived original differs from received bytes: {path}"
                )
            return path

        try:
            with path.open("xb") as original_file:
                original_file.write(attachment_bytes)
        except FileExistsError:
            if path.read_bytes() != attachment_bytes:
                raise ValueError(
                    f"Archived original differs from received bytes: {path}"
                )
        return path

    def original_path(self, activity_id: str, original_filename: str) -> Path:
        safe_activity_id = _canonical_activity_id(activity_id)
        safe_filename = _safe_original_filename(original_filename)
        return self.originals_root / safe_activity_id / safe_filename

    def write_normalized_track(
        self,
        activity_id: str,
        normalized_track: pd.DataFrame,
    ) -> str:
        if list(normalized_track.columns) != CANONICAL_TRACK_COLUMNS:
            raise ValueError(
                "Normalized track columns must exactly match the TackBar schema"
            )
        relative_path = self.track_relative_path(activity_id)
        path = self.data_root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        persisted_track = normalized_track.copy()
        persisted_track["dist"] = persisted_track["dist"].map(
            lambda distance: f"{distance:.2f}"
        )
        persisted_track.to_csv(
            path,
            index=False,
            compression={"method": "gzip", "mtime": 0},
        )
        return relative_path

    def track_path(self, activity_id: str) -> Path:
        safe_activity_id = _canonical_activity_id(activity_id)
        return self.tracks_root / f"{safe_activity_id}.csv.gz"

    def track_relative_path(self, activity_id: str) -> str:
        safe_activity_id = _canonical_activity_id(activity_id)
        return f"tracks/{safe_activity_id}.csv.gz"


def _canonical_activity_id(activity_id: str) -> str:
    try:
        canonical = str(UUID(activity_id))
    except (ValueError, AttributeError) as error:
        raise ValueError(
            f"Invalid Activity id for track storage: {activity_id}"
        ) from error
    if activity_id.lower() != canonical:
        raise ValueError(f"Invalid Activity id for track storage: {activity_id}")
    return canonical


def _safe_original_filename(original_filename: str) -> str:
    basename = original_filename.replace("\\", "/").rsplit("/", 1)[-1]
    safe_filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", basename).strip(" .")
    if not safe_filename:
        raise ValueError("Original filename cannot be safely stored")
    return safe_filename
