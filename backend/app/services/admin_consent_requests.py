from typing import Callable

from app.models import ConsentRequest, ConsentRequestState, ConsentStatus
from app.repositories.sailors import SailorRepository
from app.services.consent_request_delivery import (
    ConsentRequestDeliveryError,
    send_consent_request_email,
)
from app.services.consent_requests import ConsentRequestService
from app.services.sailor_consent import SailorConsentService


ADMIN_CONSENT_REQUEST_SOURCE = "admin_sent_consent_request"


class AdminConsentRequestEligibilityError(ValueError):
    """Raised when explicit Admin request delivery is not available."""


class AdminConsentRequestService:
    def __init__(
        self,
        requests: ConsentRequestService,
        sailors: SailorRepository,
        consent: SailorConsentService,
        sender: Callable[[str, str], None] | None = None,
    ) -> None:
        self.requests = requests
        self.sailors = sailors
        self.consent = consent
        self.sender = (
            send_consent_request_email if sender is None else sender
        )

    def send(self, sailor_id: str) -> ConsentRequest:
        sailor = self.sailors.get_by_id(sailor_id)
        if sailor is None:
            raise ValueError("Sailor not found")
        if sailor.consent_status != ConsentStatus.PENDING:
            raise AdminConsentRequestEligibilityError(
                "Consent request delivery requires PENDING consent"
            )

        resolution = self.requests.current_resolution_for_sailor(sailor_id)
        if resolution.state == ConsentRequestState.NOT_FOUND:
            request = self.requests.issue_for_pending_sailor(sailor_id)
        elif resolution.state == ConsentRequestState.VALID:
            request = resolution.request
        elif resolution.state == ConsentRequestState.EXPIRED:
            request = self.requests.reissue_expired_for_pending_sailor(
                sailor_id
            )
        else:
            raise AdminConsentRequestEligibilityError(
                "Consent request is not eligible for delivery"
            )
        if request is None:
            raise ValueError("Consent request resolution is missing request")

        try:
            self.sender(sailor.email, request.token)
        except ConsentRequestDeliveryError:
            return self.requests.mark_delivery_failed(request.id)

        delivered = self.requests.mark_delivery_succeeded(request.id)
        if delivered.delivery_sent_at is None:
            raise ValueError("Consent request delivery timestamp is unavailable")
        self.consent.mark_consent_requested(
            sailor_id,
            source=ADMIN_CONSENT_REQUEST_SOURCE,
            timestamp=delivered.delivery_sent_at,
        )
        return delivered
