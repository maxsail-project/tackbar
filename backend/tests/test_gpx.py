from datetime import datetime, timedelta, timezone
import gzip
from io import BytesIO
import math
from pathlib import Path

import pandas as pd
import pytest

from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS, normalize_track
from app.parsers import gpx
from app.parsers.gpx import GPXParseError, parse_gpx
from app.parsers.track import is_supported_track_attachment


def gpx_bytes(seconds=(0, 1, 2, 3, 4), positions=None, namespace="http://www.topografix.com/GPX/1/1"):
    if positions is None:
        positions = [(0, second * 0.00001) for second in seconds]
    start = datetime(2031, 6, 15, 8, tzinfo=timezone.utc)
    points = "".join(
        f'<trkpt lat="{lat}" lon="{lon}"><time>{(start + timedelta(seconds=second)).isoformat()}</time></trkpt>'
        for second, (lat, lon) in zip(seconds, positions)
    )
    return f'<gpx xmlns="{namespace}" version="1.1"><trk><trkseg>{points}</trkseg></trk></gpx>'.encode()


@pytest.mark.parametrize("seconds", [(0, 1, 2, 3, 4), (0, 2, 4, 6), (0, 2, 7, 9, 14), (0, 5, 10), (0, 10)])
def test_cadence_and_speed_use_elapsed_time_and_keep_all_samples(seconds):
    activity = parse_gpx(gpx_bytes(seconds), "training.GPX")
    assert len(activity.samples) == len(seconds)
    # Equatorial eastward motion at 0.00001 degree/second ≈ 2.1615 knots.
    for sample in activity.samples:
        assert sample["sog"] == pytest.approx(2.16146, rel=1e-5)
        assert sample["cog"] == pytest.approx(90)
    assert activity.source == "gpx"
    assert activity.device_name == ""
    frame = normalize_track("activity", activity.samples)
    assert list(frame.columns) == CANONICAL_TRACK_COLUMNS
    assert frame[["hdg", "heel", "trim", "quat_w", "quat_x", "quat_y", "quat_z"]].isna().all().all()
    assert frame.dist.tolist() == [0] + [round((b - a) * 1.1119508, 2) for a, b in zip(seconds, seconds[1:])]


def test_centered_window_and_one_sided_endpoints():
    # Nonuniform motion distinguishes ±2 seconds from consecutive-point speed.
    positions = [(0, x * 0.00001) for x in (0, 1, 4, 9, 16, 25, 36)]
    samples = parse_gpx(gpx_bytes(range(7), positions), "track.gpx").samples
    unit = 2.16146
    assert samples[0]["sog"] == pytest.approx(2 * unit, rel=1e-5)  # t0 -> t2
    assert samples[3]["sog"] == pytest.approx(6 * unit, rel=1e-5)  # t1 -> t5
    assert samples[-1]["sog"] == pytest.approx(10 * unit, rel=1e-5)  # t4 -> t6


def test_irregular_window_chooses_nearest_real_time_with_earlier_ties():
    samples = parse_gpx(gpx_bytes((0, 2, 7, 9, 14), [(0, x * .00001) for x in (0, 1, 4, 9, 16)]), "track.gpx").samples
    # t7 uses t2 and t9, actual interval 7 seconds.
    assert samples[2]["sog"] == pytest.approx(8 / 7 * 2.16146, rel=1e-5)
    tied = parse_gpx(gpx_bytes((0, 1, 3, 4), [(0, x * .00001) for x in (0, 1, 9, 16)]), "track.gpx").samples
    assert tied[-1]["sog"] == pytest.approx(5 * 2.16146, rel=1e-5)


def test_stationary_samples_and_circular_bearings():
    samples = parse_gpx(gpx_bytes(positions=[(39, -0.3)] * 5), "track.gpx").samples
    assert len(samples) == 5
    assert all(sample["sog"] == 0 and sample["cog"] is None for sample in samples)
    bearings = []
    for direction in (-1, 1):
        sample = parse_gpx(gpx_bytes((0, 1), [(0, 0), (.001, direction * .00001)]), "track.gpx").samples[0]
        bearings.append(sample["cog"])
    assert bearings[0] > 359
    assert bearings[1] < 1
    assert (bearings[1] - bearings[0]) % 360 < 2


def test_dateline_crossing_is_short_eastward_displacement():
    samples = parse_gpx(gpx_bytes((0, 1), [(0, 179.99999), (0, -179.99999)]), "track.gpx").samples
    assert samples[0]["sog"] == pytest.approx(4.32292, rel=1e-5)
    assert samples[0]["cog"] == pytest.approx(90)


def test_repeated_coordinates_are_not_dropped_among_movement():
    samples = parse_gpx(gpx_bytes(positions=[(0, x * .00001) for x in (0, 1, 1, 3, 4)]), "track.gpx").samples
    assert len(samples) == 5
    frame = normalize_track("activity", samples)
    assert frame.dist.iloc[2] == 0
    assert frame.utc.nunique() == 5


def test_missing_or_duplicate_time_is_not_repaired():
    time = b"<time>2031-06-15T08:00:00+00:00</time>"
    for replacement in (b"", time + time):
        with pytest.raises(GPXParseError, match="timestamp"):
            parse_gpx(gpx_bytes((0, 1)).replace(time, replacement), "track.gpx")


def test_order_and_gap_checks_use_normalized_utc_and_preserve_subseconds():
    content = gpx_bytes((0, 1)).replace(b"08:00:01+00:00", b"09:00:00+01:00")
    with pytest.raises(GPXParseError, match="strictly increasing"):
        parse_gpx(content, "track.gpx")
    content = gpx_bytes((0, 1)).replace(b"08:00:01+00:00", b"08:00:10.000000001+00:00")
    with pytest.raises(GPXParseError, match="10 seconds"):
        parse_gpx(content, "track.gpx")
    content = gpx_bytes((0, 1)).replace(b"08:00:01+00:00", b"08:00:01.123456789+00:00")
    samples = parse_gpx(content, "track.gpx").samples
    assert normalize_track("activity", samples).utc.iloc[-1] == "2031-06-15T08:00:01.123456789Z"


def test_gzip_payload_cannot_bypass_plain_gpx_policy_by_filename():
    with pytest.raises(GPXParseError, match="Malformed"):
        parse_gpx(gzip.compress(gpx_bytes()), "track.gpx")


@pytest.mark.parametrize("namespace", ["", "http://www.topografix.com/GPX/1/0", "http://www.topografix.com/GPX/1/1"])
def test_namespaces_offsets_and_ignored_non_track_data(namespace):
    content = gpx_bytes((0, 1), namespace=namespace).replace(b"08:00:00+00:00", b"10:00:00+02:00")
    content = content.replace(b"<trk>", b'<wpt lat="bad"/><rte><rtept lat="bad"/></rte><trk>')
    content = content.replace(b"</trkpt>", b"<extensions><hdg>123</hdg><sog>999</sog></extensions></trkpt>")
    samples = parse_gpx(content, "track.gpx").samples
    assert len(samples) == 2
    assert samples[0]["utc"].isoformat() == "2031-06-15T08:00:00+00:00"
    assert "hdg" not in samples[0]
    assert samples[0]["sog"] < 3


@pytest.mark.parametrize("old,new", [
    (b'lat="0"', b'lat="NaN"'), (b'lat="0"', b'lat="91"'),
    (b'lon="0.0"', b'lon="inf"'), (b'lon="0.0"', b'lon="181"'),
    (b'lat="0"', b'no_lat="0"'), (b'lon="0.0"', b'lon="bad"'),
    (b"08:00:00+00:00", b"08:00:00"), (b"08:00:00+00:00", b"08:00:00+25:00"),
    (b"08:00:00+00:00", b"08:00:00+00:60"), (b"08:00:00+00:00", b"08:00:00-01:99"),
    (b"08:00:00+00:00", b"25:00:00Z"), (b"2031-06-15", b"2031-02-30"),
    (b"08:00:01+00:00", b"08:00:00+00:00"), (b"08:00:01+00:00", b"07:59:59+00:00"),
    (b"08:00:01+00:00", b"08:00:10.001+00:00"),
    (b"<time>", b"<not_time>"), (b"</time>", b"</not_time>"),
])
def test_invalid_samples_reject_entire_file(old, new):
    content = gpx_bytes((0, 1))
    assert old in content
    with pytest.raises(GPXParseError):
        parse_gpx(content.replace(old, new, 1), "track.gpx")


@pytest.mark.parametrize("content", [
    b"not XML", b"<gpx>", b"<other/>", b"<gpx/>",
    b"<gpx><trk><trkseg/></trk></gpx>",
    gpx_bytes((0,)),
    gpx_bytes().replace(b"</trk>", b"<trkseg/></trk>"),
    gpx_bytes().replace(b"</gpx>", b"<trk/></gpx>"),
    gpx_bytes().replace(b"<trkseg>", b"<extensions><trkseg>").replace(b"</trkseg>", b"</trkseg></extensions>"),
    gpx_bytes().replace(b"</gpx>", b'<trkpt lat="0" lon="0"/></gpx>'),
    b'<!DOCTYPE gpx [<!ENTITY x "bad">]><gpx>&x;</gpx>',
    b'<!DOCTYPE gpx SYSTEM "file:///private"><gpx/>',
    ('<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE gpx [<!ENTITY x "bad">]><gpx>&x;</gpx>').encode("utf-16"),
    b"<gpx>" + b"<extensions>" * 40 + b"</extensions>" * 40 + b"</gpx>",
])
def test_invalid_structure_or_unsafe_xml(content):
    with pytest.raises(GPXParseError):
        parse_gpx(content, "track.gpx")


def test_resource_ceilings_are_enforced(monkeypatch):
    with pytest.raises(GPXParseError, match="16 MiB"):
        parse_gpx(b" " * (gpx.MAX_GPX_BYTES + 1), "track.gpx")
    monkeypatch.setattr(gpx, "MAX_XML_ELEMENTS", 10)
    with pytest.raises(GPXParseError, match="resource"):
        parse_gpx(gpx_bytes(), "track.gpx")
    monkeypatch.setattr(gpx, "MAX_XML_ELEMENTS", 500_000)
    monkeypatch.setattr(gpx, "MAX_GPX_SAMPLES", 3)
    with pytest.raises(GPXParseError, match="trackpoints"):
        parse_gpx(gpx_bytes(), "track.gpx")


def test_path_and_stream_inputs(temporary_directory):
    path = temporary_directory / "track.gpx"
    path.write_bytes(gpx_bytes())
    assert parse_gpx(path).samples == parse_gpx(BytesIO(path.read_bytes()), "track.gpx").samples


@pytest.mark.parametrize("filename", ["track.gpx.gz", "track.gpx.gzip", "track.gpx.zip", "track.zip"])
def test_compressed_gpx_is_unsupported(filename):
    assert not is_supported_track_attachment(filename)
    with pytest.raises(GPXParseError, match="uncompressed"):
        parse_gpx(gpx_bytes(), filename)


# Unmodified public MaxSail Analytics fixtures, as referenced in Issue #32:
# https://github.com/maxsail-project/maxsail-analytics/blob/main/<filename>
@pytest.mark.parametrize("filename,count,repeats", [
    ("2025-06-21-ESP29375-P01.gpx", 1913, 0),
    ("2025-06-21-ESP30782-P01.gpx", 1981, 1),
])
def test_representative_real_gpx(filename, count, repeats):
    activity = parse_gpx(Path(__file__).parent / "fixtures" / filename)
    assert len(activity.samples) == count
    frame = normalize_track("activity", activity.samples)
    assert len(frame) == count
    assert sum(a["lat"] == b["lat"] and a["lon"] == b["lon"] for a, b in zip(activity.samples, activity.samples[1:])) == repeats
    assert all(math.isfinite(sample["sog"]) for sample in activity.samples)
    assert all(sample["cog"] is None or 0 <= sample["cog"] < 360 for sample in activity.samples)
    assert pd.to_datetime(frame.utc, utc=True).is_monotonic_increasing
