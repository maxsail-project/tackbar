from app.config import OutboundMailConfigurationError
from app.services.consent_request_email import (
    compose_consent_request_email_from_environment,
)
from app.services.consent_requests import CONSENT_REQUEST_DELIVERY_FAILURE
from app.services.outbound_mail import OutboundMailError, OvhSmtpTransport


class ConsentRequestDeliveryError(RuntimeError):
    """Controlled consent-request delivery failure safe for orchestration."""


def send_consent_request_email(recipient: str, token: str) -> None:
    try:
        message = compose_consent_request_email_from_environment(
            recipient,
            token,
        )
        OvhSmtpTransport.from_environment().send(message)
    except (OutboundMailConfigurationError, OutboundMailError):
        raise ConsentRequestDeliveryError(
            CONSENT_REQUEST_DELIVERY_FAILURE
        ) from None
