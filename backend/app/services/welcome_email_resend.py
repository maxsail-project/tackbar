from dataclasses import replace
from datetime import datetime, timezone
from typing import Callable

from app.models import ConsentStatus, Sailor
from app.repositories.sailors import SailorRepository
from app.services.welcome_email_delivery import (
    WELCOME_EMAIL_DELIVERY_FAILURE,
    WelcomeEmailDeliveryError,
    send_welcome_email,
)


class WelcomeEmailResendEligibilityError(ValueError):
    """Raised when a Sailor cannot receive an explicit welcome-email resend."""


class WelcomeEmailResendService:
    def __init__(
        self,
        sailors: SailorRepository,
        sender: Callable[[str, str], None] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.sailors = sailors
        self.sender = sender or send_welcome_email
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def resend(self, sailor_id: str) -> Sailor:
        sailor = self._eligible_sailor(sailor_id)
        capability_path = f"/me/{sailor.personal_capability_token}"
        try:
            self.sender(sailor.email, capability_path)
        except WelcomeEmailDeliveryError:
            return self.sailors.replace(
                replace(
                    sailor,
                    welcome_email_last_error=WELCOME_EMAIL_DELIVERY_FAILURE,
                )
            )

        sent_at = self.clock()
        if (
            sent_at.tzinfo is None
            or sent_at.utcoffset() != timezone.utc.utcoffset(sent_at)
        ):
            raise ValueError("Welcome email resend clock must return UTC-aware time")
        return self.sailors.replace(
            replace(
                sailor,
                welcome_email_sent_at=sent_at,
                welcome_email_last_error=None,
            )
        )

    def _eligible_sailor(self, sailor_id: str) -> Sailor:
        sailor = self.sailors.get_by_id(sailor_id)
        if sailor is None:
            raise ValueError("Sailor not found")
        if sailor.consent_status != ConsentStatus.ACTIVE:
            raise WelcomeEmailResendEligibilityError(
                "Welcome email resend requires ACTIVE consent"
            )
        if (
            sailor.personal_capability_token is None
            or sailor.personal_capability_revoked
        ):
            raise WelcomeEmailResendEligibilityError(
                "Welcome email resend requires usable Personal TackBar access"
            )
        return sailor
