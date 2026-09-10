from datetime import datetime

from pydantic import BaseModel


class PersonalSessionResponse(BaseModel):
    sailing_start: datetime
    sailing_end: datetime
    sailor_count: int
    session_path: str | None


class PersonalTackBarResponse(BaseModel):
    email: str
    name: str | None
    session_count: int
    last_sailing_end: datetime | None
    sessions: list[PersonalSessionResponse]
