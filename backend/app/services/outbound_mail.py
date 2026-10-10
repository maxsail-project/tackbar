from dataclasses import dataclass
from email import policy
from email.message import EmailMessage
import imaplib
import logging
import smtplib
from typing import Mapping

from app.config import (
    OutboundMailConfigurationError,
    OvhImapConfiguration,
    OvhImapConfigurationError,
    OvhSmtpConfiguration,
    load_ovh_imap_configuration,
    load_ovh_smtp_configuration,
)


logger = logging.getLogger(__name__)
_OVH_SENT_FOLDER = "TackBar-Sent"


class OutboundMailError(RuntimeError):
    """Controlled failure while preparing or sending outbound mail."""


@dataclass(frozen=True)
class OutboundMailMessage:
    recipient: str
    subject: str
    body: str


class OvhSmtpTransport:
    """Small OVH SMTP transport with best-effort sent-copy archival."""

    def __init__(
        self,
        configuration: OvhSmtpConfiguration,
        imap_configuration: OvhImapConfiguration | None = None,
    ) -> None:
        self.configuration = configuration
        self.imap_configuration = imap_configuration

    @classmethod
    def from_environment(
        cls,
        environment: Mapping[str, str] | None = None,
    ) -> "OvhSmtpTransport":
        try:
            configuration = load_ovh_smtp_configuration(environment)
        except OutboundMailConfigurationError:
            raise OutboundMailError("Outbound mail is unavailable") from None
        try:
            imap_configuration = load_ovh_imap_configuration(environment)
        except OvhImapConfigurationError:
            imap_configuration = None
        return cls(configuration, imap_configuration)

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
        if self.imap_configuration is None:
            _log_append_failure()
            return
        try:
            _append_sent_copy(self.imap_configuration, email)
        except Exception:
            _log_append_failure()


def _append_sent_copy(
    configuration: OvhImapConfiguration,
    message: EmailMessage,
) -> None:
    connection = imaplib.IMAP4_SSL(configuration.host, configuration.port)
    try:
        connection.login(configuration.username, configuration.password)
        status, _ = connection.append(
            _OVH_SENT_FOLDER,
            None,
            None,
            message.as_bytes(policy=policy.SMTP),
        )
        if status != "OK":
            raise RuntimeError("OVH sent-copy append failed")
    finally:
        try:
            connection.logout()
        except (OSError, imaplib.IMAP4.error):
            pass


def _log_append_failure() -> None:
    logger.warning(
        "outbound_mail_archive_failed provider=ovh operation=imap_append "
        "folder=TackBar-Sent"
    )
