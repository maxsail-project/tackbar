from datetime import timezone
from pathlib import Path

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
    assert all(
        earlier["timestamp"] <= later["timestamp"]
        for earlier, later in zip(activity.samples, activity.samples[1:])
    )
