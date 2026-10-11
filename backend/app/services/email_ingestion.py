from app.models import InboundEmail, IngestionResult
from app.parsers.vakaros import (
    is_supported_vakaros_attachment,
    parse_vakaros_attachment,
)
from app.parsers.vakaros_vkx import VKXParseError


class InboundEmailRejected(ValueError):
    """Raised when an inbound email is not eligible for processing."""


def process_inbound_email(email: InboundEmail) -> IngestionResult:
    if email.attachment_bytes is None or not email.attachment_filename:
        raise InboundEmailRejected("Inbound email has no attachment")

    if not is_supported_vakaros_attachment(email.attachment_filename):
        raise InboundEmailRejected(
            "Inbound email attachment filename is not a supported Vakaros format"
        )

    try:
        activity = parse_vakaros_attachment(
            email.attachment_bytes,
            original_filename=email.attachment_filename,
        )
    except VKXParseError as error:
        raise InboundEmailRejected(
            "Inbound email attachment is not a valid Vakaros VKX file"
        ) from error
    except (OSError, EOFError) as error:
        raise InboundEmailRejected(
            "Inbound email attachment is not a valid Vakaros CSV file"
        ) from error

    return IngestionResult(
        sender_email=email.sender_email,
        subject=email.subject,
        attachment_filename=email.attachment_filename,
        activity=activity,
    )
