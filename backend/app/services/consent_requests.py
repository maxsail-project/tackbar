from dataclasses import replace
from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from typing import Callable
from uuid import uuid4

from app.config import CURRENT_CONSENT_AGREEMENT_VERSION
from app.models import (
    ConsentEventType,
    ConsentRequest,
    ConsentRequestResolution,
    ConsentRequestState,
    ConsentStatus,
)
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import (
    CONSENT_REQUEST_LIFETIME,
    ConsentRequestRepository,
    is_consent_request_token,
)
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository


CONSENT_REQUEST_DELIVERY_FAILURE = "Consent request delivery failed"


class ConsentRequestOperationError(ValueError):
    pass


class ConsentRequestService:
    def __init__(
        self,
        requests: ConsentRequestRepository,
        sailors: SailorRepository,
        events: ConsentEventRepository,
        sessions: SessionRepository,
        agreement_version: str | None = None,
        clock: Callable[[], datetime] | None = None,
        token_generator: Callable[[], str] | None = None,
    ) -> None:
        self.requests = requests
        self.sailors = sailors
        self.events = events
        self.sessions = sessions
        self.agreement_version = (
            CURRENT_CONSENT_AGREEMENT_VERSION
            if agreement_version is None
            else agreement_version
        )
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.token_generator = token_generator or (lambda: token_urlsafe(32))

    def issue_for_pending_sailor(self, sailor_id: str) -> ConsentRequest:
        self._require_pending_sailor(sailor_id)
        current = self.find_current_for_sailor(sailor_id)
        if current is not None:
            return current
        return self._create_request(sailor_id)

    def reissue_expired_for_pending_sailor(
        self,
        sailor_id: str,
    ) -> ConsentRequest:
        self._require_pending_sailor(sailor_id)
        current = self.find_current_for_sailor(sailor_id)
        if current is None or self._state(current, self._now()) != ConsentRequestState.EXPIRED:
            raise ConsentRequestOperationError(
                "Current consent request is not expired"
            )
        return self._create_request(sailor_id)

    def find_current_for_sailor(self, sailor_id: str) -> ConsentRequest | None:
        if self.sailors.get_by_id(sailor_id) is None:
            return None
        cycle_sequence = self._cycle_sequence(sailor_id)
        candidates = [
            request
            for request in self.requests.for_sailor(sailor_id)
            if request.consent_cycle_sequence == cycle_sequence
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda request: (request.created_at, request.id))

    def current_resolution_for_sailor(
        self,
        sailor_id: str,
    ) -> ConsentRequestResolution:
        request = self.find_current_for_sailor(sailor_id)
        if request is None:
            return ConsentRequestResolution(ConsentRequestState.NOT_FOUND)
        return ConsentRequestResolution(
            self._state(request, self._now()),
            request,
        )

    def automatic_delivery_was_attempted_for_current_cycle(
        self,
        sailor_id: str,
    ) -> bool:
        if self.sailors.get_by_id(sailor_id) is None:
            return False
        cycle_sequence = self._cycle_sequence(sailor_id)
        return any(
            request.consent_cycle_sequence == cycle_sequence
            and request.automatic_delivery_attempted_at is not None
            for request in self.requests.for_sailor(sailor_id)
        )

    def resolve(self, token: str) -> ConsentRequestResolution:
        if not is_consent_request_token(token):
            return ConsentRequestResolution(ConsentRequestState.NOT_FOUND)
        request = self.requests.get_by_token(token)
        if request is None:
            return ConsentRequestResolution(ConsentRequestState.NOT_FOUND)
        state = self._state(request, self._now())
        return ConsentRequestResolution(
            state,
            request
            if state in (
                ConsentRequestState.VALID,
                ConsentRequestState.ACCEPTED,
            )
            else None,
        )

    def mark_automatic_delivery_attempted(
        self,
        request_id: str,
        timestamp: datetime | None = None,
    ) -> ConsentRequest:
        request = self._require_request(request_id)
        occurred_at = self._time(timestamp)
        if self._state(request, occurred_at) != ConsentRequestState.VALID:
            raise ConsentRequestOperationError("Consent request is not usable")
        if self.automatic_delivery_was_attempted_for_current_cycle(
            request.sailor_id
        ):
            raise ConsentRequestOperationError(
                "Automatic consent-request delivery was already attempted"
            )
        return self.requests.replace(
            replace(request, automatic_delivery_attempted_at=occurred_at)
        )

    def mark_delivery_succeeded(
        self,
        request_id: str,
        timestamp: datetime | None = None,
    ) -> ConsentRequest:
        request = self._require_request(request_id)
        occurred_at = self._time(timestamp)
        return self.requests.replace(
            replace(
                request,
                delivery_sent_at=occurred_at,
                delivery_last_error=None,
            )
        )

    def mark_delivery_failed(self, request_id: str) -> ConsentRequest:
        request = self._require_request(request_id)
        return self.requests.replace(
            replace(
                request,
                delivery_last_error=CONSENT_REQUEST_DELIVERY_FAILURE,
            )
        )

    def mark_accepted(
        self,
        token: str,
        timestamp: datetime | None = None,
    ) -> ConsentRequest:
        request = (
            self.requests.get_by_token(token)
            if is_consent_request_token(token)
            else None
        )
        if request is None:
            raise ConsentRequestOperationError("Consent request is not usable")
        occurred_at = self._time(timestamp)
        state = self._state(request, occurred_at)
        if state == ConsentRequestState.ACCEPTED:
            return request
        if state != ConsentRequestState.VALID:
            raise ConsentRequestOperationError("Consent request is not usable")
        return self.requests.replace(replace(request, accepted_at=occurred_at))

    def _create_request(self, sailor_id: str) -> ConsentRequest:
        created_at = self._now()
        request = ConsentRequest(
            id=str(uuid4()),
            sailor_id=sailor_id,
            token=self._new_unique_token(),
            agreement_version=self.agreement_version,
            consent_cycle_sequence=self._cycle_sequence(sailor_id),
            created_at=created_at,
            expires_at=created_at + CONSENT_REQUEST_LIFETIME,
        )
        return self.requests.add(request)

    def _new_unique_token(self) -> str:
        sailors = self.sailors.all()
        excluded = {request.token for request in self.requests.all()}
        excluded.update(request.id for request in self.requests.all())
        excluded.update(sailor.id for sailor in sailors)
        excluded.update(sailor.email for sailor in sailors)
        excluded.update(
            sailor.personal_capability_token
            for sailor in sailors
            if sailor.personal_capability_token is not None
        )
        excluded.update(
            session.capability_token
            for session in self.sessions.all()
            if session.capability_token is not None
        )
        for _ in range(10):
            token = self.token_generator()
            if not is_consent_request_token(token):
                raise ValueError(
                    "Consent request generator returned low-entropy token"
                )
            if token not in excluded:
                return token
        raise ValueError("Unable to generate a unique consent request token")

    def _state(
        self,
        request: ConsentRequest,
        at: datetime,
    ) -> ConsentRequestState:
        sailor = self.sailors.get_by_id(request.sailor_id)
        current = self.find_current_for_sailor(request.sailor_id)
        if (
            sailor is None
            or current is None
            or current.id != request.id
            or request.consent_cycle_sequence != self._cycle_sequence(request.sailor_id)
        ):
            return ConsentRequestState.UNUSABLE
        if request.accepted_at is not None:
            return ConsentRequestState.ACCEPTED
        if sailor.consent_status != ConsentStatus.PENDING or at < request.created_at:
            return ConsentRequestState.UNUSABLE
        if at >= request.expires_at:
            return ConsentRequestState.EXPIRED
        return ConsentRequestState.VALID

    def _cycle_sequence(self, sailor_id: str) -> int:
        return sum(
            event.event_type == ConsentEventType.CONSENT_CYCLE_STARTED
            for event in self.events.for_sailor(sailor_id)
        )

    def _require_pending_sailor(self, sailor_id: str) -> None:
        sailor = self.sailors.get_by_id(sailor_id)
        if sailor is None:
            raise ConsentRequestOperationError("Sailor not found")
        if sailor.consent_status != ConsentStatus.PENDING:
            raise ConsentRequestOperationError(
                "Consent requests require a PENDING Sailor"
            )
        if not self.agreement_version.strip():
            raise ValueError("Consent agreement version must not be empty")

    def _require_request(self, request_id: str) -> ConsentRequest:
        request = self.requests.get_by_id(request_id)
        if request is None:
            raise ConsentRequestOperationError("Consent request not found")
        return request

    def _now(self) -> datetime:
        return _require_utc(self.clock())

    def _time(self, value: datetime | None) -> datetime:
        return self._now() if value is None else _require_utc(value)


def _require_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Consent request clock must return UTC-aware time")
    return value.astimezone(timezone.utc)
