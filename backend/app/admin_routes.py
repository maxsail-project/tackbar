from typing import Callable, Literal
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from app.admin_api_models import (
    AdminActivityResponse,
    AdminActivitySummaryResponse,
    AdminManeuverStateResponse,
    AdminIngestionDetailResponse,
    AdminSailorDetailResponse,
    AdminSailorResponse,
    AdminSessionRenewRequest,
    AdminSessionResponse,
    AdminSessionSummaryResponse,
    AdminIngestionResponse,
    AdminMailboxReviewResponse,
    AdminMailFeedbackResponse,
)
from app.admin_auth import require_admin_key
from app.repositories.activities import ActivityRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.admin_reader import AdminDataIntegrityError, AdminReader
from app.services.admin_activities import AdminActivityReader
from app.services.admin_consent_requests import (
    AdminConsentRequestEligibilityError,
    AdminConsentRequestService,
)
from app.services.consent_requests import ConsentRequestService
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.sailor_consent import (
    ConsentTransitionError,
    SailorConsentService,
)
from app.services.welcome_email_resend import (
    WelcomeEmailResendEligibilityError,
    WelcomeEmailResendService,
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
from app.services.session_enrichment import admin_session_enrichment_service
from app.services.ingestion_history import ADMIN_UPLOAD, IngestionHistory
from app.services.manual_upload_worker import MAX_UPLOAD_BYTES, reconcile_manual_uploads
from app.services.ingestion_lock import ingestion_lock
from app.runtime_paths import require_private_data_root, runtime_paths
from app.services.ingestion_processing import reprocess_ingestion
from app.repositories.boats import BoatRepository
from app.storage.ingestion_original_storage import IngestionOriginalStorage
from app.services.mailbox_review import MailboxReviewError, review_mailbox_now
from app.services.mail_feedback import MailFeedbackEligibilityError, MailFeedbackService
from app.services.mail_receipts import MailReceiptStore


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
    "/sailors/{sailor_id}/consent/request/send",
    response_model=AdminSailorDetailResponse,
)
def send_consent_request(sailor_id: str) -> AdminSailorDetailResponse:
    sailors = SailorRepository()
    events = ConsentEventRepository()
    sessions = SessionRepository()
    try:
        if sailors.get_by_id(sailor_id) is None:
            raise HTTPException(status_code=404, detail="Sailor not found")
        requests = ConsentRequestService(
            ConsentRequestRepository(),
            sailors,
            events,
            sessions,
        )
        AdminConsentRequestService(
            requests,
            sailors,
            SailorConsentService(sailors, events),
        ).send(sailor_id)
    except HTTPException:
        raise
    except AdminConsentRequestEligibilityError as error:
        raise HTTPException(
            status_code=409,
            detail="Consent request delivery rejected",
        ) from error
    except ValueError as error:
        raise _admin_integrity_error() from error
    return get_sailor(sailor_id)


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


@router.post("/sailors/{sailor_id}/personal-capability/regenerate", response_model=AdminSailorDetailResponse)
def regenerate_personal_capability(sailor_id: str) -> AdminSailorDetailResponse:
    return _perform_personal_action(sailor_id, lambda service: service.regenerate_capability(sailor_id))


@router.post("/sailors/{sailor_id}/personal-capability/revoke", response_model=AdminSailorDetailResponse)
def revoke_personal_capability(sailor_id: str) -> AdminSailorDetailResponse:
    return _perform_personal_action(sailor_id, lambda service: service.revoke_capability(sailor_id))


@router.post(
    "/sailors/{sailor_id}/welcome-email/resend",
    response_model=AdminSailorDetailResponse,
)
def resend_welcome_email(sailor_id: str) -> AdminSailorDetailResponse:
    sailors = SailorRepository()
    try:
        if sailors.get_by_id(sailor_id) is None:
            raise HTTPException(status_code=404, detail="Sailor not found")
        WelcomeEmailResendService(sailors).resend(sailor_id)
    except HTTPException:
        raise
    except WelcomeEmailResendEligibilityError as error:
        raise HTTPException(
            status_code=409,
            detail="Welcome email resend rejected",
        ) from error
    except ValueError as error:
        raise _admin_integrity_error() from error
    return get_sailor(sailor_id)


def _perform_personal_action(sailor_id: str, action: Callable[[PersonalCapabilityService], object]) -> AdminSailorDetailResponse:
    sailors = SailorRepository()
    try:
        if sailors.get_by_id(sailor_id) is None:
            raise HTTPException(status_code=404, detail="Sailor not found")
        action(PersonalCapabilityService(sailors, SessionRepository()))
    except ValueError as error:
        raise _admin_integrity_error() from error
    return get_sailor(sailor_id)


@router.get("/sessions", response_model=list[AdminSessionSummaryResponse])
def list_sessions() -> list[AdminSessionSummaryResponse]:
    try:
        return _admin_reader().list_sessions()
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error


@router.get("/ingestions", response_model=list[AdminIngestionResponse])
def list_ingestions(
    status: Literal["all", "acquisition_failed", "pending", "processing", "processed", "failed"] = "all",
    disposition: Literal["all", "active", "discarded"] = "all",
) -> list[AdminIngestionResponse]:
    try:
        records = _ingestion_snapshot()
        def sort_key(item: AdminIngestionResponse) -> tuple[bool, datetime]:
            acquisition_time = item.received_at or item.accepted_at
            return (acquisition_time is not None, acquisition_time or item.last_attempt_at or datetime.min.replace(tzinfo=timezone.utc))
        with ingestion_lock(runtime_paths().root, blocking=False) as idle:
            responses = (_ingestion_response(record, resolve_context=idle) for record in records)
            return sorted((item for item in responses if (status == "all" or item.status == status) and (disposition == "all" or item.disposition == disposition)), key=sort_key, reverse=True)
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error


@router.post("/ingestions/upload", status_code=202, response_model=AdminIngestionResponse)
async def upload_track(
    request: Request,
    sailor_id: UUID,
    filename: str = Query(min_length=1, max_length=255),
) -> AdminIngestionResponse:
    """One raw file body; Sailor and filename are explicit query metadata.

    Streaming raw bytes avoids unbounded multipart parsing/spooling and requires
    no additional parser dependency. Unsupported/corrupt files remain auditable
    failed Ingestions after acceptance, per the manual-source contract.
    """
    if any(len(request.query_params.getlist(key)) != 1 for key in ("sailor_id", "filename")):
        raise HTTPException(status_code=400, detail="Exactly one Sailor and filename are required")
    if request.headers.get("content-type", "").lower().startswith("multipart/"):
        raise HTTPException(status_code=415, detail="Upload one file as the raw request body")
    declared = request.headers.get("content-length")
    if declared is not None:
        if not declared.isdecimal():
            raise HTTPException(status_code=400, detail="Invalid upload length")
        declared = declared.lstrip("0") or "0"
        if len(declared) > len(str(MAX_UPLOAD_BYTES)) or int(declared) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Upload exceeds 16 MiB")
    try:
        root = require_private_data_root()
    except ValueError as error:
        raise HTTPException(status_code=503, detail="Private upload storage is unavailable") from error
    worker = getattr(request.app.state, "manual_upload_worker", None)
    if worker is None or worker.root != root:
        raise HTTPException(status_code=503, detail="Manual upload worker is unavailable")
    content = bytearray()
    try:
        async for chunk in request.stream():
            if len(content) + len(chunk) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Upload exceeds 16 MiB")
            content.extend(chunk)
    except ClientDisconnect as error:
        raise HTTPException(status_code=400, detail="Upload was interrupted before acceptance") from error
    try:
        record = await run_in_threadpool(worker.accept, str(sailor_id), filename, bytes(content))
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Upload requires an existing ACTIVE Sailor and a safe filename") from error
    except OSError as error:
        raise HTTPException(status_code=503, detail="Upload could not be durably accepted") from error
    with ingestion_lock(root, blocking=False) as idle:
        return _ingestion_response(record, resolve_context=idle)


@router.post("/ingestions/review-mailbox", response_model=AdminMailboxReviewResponse)
def review_mailbox() -> AdminMailboxReviewResponse:
    try:
        return AdminMailboxReviewResponse(**review_mailbox_now().__dict__)
    except ValueError as error:
        raise HTTPException(status_code=503, detail="Mailbox review unavailable") from error
    except MailboxReviewError as error:
        raise HTTPException(status_code=503, detail="Mailbox review unavailable") from error


@router.get("/mail-receipts/ovh", response_model=list[AdminMailFeedbackResponse])
def list_ovh_mail_receipts() -> list[AdminMailFeedbackResponse]:
    try:
        receipts = MailReceiptStore(IngestionHistory().path).receipts()
    except ValueError as error:
        raise _admin_integrity_error() from error
    return [AdminMailFeedbackResponse(**receipt) for receipt in receipts if receipt["provider"] == "ovh"]


@router.get("/mail-receipts/ovh/{message_id}/feedback", response_model=AdminMailFeedbackResponse)
def get_mail_feedback(message_id: str) -> AdminMailFeedbackResponse:
    try:
        receipt = MailReceiptStore(IngestionHistory().path).get("ovh", message_id)
    except ValueError as error:
        raise _admin_integrity_error() from error
    if receipt is None:
        raise HTTPException(status_code=404, detail="Mail receipt not found")
    return AdminMailFeedbackResponse(**receipt)


@router.post("/mail-receipts/ovh/{message_id}/feedback/resend", response_model=AdminMailFeedbackResponse)
def resend_mail_feedback(message_id: str) -> AdminMailFeedbackResponse:
    history = IngestionHistory()
    try:
        receipt = MailFeedbackService(
            history, SailorRepository(), BoatRepository(), ActivityRepository(), SessionRepository(),
        ).resend(message_id)
    except MailFeedbackEligibilityError as error:
        raise HTTPException(status_code=409, detail="Mail feedback resend rejected") from error
    except ValueError as error:
        if str(error) == "Mail receipt not found":
            raise HTTPException(status_code=404, detail="Mail receipt not found") from error
        raise _admin_integrity_error() from error
    return AdminMailFeedbackResponse(**receipt)


@router.get("/ingestions/{ingestion_id}", response_model=AdminIngestionDetailResponse)
def get_ingestion(ingestion_id: str) -> AdminIngestionDetailResponse:
    try: record = next((item for item in _ingestion_snapshot() if item["id"] == ingestion_id), None)
    except ValueError as error: raise _admin_integrity_error() from error
    if record is None: raise HTTPException(status_code=404, detail="Ingestion not found")
    try:
        with ingestion_lock(runtime_paths().root, blocking=False) as idle:
            return _ingestion_detail_response(record, resolve_context=idle)
    except AdminDataIntegrityError as error:
        raise _admin_integrity_error() from error


@router.post("/ingestions/{ingestion_id}/reprocess", response_model=AdminIngestionResponse)
def reprocess_admin_ingestion(ingestion_id: str) -> AdminIngestionResponse:
    history = IngestionHistory()
    record = next((item for item in _ingestion_snapshot() if item["id"] == ingestion_id), None)
    if record is None: raise HTTPException(status_code=404, detail="Ingestion not found")
    if record["provider"] == ADMIN_UPLOAD and record["status"] in ("pending", "processing"):
        raise HTTPException(status_code=409, detail="Manual ingestion is pending or processing")
    try:
        record = reprocess_ingestion(ingestion_id, SailorRepository(), BoatRepository(), ActivityRepository(), SessionRepository(), history)
    except (FileNotFoundError, ValueError) as error:
        record = history.get(ingestion_id)
        if record is None: raise _admin_integrity_error() from error
    return _ingestion_response(record)


@router.post("/ingestions/{ingestion_id}/discard", response_model=AdminIngestionResponse)
def discard_ingestion(ingestion_id: str) -> AdminIngestionResponse:
    try:
        return _ingestion_response(IngestionHistory().set_disposition(ingestion_id, "discarded"))
    except ValueError as error:
        if "not found" in str(error):
            raise HTTPException(status_code=404, detail="Ingestion not found") from error
        raise _admin_integrity_error() from error


@router.post("/ingestions/{ingestion_id}/restore", response_model=AdminIngestionResponse)
def restore_ingestion(ingestion_id: str) -> AdminIngestionResponse:
    try:
        return _ingestion_response(IngestionHistory().set_disposition(ingestion_id, "active"))
    except ValueError as error:
        if "not found" in str(error):
            raise HTTPException(status_code=404, detail="Ingestion not found") from error
        raise _admin_integrity_error() from error


@router.get("/sessions/{session_id}", response_model=AdminSessionResponse)
def get_session(session_id: str) -> AdminSessionResponse:
    return _get_admin_session(session_id)


@router.post(
    "/sessions/{session_id}/enrich",
    response_model=AdminSessionResponse,
)
def enrich_session(session_id: str) -> AdminSessionResponse:
    sessions = SessionRepository()
    activities = ActivityRepository()
    if sessions.get_by_id(session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        admin_session_enrichment_service(
            sessions,
            activities,
        ).enrich_from_admin(session_id)
    except ValueError as error:
        raise _admin_integrity_error() from error
    return _get_admin_session(session_id)


@router.get("/activities", response_model=list[AdminActivitySummaryResponse])
def list_activities() -> list[AdminActivitySummaryResponse]:
    try:
        return AdminActivityReader().list_activities()
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error


@router.get("/activities/{activity_id}", response_model=AdminActivityResponse)
def get_activity(activity_id: str) -> AdminActivityResponse:
    try:
        activity = AdminActivityReader().get_activity(activity_id)
    except (ValueError, AdminDataIntegrityError) as error:
        raise _admin_integrity_error() from error
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


@router.post(
    "/activities/{activity_id}/maneuvers/recalculate",
    response_model=AdminManeuverStateResponse,
)
def recalculate_activity_maneuvers(activity_id: str) -> AdminManeuverStateResponse:
    try:
        state = AdminActivityReader().recalculate_maneuvers(activity_id)
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=409, detail="Maneuver recalculation unavailable") from error
    if state is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return state


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
            days=request.days if request is not None else 90,
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
        boats=BoatRepository(),
    )


def _repositories() -> tuple[
    SessionRepository,
    ActivityRepository,
    SailorRepository,
]:
    return SessionRepository(), ActivityRepository(), SailorRepository()


def _admin_integrity_error() -> HTTPException:
    return HTTPException(status_code=500, detail="Persisted Admin data is inconsistent")


def _ingestion_snapshot() -> list[dict]:
    try:
        reconcile_manual_uploads(runtime_paths().root)
        return IngestionHistory().snapshot()
    except OSError as error:
        raise HTTPException(status_code=503, detail="Ingestion state is unavailable") from error


def _ingestion_response(record: dict, *, resolve_context: bool = True) -> AdminIngestionResponse:
    available = False
    if record["original_file"]:
        try: IngestionOriginalStorage().read(record["original_file"]); available = True
        except (FileNotFoundError, ValueError): pass
    activity = None
    sailor_id = record.get("owner_sailor_id")
    sailor_label = None
    sailor_email = None
    sailor_consent_status = None
    lookup_sailor_id = sailor_id
    # Domain collections still use in-place JSON writes. Return durable ingestion
    # evidence immediately while a writer is active; optional resolved context is
    # unavailable until it can be read safely under the writer lock.
    busy = not resolve_context or (record["provider"] == ADMIN_UPLOAD and record["status"] in ("pending", "processing"))
    if record["activity_id"] is not None and not busy:
        activity = ActivityRepository().get_by_id(record["activity_id"])
        if activity is None:
            raise AdminDataIntegrityError("Ingestion references unknown Activity")
        if sailor_id is not None and sailor_id != activity.sailor_id:
            raise AdminDataIntegrityError("Manual ingestion ownership conflicts with Activity")
        lookup_sailor_id = activity.sailor_id
    if lookup_sailor_id is not None and not busy:
        sailor = SailorRepository().get_by_id(lookup_sailor_id)
        if sailor is not None:
            sailor_id = sailor.id
            sailor_label = sailor.name or sailor.email
            sailor_email = sailor.email
            sailor_consent_status = sailor.consent_status.value
    return AdminIngestionResponse(**{key: record[key] for key in ("id", "provider", "provider_message_id", "sender_email", "received_at", "attachment_name", "status", "disposition", "attempts", "last_attempt_at", "last_error", "activity_id", "session_id", "activity_created_by_ingestion")}, attachment_ordinal=record.get("attachment_ordinal"), attachment_ordinal_verified=record.get("attachment_ordinal_verified"), operation_id=record.get("operation_id"), owner_sailor_id=record.get("owner_sailor_id"), accepted_at=record.get("accepted_at"), sailor_id=sailor_id, sailor_label=sailor_label, sailor_email=sailor_email, sailor_consent_status=sailor_consent_status, original_available=available, activity_start_time=activity.start_time if activity else None, activity_end_time=activity.end_time if activity else None, activity_sample_count=activity.sample_count if activity else None)


def _ingestion_detail_response(record: dict, *, resolve_context: bool = True) -> AdminIngestionDetailResponse:
    summary = _ingestion_response(record, resolve_context=resolve_context)
    if resolve_context and record["activity_id"] is not None and summary.sailor_id is None:
        raise AdminDataIntegrityError("Activity references unknown Sailor")
    notification = record["session_result_notification"]
    diagnostic = {
        "id": record["id"],
        "provider": record["provider"],
        "provider_message_id": record["provider_message_id"],
        "sender_email": record["sender_email"],
        "received_at": record["received_at"],
        "attachment_name": record["attachment_name"],
        "attachment_ordinal": record.get("attachment_ordinal"),
        "attachment_ordinal_verified": record.get("attachment_ordinal_verified"),
        "attachment_sha256": record["attachment_sha256"],
        "status": record["status"],
        "disposition": record["disposition"],
        "attempts": record["attempts"],
        "last_attempt_at": record["last_attempt_at"],
        "last_error": record["last_error"],
        "activity_id": record["activity_id"],
        "session_id": record["session_id"],
        "activity_created_by_ingestion": record["activity_created_by_ingestion"],
        "session_result_notification_candidate": record["session_result_notification_candidate"],
        "session_result_notification": notification,
        "original_available": summary.original_available,
    }
    if record["provider"] == ADMIN_UPLOAD:
        diagnostic.update({key: record[key] for key in ("operation_id", "owner_sailor_id", "accepted_at")})
    return AdminIngestionDetailResponse(
        **summary.model_dump(),
        session_result_notification_candidate=record["session_result_notification_candidate"],
        session_result_notification=notification,
        attachment_sha256=record["attachment_sha256"],
        diagnostic=diagnostic,
    )
