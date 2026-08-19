"""Run the Gmail-to-Activity proof of concept."""

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.email_providers.gmail import GmailAdapter  # noqa: E402
from app.repositories.activities import ActivityRepository  # noqa: E402
from app.repositories.participants import ParticipantRepository  # noqa: E402
from app.repositories.sessions import SessionRepository  # noqa: E402
from app.services.ingestion_history import IngestionHistory  # noqa: E402
from app.services.ingestion_processing import (  # noqa: E402
    process_provider_email,
)
from app.storage.track_storage import TrackStorage  # noqa: E402


def main() -> None:
    emails = GmailAdapter().get_candidate_emails()
    history = IngestionHistory()
    participants = ParticipantRepository()
    activities = ActivityRepository()
    sessions = SessionRepository()
    track_storage = TrackStorage()

    if not emails:
        print("No unread Gmail messages with matching CSV.GZ attachments found.")
        return

    for email in emails:
        try:
            result = process_provider_email(
                provider="gmail",
                email=email,
                participants=participants,
                activities=activities,
                sessions=sessions,
                history=history,
                track_storage=track_storage,
            )
        except ValueError as error:
            print(f"Failed to process {email.attachment_filename}: {error}")
            continue

        if result is None:
            print(f"Skipped already processed Gmail message: {email.provider_message_id}")
            continue

        participant = result.participant
        activity = result.activity
        activity_status = "created" if result.activity_created else "already existed"

        participant_status = "created" if result.participant_created else "existing"
        print(f"Participant: {participant_status}")
        print(f"Participant id: {participant.id}")
        print(f"Participant name: {participant.name or '-'}")
        print(f"Boat: {participant.boat_name or '-'}")
        print(f"Class: {participant.sailing_class or '-'}")
        print(f"Sail number: {participant.sail_number or '-'}")
        print(f"Activity id: {activity.id}")
        print(f"Source: {activity.source}")
        print(f"Device: {activity.device_name}")
        print(f"Start time: {activity.start_time.isoformat()}")
        print(f"End time: {activity.end_time.isoformat()}")
        print(f"Start position: {activity.start_lat}, {activity.start_lon}")
        print(f"End position: {activity.end_lat}, {activity.end_lon}")
        print(f"Sample count: {activity.sample_count}")
        print(f"Track: {activity.track_file}")
        print(f"Activity: {activity_status}")
        print(f"Session id: {result.session_match.session.id}")
        print(f"Session activity count: {result.session_match.activity_count}")
        print(f"Session status: {result.session_match.status}")
        print()


if __name__ == "__main__":
    main()
