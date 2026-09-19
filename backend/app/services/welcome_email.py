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
    body = f"""Hi,

I'm Maxi, a Snipe sailor and the person behind TackBar.

Thanks for joining the TackBar pilot.

Your participation is now confirmed, so you can start sending your sailing tracks to:

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

Tu participación ya está confirmada, así que ya puedes empezar a enviar tus tracks de navegación a:

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
) -> OutboundMailMessage:
    return compose_welcome_email(
        recipient,
        personal_capability_path,
        configured_public_base_url(environment),
    )
