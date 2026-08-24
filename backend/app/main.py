from fastapi import FastAPI, HTTPException

from app.api_models import (
    ActivityTrackResponse,
    SessionDetailResponse,
    SessionSummaryResponse,
)
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.activity_track_reader import (
    ActivityTrackDataIntegrityError,
    ActivityTrackReader,
)
from app.services.session_reader import (
    SessionDataIntegrityError,
    SessionReader,
)
from app.storage.track_storage import TrackStorage


app = FastAPI(title="TackBar API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "tackbar",
    }


@app.get("/api/sessions", response_model=list[SessionSummaryResponse])
def list_sessions() -> list[SessionSummaryResponse]:
    try:
        return _session_reader().list_sessions()
    except SessionDataIntegrityError as error:
        raise _integrity_error() from error


@app.get("/api/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session(session_id: str) -> SessionDetailResponse:
    try:
        session = _session_reader().get_session(session_id)
    except SessionDataIntegrityError as error:
        raise _integrity_error() from error
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.get(
    "/api/activities/{activity_id}/track",
    response_model=ActivityTrackResponse,
)
def get_activity_track(activity_id: str) -> ActivityTrackResponse:
    try:
        track = _activity_track_reader().get_track(activity_id)
    except ActivityTrackDataIntegrityError as error:
        raise HTTPException(
            status_code=500,
            detail="Persisted Activity track data is inconsistent",
        ) from error
    if track is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return track


def _session_reader() -> SessionReader:
    return SessionReader(
        SessionRepository(),
        ActivityRepository(),
        SailorRepository(),
        BoatRepository(),
    )


def _activity_track_reader() -> ActivityTrackReader:
    return ActivityTrackReader(
        ActivityRepository(),
        SailorRepository(),
        TrackStorage(),
    )


def _integrity_error() -> HTTPException:
    return HTTPException(
        status_code=500,
        detail="Persisted Session data is inconsistent",
    )
