from dataclasses import dataclass
import os
from typing import Any

from app.email_providers.gmail import GmailAdapter
from app.email_providers.ovh import OVHAdapter
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


def _configured_provider_key() -> str:
    provider_key = os.environ.get("TACKBAR_MAILBOX_PROVIDER", "gmail").strip().lower()
    if provider_key not in ("gmail", "ovh"):
        raise MailboxReviewError("Unsupported mailbox provider configuration")
    return provider_key


def _configured_provider(provider_key: str) -> Any:
    if provider_key == "gmail":
        return GmailAdapter()
    host = os.environ.get("TACKBAR_OVH_IMAP_HOST", "imap.mail.ovh.net").strip()
    port_text = os.environ.get("TACKBAR_OVH_IMAP_PORT", "993").strip()
    username = os.environ.get("TACKBAR_OVH_IMAP_USERNAME", "").strip()
    password = os.environ.get("TACKBAR_OVH_IMAP_PASSWORD", "")
    try:
        port = int(port_text)
    except ValueError as error:
        raise MailboxReviewError("Invalid OVH mailbox configuration") from error
    if not host or not username or not password.strip() or not 1 <= port <= 65535:
        raise MailboxReviewError("Incomplete OVH mailbox configuration")
    return OVHAdapter(host, port, username, password)


def review_mailbox_now(provider: Any | None = None) -> MailboxReviewSummary:
    require_private_data_root()
    provider_key = _configured_provider_key()
    adapter = provider if provider is not None else _configured_provider(provider_key)
    try:
        candidates = adapter.get_candidate_emails()
    except Exception as error:
        raise MailboxReviewError("Mailbox review unavailable") from error

    history = IngestionHistory()
    sailors, boats = SailorRepository(), BoatRepository()
    activities, sessions = ActivityRepository(), SessionRepository()
    track_storage = TrackStorage()
    processed = skipped = known_failed = failed = 0
    for email in candidates:
        existing = history.find_provider_message(provider_key, email.provider_message_id or "")
        if existing is not None:
            if existing["status"] == "processed":
                skipped += 1
            else:
                known_failed += 1
            continue
        try:
            result = process_provider_email(provider_key, email, sailors, boats, activities, sessions, history, track_storage)
        except Exception:
            failed += 1
            continue
        if result is None:
            skipped += 1
        else:
            processed += 1
    return MailboxReviewSummary(len(candidates), processed, skipped, known_failed, failed)
