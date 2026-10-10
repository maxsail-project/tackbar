import importlib
import inspect
import logging
import smtplib
from email import policy

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
        "TACKBAR_OVH_IMAP_HOST": "imap.example.test",
        "TACKBAR_OVH_IMAP_PORT": "2993",
        "TACKBAR_OVH_IMAP_USERNAME": "share@example.test",
        "TACKBAR_OVH_IMAP_PASSWORD": "test-imap-password",
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


def test_smtp_success_appends_same_message_to_tackbar_sent(monkeypatch):
    calls: list[tuple] = []
    submitted_messages = []
    appended_messages = []

    class FakeSMTP:
        def __init__(self, host, port):
            calls.append(("smtp_connect", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *_):
            calls.append(("smtp_close",))

        def login(self, username, password):
            calls.append(("smtp_login", username, password))

        def send_message(self, message):
            calls.append(("smtp_send",))
            submitted_messages.append(message)

    class FakeIMAP:
        def __init__(self, host, port):
            calls.append(("imap_connect", host, port))

        def login(self, username, password):
            calls.append(("imap_login", username, password))

        def append(self, folder, flags, date_time, message):
            calls.append(("imap_append", folder, flags, date_time))
            appended_messages.append(message)
            return "OK", [b"stored"]

        def logout(self):
            calls.append(("imap_logout",))

    monkeypatch.setattr("app.services.outbound_mail.smtplib.SMTP_SSL", FakeSMTP)
    monkeypatch.setattr("app.services.outbound_mail.imaplib.IMAP4_SSL", FakeIMAP)
    transport = OvhSmtpTransport.from_environment(_environment())
    transport.send(OutboundMailMessage("sailor@example.test", "Subject", "Plain text body"))

    assert calls == [
        ("smtp_connect", "smtp.example.test", 2465),
        ("smtp_login", "share@example.test", "test-smtp-password"),
        ("smtp_send",),
        ("smtp_close",),
        ("imap_connect", "imap.example.test", 2993),
        ("imap_login", "share@example.test", "test-imap-password"),
        ("imap_append", "TackBar-Sent", None, None),
        ("imap_logout",),
    ]
    assert len(submitted_messages) == len(appended_messages) == 1
    submitted = submitted_messages[0]
    assert submitted["From"] == "share@example.test"
    assert submitted["To"] == "sailor@example.test"
    assert submitted["Subject"] == "Subject"
    assert submitted.get_content() == "Plain text body\n"
    assert appended_messages[0] == submitted.as_bytes(policy=policy.SMTP)


def test_append_failure_preserves_smtp_success_and_logs_only_safe_context(
    monkeypatch,
    caplog,
):
    recipient = "private-sailor@example.test"
    subject = "Private consent subject"
    body = "Private body with capability-token-secret"
    imap_password = "imap-password-must-not-leak"

    class FakeSMTP:
        def __init__(self, *_):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def login(self, *_):
            pass

        def send_message(self, _message):
            pass

    class FailingIMAP:
        def __init__(self, *_):
            pass

        def login(self, *_):
            pass

        def append(self, *_):
            raise RuntimeError(
                f"{recipient} {subject} {body} {imap_password} C:/private/path"
            )

        def logout(self):
            pass

    monkeypatch.setattr("app.services.outbound_mail.smtplib.SMTP_SSL", FakeSMTP)
    monkeypatch.setattr(
        "app.services.outbound_mail.imaplib.IMAP4_SSL",
        FailingIMAP,
    )
    environment = _environment(TACKBAR_OVH_IMAP_PASSWORD=imap_password)
    transport = OvhSmtpTransport.from_environment(environment)

    with caplog.at_level(logging.WARNING, logger="app.services.outbound_mail"):
        result = transport.send(OutboundMailMessage(recipient, subject, body))

    assert result is None
    assert len(caplog.records) == 1
    log_output = caplog.text
    assert "outbound_mail_archive_failed" in log_output
    assert "folder=TackBar-Sent" in log_output
    for sensitive in (
        recipient,
        subject,
        body,
        "capability-token-secret",
        imap_password,
        "C:/private/path",
    ):
        assert sensitive not in log_output


def test_smtp_failure_performs_no_imap_append(monkeypatch):
    class FailingSMTP:
        def __init__(self, *_):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def login(self, *_):
            pass

        def send_message(self, _message):
            raise smtplib.SMTPException("submission failed")

    def unexpected_imap(*_):
        pytest.fail("IMAP must not be used after SMTP failure")

    monkeypatch.setattr(
        "app.services.outbound_mail.smtplib.SMTP_SSL",
        FailingSMTP,
    )
    monkeypatch.setattr(
        "app.services.outbound_mail.imaplib.IMAP4_SSL",
        unexpected_imap,
    )
    transport = OvhSmtpTransport.from_environment(_environment())

    with pytest.raises(OutboundMailError, match="Outbound mail delivery failed"):
        transport.send(OutboundMailMessage("sailor@example.test", "Subject", "Body"))


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
