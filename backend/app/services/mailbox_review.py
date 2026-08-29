from dataclasses import dataclass
from typing import Any

from app.email_providers.gmail import GmailAdapter
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.runtime_paths import require_private_data_root
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_processing import process_provider_email
from app.storage.track_storage import TrackStorage


class MailboxReviewError(RuntimeError):
    """Expected provider/configuration failure while reviewing a mailbox."""


@dataclass(frozen=True)
class MailboxReviewSummary:
    discovered_candidates: int
    processed: int
    skipped_already_processed: int
    known_failed: int
    failed: int


def review_mailbox_now(provider: Any | None = None) -> MailboxReviewSummary:
    require_private_data_root()
    adapter = provider or GmailAdapter()
    try:
        candidates = adapter.get_candidate_emails()
    except Exception as error:
        raise MailboxReviewError("Gmail mailbox review unavailable") from error

    history = IngestionHistory()
    sailors, boats = SailorRepository(), BoatRepository()
    activities, sessions = ActivityRepository(), SessionRepository()
    track_storage = TrackStorage()
    processed = skipped = known_failed = failed = 0
    for email in candidates:
        existing = history.find_provider_message("gmail", email.provider_message_id or "")
        if existing is not None:
            if existing["status"] == "processed":
                skipped += 1
            else:
                known_failed += 1
            continue
        try:
            result = process_provider_email("gmail", email, sailors, boats, activities, sessions, history, track_storage)
        except Exception:
            failed += 1
            continue
        if result is None:
            skipped += 1
        else:
            processed += 1
    return MailboxReviewSummary(len(candidates), processed, skipped, known_failed, failed)
