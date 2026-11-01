import gzip

import pytest

from app.services.vkx_record_inventory import (
    VKXInventoryError,
    count_vkx_rows,
)


def test_inventory_counts_all_present_framed_rows_without_decoding_payloads(
    tmp_path, vakaros_vkx_bytes,
):
    raw = (
        vakaros_vkx_bytes
        + bytes([0x01]) + bytes(32)
        + bytes([0x04]) + bytes(13)
        + bytes([0x05]) + bytes(17)
        + bytes([0x06]) + bytes(18)
        + bytes([0x08]) + bytes(13)
        + bytes([0x0A]) + bytes(16)
        + bytes([0x21]) + bytes(52)
        + bytes([0xFE]) + bytes(2)
    )
    plain = tmp_path / "synthetic.vkx"
    zipped = tmp_path / "synthetic.vkx.gz"
    plain.write_bytes(raw)
    zipped.write_bytes(gzip.compress(raw))

    expected = {0xFF: 1, 0x02: 1, 0x01: 1, 0x04: 1, 0x05: 1,
                0x06: 1, 0x08: 1, 0x0A: 1, 0x21: 1, 0xFE: 1}
    assert count_vkx_rows(plain, compressed=False) == expected
    assert count_vkx_rows(zipped, compressed=True) == expected


@pytest.mark.parametrize("raw", [
    b"",
    bytes([0x02]) + bytes(44),
    bytes([0xFF, 0x04]) + bytes(6),
    bytes([0xFF, 0x05]) + bytes(6) + bytes([0x99]),
    bytes([0xFF, 0x05]) + bytes(6) + bytes([0x04]) + bytes(12),
])
def test_inventory_rejects_incomplete_or_unknown_framing(tmp_path, raw):
    original = tmp_path / "bad.vkx"
    original.write_bytes(raw)
    with pytest.raises(VKXInventoryError):
        count_vkx_rows(original, compressed=False)


def test_inventory_rejects_corrupt_gzip_and_bounds_decompressed_work(
    tmp_path, monkeypatch, vakaros_vkx_bytes,
):
    corrupt = tmp_path / "bad.vkx.gz"
    corrupt.write_bytes(b"not gzip")
    with pytest.raises(OSError):
        count_vkx_rows(corrupt, compressed=True)

    original = tmp_path / "bounded.vkx"
    original.write_bytes(vakaros_vkx_bytes)
    monkeypatch.setattr("app.services.vkx_record_inventory.MAX_INVENTORY_BYTES", 8)
    with pytest.raises(VKXInventoryError, match="size limit"):
        count_vkx_rows(original, compressed=False)
