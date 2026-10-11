import gzip
from datetime import timezone
from pathlib import Path
from statistics import median

import pytest

from app.parsers.vakaros_csv import parse_vakaros_csv


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)


def test_parse_demo_vakaros_csv_fixture() -> None:
    assert FIXTURE_PATH.exists(), (
        "Missing public demo Vakaros fixture. Place it at "
        f"{FIXTURE_PATH}"
    )

    activity = parse_vakaros_csv(FIXTURE_PATH)

    assert activity.source == "vakaros"
    assert activity.original_filename == FIXTURE_PATH.name
    assert activity.device_name == "vakaros-demo"
    assert activity.samples
    assert set(activity.samples[0]) == {
        "utc",
        "lat",
        "lon",
        "cog",
        "sog",
        "hdg",
        "heel",
        "trim",
    }
    assert activity.start_time == activity.samples[0]["utc"]
    assert activity.end_time == activity.samples[-1]["utc"]
    assert activity.start_time.tzinfo == timezone.utc
    assert activity.end_time.tzinfo == timezone.utc
    assert activity.start_lat == float(activity.samples[0]["lat"])
    assert activity.start_lon == float(activity.samples[0]["lon"])
    assert activity.end_lat == float(activity.samples[-1]["lat"])
    assert activity.end_lon == float(activity.samples[-1]["lon"])
    latitudes = [float(sample["lat"]) for sample in activity.samples]
    longitudes = [float(sample["lon"]) for sample in activity.samples]
    assert activity.center_lat == median(latitudes)
    assert activity.center_lon == median(longitudes)
    assert activity.min_lat == min(latitudes)
    assert activity.max_lat == max(latitudes)
    assert activity.min_lon == min(longitudes)
    assert activity.max_lon == max(longitudes)
    assert all(
        earlier["utc"] <= later["utc"]
        for earlier, later in zip(activity.samples, activity.samples[1:])
    )


def test_parse_equivalent_uncompressed_vakaros_csv() -> None:
    csv_bytes = gzip.decompress(FIXTURE_PATH.read_bytes())

    activity = parse_vakaros_csv(
        csv_bytes,
        original_filename="vakaros-demo.CSV",
    )

    assert activity.source == "vakaros"
    assert activity.original_filename == "vakaros-demo.CSV"
    assert activity.device_name == "vakaros-demo"
    assert len(activity.samples) == 3613
    assert activity.start_time == activity.samples[0]["utc"]
    assert activity.end_time == activity.samples[-1]["utc"]


def test_parse_vakaros_csv_preserves_complete_quaternion_group() -> None:
    csv_bytes = (
        b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim,"
        b"q_w,q_x,q_y,q_z\n"
        b"2031-06-10T10:00:00Z,38.1,-0.2,5.2,359,1,-8,2,"
        b"0.5,0.1,-0.2,0.8\n"
    )

    activity = parse_vakaros_csv(
        csv_bytes,
        original_filename="quaternion.csv",
    )

    assert activity.samples[0] == {
        "utc": activity.start_time,
        "lat": 38.1,
        "lon": -0.2,
        "cog": 359,
        "sog": 5.2,
        "hdg": 1,
        "heel": -8,
        "trim": 2,
        "quat_w": 0.5,
        "quat_x": 0.1,
        "quat_y": -0.2,
        "quat_z": 0.8,
    }


def test_parse_vakaros_csv_rejects_partial_quaternion_group() -> None:
    csv_bytes = (
        b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim,q_w,q_x\n"
        b"2031-06-10T10:00:00Z,38.1,-0.2,5.2,359,1,-8,2,0.5,0.1\n"
    )

    with pytest.raises(ValueError, match="incomplete quaternion column group"):
        parse_vakaros_csv(csv_bytes, original_filename="partial.csv")


def test_quaternion_csv_and_csv_gz_parse_equivalently() -> None:
    csv_bytes = (
        b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim,"
        b"q_w,q_x,q_y,q_z\n"
        b"2031-06-10T10:00:00Z,38.1,-0.2,5.2,359,1,-8,2,"
        b"0.5,0.1,-0.2,0.8\n"
    )

    csv_activity = parse_vakaros_csv(
        csv_bytes,
        original_filename="quaternion.csv",
    )
    compressed_activity = parse_vakaros_csv(
        gzip.compress(csv_bytes),
        original_filename="quaternion.csv.gz",
    )

    assert compressed_activity.samples == csv_activity.samples
