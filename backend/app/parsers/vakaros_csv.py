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

    gps_samples = frame[["latitude", "longitude"]].apply(
        pd.to_numeric,
        errors="coerce",
    )
    gps_samples = gps_samples[
        gps_samples["latitude"].between(-90, 90)
        & gps_samples["longitude"].between(-180, 180)
    ]
    if gps_samples.empty:
        raise ValueError("Vakaros CSV contains no valid GPS samples")

    first_sample = frame.iloc[0]
    last_sample = frame.iloc[-1]
    samples = pd.DataFrame(
        {
            "utc": frame["timestamp"],
            "lat": frame["latitude"],
            "lon": frame["longitude"],
            "cog": frame["cog"],
            "sog": frame["sog_kts"],
            "hdg": frame["hdg_true"],
            "heel": frame["heel"],
            "trim": frame["trim"],
        }
    )
    return Activity(
        source="vakaros",
        original_filename=filename,
        device_name=_extract_device_name(filename),
        start_time=frame.iloc[0]["timestamp"].to_pydatetime(),
        end_time=frame.iloc[-1]["timestamp"].to_pydatetime(),
        start_lat=float(first_sample["latitude"]),
        start_lon=float(first_sample["longitude"]),
        end_lat=float(last_sample["latitude"]),
        end_lon=float(last_sample["longitude"]),
        center_lat=float(gps_samples["latitude"].median()),
        center_lon=float(gps_samples["longitude"].median()),
        min_lat=float(gps_samples["latitude"].min()),
        max_lat=float(gps_samples["latitude"].max()),
        min_lon=float(gps_samples["longitude"].min()),
        max_lon=float(gps_samples["longitude"].max()),
        samples=samples.to_dict(orient="records"),
    )


def _extract_device_name(filename: str) -> str:
    name = filename
    if name.lower().endswith(".csv.gz"):
        name = name[:-7]

    return re.sub(r"\s+\d{1,2}-\d{1,2}-\d{4}$", "", name)
