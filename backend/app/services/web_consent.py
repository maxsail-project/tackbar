from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Callable

from app.models import ConsentRequest, ConsentRequestState, ConsentStatus
from app.repositories.sailors import SailorRepository
from app.services.consent_requests import (
    ConsentRequestOperationError,
    ConsentRequestService,
)
from app.services.sailor_consent import SailorConsentService


WEB_CONSENT_SOURCE = "web_consent"


class PublicConsentState(str, Enum):
    READY = "ready"
    CONFIRMED = "confirmed"


@dataclass(frozen=True)
class PublicConsent:
    state: PublicConsentState
    agreement_version: str
    expires_at: datetime


class WebConsentUnavailableError(ValueError):
    pass


class WebConsentService:
    def __init__(
        self,
        requests: ConsentRequestService,
        sailors: SailorRepository,
        activation_factory: Callable[[str], SailorConsentService],
    ) -> None:
        self.requests = requests
        self.sailors = sailors
        self.activation_factory = activation_factory

    def get(self, token: str) -> PublicConsent:
        resolution = self.requests.resolve(token)
        request = resolution.request
        if request is None:
            raise WebConsentUnavailableError("Consent request unavailable")
        if resolution.state == ConsentRequestState.VALID:
            return _public_consent(PublicConsentState.READY, request)
        if resolution.state != ConsentRequestState.ACCEPTED:
            raise WebConsentUnavailableError("Consent request unavailable")

        sailor = self.sailors.get_by_id(request.sailor_id)
        if sailor is None or sailor.consent_status == ConsentStatus.REVOKED:
            raise WebConsentUnavailableError("Consent request unavailable")
        state = (
            PublicConsentState.CONFIRMED
            if sailor.consent_status == ConsentStatus.ACTIVE
            else PublicConsentState.READY
        )
        return _public_consent(state, request)

    def accept(self, token: str) -> PublicConsent:
        resolution = self.requests.resolve(token)
        if resolution.state == ConsentRequestState.VALID:
            try:
                request = self.requests.mark_accepted(token)
            except ConsentRequestOperationError as error:
                raise WebConsentUnavailableError(
                    "Consent request unavailable"
                ) from error
        elif resolution.state == ConsentRequestState.ACCEPTED:
            request = resolution.request
        else:
            request = None

        if request is None:
            raise WebConsentUnavailableError("Consent request unavailable")

        sailor = self.sailors.get_by_id(request.sailor_id)
        if sailor is None or sailor.consent_status == ConsentStatus.REVOKED:
            raise WebConsentUnavailableError("Consent request unavailable")
        if sailor.consent_status == ConsentStatus.PENDING:
            if request.accepted_at is None:
                raise ValueError("Accepted consent request is missing timestamp")
            self.activation_factory(request.agreement_version).confirm_consent(
                sailor.id,
                source=WEB_CONSENT_SOURCE,
                timestamp=request.accepted_at,
            )
        return _public_consent(PublicConsentState.CONFIRMED, request)


def _public_consent(
    state: PublicConsentState,
    request: ConsentRequest,
) -> PublicConsent:
    return PublicConsent(
        state=state,
        agreement_version=request.agreement_version,
        expires_at=request.expires_at,
    )
