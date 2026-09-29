from fastapi import FastAPI, HTTPException, Response

from app.admin_routes import router as admin_router
from app.consent_api_models import PublicConsentResponse
from app.api_models import (
    ActivityTrackResponse,
    SharedSessionDetailResponse,
)
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
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
from app.personal_api_models import PersonalTackBarResponse
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.personal_reader import PersonalReader
from app.services.consent_requests import ConsentRequestService
from app.services.sailor_consent import SailorConsentService
from app.services.web_consent import (
    WebConsentService,
    WebConsentUnavailableError,
)


app = FastAPI(title="TackBar API", version="0.1.0")
app.include_router(admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "tackbar",
    }


@app.get(
    "/api/consent/{token}",
    response_model=PublicConsentResponse,
)
def get_consent(token: str, response: Response) -> PublicConsentResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        consent = _web_consent_service().get(token)
    except WebConsentUnavailableError as error:
        raise _consent_unavailable() from error
    except ValueError as error:
        raise _consent_integrity_error() from error
    return PublicConsentResponse(
        status=consent.state.value,
        agreement_version=consent.agreement_version,
        expires_at=consent.expires_at,
    )


@app.post(
    "/api/consent/{token}/accept",
    response_model=PublicConsentResponse,
)
def accept_consent(token: str, response: Response) -> PublicConsentResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        consent = _web_consent_service().accept(token)
    except WebConsentUnavailableError as error:
        raise _consent_unavailable() from error
    except (SessionCapabilityIntegrityError, ValueError) as error:
        raise _consent_integrity_error() from error
    return PublicConsentResponse(
        status=consent.state.value,
        agreement_version=consent.agreement_version,
        expires_at=consent.expires_at,
    )


@app.get("/api/me/{token}", response_model=PersonalTackBarResponse)
def get_personal_tackbar(token: str, response: Response) -> PersonalTackBarResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        sailors = SailorRepository()
        sessions = SessionRepository()
        personal = PersonalReader(
            PersonalCapabilityService(sailors, sessions), sailors, sessions,
            ActivityRepository(), _shared_session_reader(),
        ).get_personal(token)
    except (SessionDataIntegrityError, SessionCapabilityIntegrityError, ValueError) as error:
        raise HTTPException(status_code=500, detail="Persisted personal data is inconsistent",
                            headers={"Cache-Control": "no-store"}) from error
    if personal is None:
        raise HTTPException(status_code=404, detail="Personal TackBar not found",
                            headers={"Cache-Control": "no-store"})
    return personal


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


def _web_consent_service() -> WebConsentService:
    sailors = SailorRepository()
    events = ConsentEventRepository()
    requests = ConsentRequestService(
        ConsentRequestRepository(),
        sailors,
        events,
        SessionRepository(),
    )

    def activation_factory(agreement_version: str) -> SailorConsentService:
        sessions = SessionRepository()
        return SailorConsentService(
            sailors,
            events,
            agreement_version=agreement_version,
            session_capabilities=SessionCapabilityService(
                sessions,
                ActivityRepository(),
                sailors,
            ),
            personal_capabilities=PersonalCapabilityService(
                sailors,
                sessions,
            ),
        )

    return WebConsentService(requests, sailors, activation_factory)


def _integrity_error() -> HTTPException:
    return HTTPException(
        status_code=500,
        detail="Persisted Session data is inconsistent",
    )


def _consent_unavailable() -> HTTPException:
    return HTTPException(
        status_code=404,
        detail="Consent request unavailable",
        headers={"Cache-Control": "no-store"},
    )


def _consent_integrity_error() -> HTTPException:
    return HTTPException(
        status_code=500,
        detail="Persisted consent data is inconsistent",
        headers={"Cache-Control": "no-store"},
    )
