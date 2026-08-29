from typing import Callable
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.admin_api_models import (
    AdminSailorDetailResponse,
    AdminSailorResponse,
    AdminSessionRenewRequest,
    AdminSessionResponse,
    AdminIngestionResponse,
    AdminMailboxReviewResponse,
)
from app.admin_auth import require_admin_key
from app.repositories.activities import ActivityRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.admin_reader import AdminDataIntegrityError, AdminReader
from app.services.sailor_consent import (
    ConsentTransitionError,
    SailorConsentService,
)
from app.services.session_capabilities import (
    SessionCapabilityIntegrityError,
    SessionCapabilityOperationError,
    SessionCapabilityService,
)
from app.services.session_lifetime import (
    SessionLifetimeOperationError,
    SessionLifetimeService,
)
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_processing import reprocess_ingestion
from app.repositories.boats import BoatRepository
from app.storage.ingestion_original_storage import IngestionOriginalStorage
from app.services.mailbox_review import MailboxReviewError, review_mailbox_now


router = APIRouter(
    prefix="/api/admin",
    dependencies=[Depends(require_admin_key)],
)


@router.get("/sailors", response_model=list[AdminSailorResponse])
def list_sailors() -> list[AdminSailorResponse]:
    try:
        return _admin_reader().list_sailors()
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error


@router.get("/sailors/{sailor_id}", response_model=AdminSailorDetailResponse)
def get_sailor(sailor_id: str) -> AdminSailorDetailResponse:
    try:
        sailor = _admin_reader().get_sailor(sailor_id)
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error
    if sailor is None:
        raise HTTPException(status_code=404, detail="Sailor not found")
    return sailor


@router.post(
    "/sailors/{sailor_id}/consent/requested",
    response_model=AdminSailorDetailResponse,
)
def mark_consent_requested(sailor_id: str) -> AdminSailorDetailResponse:
    return _perform_consent_action(
        sailor_id,
        lambda service: service.mark_consent_requested(
            sailor_id,
            source="admin_marked_consent_requested",
        ),
    )


@router.post(
    "/sailors/{sailor_id}/consent/confirm",
    response_model=AdminSailorDetailResponse,
)
def confirm_consent(sailor_id: str) -> AdminSailorDetailResponse:
    return _perform_consent_action(
        sailor_id,
        lambda service: service.confirm_consent(
            sailor_id,
            source="admin_confirmed_email",
        ),
    )


@router.post(
    "/sailors/{sailor_id}/consent/revoke",
    response_model=AdminSailorDetailResponse,
)
def revoke_consent(sailor_id: str) -> AdminSailorDetailResponse:
    return _perform_consent_action(
        sailor_id,
        lambda service: service.revoke_consent(
            sailor_id,
            source="admin_recorded_withdrawal",
        ),
    )


@router.post(
    "/sailors/{sailor_id}/consent/new-cycle",
    response_model=AdminSailorDetailResponse,
)
def start_new_consent_cycle(sailor_id: str) -> AdminSailorDetailResponse:
    return _perform_consent_action(
        sailor_id,
        lambda service: service.start_new_consent_cycle(
            sailor_id,
            source="admin_started_new_consent_cycle",
        ),
    )


@router.get("/sessions", response_model=list[AdminSessionResponse])
def list_sessions() -> list[AdminSessionResponse]:
    try:
        return _admin_reader().list_sessions()
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error


@router.get("/ingestions", response_model=list[AdminIngestionResponse])
def list_ingestions() -> list[AdminIngestionResponse]:
    try:
        records = IngestionHistory().records()
        return sorted((_ingestion_response(record) for record in records), key=lambda item: item.last_attempt_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    except ValueError as error:
        raise _admin_integrity_error() from error


@router.post("/ingestions/review-mailbox", response_model=AdminMailboxReviewResponse)
def review_mailbox() -> AdminMailboxReviewResponse:
    try:
        return AdminMailboxReviewResponse(**review_mailbox_now().__dict__)
    except ValueError as error:
        raise HTTPException(status_code=503, detail="Mailbox review unavailable") from error
    except MailboxReviewError as error:
        raise HTTPException(status_code=503, detail="Mailbox review unavailable") from error


@router.get("/ingestions/{ingestion_id}", response_model=AdminIngestionResponse)
def get_ingestion(ingestion_id: str) -> AdminIngestionResponse:
    try: record = IngestionHistory().get(ingestion_id)
    except ValueError as error: raise _admin_integrity_error() from error
    if record is None: raise HTTPException(status_code=404, detail="Ingestion not found")
    return _ingestion_response(record)


@router.post("/ingestions/{ingestion_id}/reprocess", response_model=AdminIngestionResponse)
def reprocess_admin_ingestion(ingestion_id: str) -> AdminIngestionResponse:
    history = IngestionHistory()
    if history.get(ingestion_id) is None: raise HTTPException(status_code=404, detail="Ingestion not found")
    try:
        record = reprocess_ingestion(ingestion_id, SailorRepository(), BoatRepository(), ActivityRepository(), SessionRepository(), history)
    except (FileNotFoundError, ValueError) as error:
        record = history.get(ingestion_id)
        if record is None: raise _admin_integrity_error() from error
    return _ingestion_response(record)


@router.get("/sessions/{session_id}", response_model=AdminSessionResponse)
def get_session(session_id: str) -> AdminSessionResponse:
    return _get_admin_session(session_id)


@router.post(
    "/sessions/{session_id}/renew",
    response_model=AdminSessionResponse,
)
def renew_session(
    session_id: str,
    request: AdminSessionRenewRequest | None = None,
) -> AdminSessionResponse:
    sessions = SessionRepository()
    try:
        if sessions.get_by_id(session_id) is None:
            raise HTTPException(status_code=404, detail="Session not found")
        SessionLifetimeService(sessions).renew_session(
            session_id,
            days=request.days if request is not None else 30,
        )
    except HTTPException:
        raise
    except SessionLifetimeOperationError as error:
        raise HTTPException(
            status_code=409,
            detail="Session renewal rejected",
        ) from error
    except ValueError as error:
        raise _admin_integrity_error() from error
    return _get_admin_session(session_id)


@router.post(
    "/sessions/{session_id}/capability/regenerate",
    response_model=AdminSessionResponse,
)
def regenerate_capability(session_id: str) -> AdminSessionResponse:
    sessions, activities, sailors = _repositories()
    try:
        if sessions.get_by_id(session_id) is None:
            raise HTTPException(status_code=404, detail="Session not found")
        SessionCapabilityService(
            sessions,
            activities,
            sailors,
        ).regenerate_capability(session_id)
    except HTTPException:
        raise
    except SessionCapabilityIntegrityError as error:
        raise _admin_integrity_error() from error
    except SessionCapabilityOperationError as error:
        raise HTTPException(
            status_code=409,
            detail="Capability operation rejected",
        ) from error
    except ValueError as error:
        raise _admin_integrity_error() from error
    return _get_admin_session(session_id)


@router.post(
    "/sessions/{session_id}/capability/revoke",
    response_model=AdminSessionResponse,
)
def revoke_capability(session_id: str) -> AdminSessionResponse:
    sessions, activities, sailors = _repositories()
    try:
        if sessions.get_by_id(session_id) is None:
            raise HTTPException(status_code=404, detail="Session not found")
        SessionCapabilityService(
            sessions,
            activities,
            sailors,
        ).revoke_capability(session_id)
    except HTTPException:
        raise
    except ValueError as error:
        raise _admin_integrity_error() from error
    return _get_admin_session(session_id)


def _perform_consent_action(
    sailor_id: str,
    action: Callable[[SailorConsentService], object],
) -> AdminSailorDetailResponse:
    sailors = SailorRepository()
    try:
        if sailors.get_by_id(sailor_id) is None:
            raise HTTPException(status_code=404, detail="Sailor not found")
        service = SailorConsentService(sailors, ConsentEventRepository())
        action(service)
    except HTTPException:
        raise
    except SessionCapabilityIntegrityError as error:
        raise _admin_integrity_error() from error
    except ConsentTransitionError as error:
        raise HTTPException(
            status_code=409,
            detail="Consent transition rejected",
        ) from error
    except ValueError as error:
        raise _admin_integrity_error() from error
    try:
        detail = _admin_reader().get_sailor(sailor_id)
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error
    if detail is None:
        raise _admin_integrity_error()
    return detail


def _get_admin_session(session_id: str) -> AdminSessionResponse:
    try:
        session = _admin_reader().get_session(session_id)
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _admin_reader() -> AdminReader:
    sessions, activities, sailors = _repositories()
    return AdminReader(
        sailors,
        ConsentEventRepository(),
        sessions,
        activities,
    )


def _repositories() -> tuple[
    SessionRepository,
    ActivityRepository,
    SailorRepository,
]:
    return SessionRepository(), ActivityRepository(), SailorRepository()


def _admin_integrity_error() -> HTTPException:
    return HTTPException(status_code=500, detail="Persisted Admin data is inconsistent")


def _ingestion_response(record: dict) -> AdminIngestionResponse:
    available = False
    if record["original_file"]:
        try: IngestionOriginalStorage().read(record["original_file"]); available = True
        except (FileNotFoundError, ValueError): pass
    return AdminIngestionResponse(**{key: record[key] for key in ("id", "provider", "provider_message_id", "sender_email", "received_at", "attachment_name", "status", "attempts", "last_attempt_at", "last_error", "activity_id", "session_id")}, original_available=available)
