import re
from pathlib import Path

import pandas as pd

from app.models import Activity


REQUIRED_COLUMNS = {
    "timestamp",
    "latitude",
    "longitude",
    "sog_kts",
    "cog",
    "hdg_true",
    "heel",
    "trim",
}


def parse_vakaros_csv(file_path: str | Path) -> Activity:
    path = Path(file_path)
    frame = pd.read_csv(path, compression="gzip")

    missing_columns = sorted(REQUIRED_COLUMNS - set(frame.columns))
    if missing_columns:
        raise ValueError(
            "Vakaros CSV is missing required columns: "
            + ", ".join(missing_columns)
        )

    if frame.empty:
        raise ValueError("Vakaros CSV contains no samples")

    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    frame = frame.sort_values("timestamp").reset_index(drop=True)

    first_sample = frame.iloc[0]
    return Activity(
        source="vakaros",
        original_filename=path.name,
        device_name=_extract_device_name(path.name),
        start_time=frame.iloc[0]["timestamp"].to_pydatetime(),
        end_time=frame.iloc[-1]["timestamp"].to_pydatetime(),
        start_lat=float(first_sample["latitude"]),
        start_lon=float(first_sample["longitude"]),
        samples=frame.to_dict(orient="records"),
    )


def _extract_device_name(filename: str) -> str:
    name = filename
    if name.lower().endswith(".csv.gz"):
        name = name[:-7]

    return re.sub(r"\s+\d{1,2}-\d{1,2}-\d{4}$", "", name)
