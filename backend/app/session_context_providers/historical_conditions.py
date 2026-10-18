import json
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Callable, Protocol
from urllib.parse import urlencode
from urllib.request import urlopen

from app.models import (
    HistoricalConditions,
    HistoricalConditionsSample,
    HistoricalConditionsSource,
)


FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
RECENT_ARCHIVE_DAYS = 92
logger = logging.getLogger(__name__)

WEATHER_FIELDS = {
    "temperature_2m": "air_temperature_c",
    "wind_speed_10m": "wind_speed_10m_kn",
    "wind_direction_10m": "wind_direction_10m_deg",
    "wind_gusts_10m": "wind_gusts_10m_kn",
    "cloud_cover": "cloud_cover_pct",
}
MARINE_FIELDS = {
    "wave_height": "wave_height_m",
    "wave_direction": "wave_direction_deg",
    "wave_period": "wave_period_s",
}


class HistoricalConditionsProvider(Protocol):
    def fetch(
        self,
        latitude: float,
        longitude: float,
        coverage_start: datetime,
        coverage_end: datetime,
        session_end: datetime,
    ) -> HistoricalConditions | None:
        """Return a normalized hourly series; partial source availability is valid."""


def _get_json(url: str, timeout_seconds: float) -> object:
    with urlopen(url, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


class OpenMeteoHistoricalConditionsProvider:
    def __init__(
        self,
        *,
        timeout_seconds: float = 8.0,
        clock: Callable[[], datetime] | None = None,
        http_get: Callable[[str, float], object] | None = None,
    ) -> None:
        self._timeout_seconds = timeout_seconds
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._http_get = http_get or _get_json

    def fetch(
        self,
        latitude: float,
        longitude: float,
        coverage_start: datetime,
        coverage_end: datetime,
        session_end: datetime,
    ) -> HistoricalConditions | None:
        coverage_start = _utc(coverage_start)
        coverage_end = _utc(coverage_end)
        session_end = _utc(session_end)
        now = _utc(self._clock())
        recent = session_end >= now - timedelta(days=RECENT_ARCHIVE_DAYS)
        retrieved_at = now

        weather_url, weather_route = self._weather_request(
            latitude, longitude, coverage_start, coverage_end, recent
        )
        marine_url, marine_route = self._marine_request(
            latitude, longitude, coverage_start, coverage_end, recent
        )
        weather_source, weather_samples = self._attempt_source(
            weather_url,
            weather_route,
            WEATHER_FIELDS,
            coverage_start,
            coverage_end,
            retrieved_at,
        )
        marine_source, marine_samples = self._attempt_source(
            marine_url,
            marine_route,
            MARINE_FIELDS,
            coverage_start,
            coverage_end,
            retrieved_at,
        )
        if weather_source is None and marine_source is None:
            return None

        combined: dict[datetime, dict[str, float]] = {}
        for timestamp, values in (*weather_samples.items(), *marine_samples.items()):
            combined.setdefault(timestamp, {}).update(values)
        hourly = [
            HistoricalConditionsSample(time=timestamp, **combined[timestamp])
            for timestamp in sorted(combined)
        ]
        return HistoricalConditions(
            coverage_start=coverage_start,
            coverage_end=coverage_end,
            requested_latitude=float(latitude),
            requested_longitude=float(longitude),
            weather_source=weather_source,
            marine_source=marine_source,
            hourly=hourly,
        )

    def _attempt_source(
        self,
        url: str,
        route: str,
        field_map: dict[str, str],
        coverage_start: datetime,
        coverage_end: datetime,
        retrieved_at: datetime,
    ) -> tuple[HistoricalConditionsSource | None, dict[datetime, dict[str, float]]]:
        try:
            payload = self._http_get(url, self._timeout_seconds)
            source, samples = _normalize_source(
                payload,
                route,
                field_map,
                coverage_start,
                coverage_end,
                retrieved_at,
            )
            if source is None:
                logger.info("Open-Meteo %s returned no usable result", route)
            return source, samples
        except Exception:
            logger.warning("Open-Meteo %s request failed", route)
            return None, {}

    @staticmethod
    def _weather_request(
        latitude: float,
        longitude: float,
        start: datetime,
        end: datetime,
        recent: bool,
    ) -> tuple[str, str]:
        route = "forecast" if recent else "historical_weather"
        base_url = FORECAST_URL if recent else ARCHIVE_URL
        query = _base_query(latitude, longitude, start, end)
        query.update({
            "hourly": ",".join(WEATHER_FIELDS),
            "wind_speed_unit": "kn",
        })
        return f"{base_url}?{urlencode(query)}", route

    @staticmethod
    def _marine_request(
        latitude: float,
        longitude: float,
        start: datetime,
        end: datetime,
        recent: bool,
    ) -> tuple[str, str]:
        query = _base_query(latitude, longitude, start, end)
        query["hourly"] = ",".join(MARINE_FIELDS)
        route = "marine_best_match" if recent else "marine_era5_ocean"
        if not recent:
            query["models"] = "era5_ocean"
        return f"{MARINE_URL}?{urlencode(query)}", route


def _base_query(
    latitude: float,
    longitude: float,
    start: datetime,
    end: datetime,
) -> dict[str, object]:
    return {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start.date().isoformat(),
        "end_date": end.date().isoformat(),
        "timezone": "GMT",
        "cell_selection": "sea",
    }


def _normalize_source(
    payload: object,
    route: str,
    field_map: dict[str, str],
    coverage_start: datetime,
    coverage_end: datetime,
    retrieved_at: datetime,
) -> tuple[HistoricalConditionsSource | None, dict[datetime, dict[str, float]]]:
    if not isinstance(payload, dict):
        return None, {}
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
        return None, {}
    grid_latitude = _finite(payload.get("latitude"))
    grid_longitude = _finite(payload.get("longitude"))
    if grid_latitude is None or grid_longitude is None:
        return None, {}

    normalized: dict[datetime, dict[str, float]] = {}
    for index, raw_time in enumerate(hourly["time"]):
        timestamp = _provider_time(raw_time)
        if timestamp is None or not coverage_start <= timestamp <= coverage_end:
            continue
        values: dict[str, float] = {}
        for provider_name, normalized_name in field_map.items():
            series = hourly.get(provider_name)
            raw_value = series[index] if isinstance(series, list) and index < len(series) else None
            value = _finite(raw_value)
            if value is not None:
                values[normalized_name] = value
        if values:
            normalized[timestamp] = values
    if not normalized:
        return None, {}
    return HistoricalConditionsSource(
        provider="open-meteo",
        route=route,
        retrieved_at=retrieved_at,
        grid_latitude=grid_latitude,
        grid_longitude=grid_longitude,
    ), normalized


def _provider_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _finite(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Historical conditions times must be timezone-aware")
    return value.astimezone(timezone.utc)
