from dataclasses import replace
from datetime import datetime, timezone

from app.config import CURRENT_CONSENT_AGREEMENT_VERSION
from app.models import ConsentEvent, ConsentEventType, ConsentStatus, Sailor
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.activities import ActivityRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.session_capabilities import SessionCapabilityService


class SailorConsentService:
    def __init__(
        self,
        sailors: SailorRepository,
        events: ConsentEventRepository,
        agreement_version: str = CURRENT_CONSENT_AGREEMENT_VERSION,
        session_capabilities: SessionCapabilityService | None = None,
    ) -> None:
        self.sailors = sailors
        self.events = events
        self.agreement_version = agreement_version
        self.session_capabilities = session_capabilities or SessionCapabilityService(
            SessionRepository(sailors.path.with_name("sessions.json")),
            ActivityRepository(sailors.path.with_name("activities.json")),
            sailors,
        )

    def mark_consent_requested(
        self,
        sailor_id: str,
        source: str,
        timestamp: datetime | None = None,
    ) -> Sailor:
        sailor = self._require_status(sailor_id, ConsentStatus.PENDING)
        occurred_at = timestamp or datetime.now(timezone.utc)
        updated = replace(sailor, consent_request_sent_at=occurred_at)
        return self._persist_transition(
            updated,
            ConsentEvent(
                event_type=ConsentEventType.CONSENT_REQUESTED,
                timestamp=occurred_at,
                source=source,
                sailor_id=sailor_id,
            ),
        )

    def confirm_consent(
        self,
        sailor_id: str,
        source: str,
        timestamp: datetime | None = None,
    ) -> Sailor:
        sailor = self._require_status(sailor_id, ConsentStatus.PENDING)
        occurred_at = timestamp or datetime.now(timezone.utc)
        updated = replace(
            sailor,
            consent_status=ConsentStatus.ACTIVE,
            consent_granted_at=occurred_at,
            consent_revoked_at=None,
        )
        confirmed = self._persist_transition(
            updated,
            ConsentEvent(
                event_type=ConsentEventType.CONSENT_GRANTED,
                timestamp=occurred_at,
                source=source,
                sailor_id=sailor_id,
                agreement_version=self.agreement_version,
            ),
        )
        self.session_capabilities.ensure_for_sailor(sailor_id)
        return confirmed

    def revoke_consent(
        self,
        sailor_id: str,
        source: str,
        timestamp: datetime | None = None,
    ) -> Sailor:
        sailor = self._require_one_of_statuses(
            sailor_id,
            (ConsentStatus.PENDING, ConsentStatus.ACTIVE),
        )
        occurred_at = timestamp or datetime.now(timezone.utc)
        event_type = (
            ConsentEventType.CONSENT_DECLINED
            if sailor.consent_status == ConsentStatus.PENDING
            else ConsentEventType.CONSENT_REVOKED
        )
        updated = replace(
            sailor,
            consent_status=ConsentStatus.REVOKED,
            consent_revoked_at=occurred_at,
        )
        return self._persist_transition(
            updated,
            ConsentEvent(
                event_type=event_type,
                timestamp=occurred_at,
                source=source,
                sailor_id=sailor_id,
            ),
        )

    def start_new_consent_cycle(
        self,
        sailor_id: str,
        source: str,
        timestamp: datetime | None = None,
    ) -> Sailor:
        sailor = self._require_status(sailor_id, ConsentStatus.REVOKED)
        occurred_at = timestamp or datetime.now(timezone.utc)
        updated = replace(
            sailor,
            consent_status=ConsentStatus.PENDING,
            consent_request_sent_at=None,
            consent_granted_at=None,
            consent_revoked_at=None,
        )
        return self._persist_transition(
            updated,
            ConsentEvent(
                event_type=ConsentEventType.CONSENT_CYCLE_STARTED,
                timestamp=occurred_at,
                source=source,
                sailor_id=sailor_id,
            ),
        )

    def _require_status(
        self,
        sailor_id: str,
        expected: ConsentStatus,
    ) -> Sailor:
        sailor = self.sailors.get_by_id(sailor_id)
        if sailor is None:
            raise ValueError(f"Sailor not found: {sailor_id}")
        if sailor.consent_status != expected:
            raise ValueError(
                f"Cannot transition Sailor {sailor_id} from "
                f"{sailor.consent_status.value}; expected {expected.value}"
            )
        return sailor

    def _require_one_of_statuses(
        self,
        sailor_id: str,
        expected: tuple[ConsentStatus, ...],
    ) -> Sailor:
        sailor = self.sailors.get_by_id(sailor_id)
        if sailor is None:
            raise ValueError(f"Sailor not found: {sailor_id}")
        if sailor.consent_status not in expected:
            expected_names = " or ".join(status.value for status in expected)
            raise ValueError(
                f"Cannot transition Sailor {sailor_id} from "
                f"{sailor.consent_status.value}; expected {expected_names}"
            )
        return sailor

    def _persist_transition(
        self,
        sailor: Sailor,
        event: ConsentEvent,
    ) -> Sailor:
        self.events.validate(event)
        self.sailors.replace(sailor)
        self.events.append(event)
        return sailor
