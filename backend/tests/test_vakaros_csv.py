from datetime import timezone
from pathlib import Path
from statistics import median

from app.parsers.vakaros_csv import REQUIRED_COLUMNS, parse_vakaros_csv


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
    assert set(activity.samples[0]) >= REQUIRED_COLUMNS
    assert activity.start_time == activity.samples[0]["timestamp"]
    assert activity.end_time == activity.samples[-1]["timestamp"]
    assert activity.start_time.tzinfo == timezone.utc
    assert activity.end_time.tzinfo == timezone.utc
    assert activity.start_lat == float(activity.samples[0]["latitude"])
    assert activity.start_lon == float(activity.samples[0]["longitude"])
    assert activity.end_lat == float(activity.samples[-1]["latitude"])
    assert activity.end_lon == float(activity.samples[-1]["longitude"])
    latitudes = [float(sample["latitude"]) for sample in activity.samples]
    longitudes = [float(sample["longitude"]) for sample in activity.samples]
    assert activity.center_lat == median(latitudes)
    assert activity.center_lon == median(longitudes)
    assert activity.min_lat == min(latitudes)
    assert activity.max_lat == max(latitudes)
    assert activity.min_lon == min(longitudes)
    assert activity.max_lon == max(longitudes)
    assert all(
        earlier["timestamp"] <= later["timestamp"]
        for earlier, later in zip(activity.samples, activity.samples[1:])
    )
