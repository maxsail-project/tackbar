from datetime import datetime, timezone
from typing import Callable

from app.models import ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.ingestion_history import IngestionHistory, SESSION_RESULT_DELIVERY_FAILURE
from app.services.session_capabilities import SessionCapabilityService
from app.services.session_result_email import SessionResultDeliveryError, send_session_result_email


class SessionResultDeliveryService:
    """Synchronous, at-most-once delivery under the ingestion single-writer lock."""

    def __init__(
        self,
        history: IngestionHistory,
        sailors: SailorRepository,
        activities: ActivityRepository,
        sessions: SessionRepository,
        sender: Callable[[str, str, str], None] | None = None,
    ) -> None:
        self.history = history
        self.sailors = sailors
        self.activities = activities
        self.sessions = sessions
        self.sender = sender or send_session_result_email

    def attempt_for_new_activity(self, ingestion_id: str) -> None:
        record = self.history.get(ingestion_id)
        if record is None or record["status"] != "processed":
            raise ValueError("Session-result delivery requires processed ingestion")
        if (
            record["activity_created_by_ingestion"] is not True
            or record["session_result_notification_candidate"] is not True
        ):
            return
        notification = record["session_result_notification"]
        if notification is not None and notification["status"] != "eligible":
            return
        if notification is None:
            if any(
                other["id"] != record["id"]
                and other["activity_id"] == record["activity_id"]
                and other["session_result_notification"] is not None
                for other in self.history.records()
            ):
                return

        activity = self.activities.get_by_id(record["activity_id"])
        session = self.sessions.get_by_id(record["session_id"])
        if activity is None or session is None or activity.id not in session.activity_ids:
            raise ValueError("Session-result ingestion references unavailable Activity/Session")
        sailor = self.sailors.get_by_id(activity.sailor_id)
        if sailor is None:
            raise ValueError("Session-result Activity references unavailable Sailor")
        if (
            sailor.consent_status != ConsentStatus.ACTIVE
            or sailor.personal_capability_token is None
            or sailor.personal_capability_revoked
            or session.capability_token is None
            or SessionCapabilityService(
                self.sessions, self.activities, self.sailors
            ).resolve(session.capability_token) is None
        ):
            return

        if notification is None:
            notification = {
                "status": "eligible", "attempted_at": None,
                "sent_at": None, "last_error": None,
            }
            record["session_result_notification"] = notification
            self.history.replace(record)
        notification.update(
            status="attempted", attempted_at=datetime.now(timezone.utc).isoformat()
        )
        # A crash after this write remains terminal, even if SMTP outcome is unknown.
        self.history.replace(record)
        try:
            self.sender(
                sailor.email,
                f"/s/{session.capability_token}",
                f"/me/{sailor.personal_capability_token}",
            )
        except SessionResultDeliveryError:
            notification.update(status="failed", last_error=SESSION_RESULT_DELIVERY_FAILURE)
        else:
            notification.update(status="sent", sent_at=datetime.now(timezone.utc).isoformat())
        self.history.replace(record)
