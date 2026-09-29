from typing import Mapping
from urllib.parse import urlsplit, urlunsplit

from app.config import configured_public_base_url
from app.repositories.consent_requests import is_consent_request_token
from app.services.outbound_mail import OutboundMailMessage


CONSENT_REQUEST_EMAIL_SUBJECT = (
    "Confirm your TackBar pilot participation / "
    "Confirma tu participación en TackBar"
)


def consent_request_url(public_base_url: str, token: str) -> str:
    if not is_consent_request_token(token):
        raise ValueError("Consent request token is invalid")
    parsed = urlsplit(public_base_url)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Public application URL is invalid")
    origin = urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", "")
    )
    return f"{origin}/consent/{token}"


def compose_consent_request_email(
    recipient: str,
    token: str,
    public_base_url: str,
) -> OutboundMailMessage:
    consent_url = consent_request_url(public_base_url, token)
    body = f"""Hi,

TackBar received a sailing Activity associated with this email address.

Your participation in the TackBar pilot is still pending. While it is pending, this Activity is not exposed through shared TackBar Sessions.

Sending the track did not constitute consent. To participate, please review the participation conditions and explicitly confirm your consent using this link:

{consent_url}

Ignoring this message does not activate your participation.

Thanks,

TackBar
Sail. Debrief. Learn.

---

Hola,

TackBar ha recibido una Actividad de navegación asociada a esta dirección de correo electrónico.

Tu participación en el piloto de TackBar sigue pendiente. Mientras esté pendiente, esta Actividad no se muestra en Sessions compartidas de TackBar.

Enviar el track no constituyó tu consentimiento. Para participar, revisa las condiciones de participación y confirma explícitamente tu consentimiento mediante este enlace:

{consent_url}

Ignorar este mensaje no activa tu participación.

Gracias,

TackBar
Sail. Debrief. Learn.
"""
    return OutboundMailMessage(recipient, CONSENT_REQUEST_EMAIL_SUBJECT, body)


def compose_consent_request_email_from_environment(
    recipient: str,
    token: str,
    environment: Mapping[str, str] | None = None,
) -> OutboundMailMessage:
    return compose_consent_request_email(
        recipient,
        token,
        configured_public_base_url(environment),
    )
