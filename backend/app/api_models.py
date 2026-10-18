from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SailorContextResponse(BaseModel):
    id: str
    name: str | None
    email: str


class BoatContextResponse(BaseModel):
    id: str
    name: str | None
    sailing_class: str | None
    sail_number: str | None


class ActivityContextResponse(BaseModel):
    id: str
    source: str
    device_name: str
    original_filename: str
    start_time: datetime
    end_time: datetime
    sample_count: int
    sailor: SailorContextResponse
    boat: BoatContextResponse | None


class SessionSummaryResponse(BaseModel):
    id: str
    start_time: datetime
    end_time: datetime
    activity_count: int


class SessionDetailResponse(BaseModel):
    id: str
    start_time: datetime
    end_time: datetime
    activities: list[ActivityContextResponse]


class HistoricalConditionsSampleResponse(BaseModel):
    time: datetime
    air_temperature_c: float | None
    wind_speed_10m_kn: float | None
    wind_direction_10m_deg: float | None
    wind_gusts_10m_kn: float | None
    cloud_cover_pct: float | None
    wave_height_m: float | None
    wave_direction_deg: float | None
    wave_period_s: float | None


class HistoricalConditionsSourceResponse(BaseModel):
    provider: str


class HistoricalConditionsResponse(BaseModel):
    weather_source: HistoricalConditionsSourceResponse | None
    marine_source: HistoricalConditionsSourceResponse | None
    hourly: list[HistoricalConditionsSampleResponse]


class SharedSessionContentResponse(BaseModel):
    start_time: datetime
    end_time: datetime
    activities: list[ActivityContextResponse]
    location_label: str | None
    historical_conditions: HistoricalConditionsResponse | None


class SharedSessionDetailResponse(SharedSessionContentResponse):
    session_access_expires_at: datetime


class TemporarySessionShareResponse(BaseModel):
    path: str
    expires_at: datetime


class TemporarySharedSessionDetailResponse(SharedSessionContentResponse):
    temporary_access_expires_at: datetime


class TrackSampleResponse(BaseModel):
    utc: str
    lat: float
    lon: float
    cog: float | None
    sog: float | None
    dist: float
    hdg: float | None
    heel: float | None
    trim: float | None


class ActivityTrackResponse(BaseModel):
    activity_id: str
    samples: list[TrackSampleResponse]


class ManeuverResponse(BaseModel):
    start_time: str
    center_time: str
    end_time: str
    heading_change_deg: float
    peak_turn_rate_deg_s: float
    peak_turn_rate_time: str
    duration_s: float
    sog_entry_kn: float | None = None
    sog_min_kn: float | None = None
    sog_exit_kn: float | None = None
    recovery_time_s: float | None = None
    speed_loss_distance_m: float | None = None
    speed_loss_time_s: float | None = None


class ActivityManeuverAnalyticsResponse(BaseModel):
    activity_id: str
    status: Literal["available", "unavailable"]
    reason: str | None = None
    maneuvers: list[ManeuverResponse]
