from typing import Mapping
from urllib.parse import urlsplit, urlunsplit

from app.config import configured_public_base_url
from app.services.outbound_mail import OutboundMailMessage


WELCOME_EMAIL_SUBJECT = "Welcome to TackBar / Bienvenido a TackBar"
ENGLISH_VAKAROS_GUIDE_URL = "https://tackbar.eu/share-vakaros/index.html"
SPANISH_VAKAROS_GUIDE_URL = "https://tackbar.eu/es/compartir-vakaros/index.html"


def personal_tackbar_url(public_base_url: str, capability_path: str) -> str:
    if not capability_path.strip():
        raise ValueError("Personal capability path is required")
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
    origin = urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))
    return f"{origin}/{capability_path.lstrip('/')}"


def compose_welcome_email(
    recipient: str,
    personal_capability_path: str,
    public_base_url: str,
) -> OutboundMailMessage:
    personal_url = personal_tackbar_url(public_base_url, personal_capability_path)
    body = f"""Hello,

Thank you for participating in TackBar and confirming your participation.

Send your sailing tracks to share@tackbar.eu. The currently supported sharing workflow is Vakaros Connect. Follow the English Vakaros guide:
{ENGLISH_VAKAROS_GUIDE_URL}

Your Personal TackBar link is:
{personal_url}

Personal TackBar gives you access to your Sessions, subject to their existing availability rules. Keep this personal link private.

---

Hola,

Gracias por participar en TackBar y confirmar tu participación.

Envía tus tracks de navegación a share@tackbar.eu. El flujo soportado actualmente es Vakaros Connect. Sigue la guía de Vakaros en español:
{SPANISH_VAKAROS_GUIDE_URL}

Tu enlace personal de TackBar es:
{personal_url}

Personal TackBar te da acceso a tus Sessions según sus reglas de disponibilidad actuales. Mantén privado este enlace personal.
"""
    return OutboundMailMessage(recipient, WELCOME_EMAIL_SUBJECT, body)


def compose_welcome_email_from_environment(
    recipient: str,
    personal_capability_path: str,
    environment: Mapping[str, str] | None = None,
) -> OutboundMailMessage:
    return compose_welcome_email(
        recipient,
        personal_capability_path,
        configured_public_base_url(environment),
    )
