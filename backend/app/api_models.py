from datetime import datetime

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


class SharedSessionDetailResponse(BaseModel):
    start_time: datetime
    end_time: datetime
    activities: list[ActivityContextResponse]


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
