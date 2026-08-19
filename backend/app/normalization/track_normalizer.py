import math
from collections.abc import Mapping, Sequence
from typing import Any

import pandas as pd


CANONICAL_TRACK_COLUMNS = [
    "activity_id",
    "utc",
    "lat",
    "lon",
    "cog",
    "sog",
    "dist",
    "hdg",
    "heel",
    "trim",
]
OPTIONAL_SAMPLE_COLUMNS = ["cog", "sog", "hdg", "heel", "trim"]
EARTH_RADIUS_METRES = 6_371_008.8


def normalize_track(
    activity_id: str,
    samples: Sequence[Mapping[str, Any]],
) -> pd.DataFrame:
    if not samples:
        raise ValueError("Cannot normalize a track without samples")

    frame = pd.DataFrame(samples)
    missing = [column for column in ("utc", "lat", "lon") if column not in frame]
    if missing:
        raise ValueError(
            "Parsed track samples are missing required fields: "
            + ", ".join(missing)
        )

    timestamps = pd.to_datetime(frame["utc"], utc=True, errors="raise")
    latitudes = pd.to_numeric(frame["lat"], errors="raise")
    longitudes = pd.to_numeric(frame["lon"], errors="raise")
    if timestamps.isna().any() or latitudes.isna().any() or longitudes.isna().any():
        raise ValueError("Parsed track samples contain null utc, lat or lon values")
    if not latitudes.between(-90, 90).all() or not longitudes.between(-180, 180).all():
        raise ValueError("Parsed track samples contain invalid WGS84 coordinates")

    normalized = pd.DataFrame(
        {
            "activity_id": [activity_id] * len(frame),
            "utc": timestamps.map(_format_utc),
            "lat": latitudes,
            "lon": longitudes,
        }
    )
    for column in OPTIONAL_SAMPLE_COLUMNS:
        normalized[column] = frame[column] if column in frame else pd.NA

    normalized["dist"] = [
        round(distance, 2)
        for distance in _consecutive_distances(latitudes, longitudes)
    ]
    return normalized[CANONICAL_TRACK_COLUMNS]


def _format_utc(value: pd.Timestamp) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _consecutive_distances(
    latitudes: pd.Series,
    longitudes: pd.Series,
) -> list[float]:
    distances = [0.0]
    for index in range(1, len(latitudes)):
        distances.append(
            _haversine_metres(
                float(latitudes.iloc[index - 1]),
                float(longitudes.iloc[index - 1]),
                float(latitudes.iloc[index]),
                float(longitudes.iloc[index]),
            )
        )
    return distances


def _haversine_metres(
    first_lat: float,
    first_lon: float,
    second_lat: float,
    second_lon: float,
) -> float:
    first_lat_radians = math.radians(first_lat)
    second_lat_radians = math.radians(second_lat)
    latitude_delta = math.radians(second_lat - first_lat)
    longitude_delta = math.radians(second_lon - first_lon)
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(first_lat_radians)
        * math.cos(second_lat_radians)
        * math.sin(longitude_delta / 2) ** 2
    )
    angular_distance = 2 * math.atan2(
        math.sqrt(haversine),
        math.sqrt(1 - haversine),
    )
    return EARTH_RADIUS_METRES * angular_distance
