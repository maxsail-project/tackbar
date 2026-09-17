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
    assert message.body.index("Thank you") < message.body.index("Gracias")
    assert "share@tackbar.eu" in message.body
    assert "Vakaros Connect" in message.body
    assert ENGLISH_VAKAROS_GUIDE_URL in message.body
    assert SPANISH_VAKAROS_GUIDE_URL in message.body
    assert "https://app.example.test/me/test-personal-token" in message.body
    assert "Keep this personal link private" in message.body
    assert "Mantén privado este enlace personal" in message.body
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
