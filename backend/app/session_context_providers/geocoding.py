import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Protocol
from urllib.parse import urlencode
from urllib.request import urlopen


GEOAPIFY_REVERSE_URL = "https://api.geoapify.com/v1/geocode/reverse"


@dataclass(frozen=True)
class GeographicContext:
    label: str | None
    region: str | None
    country: str | None
    country_code: str | None
    provider: str
    resolved_at: datetime


class GeocodingProvider(Protocol):
    def reverse(self, latitude: float, longitude: float) -> GeographicContext | None:
        """Return normalized coarse geographic context, or no usable result."""


def _get_json(url: str, timeout_seconds: float) -> object:
    with urlopen(url, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


class GeoapifyGeocodingProvider:
    def __init__(
        self,
        api_key: str,
        *,
        timeout_seconds: float = 5.0,
        clock: Callable[[], datetime] | None = None,
        http_get: Callable[[str, float], object] | None = None,
    ) -> None:
        if not api_key.strip():
            raise ValueError("Geoapify API key must not be blank")
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._http_get = http_get or _get_json

    def reverse(self, latitude: float, longitude: float) -> GeographicContext | None:
        query = urlencode({
            "lat": latitude,
            "lon": longitude,
            "lang": "es",
            "limit": 1,
            "format": "json",
            "apiKey": self._api_key,
        })
        payload = self._http_get(
            f"{GEOAPIFY_REVERSE_URL}?{query}",
            self._timeout_seconds,
        )
        if not isinstance(payload, dict):
            return None
        results = payload.get("results")
        if not isinstance(results, list) or not results or not isinstance(results[0], dict):
            return None
        result = results[0]
        city = _optional_text(result.get("city"))
        region = _optional_text(result.get("state"))
        country = _optional_text(result.get("country"))
        country_code = _optional_text(result.get("country_code"))
        if all(value is None for value in (city, region, country, country_code)):
            return None
        resolved_at = self._clock()
        if resolved_at.tzinfo is None or resolved_at.utcoffset() is None:
            raise ValueError("Geocoding clock must return timezone-aware time")
        return GeographicContext(
            label=city,
            region=region,
            country=country,
            country_code=country_code,
            provider="geoapify",
            resolved_at=resolved_at.astimezone(timezone.utc),
        )


def _optional_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None
