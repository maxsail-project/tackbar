from app.services.outbound_mail import OutboundMailError, OvhSmtpTransport
from app.services.welcome_email import compose_welcome_email_from_environment


WELCOME_EMAIL_DELIVERY_FAILURE = "Welcome email delivery failed"


class WelcomeEmailDeliveryError(RuntimeError):
    """Controlled welcome-email failure safe to persist as operational state."""


def send_welcome_email(recipient: str, personal_capability_path: str) -> None:
    try:
        message = compose_welcome_email_from_environment(
            recipient,
            personal_capability_path,
        )
        OvhSmtpTransport.from_environment().send(message)
    except (OutboundMailError, ValueError):
        raise WelcomeEmailDeliveryError("Welcome email delivery failed") from None
