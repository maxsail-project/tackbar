import gzip
from datetime import timezone
from pathlib import Path
from statistics import median

from app.parsers.vakaros_csv import parse_vakaros_csv


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "VK-Maxi-URU 10-8-2026.csv.gz"
)


def test_parse_real_vakaros_csv_fixture() -> None:
    assert FIXTURE_PATH.exists(), (
        "Missing real Vakaros fixture. Place it at "
        f"{FIXTURE_PATH}"
    )

    activity = parse_vakaros_csv(FIXTURE_PATH)

    assert activity.source == "vakaros"
    assert activity.original_filename == FIXTURE_PATH.name
    assert activity.device_name == "VK-Maxi-URU"
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
        original_filename="VK-Maxi-URU 10-8-2026.CSV",
    )

    assert activity.source == "vakaros"
    assert activity.original_filename == "VK-Maxi-URU 10-8-2026.CSV"
    assert activity.device_name == "VK-Maxi-URU"
    assert len(activity.samples) == 3613
    assert activity.start_time == activity.samples[0]["utc"]
    assert activity.end_time == activity.samples[-1]["utc"]
