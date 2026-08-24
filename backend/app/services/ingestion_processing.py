from dataclasses import dataclass

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
    provider_message_id = email.provider_message_id
    if not provider_message_id:
        raise ValueError("Inbound email is missing its provider message ID")

    if history.is_processed(provider, provider_message_id):
        return None

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
    history.record_processed(provider, provider_message_id, stored_activity.id)

    return IngestionProcessingResult(
        sailor=sailor,
        sailor_created=sailor_created,
        activity=stored_activity,
        activity_created=created,
        session_match=session_match,
    )
