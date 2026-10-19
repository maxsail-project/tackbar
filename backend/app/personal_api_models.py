from datetime import datetime

from pydantic import BaseModel


class PersonalWeatherResponse(BaseModel):
    air_temperature_c: float | None
    wind_speed_10m_kn: float | None
    wind_direction_10m_deg: float | None


class PersonalSessionResponse(BaseModel):
    sailing_start: datetime
    sailing_end: datetime
    sailor_count: int
    location_label: str | None
    weather: PersonalWeatherResponse | None
    session_path: str | None


class PersonalTackBarResponse(BaseModel):
    email: str
    name: str | None
    session_count: int
    last_sailing_end: datetime | None
    sessions: list[PersonalSessionResponse]
