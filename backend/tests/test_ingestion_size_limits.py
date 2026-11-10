import gzip

import pytest

from app.parsers import size_limits
from app.parsers.size_limits import (
    ExpandedTrackTooLarge, InvalidTrackGzip, TrackAttachmentTooLarge,
)
from app.parsers.track import parse_track_attachment
from app.parsers.vakaros_csv import VakarosCSVParseError, parse_vakaros_csv
from app.parsers.vakaros_vkx import VKXParseError, parse_vakaros_vkx
from test_vakaros_vkx import _position, _vkx


CSV = (
    b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim\n"
    b"2031-06-10T10:00:00Z,38.1,-0.2,5.2,359,1,-8,2\n"
)
VKX = _vkx(_position())


def test_approved_byte_ceilings():
    assert size_limits.MAX_ATTACHMENT_BYTES == 16 * 1024 * 1024
    assert size_limits.MAX_EXPANDED_BYTES == 160 * 1024 * 1024


@pytest.mark.parametrize("filename", ["track.csv", "track.csv.gz", "track.vkx", "track.vkx.gz", "track.gpx"])
def test_received_attachment_boundary_is_inclusive(monkeypatch, filename):
    import app.parsers.track as track

    monkeypatch.setattr(track, "parse_vakaros_attachment", lambda source, original_filename: source)
    monkeypatch.setattr("app.parsers.gpx.parse_gpx", lambda source, original_filename: source)
    accepted = b"x" * size_limits.MAX_ATTACHMENT_BYTES
    assert parse_track_attachment(accepted, filename) is accepted
    with pytest.raises(TrackAttachmentTooLarge, match="16 MiB"):
        parse_track_attachment(accepted + b"x", filename)


@pytest.mark.parametrize("content", [CSV, VKX])
def test_expanded_gzip_boundary_is_inclusive(monkeypatch, content):
    monkeypatch.setattr(size_limits, "MAX_EXPANDED_BYTES", len(content))
    assert size_limits.decompress_vakaros_gzip(gzip.compress(content)) == content
    with pytest.raises(ExpandedTrackTooLarge, match="160 MiB"):
        size_limits.decompress_vakaros_gzip(gzip.compress(content + b"x"))


def test_high_expansion_stops_with_bounded_reads(monkeypatch):
    monkeypatch.setattr(size_limits, "MAX_EXPANDED_BYTES", 2 * 1024 * 1024)
    original = size_limits.gzip.GzipFile.read
    requests = []

    def observed_read(stream, size=-1):
        requests.append(size)
        return original(stream, size)

    monkeypatch.setattr(size_limits.gzip.GzipFile, "read", observed_read)
    compressed = gzip.compress(b"x" * (8 * 1024 * 1024))
    assert len(compressed) < 16 * 1024
    with pytest.raises(ExpandedTrackTooLarge):
        size_limits.decompress_vakaros_gzip(compressed)
    assert requests and all(0 < size <= 1024 * 1024 for size in requests)
    assert sum(requests) <= 2 * 1024 * 1024 + 1


@pytest.mark.parametrize("filename,content,parser,error_type", [
    ("track.csv.gz", CSV, parse_vakaros_csv, VakarosCSVParseError),
    ("track.vkx.gz", VKX, parse_vakaros_vkx, VKXParseError),
])
def test_vakaros_parsers_enforce_expanded_limit_and_reject_bad_gzip(
    monkeypatch, filename, content, parser, error_type,
):
    monkeypatch.setattr(size_limits, "MAX_EXPANDED_BYTES", len(content))
    assert parser(gzip.compress(content), original_filename=filename).samples
    with pytest.raises(error_type, match="exceeds 160 MiB"):
        parser(gzip.compress(content + b"x"), original_filename=filename)
    for corrupt in (b"", b"not gzip", gzip.compress(content)[:-3]):
        with pytest.raises(error_type, match="not valid gzip"):
            parser(corrupt, original_filename=filename)
        with pytest.raises(InvalidTrackGzip):
            size_limits.decompress_vakaros_gzip(corrupt)
