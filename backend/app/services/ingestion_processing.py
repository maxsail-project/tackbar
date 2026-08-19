from dataclasses import dataclass

from app.models import InboundEmail, Participant, StoredActivity
from app.repositories.activities import ActivityRepository
from app.repositories.participants import ParticipantRepository
from app.repositories.sessions import SessionRepository
from app.services.activity_tracks import persist_activity_track
from app.services.email_ingestion import process_inbound_email
from app.services.ingestion_history import IngestionHistory
from app.services.session_matcher import SessionMatchResult, match_activity_to_session
from app.storage.track_storage import TrackStorage


@dataclass
class IngestionProcessingResult:
    participant: Participant
    participant_created: bool
    activity: StoredActivity
    activity_created: bool
    session_match: SessionMatchResult


def process_provider_email(
    provider: str,
    email: InboundEmail,
    participants: ParticipantRepository,
    activities: ActivityRepository,
    sessions: SessionRepository,
    history: IngestionHistory,
    track_storage: TrackStorage | None = None,
) -> IngestionProcessingResult | None:
    provider_message_id = email.provider_message_id
    if not provider_message_id:
        raise ValueError("Inbound email is missing its provider message ID")

    if history.is_processed(provider, provider_message_id):
        return None

    ingestion = process_inbound_email(email)
    participant, participant_created = participants.find_or_create_by_email(
        ingestion.sender_email
    )

    if email.attachment_bytes is None:
        raise ValueError("Inbound email has no attachment bytes")

    stored_activity, created = activities.find_or_create(
        participant.id,
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
    history.record_processed(provider, provider_message_id, stored_activity.id)

    return IngestionProcessingResult(
        participant=participant,
        participant_created=participant_created,
        activity=stored_activity,
        activity_created=created,
        session_match=session_match,
    )
