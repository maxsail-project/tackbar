import gzip
from pathlib import Path

import pandas as pd

from app.normalization.track_normalizer import (
    CANONICAL_TRACK_COLUMNS,
    normalize_track,
)
from app.parsers.vakaros_csv import parse_vakaros_csv


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)
ACTIVITY_ID = "4f17e0e1-4e36-4d4e-b059-a1a33fb1be2f"


def test_vakaros_track_normalizes_to_canonical_schema() -> None:
    source = pd.read_csv(FIXTURE_PATH, compression="gzip")
    source["timestamp"] = pd.to_datetime(source["timestamp"], utc=True)
    source = source.sort_values("timestamp").reset_index(drop=True)
    activity = parse_vakaros_csv(FIXTURE_PATH)

    normalized = normalize_track(ACTIVITY_ID, activity.samples)

    assert list(normalized.columns) == CANONICAL_TRACK_COLUMNS
    assert all(column == column.lower() for column in normalized.columns)
    assert normalized["activity_id"].eq(ACTIVITY_ID).all()
    assert len(normalized) == len(source) == len(activity.samples)

    normalized_timestamps = pd.to_datetime(
        normalized["utc"], utc=True, format="mixed"
    )
    assert normalized_timestamps.tolist() == source["timestamp"].tolist()
    assert normalized_timestamps.diff().tolist()[1:] == (
        source["timestamp"].diff().tolist()[1:]
    )

    mappings = {
        "lat": "latitude",
        "lon": "longitude",
        "cog": "cog",
        "sog": "sog_kts",
        "hdg": "hdg_true",
        "heel": "heel",
        "trim": "trim",
    }
    for normalized_column, source_column in mappings.items():
        assert normalized.iloc[0][normalized_column] == source.iloc[0][source_column]


def test_equivalent_csv_and_csv_gz_normalize_identically() -> None:
    compressed_activity = parse_vakaros_csv(FIXTURE_PATH)
    uncompressed_activity = parse_vakaros_csv(
        gzip.decompress(FIXTURE_PATH.read_bytes()),
        original_filename="vakaros-demo.csv",
    )

    compressed_track = normalize_track(
        ACTIVITY_ID,
        compressed_activity.samples,
    )
    uncompressed_track = normalize_track(
        ACTIVITY_ID,
        uncompressed_activity.samples,
    )

    assert len(compressed_track) == len(uncompressed_track) == 3613
    assert compressed_track.iloc[0]["utc"] == uncompressed_track.iloc[0]["utc"]
    assert compressed_track.iloc[-1]["utc"] == uncompressed_track.iloc[-1]["utc"]
    pd.testing.assert_frame_equal(uncompressed_track, compressed_track)


def test_distance_uses_each_pair_of_consecutive_points() -> None:
    normalized = normalize_track(
        ACTIVITY_ID,
        [
            {"utc": "2031-06-10T10:00:00Z", "lat": 0.0, "lon": 0.0},
            {"utc": "2031-06-10T10:00:01Z", "lat": 0.0, "lon": 0.001},
            {"utc": "2031-06-10T10:00:02Z", "lat": 0.0, "lon": 0.003},
        ],
    )

    assert normalized["dist"].iloc[0] == 0.0
    assert normalized["dist"].iloc[1] == 111.2
    assert normalized["dist"].iloc[2] == 222.39


def test_missing_optional_fields_remain_as_empty_canonical_columns() -> None:
    normalized = normalize_track(
        ACTIVITY_ID,
        [{"utc": "2031-06-10T10:00:00Z", "lat": 0.25, "lon": -30.75}],
    )

    assert list(normalized.columns) == CANONICAL_TRACK_COLUMNS
    for column in ("cog", "sog", "hdg", "heel", "trim"):
        assert pd.isna(normalized.iloc[0][column])
