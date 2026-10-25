from app.config import configured_public_base_url
from app.services.outbound_mail import OutboundMailError, OutboundMailMessage, OvhSmtpTransport, compose_automated_mail
from app.services.welcome_email import public_capability_url


SESSION_RESULT_SUBJECT = "Your TackBar session is ready / Tu sesión de TackBar está lista"


class SessionResultDeliveryError(RuntimeError):
    """Controlled Session-result failure, separate from ingestion outcome."""


def compose_session_result_email(
    recipient: str,
    session_capability_path: str,
    personal_capability_path: str,
    public_base_url: str,
) -> OutboundMailMessage:
    session_url = public_capability_url(public_base_url, session_capability_path)
    personal_url = public_capability_url(public_base_url, personal_capability_path)
    body = f"""Hi,

Your sailing activity has been processed and is now available in TackBar.

Open this session:
{session_url}

You can also access all your available sailing sessions anytime from your personal TackBar home:

My TackBar:
{personal_url}

See you on the water!

Maxi
TackBar — Sail. Debrief. Learn.

---

Hola,

Tu navegación ha sido procesada y ya está disponible en TackBar.

Abre esta sesión:
{session_url}

También puedes consultar en cualquier momento todas tus sesiones disponibles desde tu espacio personal de TackBar:

Mi TackBar:
{personal_url}

¡Nos vemos en el agua!

Maxi
TackBar — Sail. Debrief. Learn.
"""
    return compose_automated_mail(recipient, SESSION_RESULT_SUBJECT, body)


def send_session_result_email(
    recipient: str,
    session_capability_path: str,
    personal_capability_path: str,
) -> None:
    try:
        message = compose_session_result_email(
            recipient, session_capability_path, personal_capability_path,
            configured_public_base_url(),
        )
        OvhSmtpTransport.from_environment().send(message)
    except (OutboundMailError, ValueError):
        raise SessionResultDeliveryError("Session-result email delivery failed") from None
