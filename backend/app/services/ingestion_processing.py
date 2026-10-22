import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from typing import Callable

from app.models import ConsentStatus, InboundEmail, Sailor, StoredActivity
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.activity_tracks import persist_activity_track
from app.services.automatic_consent_requests import AutomaticConsentRequestService
from app.services.consent_requests import ConsentRequestService
from app.services.email_ingestion import process_inbound_email
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_lock import ingestion_lock
from app.services.maneuver_analytics import get_or_generate_maneuver_analytics
from app.services.session_matcher import SessionMatchResult, match_activity_to_session
from app.services.session_enrichment import automatic_session_enrichment_service
from app.services.sailor_consent import SailorConsentService
from app.services.session_capabilities import SessionCapabilityService
from app.services.session_result_delivery import SessionResultDeliveryService
from app.storage.track_storage import TrackStorage
from app.storage.ingestion_original_storage import IngestionOriginalStorage
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage


logger = logging.getLogger(__name__)


@dataclass
class IngestionProcessingResult:
    sailor: Sailor
    sailor_created: bool
    activity: StoredActivity
    activity_created: bool
    session_match: SessionMatchResult


def process_provider_email(
    provider: str,
    email: InboundEmail,
    sailors: SailorRepository,
    boats: BoatRepository,
    activities: ActivityRepository,
    sessions: SessionRepository,
    history: IngestionHistory,
    track_storage: TrackStorage | None = None,
    consent_events: ConsentEventRepository | None = None,
    consent_request_sender: Callable[[str, str], None] | None = None,
    session_result_sender: Callable[[str, str, str], None] | None = None,
) -> IngestionProcessingResult | None:
    with ingestion_lock(history.path.parent):
        if not email.provider_message_id:
            raise ValueError("Inbound email is missing its provider message ID")
        if history.find_provider_message(provider, email.provider_message_id) is not None:
            return None
        digest = sha256(email.attachment_bytes).hexdigest() if email.attachment_bytes is not None else None
        record = history.create(provider, email.provider_message_id, email.sender_email, email.attachment_filename, digest)
        record["received_at"] = email.received_at.isoformat() if email.received_at else None
        history.replace(record)
        if email.attachment_bytes is not None and email.attachment_filename:
            original_storage = IngestionOriginalStorage(activities.path.parent)
            record["original_file"] = original_storage.preserve(record["id"], email.attachment_filename, email.attachment_bytes)
            history.replace(record)
        return _attempt_record(
            record,
            email,
            sailors,
            boats,
            activities,
            sessions,
            history,
            track_storage,
            consent_events,
            consent_request_sender,
            True,
            session_result_sender=session_result_sender,
        )


def reprocess_ingestion(
    ingestion_id: str,
    sailors: SailorRepository,
    boats: BoatRepository,
    activities: ActivityRepository,
    sessions: SessionRepository,
    history: IngestionHistory,
    track_storage: TrackStorage | None = None,
    consent_request_sender: Callable[[str, str], None] | None = None,
    session_result_sender: Callable[[str, str, str], None] | None = None,
) -> dict:
    with ingestion_lock(history.path.parent):
        record = history.get(ingestion_id)
        if record is None: raise ValueError(f"Ingestion not found: {ingestion_id}")
        establish_activity_creation_provenance = record["status"] != "processed"
        record["attempts"] += 1
        record["last_attempt_at"] = datetime.now(timezone.utc).isoformat()
        record["last_error"] = None
        record["status"] = "failed"
        history.replace(record)
        try:
            if not record["original_file"] or not record["attachment_name"] or not record["sender_email"]:
                raise FileNotFoundError("Preserved ingestion original is unavailable")
            content = IngestionOriginalStorage(activities.path.parent).read(record["original_file"])
            email = InboundEmail(sender_email=record["sender_email"], subject=record["attachment_name"], attachment_filename=record["attachment_name"], attachment_bytes=content, provider_message_id=record["provider_message_id"])
        except (ValueError, OSError, EOFError, FileNotFoundError) as error:
            record["last_error"] = _safe_error(error)
            history.replace(record)
        except Exception as error:
            record["last_error"] = _safe_error(error)
            history.replace(record)
            raise
        else:
            _attempt_record(
                record,
                email,
                sailors,
                boats,
                activities,
                sessions,
                history,
                track_storage,
                None,
                consent_request_sender,
                False,
                attempt_started=True,
                establish_activity_creation_provenance=establish_activity_creation_provenance,
                session_result_sender=session_result_sender,
            )
        updated = history.get(ingestion_id)
        if updated is None: raise ValueError("Ingestion disappeared after reprocessing")
        return updated


def _attempt_record(
    record,
    email,
    sailors,
    boats,
    activities,
    sessions,
    history,
    track_storage,
    consent_events,
    consent_request_sender,
    raise_errors,
    attempt_started=False,
    establish_activity_creation_provenance=True,
    session_result_sender=None,
):
    if not attempt_started:
        record["attempts"] += 1; record["last_attempt_at"] = datetime.now(timezone.utc).isoformat()
    record["last_error"] = None
    try:
        if email.attachment_bytes is None or sha256(email.attachment_bytes).hexdigest() != record["attachment_sha256"]: raise ValueError("Preserved ingestion original SHA-256 mismatch")
        result = _process_known_email(
            record["provider"],
            email,
            sailors,
            boats,
            activities,
            sessions,
            history,
            record,
            establish_activity_creation_provenance,
            track_storage,
            consent_events,
        )
        automatic_consent = _automatic_consent_requests(
            sailors,
            sessions,
            consent_events,
            consent_request_sender,
        )
        onboarding_reservation = _pending_onboarding_reservation(
            record,
            result,
            history,
            automatic_consent.requests,
            establish_activity_creation_provenance,
        )
        if (
            establish_activity_creation_provenance
            and record["session_result_notification_candidate"] is None
        ):
            record["session_result_notification_candidate"] = (
                record["activity_created_by_ingestion"] is True
                and result.sailor.consent_status == ConsentStatus.ACTIVE
            )
        record.update(status="processed", last_error=None, activity_id=result.activity.id, session_id=result.session_match.session.id)
        history.replace(record)
    except Exception as error:
        record.update(status="failed", last_error=_safe_error(error)); history.replace(record)
        if raise_errors or not isinstance(error, (ValueError, OSError, EOFError, FileNotFoundError)): raise
        return None
    # Core ingestion is authoritative before capability handling or outbound mail.
    session = SessionCapabilityService(sessions, activities, sailors).ensure_for_session(
        result.session_match.session.id
    )
    result.session_match.session = session
    automatic_consent.attempt_for_sailor(
        result.sailor.id,
        source=f"{record['provider']}_automatic_consent_request",
        onboarding_activity_id=(
            onboarding_reservation["activity_id"]
            if onboarding_reservation is not None else None
        ),
        onboarding_session_id=(
            onboarding_reservation["session_id"]
            if onboarding_reservation is not None else None
        ),
    )
    if (
        record["activity_created_by_ingestion"] is True
        and record["session_result_notification_candidate"] is True
    ):
        SessionResultDeliveryService(
            history, sailors, activities, sessions, sender=session_result_sender
        ).attempt_for_new_activity(record["id"])
    return result


def _safe_error(error: Exception) -> str:
    if isinstance(error, (ValueError, OSError, EOFError, FileNotFoundError)):
        message = str(error).replace("\\", "/")
        return message.rsplit("/", 1)[-1][:300]
    return "Unexpected ingestion processing error"


def _pending_onboarding_reservation(
    record: dict,
    result: IngestionProcessingResult,
    history: IngestionHistory,
    requests: ConsentRequestService,
    allow_creation: bool,
) -> dict | None:
    if result.sailor.consent_status != ConsentStatus.PENDING:
        return None
    cycle_sequence = requests.current_cycle_sequence(result.sailor.id)
    current_request = requests.find_current_for_sailor(result.sailor.id)
    existing = history.resolve_pending_onboarding_association(
        result.sailor.id,
        cycle_sequence,
        current_request,
    )
    if existing is not None:
        return existing
    if (
        not allow_creation
        or record["activity_created_by_ingestion"] is not True
        or result.sailor.consent_request_sent_at is not None
        or current_request is not None
    ):
        return None
    reservation = {
        "sailor_id": result.sailor.id,
        "consent_cycle_sequence": cycle_sequence,
        "activity_id": result.activity.id,
        "session_id": result.session_match.session.id,
    }
    record["pending_onboarding_reservation"] = reservation
    return reservation


def _automatic_consent_requests(
    sailors: SailorRepository,
    sessions: SessionRepository,
    consent_events: ConsentEventRepository | None,
    sender: Callable[[str, str], None] | None,
) -> AutomaticConsentRequestService:
    events = consent_events or ConsentEventRepository(
        sailors.path.with_name("consent_events.json")
    )
    requests = ConsentRequestService(
        ConsentRequestRepository(
            sailors.path.with_name("consent_requests.json")
        ),
        sailors,
        events,
        sessions,
    )
    return AutomaticConsentRequestService(
        requests,
        sailors,
        SailorConsentService(sailors, events),
        sender=sender,
    )


def _process_known_email(
    provider: str,
    email: InboundEmail,
    sailors: SailorRepository,
    boats: BoatRepository,
    activities: ActivityRepository,
    sessions: SessionRepository,
    history: IngestionHistory,
    record: dict,
    establish_activity_creation_provenance: bool,
    track_storage: TrackStorage | None = None,
    consent_events: ConsentEventRepository | None = None,
) -> IngestionProcessingResult:
    provider_message_id = email.provider_message_id
    if not provider_message_id:
        raise ValueError("Inbound email is missing its provider message ID")

    ingestion = process_inbound_email(email)
    sailor, sailor_created = sailors.find_or_create_by_email(
        ingestion.sender_email
    )
    if sailor.consent_status == ConsentStatus.REVOKED:
        event_repository = consent_events or ConsentEventRepository(
            sailors.path.with_name("consent_events.json")
        )
        sailor = SailorConsentService(
            sailors,
            event_repository,
        ).start_new_consent_cycle(
            sailor.id,
            source=f"{provider}_valid_track",
        )

    boat_id = sailor.default_boat_id
    if boat_id is not None and boats.get_by_id(boat_id) is None:
        raise ValueError(
            f"Sailor {sailor.id} references missing default Boat: {boat_id}"
        )

    if email.attachment_bytes is None:
        raise ValueError("Inbound email has no attachment bytes")

    stored_activity, created = activities.find_or_create(
        sailor.id,
        boat_id,
        ingestion.activity,
        email.attachment_bytes,
    )
    if (
        establish_activity_creation_provenance
        and record["activity_created_by_ingestion"] is None
    ):
        record["activity_created_by_ingestion"] = created
        history.replace(record)
    storage = track_storage or TrackStorage(activities.path.parent)
    stored_activity = persist_activity_track(
        stored_activity,
        ingestion.activity,
        email.attachment_bytes,
        activities,
        storage,
    )
    session_match = match_activity_to_session(
        stored_activity,
        activities,
        sessions,
    )
    if session_match.status == "created":
        automatic_session_enrichment_service(
            sessions,
            activities,
        ).enrich_new_session_context(session_match.session.id)
        refreshed_session = sessions.get_by_id(session_match.session.id)
        if refreshed_session is not None:
            session_match.session = refreshed_session
    _attempt_maneuver_analytics_generation(stored_activity.id, storage)
    return IngestionProcessingResult(
        sailor=sailor,
        sailor_created=sailor_created,
        activity=stored_activity,
        activity_created=created,
        session_match=session_match,
    )


def _attempt_maneuver_analytics_generation(
    activity_id: str,
    storage: TrackStorage,
) -> None:
    try:
        get_or_generate_maneuver_analytics(
            activity_id,
            storage,
            ManeuverAnalyticsStorage(storage.data_root),
        )
    except Exception:
        logger.warning(
            "Eager maneuver analytics generation failed for Activity %s",
            activity_id,
        )
