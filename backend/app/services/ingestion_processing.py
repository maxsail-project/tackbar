from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from threading import Lock

from app.models import ConsentStatus, InboundEmail, Sailor, StoredActivity
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.activity_tracks import persist_activity_track
from app.services.email_ingestion import process_inbound_email
from app.services.ingestion_history import IngestionHistory
from app.services.session_matcher import SessionMatchResult, match_activity_to_session
from app.services.sailor_consent import SailorConsentService
from app.services.session_capabilities import SessionCapabilityService
from app.storage.track_storage import TrackStorage
from app.storage.ingestion_original_storage import IngestionOriginalStorage


_INGESTION_LOCK = Lock()


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
) -> IngestionProcessingResult | None:
    with _INGESTION_LOCK:
        if not email.provider_message_id:
            raise ValueError("Inbound email is missing its provider message ID")
        if history.find_provider_message(provider, email.provider_message_id) is not None:
            return None
        digest = sha256(email.attachment_bytes).hexdigest() if email.attachment_bytes is not None else None
        record = history.create(provider, email.provider_message_id, email.sender_email, email.attachment_filename, digest)
        if email.attachment_bytes is not None and email.attachment_filename:
            original_storage = IngestionOriginalStorage(activities.path.parent)
            record["original_file"] = original_storage.preserve(record["id"], email.attachment_filename, email.attachment_bytes)
            history.replace(record)
        return _attempt_record(record, email, sailors, boats, activities, sessions, history, track_storage, consent_events, True)


def reprocess_ingestion(
    ingestion_id: str,
    sailors: SailorRepository,
    boats: BoatRepository,
    activities: ActivityRepository,
    sessions: SessionRepository,
    history: IngestionHistory,
    track_storage: TrackStorage | None = None,
) -> dict:
    with _INGESTION_LOCK:
        record = history.get(ingestion_id)
        if record is None: raise ValueError(f"Ingestion not found: {ingestion_id}")
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
            _attempt_record(record, email, sailors, boats, activities, sessions, history, track_storage, None, False, attempt_started=True)
        except (ValueError, OSError, EOFError, FileNotFoundError) as error:
            record["last_error"] = _safe_error(error)
            history.replace(record)
        except Exception as error:
            record["last_error"] = _safe_error(error)
            history.replace(record)
            raise
        updated = history.get(ingestion_id)
        if updated is None: raise ValueError("Ingestion disappeared after reprocessing")
        return updated


def _attempt_record(record, email, sailors, boats, activities, sessions, history, track_storage, consent_events, raise_errors, attempt_started=False):
    if not attempt_started:
        record["attempts"] += 1; record["last_attempt_at"] = datetime.now(timezone.utc).isoformat()
    record["last_error"] = None
    try:
        if email.attachment_bytes is None or sha256(email.attachment_bytes).hexdigest() != record["attachment_sha256"]: raise ValueError("Preserved ingestion original SHA-256 mismatch")
        result = _process_known_email(record["provider"], email, sailors, boats, activities, sessions, history, track_storage, consent_events)
        record.update(status="processed", last_error=None, activity_id=result.activity.id, session_id=result.session_match.session.id)
        history.replace(record); return result
    except Exception as error:
        record.update(status="failed", last_error=_safe_error(error)); history.replace(record)
        if raise_errors or not isinstance(error, (ValueError, OSError, EOFError, FileNotFoundError)): raise
        return None


def _safe_error(error: Exception) -> str:
    if isinstance(error, (ValueError, OSError, EOFError, FileNotFoundError)):
        message = str(error).replace("\\", "/")
        return message.rsplit("/", 1)[-1][:300]
    return "Unexpected ingestion processing error"


def _process_known_email(
    provider: str,
    email: InboundEmail,
    sailors: SailorRepository,
    boats: BoatRepository,
    activities: ActivityRepository,
    sessions: SessionRepository,
    history: IngestionHistory,
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
    SessionCapabilityService(sessions, activities, sailors).ensure_for_session(
        session_match.session.id
    )
    refreshed_session = sessions.get_by_id(session_match.session.id)
    if refreshed_session is None:
        raise ValueError("Matched Session disappeared from persistence")
    session_match.session = refreshed_session
    return IngestionProcessingResult(
        sailor=sailor,
        sailor_created=sailor_created,
        activity=stored_activity,
        activity_created=created,
        session_match=session_match,
    )
