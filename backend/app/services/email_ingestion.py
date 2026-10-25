from app.models import InboundEmail, IngestionResult
from app.parsers.track import (
    is_supported_track_attachment,
    parse_track_attachment,
)
from app.parsers.gpx import GPXParseError
from app.parsers.vakaros_vkx import VKXParseError
from app.parsers.vakaros_csv import VakarosCSVParseError


class InboundEmailRejected(ValueError):
    """Raised when an inbound email is not eligible for processing."""


class ActionableTrackRejected(InboundEmailRejected):
    """A supported attachment failed a known input parsing/validation rule."""


def process_inbound_email(email: InboundEmail) -> IngestionResult:
    if email.attachment_bytes is None or not email.attachment_filename:
        raise InboundEmailRejected("Inbound email has no attachment")

    if not is_supported_track_attachment(email.attachment_filename):
        raise InboundEmailRejected(
            "Inbound email attachment filename is not a supported track format"
        )

    try:
        activity = parse_track_attachment(
            email.attachment_bytes,
            original_filename=email.attachment_filename,
        )
    except GPXParseError as error:
        raise ActionableTrackRejected(str(error)) from error
    except VKXParseError as error:
        raise ActionableTrackRejected(
            "Inbound email attachment is not a valid Vakaros VKX file"
        ) from error
    except VakarosCSVParseError as error:
        raise ActionableTrackRejected(
            "Inbound email attachment is not a valid Vakaros CSV file"
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
