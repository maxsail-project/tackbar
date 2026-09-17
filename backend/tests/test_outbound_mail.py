import importlib
import inspect
import smtplib

import pytest

from app.config import (
    OutboundMailConfigurationError,
    configured_public_base_url,
    load_ovh_smtp_configuration,
)
from app.services.outbound_mail import (
    OutboundMailError,
    OutboundMailMessage,
    OvhSmtpTransport,
)


def _environment(**overrides: str) -> dict[str, str]:
    environment = {
        "TACKBAR_OVH_SMTP_HOST": "smtp.example.test",
        "TACKBAR_OVH_SMTP_PORT": "2465",
        "TACKBAR_OVH_SMTP_USERNAME": "share@example.test",
        "TACKBAR_OVH_SMTP_PASSWORD": "test-smtp-password",
        "TACKBAR_OVH_SMTP_FROM": "share@example.test",
        "TACKBAR_PUBLIC_BASE_URL": "https://app.example.test/",
    }
    environment.update(overrides)
    return environment


def test_smtp_configuration_is_independent_from_imap_and_uses_safe_defaults():
    configuration = load_ovh_smtp_configuration({"TACKBAR_OVH_SMTP_PASSWORD": "test-smtp-password"})

    assert (configuration.host, configuration.port) == ("smtp.mail.ovh.net", 465)
    assert configuration.username == configuration.from_address == "share@tackbar.eu"
    assert configured_public_base_url({}) == "https://app.tackbar.eu"


@pytest.mark.parametrize("environment", [
    {},
    {"TACKBAR_OVH_SMTP_PASSWORD": " "},
    {"TACKBAR_OVH_SMTP_PASSWORD": "test-smtp-password", "TACKBAR_OVH_SMTP_PORT": "invalid"},
])
def test_invalid_smtp_configuration_fails_only_when_outbound_transport_is_requested(environment):
    with pytest.raises(OutboundMailError, match="Outbound mail is unavailable"):
        OvhSmtpTransport.from_environment(environment)

    importlib.import_module("app.main")


def test_invalid_public_base_url_is_controlled():
    with pytest.raises(OutboundMailConfigurationError, match="Invalid public application URL"):
        configured_public_base_url({"TACKBAR_PUBLIC_BASE_URL": "not-a-url"})


def test_smtp_transport_uses_configured_ssl_connection_and_plain_text_message(monkeypatch):
    calls: list[tuple] = []

    class FakeSMTP:
        def __init__(self, host, port):
            calls.append(("connect", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *_):
            calls.append(("close",))

        def login(self, username, password):
            calls.append(("login", username, password))

        def send_message(self, message):
            calls.append(("send", message["From"], message["To"], message["Subject"], message.get_content()))

    monkeypatch.setattr("app.services.outbound_mail.smtplib.SMTP_SSL", FakeSMTP)
    transport = OvhSmtpTransport.from_environment(_environment())
    transport.send(OutboundMailMessage("sailor@example.test", "Subject", "Plain text body"))

    assert calls == [
        ("connect", "smtp.example.test", 2465),
        ("login", "share@example.test", "test-smtp-password"),
        ("send", "share@example.test", "sailor@example.test", "Subject", "Plain text body\n"),
        ("close",),
    ]


def test_smtp_transport_hides_provider_failure_details(monkeypatch):
    password = "smtp-password-must-not-leak"

    def fail(*_):
        raise smtplib.SMTPException(f"Authentication failed for {password}")

    monkeypatch.setattr("app.services.outbound_mail.smtplib.SMTP_SSL", fail)
    transport = OvhSmtpTransport.from_environment(_environment(TACKBAR_OVH_SMTP_PASSWORD=password))

    with pytest.raises(OutboundMailError, match="Outbound mail delivery failed") as captured:
        transport.send(OutboundMailMessage("sailor@example.test", "Subject", "Body"))

    assert password not in str(captured.value)
    assert captured.value.__cause__ is None


def test_outbound_smtp_module_is_separate_from_inbound_imap_adapter():
    module = importlib.import_module("app.services.outbound_mail")

    assert "email_providers" not in inspect.getsource(module)
