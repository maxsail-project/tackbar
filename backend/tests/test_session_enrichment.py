import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, urlsplit

from app.config import GeoapifyConfigurationError, load_geoapify_api_key
from app.models import (
    HistoricalConditions,
    HistoricalConditionsSample,
    HistoricalConditionsSource,
)
from app.repositories.activities import ActivityRepository
from app.repositories.sessions import SessionRepository
from app.services.session_enrichment import (
    SessionEnrichmentService,
    automatic_session_enrichment_service,
)
from app.session_context_providers.geocoding import GeoapifyGeocodingProvider
from app.session_context_providers.historical_conditions import (
    OpenMeteoHistoricalConditionsProvider,
)


def _time(month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=timezone.utc)


def _activity(activity_id: str = "activity-a") -> dict[str, object]:
    return {
        "id": activity_id,
        "sailor_id": "sailor-a",
        "boat_id": None,
        "source": "vakaros",
        "device_name": "demo",
        "original_filename": "demo.csv.gz",
        "start_time": _time(10, 17, 10).isoformat(),
        "end_time": _time(10, 17, 12).isoformat(),
        "start_lat": 39.40,
        "start_lon": -0.30,
        "end_lat": 39.42,
        "end_lon": -0.28,
        "center_lat": 39.41,
        "center_lon": -0.29,
        "min_lat": 39.40,
        "max_lat": 39.42,
        "min_lon": -0.30,
        "max_lon": -0.28,
        "sample_count": 2,
        "attachment_sha256": "a" * 64,
    }


def _repositories(
    temporary_json_file: Callable[[str, object], Path],
) -> tuple[ActivityRepository, SessionRepository]:
    activities = ActivityRepository(
        temporary_json_file("context-activities", [_activity()])
    )
    sessions = SessionRepository(temporary_json_file("context-sessions", [{
        "id": "session-a",
        "activity_ids": ["activity-a"],
        "created_at": _time(10, 17, 13).isoformat(),
        "expires_at": _time(12, 17, 13).isoformat(),
        "capability_token": None,
        "capability_revoked": False,
    }]))
    return activities, sessions


def _source(route: str) -> HistoricalConditionsSource:
    return HistoricalConditionsSource(
        provider="open-meteo",
        route=route,
        retrieved_at=_time(10, 18, 10),
        grid_latitude=39.4,
        grid_longitude=-0.3,
    )


def test_session_persistence_reads_legacy_records_and_round_trips_context(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    activities, sessions = _repositories(temporary_json_file)
    legacy = sessions.get_by_id("session-a")
    assert legacy is not None
    assert legacy.location_label is None
    assert legacy.historical_conditions is None

    conditions = HistoricalConditions(
        coverage_start=_time(10, 17, 7),
        coverage_end=_time(10, 17, 15),
        requested_latitude=39.41,
        requested_longitude=-0.29,
        weather_source=_source("forecast"),
        marine_source=None,
        hourly=[HistoricalConditionsSample(
            time=_time(10, 17, 10),
            air_temperature_c=23.5,
            wind_speed_10m_kn=12.0,
        )],
    )
    sessions.replace(replace(
        legacy,
        location_label="Valencia",
        location_provider="geoapify",
        location_resolved_at=_time(10, 18, 10),
        location_source_activity_id="activity-a",
        historical_conditions=conditions,
    ))

    restarted = SessionRepository(sessions.path).get_by_id("session-a")
    assert restarted is not None
    assert restarted.location_label == "Valencia"
    assert restarted.historical_conditions == conditions
    persisted = json.loads(sessions.path.read_text(encoding="utf-8"))[0]
    assert persisted["historical_conditions"]["hourly"][0]["time"].endswith("+00:00")
    assert activities.get_by_id("activity-a") is not None


def test_geoapify_normalizes_only_first_result_city_without_city_filter() -> None:
    calls: list[str] = []

    def get(url: str, _timeout: float) -> object:
        calls.append(url)
        return {"results": [{
            "city": "  Mahón ",
            "state": "Illes Balears",
            "country": "España",
            "country_code": "es",
            "formatted": "credential-must-not-be-persisted",
        }]}

    provider = GeoapifyGeocodingProvider(
        "secret-key",
        clock=lambda: _time(10, 18, 9),
        http_get=get,
    )
    result = provider.reverse(39.889, 4.276)

    assert result is not None
    assert result.label == "Mahón"
    assert result.region == "Illes Balears"
    assert result.country == "España"
    assert result.country_code == "es"
    query = parse_qs(urlsplit(calls[0]).query)
    assert query["lang"] == ["es"]
    assert query["limit"] == ["1"]
    assert "type" not in query

    no_city = GeoapifyGeocodingProvider(
        "secret-key",
        http_get=lambda *_: {"results": [{"state": "Valencia", "country": "España"}]},
    )
    assert no_city.reverse(39.4, -0.3) is None


def test_geoapify_configuration_is_required_without_exposing_value() -> None:
    try:
        load_geoapify_api_key({})
    except GeoapifyConfigurationError as error:
        assert str(error) == "Geoapify is not configured"
    else:
        raise AssertionError("Missing configuration should be rejected")


def _open_meteo_payload(marine: bool = False) -> dict[str, object]:
    hourly: dict[str, object] = {
        "time": ["2026-10-17T06:00", "2026-10-17T07:00", "2026-10-17T08:00"],
    }
    if marine:
        hourly.update({
            "wave_height": [0.1, 0.2, None],
            "wave_direction": [260, 270, None],
            "wave_period": [3.1, 3.2, None],
        })
    else:
        hourly.update({
            "temperature_2m": [22, 23, 24],
            "wind_speed_10m": [10, 11, None],
            "wind_direction_10m": [20, 25, None],
            "wind_gusts_10m": [14, 15, None],
            "cloud_cover": [30, 40, None],
        })
    return {"latitude": 39.4, "longitude": -0.3, "hourly": hourly}


def test_open_meteo_routes_recent_requests_and_keeps_hourly_partial_values() -> None:
    calls: list[str] = []

    def get(url: str, _timeout: float) -> object:
        calls.append(url)
        return _open_meteo_payload("marine-api" in url)

    provider = OpenMeteoHistoricalConditionsProvider(
        clock=lambda: _time(10, 18, 12),
        http_get=get,
    )
    result = provider.fetch(
        39.41, -0.29,
        _time(10, 17, 6, 30), _time(10, 17, 8), _time(10, 17, 12),
    )

    assert result is not None
    assert len(calls) == 2
    assert calls[0].startswith("https://api.open-meteo.com/v1/forecast?")
    assert "wind_speed_unit=kn" in calls[0]
    assert "timezone=GMT" in calls[0]
    assert "cell_selection=sea" in calls[0]
    assert "models=" not in calls[1]
    assert result.weather_source is not None
    assert result.weather_source.route == "forecast"
    assert result.marine_source is not None
    assert result.marine_source.route == "marine_best_match"
    assert [sample.time for sample in result.hourly] == [
        _time(10, 17, 7), _time(10, 17, 8)
    ]
    assert result.hourly[0].wind_gusts_10m_kn == 15.0
    assert result.hourly[0].cloud_cover_pct == 40.0
    assert result.hourly[1].air_temperature_c == 24.0
    assert result.hourly[1].wave_height_m is None


def test_open_meteo_routes_older_requests_and_isolates_partial_source_failure() -> None:
    calls: list[str] = []

    def get(url: str, _timeout: float) -> object:
        calls.append(url)
        if "archive-api" in url:
            raise TimeoutError("weather unavailable")
        payload = _open_meteo_payload(marine=True)
        payload["hourly"]["time"] = ["2026-05-01T09:00"]
        payload["hourly"]["wave_height"] = [0.6]
        payload["hourly"]["wave_direction"] = [295]
        payload["hourly"]["wave_period"] = [3.4]
        return payload

    provider = OpenMeteoHistoricalConditionsProvider(
        clock=lambda: _time(10, 18, 12),
        http_get=get,
    )
    result = provider.fetch(
        39.89, 4.28,
        _time(5, 1, 8), _time(5, 1, 10), _time(5, 1, 10),
    )

    assert result is not None
    assert calls[0].startswith("https://archive-api.open-meteo.com/v1/archive?")
    assert "models=era5_ocean" in calls[1]
    assert result.weather_source is None
    assert result.marine_source is not None
    assert result.marine_source.route == "marine_era5_ocean"
    assert result.hourly[0].wave_height_m == 0.6
    assert result.hourly[0].air_temperature_c is None


def test_admin_enrichment_uses_session_center_and_plus_minus_three_hours(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    activities, sessions = _repositories(temporary_json_file)
    calls: list[tuple[float, float, datetime, datetime, datetime]] = []

    class Conditions:
        def fetch(self, latitude, longitude, coverage_start, coverage_end, session_end):
            calls.append((latitude, longitude, coverage_start, coverage_end, session_end))
            return HistoricalConditions(
                coverage_start=coverage_start,
                coverage_end=coverage_end,
                requested_latitude=latitude,
                requested_longitude=longitude,
                weather_source=_source("forecast"),
                marine_source=None,
                hourly=[HistoricalConditionsSample(time=_time(10, 17, 10), air_temperature_c=23)],
            )

    SessionEnrichmentService(
        sessions,
        activities,
        conditions=Conditions(),
    ).enrich_from_admin("session-a")

    assert calls == [(
        39.41, -0.29,
        _time(10, 17, 7), _time(10, 17, 15), _time(10, 17, 12),
    )]
    assert sessions.get_by_id("session-a").historical_conditions is not None


def test_geocoding_failure_isolated_and_automatic_path_has_no_conditions_provider(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    activities, sessions = _repositories(temporary_json_file)

    class FailingGeocoder:
        def reverse(self, _latitude, _longitude):
            raise TimeoutError("provider unavailable")

    SessionEnrichmentService(
        sessions,
        activities,
        geocoding=FailingGeocoder(),
    ).enrich_new_session_geography("session-a")

    persisted = sessions.get_by_id("session-a")
    assert persisted is not None
    assert persisted.location_label is None
    assert automatic_session_enrichment_service(sessions, activities).conditions is None


def test_admin_geography_failure_does_not_prevent_conditions_enrichment(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    activities, sessions = _repositories(temporary_json_file)

    class FailingGeocoder:
        def reverse(self, _latitude, _longitude):
            raise TimeoutError("geocoding unavailable")

    class Conditions:
        def fetch(self, latitude, longitude, coverage_start, coverage_end, _session_end):
            return HistoricalConditions(
                coverage_start=coverage_start,
                coverage_end=coverage_end,
                requested_latitude=latitude,
                requested_longitude=longitude,
                weather_source=_source("forecast"),
                marine_source=None,
                hourly=[HistoricalConditionsSample(time=_time(10, 17, 10), air_temperature_c=22)],
            )

    SessionEnrichmentService(
        sessions,
        activities,
        geocoding=FailingGeocoder(),
        conditions=Conditions(),
    ).enrich_from_admin("session-a")

    persisted = sessions.get_by_id("session-a")
    assert persisted is not None
    assert persisted.location_label is None
    assert persisted.historical_conditions is not None
