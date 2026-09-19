import pytest

from app.services.welcome_email import (
    ENGLISH_VAKAROS_GUIDE_URL,
    SPANISH_VAKAROS_GUIDE_URL,
    WELCOME_EMAIL_SUBJECT,
    compose_welcome_email,
    compose_welcome_email_from_environment,
    personal_tackbar_url,
)


def test_welcome_email_is_bilingual_and_contains_required_operational_content():
    message = compose_welcome_email(
        "sailor@example.test",
        "/me/test-personal-token",
        "https://app.example.test",
    )

    assert message.recipient == "sailor@example.test"
    assert message.subject == WELCOME_EMAIL_SUBJECT
    assert message.body == f"""Hi,

I'm Maxi, a Snipe sailor and the person behind TackBar.

Thanks for joining the TackBar pilot.

Your participation is now confirmed, so you can start sending your sailing tracks to:

share@tackbar.eu

TackBar currently supports tracks shared through Vakaros Connect.

You can follow the English guide here:

{ENGLISH_VAKAROS_GUIDE_URL}

Your personal TackBar link is:

https://app.example.test/me/test-personal-token

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

https://app.example.test/me/test-personal-token

Desde ahí podrás acceder a las Sessions que tengas disponibles después de navegar.

Guarda este enlace de forma privada, ya que da acceso a tu espacio personal de TackBar.

Si tienes cualquier problema para empezar, escríbeme.

Gracias,

Maxi

TackBar
Sail. Debrief. Learn.
"""
    for unsupported_format in ("GPX", "VKX", "FIT"):
        assert unsupported_format not in message.body


@pytest.mark.parametrize(("base_url", "path", "expected"), [
    ("https://app.example.test", "/me/token", "https://app.example.test/me/token"),
    ("https://app.example.test/", "me/token", "https://app.example.test/me/token"),
    ("https://app.example.test/app/", "/me/token", "https://app.example.test/app/me/token"),
])
def test_personal_tackbar_url_normalizes_path_joining(base_url, path, expected):
    assert personal_tackbar_url(base_url, path) == expected


def test_welcome_email_uses_the_configured_public_origin():
    message = compose_welcome_email_from_environment(
        "sailor@example.test",
        "/me/test-personal-token",
        {"TACKBAR_PUBLIC_BASE_URL": "https://configured.example.test/"},
    )

    assert "https://configured.example.test/me/test-personal-token" in message.body


def test_personal_tackbar_url_does_not_include_path_in_validation_error():
    path = "/me/personal-token-must-not-leak"

    with pytest.raises(ValueError) as captured:
        personal_tackbar_url("not-a-url", path)

    assert path not in str(captured.value)
