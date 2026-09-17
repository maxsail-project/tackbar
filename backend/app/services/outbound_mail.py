from dataclasses import dataclass
from email.message import EmailMessage
import smtplib
from typing import Mapping

from app.config import (
    OutboundMailConfigurationError,
    OvhSmtpConfiguration,
    load_ovh_smtp_configuration,
)


class OutboundMailError(RuntimeError):
    """Controlled failure while preparing or sending outbound mail."""


@dataclass(frozen=True)
class OutboundMailMessage:
    recipient: str
    subject: str
    body: str


class OvhSmtpTransport:
    """Small SMTP-only transport; inbound IMAP adapters are deliberately separate."""

    def __init__(self, configuration: OvhSmtpConfiguration) -> None:
        self.configuration = configuration

    @classmethod
    def from_environment(
        cls,
        environment: Mapping[str, str] | None = None,
    ) -> "OvhSmtpTransport":
        try:
            configuration = load_ovh_smtp_configuration(environment)
        except OutboundMailConfigurationError:
            raise OutboundMailError("Outbound mail is unavailable") from None
        return cls(configuration)

    def send(self, message: OutboundMailMessage) -> None:
        if not message.recipient.strip() or not message.subject.strip() or not message.body.strip():
            raise OutboundMailError("Outbound mail message is incomplete")
        email = EmailMessage()
        email["From"] = self.configuration.from_address
        email["To"] = message.recipient
        email["Subject"] = message.subject
        email.set_content(message.body)
        try:
            with smtplib.SMTP_SSL(self.configuration.host, self.configuration.port) as connection:
                connection.login(self.configuration.username, self.configuration.password)
                connection.send_message(email)
        except (OSError, smtplib.SMTPException):
            raise OutboundMailError("Outbound mail delivery failed") from None
