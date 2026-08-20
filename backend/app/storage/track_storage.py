import re
from math import isfinite
from pathlib import Path
from uuid import UUID

import pandas as pd

from app.normalization.track_normalizer import (
    CANONICAL_TRACK_COLUMNS,
    OPTIONAL_SAMPLE_COLUMNS,
)
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

    def read_normalized_track(self, activity_id: str) -> pd.DataFrame:
        path = self.track_path(activity_id)
        if not path.is_file():
            raise FileNotFoundError(f"Normalized track does not exist: {path}")

        track = pd.read_csv(path, compression="gzip")
        if list(track.columns) != CANONICAL_TRACK_COLUMNS:
            raise ValueError(
                "Normalized track columns must exactly match the TackBar schema"
            )
        if track.empty:
            raise ValueError("Normalized track contains no samples")
        if not track["activity_id"].eq(activity_id).all():
            raise ValueError("Normalized track contains a different Activity id")

        _validate_utc(track["utc"])
        _validate_required_number(track["lat"], "lat", -90.0, 90.0)
        _validate_required_number(track["lon"], "lon", -180.0, 180.0)
        _validate_required_number(track["dist"], "dist", 0.0)
        for column in OPTIONAL_SAMPLE_COLUMNS:
            _validate_optional_number(track[column], column)
        return track


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


def _validate_utc(values: pd.Series) -> None:
    for value in values:
        if pd.isna(value):
            raise ValueError("Normalized track contains invalid utc values")
        try:
            timestamp = pd.Timestamp(value)
        except (TypeError, ValueError) as error:
            raise ValueError(
                "Normalized track contains invalid utc values"
            ) from error
        if pd.isna(timestamp) or timestamp.tzinfo is None:
            raise ValueError("Normalized track utc values must be timezone-aware")
        if timestamp.utcoffset().total_seconds() != 0:
            raise ValueError("Normalized track utc values must be UTC")


def _validate_required_number(
    values: pd.Series,
    field_name: str,
    minimum: float | None = None,
    maximum: float | None = None,
) -> None:
    numbers = pd.to_numeric(values, errors="coerce")
    if numbers.isna().any() or not numbers.map(isfinite).all():
        raise ValueError(
            f"Normalized track contains invalid {field_name} values"
        )
    if minimum is not None and not numbers.ge(minimum).all():
        raise ValueError(
            f"Normalized track contains invalid {field_name} values"
        )
    if maximum is not None and not numbers.le(maximum).all():
        raise ValueError(
            f"Normalized track contains invalid {field_name} values"
        )


def _validate_optional_number(values: pd.Series, field_name: str) -> None:
    present = values.notna()
    numbers = pd.to_numeric(values, errors="coerce")
    if numbers[present].isna().any() or not numbers[present].map(isfinite).all():
        raise ValueError(
            f"Normalized track contains invalid {field_name} values"
        )
