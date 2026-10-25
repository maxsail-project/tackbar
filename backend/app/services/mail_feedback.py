"""Internal per-mail feedback. The production mailbox trigger does not call this."""

from dataclasses import dataclass
from email.utils import parseaddr
from typing import Callable
from unicodedata import category

from app.config import configured_public_base_url
from app.email_providers.ovh import OVHAdapter
from app.models import ConsentEventType, ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_lock import ingestion_lock
from app.services.ingestion_processing import _automatic_consent_requests, process_staged_ingestion
from app.services.mail_feedback_email import compose_results_email, compose_technical_email
from app.services.mail_receipts import MailReceiptStore
from app.services.outbound_mail import OutboundMailError, OutboundMailMessage, OutboundMailUncertainError, OvhSmtpTransport
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.session_capabilities import SessionCapabilityService
from app.services.session_reader import SessionDataIntegrityError, SessionReader
from app.services.staged_mail_acquisition import recover_unattempted_ingestions, stage_ovh_mailbox_now


FeedbackSender = Callable[[OutboundMailMessage], None]


class MailFeedbackEligibilityError(ValueError):
    """Current state does not permit an explicit mail-feedback resend."""


def _send(message: OutboundMailMessage) -> None:
    OvhSmtpTransport.from_environment().send(message)


def _safe_sender(value: object) -> str | None:
    if not isinstance(value, str) or not value or value.count("@") != 1:
        return None
    if any(category(char).startswith("C") or char.isspace() for char in value):
        return None
    return value if parseaddr(value)[1] == value else None


@dataclass(frozen=True)
class StagedMailCycleSummary:
    processed_children: int
    evaluated_receipts: int
    successful_children: int = 0
    failed_children: int = 0
    examined_messages: int = 0
    completed_receipts: int = 0
    rejected_receipts: int = 0


class MailFeedbackService:
    def __init__(
        self,
        history: IngestionHistory,
        sailors: SailorRepository,
        boats: BoatRepository,
        activities: ActivityRepository,
        sessions: SessionRepository,
        sender: FeedbackSender | None = None,
        consent_request_sender: Callable[[str, str], None] | None = None,
    ) -> None:
        self.history = history
        self.receipts = MailReceiptStore(history.path)
        self.sailors = sailors
        self.boats = boats
        self.activities = activities
        self.sessions = sessions
        self.sender = sender or _send
        self.consent_request_sender = consent_request_sender

    def attempt_automatic(self, message_id: str) -> dict | None:
        with ingestion_lock(self.history.path.parent):
            receipt = self.receipts.get("ovh", message_id)
            if receipt is None or receipt["receipt_state"] not in ("complete", "rejected"):
                return None
            if receipt["feedback_state"] == "suppressed":
                if receipt["feedback_suppressed_reason"] == "non_active":
                    self._attempt_pending_consent(receipt, self._children(receipt))
                return self.receipts.get("ovh", message_id)
            if receipt["feedback_state"] != "unreserved":
                return receipt
            records = self._children(receipt)
            if records is None:
                return receipt
            message, reason, sailor_id = self._compose(receipt, records)
            if reason is not None:
                consent_cycle = None
                if reason == "non_active" and sailor_id is not None:
                    sailor = self.sailors.get_by_id(sailor_id)
                    if sailor is not None and sailor.consent_status == ConsentStatus.PENDING:
                        consent_cycle = _automatic_consent_requests(
                            self.sailors, self.sessions, None, self.consent_request_sender,
                        ).requests.current_cycle_sequence(sailor_id)
                receipt = self.receipts.suppress_feedback(
                    "ovh", message_id, reason,
                    consent_sailor_id=sailor_id if consent_cycle is not None else None,
                    consent_cycle=consent_cycle,
                )
                if reason == "non_active":
                    self._attempt_pending_consent(receipt, records)
                return receipt
            if message is None:
                raise ValueError("Mail feedback decision lacks message")
            attempt = self.receipts.reserve_feedback("ovh", message_id, "automatic")
            if attempt is None:
                return self.receipts.get("ovh", message_id)
            self._deliver(message_id, attempt, message)
            return self.receipts.get("ovh", message_id)

    def resend(self, message_id: str) -> dict:
        with ingestion_lock(self.history.path.parent):
            receipt = self.receipts.get("ovh", message_id)
            if receipt is None:
                raise ValueError("Mail receipt not found")
            if receipt["receipt_state"] not in ("complete", "rejected") or not any(
                item["kind"] == "automatic" for item in receipt["feedback_attempts"]
            ):
                raise MailFeedbackEligibilityError("Mail has no earlier automatic feedback attempt")
            records = self._children(receipt)
            if records is None:
                raise MailFeedbackEligibilityError("Mail processing is incomplete")
            message, reason, _ = self._compose(receipt, records)
            if reason is not None or message is None:
                raise MailFeedbackEligibilityError("Current mail feedback eligibility failed")
            attempt = self.receipts.reserve_feedback("ovh", message_id, "manual")
            if attempt is None:
                raise ValueError("Manual feedback reservation disappeared")
            self._deliver(message_id, attempt, message)
            return self.receipts.get("ovh", message_id)

    def _children(self, receipt: dict) -> list[dict] | None:
        if receipt["receipt_state"] == "rejected":
            return []
        records = self.history.find_mail_attachments("ovh", receipt["provider_message_id"])
        if (
            [item["id"] for item in records] != receipt["attachment_ingestion_ids"]
            or any(item["attachment_ordinal_verified"] is not True for item in records)
        ):
            raise ValueError("Mail receipt conflicts with staged Ingestions")
        return records if all(item["status"] in ("processed", "failed", "acquisition_failed") for item in records) else None

    def _compose(self, receipt: dict, records: list[dict]) -> tuple[OutboundMailMessage | None, str | None, str | None]:
        if receipt["receipt_state"] == "rejected":
            sender = _safe_sender(receipt.get("sender_email"))
        else:
            senders = {item["sender_email"] for item in records}
            sender = _safe_sender(next(iter(senders))) if len(senders) == 1 else None
        if sender is None:
            return None, "unsafe_recipient", None
        successful = [item for item in records if item["status"] == "processed"]
        if not successful:
            return compose_technical_email(sender, receipt["receipt_state"] == "rejected"), None, None
        sailor = self.sailors.find_by_email(sender)
        if sailor is None:
            return None, "unusable_access", None
        if sailor.consent_status != ConsentStatus.ACTIVE:
            return None, "non_active", sailor.id
        evidence = [record.get("first_processing_consent") for record in successful]
        if any(item is None for item in evidence):
            return None, "uncertain_consent", sailor.id
        cycle = sum(
            event.event_type == ConsentEventType.CONSENT_CYCLE_STARTED
            for event in ConsentEventRepository(
                self.sailors.path.with_name("consent_events.json")
            ).for_sailor(sailor.id)
        )
        current_grant = sailor.consent_granted_at.isoformat() if sailor.consent_granted_at else None
        if any(
            item["consent_status"] != ConsentStatus.ACTIVE.value
            or item["consent_cycle_sequence"] != cycle
            or item["consent_granted_at"] != current_grant
            for item in evidence
        ):
            return None, "non_active", sailor.id
        if any(item["sailor_id"] != sailor.id for item in evidence):
            return None, "unusable_access", sailor.id
        # Do not disclose an Activity belonging to another Sailor, even when
        # a corrupt Ingestion happens to point to an otherwise valid Session.
        for record in successful:
            activity = self.activities.get_by_id(record["activity_id"])
            if activity is None or activity.sailor_id != sailor.id:
                return None, "unusable_access", sailor.id
        personal_path = None
        if sailor.personal_capability_token:
            personal_owner = PersonalCapabilityService(self.sailors, self.sessions).resolve(sailor.personal_capability_token)
            if personal_owner is not None and personal_owner.id == sailor.id:
                personal_path = f"/me/{sailor.personal_capability_token}"
        capability_service = SessionCapabilityService(self.sessions, self.activities, self.sailors)
        reader = SessionReader(self.sessions, self.activities, self.sailors, self.boats)
        paths = []
        seen_sessions = set()
        for record in successful:
            session_id = record["session_id"]
            if session_id in seen_sessions:
                continue
            session = self.sessions.get_by_id(session_id)
            if session is None or record["activity_id"] not in session.activity_ids or not session.capability_token or session.capability_revoked:
                continue
            resolved = capability_service.resolve(session.capability_token)
            if resolved is None or resolved.id != session_id:
                continue
            try:
                visible = reader.get_session(session_id)
            except (ValueError, SessionDataIntegrityError):
                continue
            if visible is not None and any(item.id == record["activity_id"] for item in visible.activities):
                seen_sessions.add(session_id)
                paths.append(f"/s/{session.capability_token}")
        try:
            message = compose_results_email(sender, records, paths, personal_path, configured_public_base_url())
        except ValueError:
            return None, "unusable_access", sailor.id
        return message, None, sailor.id

    def _attempt_pending_consent(self, receipt: dict, records: list[dict] | None) -> None:
        sailor_id = receipt.get("feedback_consent_sailor_id")
        cycle = receipt.get("feedback_consent_cycle")
        if not records or sailor_id is None or cycle is None:
            return
        successful = [record for record in records if record["status"] == "processed"]
        if not successful:
            return
        sender = _safe_sender(successful[0]["sender_email"])
        sailor = self.sailors.find_by_email(sender) if sender else None
        if sailor is None or sailor.id != sailor_id or sailor.consent_status != ConsentStatus.PENDING:
            return
        requests = _automatic_consent_requests(self.sailors, self.sessions, None, self.consent_request_sender)
        if requests.requests.current_cycle_sequence(sailor_id) != cycle:
            return
        reservation = next((record["pending_onboarding_reservation"] for record in successful if record["pending_onboarding_reservation"] is not None), None)
        requests.attempt_for_sailor(
            sailor.id, source="ovh_staged_automatic_consent_request",
            onboarding_activity_id=reservation["activity_id"] if reservation else None,
            onboarding_session_id=reservation["session_id"] if reservation else None,
        )

    def _deliver(self, message_id: str, attempt: dict, message: OutboundMailMessage) -> None:
        # Reservation is durable before the first transport call. Unexpected
        # exceptions leave `attempted`, which is terminal for automatic sends.
        try:
            self.sender(message)
        except OutboundMailUncertainError:
            # A transport disconnect can follow SMTP acceptance. Keep the
            # durable reservation terminal and report uncertain delivery.
            pass
        except OutboundMailError:
            self.receipts.finish_feedback("ovh", message_id, attempt["id"], "failed")
        else:
            self.receipts.finish_feedback("ovh", message_id, attempt["id"], "sent")


def orchestrate_staged_mailbox_now(
    provider: OVHAdapter | None = None,
    *,
    acquire: bool = True,
    feedback_sender: FeedbackSender | None = None,
    consent_request_sender: Callable[[str, str], None] | None = None,
) -> StagedMailCycleSummary:
    """Internal acquisition -> recovery -> processing -> feedback entry point."""
    acquisition = stage_ovh_mailbox_now(provider) if acquire else None
    sailors, boats, activities, sessions, history = (
        SailorRepository(), BoatRepository(), ActivityRepository(), SessionRepository(), IngestionHistory(),
    )
    pending = recover_unattempted_ingestions(history.path)
    successful = failed = 0
    for record in pending:
        try:
            process_staged_ingestion(record["id"], sailors, boats, activities, sessions, history)
        except Exception:
            current = history.get(record["id"])
            if current is None or current["status"] not in ("failed", "processed"):
                raise
        current = history.get(record["id"])
        successful += current is not None and current["status"] == "processed"
        failed += current is not None and current["status"] in ("failed", "acquisition_failed")
    feedback = MailFeedbackService(
        history, sailors, boats, activities, sessions,
        sender=feedback_sender, consent_request_sender=consent_request_sender,
    )
    evaluated = 0
    for receipt in feedback.receipts.receipts():
        if receipt["provider"] == "ovh" and receipt["receipt_state"] in ("complete", "rejected"):
            feedback.attempt_automatic(receipt["provider_message_id"])
            evaluated += 1
    return StagedMailCycleSummary(
        len(pending), evaluated, successful, failed,
        acquisition.examined if acquisition else 0,
        acquisition.completed if acquisition else 0,
        acquisition.rejected if acquisition else 0,
    )
