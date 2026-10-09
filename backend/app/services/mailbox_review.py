from dataclasses import dataclass
import logging
import os
from threading import Lock
import time
from typing import Any

from app.email_providers.gmail import GmailAdapter
from app.email_providers.ovh import (
    OVHAdapter,
    OVHMessageOutcome,
    OVHUIDValidityMismatch,
)
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.runtime_paths import require_private_data_root
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_processing import process_provider_email
from app.services.ovh_mailbox_cursor import (
    OVHMailboxCursor,
    OVHMailboxCursorStore,
)
from app.storage.track_storage import TrackStorage


logger = logging.getLogger(__name__)
_FAILURE_REMINDER_SECONDS = 60 * 60


@dataclass
class _ActiveCycleFailure:
    fingerprint: tuple[str, str, str, str]
    provider: str
    stage: str
    error_class: str
    reason: str
    last_emitted_at: float
    suppressed_since_reminder: int = 0
    total_suppressed: int = 0


class _CycleFailureLogSuppressor:
    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._active: _ActiveCycleFailure | None = None
        self._lock = Lock()

    def record_failure(
        self,
        provider: str,
        stage: str,
        error: Exception,
    ) -> None:
        error_class = type(error).__name__
        reason = _safe_failure_reason(error)
        fingerprint = (provider, stage, error_class, reason)
        now = self._clock()
        with self._lock:
            if (
                self._active is None
                or self._active.fingerprint != fingerprint
            ):
                self._active = _ActiveCycleFailure(
                    fingerprint,
                    provider,
                    stage,
                    error_class,
                    reason,
                    now,
                )
                logger.error(
                    "mailbox_review_cycle_failed provider=%s stage=%s "
                    "error_class=%s reason=%s",
                    provider,
                    stage,
                    error_class,
                    reason,
                )
                return

            self._active.suppressed_since_reminder += 1
            self._active.total_suppressed += 1
            if (
                now - self._active.last_emitted_at
                < _FAILURE_REMINDER_SECONDS
            ):
                return
            logger.warning(
                "mailbox_review_cycle_still_failing provider=%s stage=%s "
                "error_class=%s reason=%s suppressed_cycles=%d",
                provider,
                stage,
                error_class,
                reason,
                self._active.suppressed_since_reminder,
            )
            self._active.last_emitted_at = now
            self._active.suppressed_since_reminder = 0

    def record_success(self, provider: str) -> None:
        with self._lock:
            active = self._active
            self._active = None
            if active is None or active.total_suppressed == 0:
                return
            logger.info(
                "mailbox_review_cycle_recovered provider=%s "
                "previous_stage=%s suppressed_cycles=%d",
                provider,
                active.stage,
                active.total_suppressed,
            )


_cycle_failure_logs = _CycleFailureLogSuppressor()


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
    try:
        provider_key = _configured_provider_key()
    except Exception as error:
        _cycle_failure_logs.record_failure(
            "unknown", "configuration", error
        )
        raise
    try:
        adapter = (
            provider
            if provider is not None
            else _configured_provider(provider_key)
        )
    except Exception as error:
        _cycle_failure_logs.record_failure(
            provider_key, "configuration", error
        )
        raise
    ovh_batch = None
    cursor_store = None
    if provider_key == "ovh" and hasattr(adapter, "acquire_messages"):
        cursor_store = OVHMailboxCursorStore()
        try:
            cursor = cursor_store.load()
        except Exception as error:
            _cycle_failure_logs.record_failure(
                provider_key, "cursor_load", error
            )
            raise MailboxReviewError("Mailbox review unavailable") from error
        try:
            ovh_batch = adapter.acquire_messages(
                last_seen_uid=(
                    None if cursor is None else cursor.last_seen_uid
                ),
                expected_uidvalidity=(
                    None if cursor is None else cursor.uidvalidity
                ),
            )
            candidates = [
                item.candidate
                for item in ovh_batch.examined_messages
                if item.candidate is not None
            ]
        except Exception as error:
            _cycle_failure_logs.record_failure(
                provider_key, "acquisition", error
            )
            raise MailboxReviewError("Mailbox review unavailable") from error
    else:
        try:
            candidates = adapter.get_candidate_emails()
        except Exception as error:
            _cycle_failure_logs.record_failure(
                provider_key, "acquisition", error
            )
            raise MailboxReviewError("Mailbox review unavailable") from error

    history = IngestionHistory()
    sailors, boats = SailorRepository(), BoatRepository()
    activities, sessions = ActivityRepository(), SessionRepository()
    track_storage = TrackStorage()
    processed = skipped = known_failed = failed = 0
    unsupported = malformed = 0
    if ovh_batch is not None:
        for examined in ovh_batch.examined_messages:
            provider_message_id = (
                f"{ovh_batch.uidvalidity}:{examined.uid}"
            )
            if examined.outcome == OVHMessageOutcome.UNSUPPORTED:
                unsupported += 1
            elif examined.outcome == OVHMessageOutcome.MALFORMED:
                malformed += 1
            logger.info(
                "ovh_message_examined provider=ovh uid=%d "
                "provider_message_id=%s outcome=%s error_class=%s",
                examined.uid,
                provider_message_id,
                examined.outcome.value,
                examined.error_class or "none",
            )
    for email in candidates:
        message_id = email.provider_message_id or ""
        logged_message_id = _safe_logged_message_id(
            provider_key, message_id
        )
        if provider_key == "ovh":
            logger.info(
                "mailbox_message_processing_started provider=ovh "
                "provider_message_id=%s",
                logged_message_id,
            )
        existing = history.find_provider_message(provider_key, message_id)
        if existing is not None:
            if existing["status"] == "processed":
                skipped += 1
                outcome = "skipped_already_processed"
            else:
                known_failed += 1
                outcome = "skipped_known_failed"
            if provider_key == "ovh":
                logger.info(
                    "mailbox_message_processing_finished provider=ovh "
                    "provider_message_id=%s outcome=%s",
                    logged_message_id,
                    outcome,
                )
            continue
        try:
            result = process_provider_email(provider_key, email, sailors, boats, activities, sessions, history, track_storage)
        except Exception as error:
            failed += 1
            if provider_key == "ovh":
                logger.error(
                    "mailbox_message_processing_failed provider=ovh "
                    "provider_message_id=%s error_class=%s reason=%s",
                    logged_message_id,
                    type(error).__name__,
                    _safe_failure_reason(error),
                )
            continue
        if result is None:
            skipped += 1
            outcome = "skipped_already_processed"
        else:
            processed += 1
            outcome = "processed"
        if provider_key == "ovh":
            logger.info(
                "mailbox_message_processing_finished provider=ovh "
                "provider_message_id=%s outcome=%s",
                logged_message_id,
                outcome,
            )
    summary = MailboxReviewSummary(
        len(candidates), processed, skipped, known_failed, failed
    )
    examined_count = (
        len(ovh_batch.examined_messages)
        if ovh_batch is not None
        else len(candidates)
    )
    if ovh_batch is not None and cursor_store is not None:
        last_seen_uid = (
            ovh_batch.examined_messages[-1].uid
            if ovh_batch.examined_messages
            else (0 if cursor is None else cursor.last_seen_uid)
        )
        try:
            cursor_store.write(
                OVHMailboxCursor(ovh_batch.uidvalidity, last_seen_uid)
            )
        except Exception as error:
            _cycle_failure_logs.record_failure(
                provider_key, "cursor_write", error
            )
            raise MailboxReviewError("Mailbox review unavailable") from error
        if ovh_batch.acquisition_failed:
            _log_cycle_summary(
                provider_key,
                summary,
                examined_count,
                unsupported,
                malformed,
            )
            error = RuntimeError("mailbox acquisition failed")
            _cycle_failure_logs.record_failure(
                provider_key, "message_fetch", error
            )
            raise MailboxReviewError("Mailbox review unavailable")
    _cycle_failure_logs.record_success(provider_key)
    _log_cycle_summary(
        provider_key,
        summary,
        examined_count,
        unsupported,
        malformed,
    )
    return summary


def _log_cycle_summary(
    provider: str,
    summary: MailboxReviewSummary,
    examined: int,
    unsupported: int,
    malformed: int,
) -> None:
    if (
        examined
        or summary.processed
        or summary.skipped_already_processed
        or summary.known_failed
        or summary.failed
    ):
        logger.info(
            "mailbox_review_cycle_summary provider=%s examined=%d "
            "discovered_candidates=%d processed=%d "
            "skipped_already_processed=%d known_failed=%d failed=%d "
            "unsupported=%d malformed=%d",
            provider,
            examined,
            summary.discovered_candidates,
            summary.processed,
            summary.skipped_already_processed,
            summary.known_failed,
            summary.failed,
            unsupported,
            malformed,
        )
    else:
        logger.debug(
            "mailbox_review_cycle_summary provider=%s examined=0",
            provider,
        )


def _safe_failure_reason(error: Exception) -> str:
    if isinstance(error, OVHUIDValidityMismatch):
        return "uidvalidity_mismatch"
    if isinstance(error, PermissionError):
        return "permission_denied"
    if isinstance(error, FileNotFoundError):
        return "file_not_found"
    if isinstance(error, TimeoutError):
        return "timeout"
    if isinstance(error, ConnectionError):
        return "connection_failed"
    if isinstance(error, OSError):
        return "os_error"
    if isinstance(error, ValueError):
        return "invalid_value"
    if isinstance(error, MailboxReviewError):
        return "mailbox_unavailable"
    if isinstance(error, RuntimeError):
        return "operation_failed"
    return "unexpected_error"


def _safe_logged_message_id(provider: str, message_id: str) -> str:
    if provider != "ovh":
        return "unavailable"
    parts = message_id.split(":")
    if len(parts) == 2 and all(part.isdecimal() for part in parts):
        return message_id
    return "unavailable"
