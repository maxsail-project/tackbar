import csv
import gzip
from pathlib import Path

import pandas as pd
import pytest

from app.normalization.track_normalizer import normalize_track
from app.storage.track_storage import TrackStorage


ACTIVITY_ID = "4f17e0e1-4e36-4d4e-b059-a1a33fb1be2f"


def test_original_bytes_are_archived_with_a_safe_filename(
    temporary_directory: Path,
) -> None:
    storage = TrackStorage(temporary_directory)
    original_bytes = b"exact original bytes"

    path = storage.archive_original(
        ACTIVITY_ID,
        "../../unsafe\\VK-Test.csv.gz",
        original_bytes,
    )

    assert path == (
        temporary_directory / "originals" / ACTIVITY_ID / "VK-Test.csv.gz"
    )
    assert path.read_bytes() == original_bytes
    assert path.resolve().is_relative_to(
        (temporary_directory / "originals").resolve()
    )


def test_identical_existing_original_is_reused(
    temporary_directory: Path,
) -> None:
    storage = TrackStorage(temporary_directory)
    original_bytes = b"same bytes"
    first_path = storage.archive_original(
        ACTIVITY_ID, "VK-Test.csv.gz", original_bytes
    )
    first_modified_time = first_path.stat().st_mtime_ns

    second_path = storage.archive_original(
        ACTIVITY_ID, "VK-Test.csv.gz", original_bytes
    )

    assert second_path == first_path
    assert second_path.stat().st_mtime_ns == first_modified_time
    assert second_path.read_bytes() == original_bytes


def test_different_existing_original_is_not_overwritten(
    temporary_directory: Path,
) -> None:
    storage = TrackStorage(temporary_directory)
    path = storage.archive_original(
        ACTIVITY_ID, "VK-Test.csv.gz", b"archived bytes"
    )

    with pytest.raises(ValueError, match="differs"):
        storage.archive_original(
            ACTIVITY_ID, "VK-Test.csv.gz", b"different bytes"
        )

    assert path.read_bytes() == b"archived bytes"


def test_normalized_track_is_written_as_csv_gz(
    temporary_directory: Path,
) -> None:
    storage = TrackStorage(temporary_directory)
    frame = normalize_track(
        ACTIVITY_ID,
        [{"utc": "2031-06-10T10:00:00Z", "lat": 0.25, "lon": -30.75}],
    )

    track_file = storage.write_normalized_track(ACTIVITY_ID, frame)

    assert track_file == f"tracks/{ACTIVITY_ID}.csv.gz"
    persisted = pd.read_csv(
        temporary_directory / track_file,
        compression="gzip",
    )
    assert list(persisted.columns) == list(frame.columns)
    assert persisted.iloc[0]["activity_id"] == ACTIVITY_ID
    assert persisted.iloc[0]["utc"] == "2031-06-10T10:00:00Z"
    assert persisted.iloc[0]["lat"] == 0.25
    assert persisted.iloc[0]["lon"] == -30.75
    assert persisted.iloc[0]["dist"] == 0.0
    assert persisted[["cog", "sog", "hdg", "heel", "trim"]].isna().all().all()


def test_persisted_distance_has_exactly_two_decimal_places(
    temporary_directory: Path,
) -> None:
    storage = TrackStorage(temporary_directory)
    frame = normalize_track(
        ACTIVITY_ID,
        [
            {"utc": "2031-06-10T10:00:00Z", "lat": 0.0, "lon": 0.0},
            {"utc": "2031-06-10T10:00:01Z", "lat": 0.0, "lon": 0.001},
            {"utc": "2031-06-10T10:00:02Z", "lat": 0.0, "lon": 0.003},
        ],
    )

    track_file = storage.write_normalized_track(ACTIVITY_ID, frame)

    with gzip.open(
        temporary_directory / track_file,
        mode="rt",
        encoding="utf-8",
        newline="",
    ) as normalized_csv:
        rows = list(csv.DictReader(normalized_csv))

    assert [row["dist"] for row in rows] == ["0.00", "111.20", "222.39"]


def test_track_storage_rejects_noncanonical_schema(
    temporary_directory: Path,
) -> None:
    storage = TrackStorage(temporary_directory)

    with pytest.raises(ValueError, match="exactly match"):
        storage.write_normalized_track(
            ACTIVITY_ID,
            pd.DataFrame({"utc": ["2031-06-10T10:00:00Z"]}),
        )
