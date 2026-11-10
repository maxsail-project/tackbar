"""Received-track and expanded Vakaros gzip limits."""

import gzip
import zlib
from io import BytesIO


MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024
MAX_EXPANDED_BYTES = 160 * 1024 * 1024
_CHUNK_BYTES = 1024 * 1024


class TrackAttachmentTooLarge(ValueError):
    pass


class ExpandedTrackTooLarge(ValueError):
    pass


class InvalidTrackGzip(ValueError):
    pass


def decompress_vakaros_gzip(content: bytes) -> bytes:
    if not content.startswith(b"\x1f\x8b"):
        raise InvalidTrackGzip("Vakaros gzip is corrupt or truncated")
    expanded = bytearray()
    try:
        with gzip.GzipFile(fileobj=BytesIO(content)) as stream:
            while True:
                chunk = stream.read(min(_CHUNK_BYTES, MAX_EXPANDED_BYTES - len(expanded) + 1))
                if not chunk:
                    break
                if len(expanded) + len(chunk) > MAX_EXPANDED_BYTES:
                    raise ExpandedTrackTooLarge("Expanded Vakaros track exceeds 160 MiB")
                expanded.extend(chunk)
    except (OSError, EOFError, zlib.error) as error:
        raise InvalidTrackGzip("Vakaros gzip is corrupt or truncated") from error
    return bytes(expanded)
