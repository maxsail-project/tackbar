"""Run the Gmail-to-Activity proof of concept."""

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.email_providers.gmail import GmailAdapter  # noqa: E402
from app.repositories.activities import ActivityRepository  # noqa: E402
from app.repositories.boats import BoatRepository  # noqa: E402
from app.repositories.sailors import SailorRepository  # noqa: E402
from app.repositories.sessions import SessionRepository  # noqa: E402
from app.runtime_paths import require_private_data_root  # noqa: E402
from app.services.ingestion_history import IngestionHistory  # noqa: E402
from app.services.ingestion_processing import (  # noqa: E402
    process_provider_email,
)
from app.storage.track_storage import TrackStorage  # noqa: E402


def main() -> None:
    require_private_data_root()
    emails = GmailAdapter().get_candidate_emails()
    history = IngestionHistory()
    sailors = SailorRepository()
    boats = BoatRepository()
    activities = ActivityRepository()
    sessions = SessionRepository()
    track_storage = TrackStorage()

    if not emails:
        print(
            "No unread Gmail messages with matching Vakaros CSV "
            "attachments found."
        )
        return

    for email in emails:
        try:
            result = process_provider_email(
                provider="gmail",
                email=email,
                sailors=sailors,
                boats=boats,
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

        sailor = result.sailor
        activity = result.activity
        boat = (
            boats.get_by_id(activity.boat_id)
            if activity.boat_id is not None
            else None
        )
        activity_status = "created" if result.activity_created else "already existed"

        sailor_status = "created" if result.sailor_created else "existing"
        print(f"Sailor: {sailor_status}")
        print(f"Sailor id: {sailor.id}")
        print(f"Sailor email: {sailor.email}")
        print(f"Sailor name: {sailor.name or '-'}")
        print(f"Boat: {boat.name if boat and boat.name else '-'}")
        print(f"Class: {boat.sailing_class if boat and boat.sailing_class else '-'}")
        print(f"Sail number: {boat.sail_number if boat and boat.sail_number else '-'}")
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
