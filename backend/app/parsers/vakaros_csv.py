from io import BytesIO
from math import isfinite
from pathlib import Path
from typing import BinaryIO

import pandas as pd

from app.models import Activity
from app.parsers.vakaros import (
    VAKAROS_CSV_SUFFIXES,
    extract_vakaros_device_name,
)


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
QUATERNION_COLUMNS = {
    "q_w": "quat_w",
    "q_x": "quat_x",
    "q_y": "quat_y",
    "q_z": "quat_z",
}


def has_vakaros_csv_suffix(value: str) -> bool:
    return value.lower().endswith(VAKAROS_CSV_SUFFIXES)


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

    frame = pd.read_csv(
        csv_source,
        compression=_compression_for_filename(filename),
    )

    missing_columns = sorted(REQUIRED_COLUMNS - set(frame.columns))
    if missing_columns:
        raise ValueError(
            "Vakaros CSV is missing required columns: "
            + ", ".join(missing_columns)
        )

    present_quaternion_columns = set(QUATERNION_COLUMNS) & set(frame.columns)
    if present_quaternion_columns and present_quaternion_columns != set(
        QUATERNION_COLUMNS
    ):
        missing_quaternion_columns = sorted(
            set(QUATERNION_COLUMNS) - present_quaternion_columns
        )
        raise ValueError(
            "Vakaros CSV has an incomplete quaternion column group; missing: "
            + ", ".join(missing_quaternion_columns)
        )

    if frame.empty:
        raise ValueError("Vakaros CSV contains no samples")

    if present_quaternion_columns:
        quaternion_columns = list(QUATERNION_COLUMNS)
        quaternion_values = frame[quaternion_columns].apply(
            pd.to_numeric,
            errors="coerce",
        )
        finite_values = quaternion_values.apply(
            lambda values: values.map(isfinite)
        )
        if quaternion_values.isna().any().any() or not finite_values.all().all():
            raise ValueError("Vakaros CSV contains invalid quaternion values")
        frame[quaternion_columns] = quaternion_values

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
    for source_column, canonical_column in QUATERNION_COLUMNS.items():
        if source_column in frame:
            samples[canonical_column] = frame[source_column]
    return Activity(
        source="vakaros",
        original_filename=filename,
        device_name=extract_vakaros_device_name(filename),
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


def _compression_for_filename(filename: str) -> str | None:
    if filename.lower().endswith(".csv.gz"):
        return "gzip"
    if filename.lower().endswith(".csv"):
        return None
    raise ValueError(
        "Vakaros input filename must end with .csv or .csv.gz"
    )
