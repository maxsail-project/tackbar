from datetime import datetime

from pydantic import BaseModel, ConfigDict, StrictBool, StrictStr

from app.api_models import BoatContextResponse


class PersonalWeatherResponse(BaseModel):
    air_temperature_c: float | None
    wind_speed_10m_kn: float | None
    wind_direction_10m_deg: float | None


class PersonalSessionResponse(BaseModel):
    sailing_start: datetime
    sailing_end: datetime
    sailor_count: int
    location_label: str | None
    location_country: str | None
    weather: PersonalWeatherResponse | None
    session_path: str | None


class PersonalTackBarResponse(BaseModel):
    email: str
    name: str | None
    session_count: int
    last_sailing_end: datetime | None
    sessions: list[PersonalSessionResponse]


class PersonalProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: StrictStr | None


class PersonalProfileResponse(BaseModel):
    name: str | None


class PersonalActivityResponse(BaseModel):
    id: str
    boat_id: str | None
    boat: BoatContextResponse | None
    device_name: str
    device_label: str | None
    source: str
    original_filename: str
    start_time: datetime
    end_time: datetime


class PersonalActivityContextPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    boat_id: str | None = None
    device_label: str | None = None


class PersonalBoatResponse(BaseModel):
    id: str
    name: str | None
    sailing_class: str | None
    sail_number: str | None


class PersonalBoatCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    sailing_class: str | None = None
    sail_number: str | None = None
    confirm_new_class: StrictBool = False


class PersonalBoatPatch(PersonalBoatCreate):
    pass


class PersonalDefaultBoatResponse(BaseModel):
    default_boat_id: str | None


class PersonalDefaultBoatPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    default_boat_id: str | None = None
