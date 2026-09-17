from dataclasses import dataclass
import os
from typing import Mapping
from urllib.parse import urlsplit, urlunsplit


CURRENT_CONSENT_AGREEMENT_VERSION = "v0.5.0"

OVH_SMTP_HOST_ENVIRONMENT_VARIABLE = "TACKBAR_OVH_SMTP_HOST"
OVH_SMTP_PORT_ENVIRONMENT_VARIABLE = "TACKBAR_OVH_SMTP_PORT"
OVH_SMTP_USERNAME_ENVIRONMENT_VARIABLE = "TACKBAR_OVH_SMTP_USERNAME"
OVH_SMTP_PASSWORD_ENVIRONMENT_VARIABLE = "TACKBAR_OVH_SMTP_PASSWORD"
OVH_SMTP_FROM_ENVIRONMENT_VARIABLE = "TACKBAR_OVH_SMTP_FROM"
PUBLIC_BASE_URL_ENVIRONMENT_VARIABLE = "TACKBAR_PUBLIC_BASE_URL"


class OutboundMailConfigurationError(ValueError):
    """Expected outbound-mail configuration failure at send time."""


@dataclass(frozen=True)
class OvhSmtpConfiguration:
    host: str
    port: int
    username: str
    password: str
    from_address: str


def load_ovh_smtp_configuration(
    environment: Mapping[str, str] | None = None,
) -> OvhSmtpConfiguration:
    values = os.environ if environment is None else environment
    host = values.get(OVH_SMTP_HOST_ENVIRONMENT_VARIABLE, "smtp.mail.ovh.net").strip()
    port_text = values.get(OVH_SMTP_PORT_ENVIRONMENT_VARIABLE, "465").strip()
    username = values.get(OVH_SMTP_USERNAME_ENVIRONMENT_VARIABLE, "share@tackbar.eu").strip()
    password = values.get(OVH_SMTP_PASSWORD_ENVIRONMENT_VARIABLE, "")
    from_address = values.get(OVH_SMTP_FROM_ENVIRONMENT_VARIABLE, "share@tackbar.eu").strip()
    try:
        port = int(port_text)
    except ValueError as error:
        raise OutboundMailConfigurationError("Invalid outbound SMTP configuration") from error
    if not host or not username or not password.strip() or not from_address or not 1 <= port <= 65535:
        raise OutboundMailConfigurationError("Incomplete outbound SMTP configuration")
    return OvhSmtpConfiguration(host, port, username, password, from_address)


def configured_public_base_url(
    environment: Mapping[str, str] | None = None,
) -> str:
    values = os.environ if environment is None else environment
    value = values.get(PUBLIC_BASE_URL_ENVIRONMENT_VARIABLE, "https://app.tackbar.eu").strip()
    parsed = urlsplit(value)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise OutboundMailConfigurationError("Invalid public application URL configuration")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))
