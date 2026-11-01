"""Read-only structural inventory of one archived VKX original."""

import gzip
from pathlib import Path

from app.parsers.vakaros_vkx import ROW_PAYLOAD_SIZES, VKX_1_4_REVISION


MAX_INVENTORY_BYTES = 256 * 1024 * 1024


class VKXInventoryError(ValueError):
    """The original cannot be counted as one complete supported VKX file."""


def count_vkx_rows(path: Path, *, compressed: bool) -> dict[int, int]:
    counts: dict[int, int] = {}
    consumed = 0
    opener = gzip.open if compressed else Path.open
    with opener(path, "rb") as source:
        while True:
            key_bytes = source.read(1)
            if not key_bytes:
                break
            key = key_bytes[0]
            size = ROW_PAYLOAD_SIZES.get(key)
            if size is None or (not counts and key != 0xFF):
                raise VKXInventoryError("Invalid VKX row framing")
            consumed += 1 + size
            if consumed > MAX_INVENTORY_BYTES:
                raise VKXInventoryError("VKX inventory size limit exceeded")
            payload = source.read(size)
            if len(payload) != size:
                raise VKXInventoryError("Truncated VKX row")
            if key == 0xFF and payload[0] != VKX_1_4_REVISION:
                raise VKXInventoryError("Unsupported VKX revision")
            counts[key] = counts.get(key, 0) + 1
    if not counts:
        raise VKXInventoryError("Empty VKX original")
    return counts
