from fastapi import FastAPI, HTTPException

from app.admin_routes import router as admin_router
from app.api_models import (
    ActivityTrackResponse,
    SharedSessionDetailResponse,
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
from app.services.session_capabilities import (
    SessionCapabilityIntegrityError,
    SessionCapabilityService,
)
from app.services.shared_session_reader import SharedSessionReader
from app.storage.track_storage import TrackStorage


app = FastAPI(title="TackBar API", version="0.1.0")
app.include_router(admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "tackbar",
    }


@app.get(
    "/api/shared/sessions/{token}",
    response_model=SharedSessionDetailResponse,
)
def get_shared_session(token: str) -> SharedSessionDetailResponse:
    try:
        session = _shared_session_reader().get_session(token)
    except (
        SessionDataIntegrityError,
        SessionCapabilityIntegrityError,
        ValueError,
    ) as error:
        raise _integrity_error() from error
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.get(
    "/api/shared/sessions/{token}/activities/{activity_id}/track",
    response_model=ActivityTrackResponse,
)
def get_shared_activity_track(token: str, activity_id: str) -> ActivityTrackResponse:
    try:
        track = _shared_session_reader().get_track(token, activity_id)
    except (
        ActivityTrackDataIntegrityError,
        SessionDataIntegrityError,
        SessionCapabilityIntegrityError,
        ValueError,
    ) as error:
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


def _shared_session_reader() -> SharedSessionReader:
    sessions = SessionRepository()
    activities = ActivityRepository()
    sailors = SailorRepository()
    return SharedSessionReader(
        SessionCapabilityService(sessions, activities, sailors),
        SessionReader(sessions, activities, sailors, BoatRepository()),
        ActivityTrackReader(activities, sailors, TrackStorage()),
    )


def _integrity_error() -> HTTPException:
    return HTTPException(
        status_code=500,
        detail="Persisted Session data is inconsistent",
    )
