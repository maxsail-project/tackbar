"""Supported email track formats; source-specific parsers remain adapters."""

from pathlib import Path
from typing import BinaryIO

from app.models import Activity
from app.parsers.size_limits import MAX_ATTACHMENT_BYTES, TrackAttachmentTooLarge
from app.parsers.vakaros import (
    is_supported_vakaros_attachment,
    parse_vakaros_attachment,
)


def is_supported_track_attachment(filename: str) -> bool:
    return filename.lower().endswith(".gpx") or is_supported_vakaros_attachment(filename)


def parse_track_attachment(
    source: str | Path | bytes | BinaryIO,
    original_filename: str,
) -> Activity:
    if isinstance(source, bytes) and len(source) > MAX_ATTACHMENT_BYTES:
        raise TrackAttachmentTooLarge("Track attachment exceeds 16 MiB")
    if isinstance(source, (str, Path)) and Path(source).stat().st_size > MAX_ATTACHMENT_BYTES:
        raise TrackAttachmentTooLarge("Track attachment exceeds 16 MiB")
    if original_filename.lower().endswith(".gpx"):
        from app.parsers.gpx import parse_gpx

        return parse_gpx(source, original_filename=original_filename)
    return parse_vakaros_attachment(source, original_filename=original_filename)
