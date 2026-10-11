from typing import Mapping
from urllib.parse import urlsplit, urlunsplit

from app.config import configured_public_base_url
from app.services.outbound_mail import OutboundMailMessage


WELCOME_EMAIL_SUBJECT = "Welcome to TackBar / Bienvenido a TackBar"
ENGLISH_VAKAROS_GUIDE_URL = "https://tackbar.eu/share-vakaros/index.html"
SPANISH_VAKAROS_GUIDE_URL = "https://tackbar.eu/es/compartir-vakaros/index.html"


def personal_tackbar_url(public_base_url: str, capability_path: str) -> str:
    return public_capability_url(public_base_url, capability_path)


def public_capability_url(public_base_url: str, capability_path: str) -> str:
    if not capability_path.strip():
        raise ValueError("Capability path is required")
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
    session_capability_path: str | None = None,
) -> OutboundMailMessage:
    personal_url = personal_tackbar_url(public_base_url, personal_capability_path)
    session_en = session_es = ""
    if session_capability_path is not None:
        session_url = public_capability_url(public_base_url, session_capability_path)
        session_en = (
            "Your sailing activity has been processed and is now available in TackBar.\n\n"
            f"Open this session:\n{session_url}\n\n"
            "You can also find all your available sessions from your personal TackBar home below.\n\n"
        )
        session_es = (
            "Tu navegación ha sido procesada y ya está disponible en TackBar.\n\n"
            f"Abre esta sesión:\n{session_url}\n\n"
            "También puedes consultar todas tus sesiones disponibles desde tu espacio personal de TackBar más abajo.\n\n"
        )
    body = f"""Hi,

I'm Maxi, a Snipe sailor and the person behind TackBar.

Thanks for joining the TackBar pilot.

{session_en}Your participation is now confirmed, so you can start sending your sailing tracks to:

share@tackbar.eu

TackBar currently supports tracks shared through Vakaros Connect.

You can follow the English guide here:

{ENGLISH_VAKAROS_GUIDE_URL}

Your personal TackBar link is:

{personal_url}

From there, you'll be able to access the Sessions available to you after sailing.

Please keep this link private, as it gives access to your personal TackBar area.

If you have any problem getting started, just let me know.

Thanks,

Maxi

TackBar
Sail. Debrief. Learn.

---

Hola,

Soy Maxi, regatista de Snipe y la persona detrás de TackBar.

Gracias por participar en el piloto de TackBar.

{session_es}Tu participación ya está confirmada, así que ya puedes empezar a enviar tus tracks de navegación a:

share@tackbar.eu

Actualmente TackBar admite los tracks compartidos mediante Vakaros Connect.

Puedes seguir la guía en español aquí:

{SPANISH_VAKAROS_GUIDE_URL}

Tu enlace personal de TackBar es:

{personal_url}

Desde ahí podrás acceder a las Sessions que tengas disponibles después de navegar.

Guarda este enlace de forma privada, ya que da acceso a tu espacio personal de TackBar.

Si tienes cualquier problema para empezar, escríbeme.

Gracias,

Maxi

TackBar
Sail. Debrief. Learn.
"""
    return OutboundMailMessage(recipient, WELCOME_EMAIL_SUBJECT, body)


def compose_welcome_email_from_environment(
    recipient: str,
    personal_capability_path: str,
    environment: Mapping[str, str] | None = None,
    *,
    session_capability_path: str | None = None,
) -> OutboundMailMessage:
    return compose_welcome_email(
        recipient,
        personal_capability_path,
        configured_public_base_url(environment),
        session_capability_path,
    )
