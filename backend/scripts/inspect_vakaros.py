"""Inspect the real Vakaros fixture and export normalized parser output."""

import json
import sys
from pathlib import Path

import pandas as pd


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.parsers.vakaros_csv import parse_vakaros_csv  # noqa: E402


FIXTURE_PATH = (
    BACKEND_DIR / "tests" / "fixtures" / "VK-Maxi-URU 10-8-2026.csv.gz"
)
OUTPUT_DIR = BACKEND_DIR / "tmp"
SUMMARY_PATH = OUTPUT_DIR / "activity-summary.json"
NORMALIZED_CSV_PATH = OUTPUT_DIR / "activity-normalized.csv"


def main() -> None:
    if not FIXTURE_PATH.exists():
        raise FileNotFoundError(f"Vakaros fixture not found: {FIXTURE_PATH}")

    activity = parse_vakaros_csv(FIXTURE_PATH)
    samples = pd.DataFrame(activity.samples)
    summary = {
        "source": activity.source,
        "original_filename": activity.original_filename,
        "device_name": activity.device_name,
        "start_time": activity.start_time.isoformat(),
        "end_time": activity.end_time.isoformat(),
        "start_lat": activity.start_lat,
        "start_lon": activity.start_lon,
        "sample_count": len(activity.samples),
        "sample_columns": list(samples.columns),
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    samples.to_csv(NORMALIZED_CSV_PATH, index=False)

    print(f"JSON summary: {SUMMARY_PATH}")
    print(f"Normalized CSV: {NORMALIZED_CSV_PATH}")


if __name__ == "__main__":
    main()
