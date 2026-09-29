import pytest

from app.services import consent_request_delivery
from app.services.consent_request_delivery import (
    ConsentRequestDeliveryError,
    send_consent_request_email,
)
from app.services.consent_requests import CONSENT_REQUEST_DELIVERY_FAILURE
from app.services.outbound_mail import OutboundMailError


TOKEN = "request-" + "r" * 40


def test_delivery_reuses_ovh_smtp_transport_without_live_smtp(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent = []

    class FakeTransport:
        @classmethod
        def from_environment(cls):
            return cls()

        def send(self, message):
            sent.append(message)

    monkeypatch.setenv(
        "TACKBAR_PUBLIC_BASE_URL",
        "https://configured.example.test",
    )
    monkeypatch.setattr(
        consent_request_delivery,
        "OvhSmtpTransport",
        FakeTransport,
    )

    send_consent_request_email("sailor@example.test", TOKEN)

    assert len(sent) == 1
    assert sent[0].recipient == "sailor@example.test"
    assert f"https://configured.example.test/consent/{TOKEN}" in sent[0].body


def test_controlled_delivery_failure_hides_provider_secret_and_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "smtp-password-must-not-leak"

    class FailingTransport:
        @classmethod
        def from_environment(cls):
            return cls()

        def send(self, _message):
            raise OutboundMailError(f"provider rejected {secret} {TOKEN}")

    monkeypatch.setattr(
        consent_request_delivery,
        "OvhSmtpTransport",
        FailingTransport,
    )

    with pytest.raises(ConsentRequestDeliveryError) as captured:
        send_consent_request_email("sailor@example.test", TOKEN)

    assert str(captured.value) == CONSENT_REQUEST_DELIVERY_FAILURE
    assert secret not in str(captured.value)
    assert TOKEN not in str(captured.value)
    assert captured.value.__cause__ is None


def test_invalid_public_base_configuration_is_a_safe_controlled_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TACKBAR_PUBLIC_BASE_URL", "not-a-url")

    with pytest.raises(ConsentRequestDeliveryError) as captured:
        send_consent_request_email("sailor@example.test", TOKEN)

    assert str(captured.value) == CONSENT_REQUEST_DELIVERY_FAILURE
    assert TOKEN not in str(captured.value)
    assert captured.value.__cause__ is None
