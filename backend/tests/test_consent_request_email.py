import pytest

from app.services.consent_request_email import (
    CONSENT_REQUEST_EMAIL_SUBJECT,
    compose_consent_request_email,
    compose_consent_request_email_from_environment,
    consent_request_url,
)


TOKEN = "request-" + "r" * 40


def test_consent_request_email_is_bilingual_and_operational() -> None:
    message = compose_consent_request_email(
        "sailor@example.test",
        TOKEN,
        "https://app.example.test",
    )

    assert message.recipient == "sailor@example.test"
    assert message.subject == (
        "Confirm your TackBar pilot participation / "
        "Confirma tu participación en TackBar"
    )
    assert message.subject == CONSENT_REQUEST_EMAIL_SUBJECT
    assert message.body.index("Hi,") < message.body.index("Hola,")

    assert "received a sailing Activity associated with this email" in message.body
    assert "participation in the TackBar pilot is still pending" in message.body
    assert "not exposed through shared TackBar Sessions" in message.body
    assert "Sending the track did not constitute consent" in message.body
    assert "review the participation conditions" in message.body
    assert "explicitly confirm your consent" in message.body
    assert "Ignoring this message does not activate" in message.body

    assert "ha recibido una Actividad de navegación asociada" in message.body
    assert "participación en el piloto de TackBar sigue pendiente" in message.body
    assert "no se muestra en Sessions compartidas" in message.body
    assert "Enviar el track no constituyó tu consentimiento" in message.body
    assert "revisa las condiciones de participación" in message.body
    assert "confirma explícitamente tu consentimiento" in message.body
    assert "Ignorar este mensaje no activa" in message.body

    assert message.body.count(f"https://app.example.test/consent/{TOKEN}") == 2
    assert "/me/" not in message.body
    assert "session-token-must-not-appear" not in message.body
    assert "30000000-0000-4000-8000-000000000001" not in message.body
    assert "60000000-0000-4000-8000-000000000001" not in message.body
    for unsupported_format in ("GPX", "VKX", "FIT"):
        assert unsupported_format not in message.body


@pytest.mark.parametrize(
    ("base_url", "expected"),
    [
        (
            "https://app.example.test",
            f"https://app.example.test/consent/{TOKEN}",
        ),
        (
            "https://app.example.test/",
            f"https://app.example.test/consent/{TOKEN}",
        ),
        (
            "https://app.example.test/app/",
            f"https://app.example.test/app/consent/{TOKEN}",
        ),
    ],
)
def test_consent_request_url_normalizes_path_joining(
    base_url: str,
    expected: str,
) -> None:
    assert consent_request_url(base_url, TOKEN) == expected


def test_consent_request_email_uses_configured_public_base_url() -> None:
    message = compose_consent_request_email_from_environment(
        "sailor@example.test",
        TOKEN,
        {"TACKBAR_PUBLIC_BASE_URL": "https://configured.example.test/app/"},
    )

    assert f"https://configured.example.test/app/consent/{TOKEN}" in message.body


@pytest.mark.parametrize(
    ("base_url", "token"),
    [
        ("not-a-url", TOKEN),
        ("https://app.example.test", "secret-token-must-not-leak"),
    ],
)
def test_consent_request_url_validation_does_not_leak_token(
    base_url: str,
    token: str,
) -> None:
    with pytest.raises(ValueError) as captured:
        consent_request_url(base_url, token)

    assert token not in str(captured.value)
