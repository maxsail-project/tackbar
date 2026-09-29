from typing import Callable

from app.models import ConsentRequest, ConsentStatus
from app.repositories.sailors import SailorRepository
from app.services.consent_request_delivery import (
    ConsentRequestDeliveryError,
    send_consent_request_email,
)
from app.services.consent_requests import ConsentRequestService
from app.services.sailor_consent import SailorConsentService


class AutomaticConsentRequestService:
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

    def attempt_for_sailor(
        self,
        sailor_id: str,
        source: str,
    ) -> ConsentRequest | None:
        sailor = self.sailors.get_by_id(sailor_id)
        if sailor is None:
            raise ValueError("Sailor disappeared before consent request delivery")
        if sailor.consent_status != ConsentStatus.PENDING:
            return None
        if self.requests.automatic_delivery_was_attempted_for_current_cycle(
            sailor_id
        ):
            return self.requests.find_current_for_sailor(sailor_id)

        request = self.requests.issue_for_pending_sailor(sailor_id)
        self.requests.mark_automatic_delivery_attempted(request.id)
        try:
            self.sender(sailor.email, request.token)
        except ConsentRequestDeliveryError:
            return self.requests.mark_delivery_failed(request.id)

        delivered = self.requests.mark_delivery_succeeded(request.id)
        if delivered.delivery_sent_at is None:
            raise ValueError("Consent request delivery timestamp is unavailable")
        self.consent.mark_consent_requested(
            sailor_id,
            source=source,
            timestamp=delivered.delivery_sent_at,
        )
        return delivered
