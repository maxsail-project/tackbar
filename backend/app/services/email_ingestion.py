from app.models import InboundEmail, IngestionResult
from app.parsers.vakaros_csv import (
    has_vakaros_csv_suffix,
    parse_vakaros_csv,
)


class InboundEmailRejected(ValueError):
    """Raised when an inbound email is not eligible for processing."""


def process_inbound_email(email: InboundEmail) -> IngestionResult:
    if email.attachment_bytes is None or not email.attachment_filename:
        raise InboundEmailRejected("Inbound email has no attachment")

    if not has_vakaros_csv_suffix(email.subject.strip()):
        raise InboundEmailRejected(
            "Inbound email subject must end with .csv or .csv.gz"
        )

    if not has_vakaros_csv_suffix(email.attachment_filename):
        raise InboundEmailRejected(
            "Inbound email attachment filename must end with .csv or .csv.gz"
        )

    try:
        activity = parse_vakaros_csv(
            email.attachment_bytes,
            original_filename=email.attachment_filename,
        )
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
