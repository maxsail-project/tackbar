import re
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

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


def parse_vakaros_csv(
    source: str | Path | bytes | BinaryIO,
    original_filename: str | None = None,
) -> Activity:
    if isinstance(source, (str, Path)):
        csv_source: str | Path | BinaryIO = source
        filename = original_filename or Path(source).name
    else:
        if original_filename is None:
            raise ValueError(
                "original_filename is required when parsing Vakaros data from bytes"
            )
        csv_source = BytesIO(source) if isinstance(source, bytes) else source
        filename = original_filename

    frame = pd.read_csv(csv_source, compression="gzip")

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
        original_filename=filename,
        device_name=_extract_device_name(filename),
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
