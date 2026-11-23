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


def gpx_from_gaps_ns(gaps_ns):
    time = pd.Timestamp("2031-06-15T08:00:00Z")
    points = [f'<trkpt lat="0" lon="0"><time>{time.isoformat()}</time></trkpt>']
    for index, gap_ns in enumerate(gaps_ns, start=1):
        time += pd.Timedelta(gap_ns, unit="ns")
        points.append(f'<trkpt lat="0" lon="{index * .00001}"><time>{time.isoformat()}</time></trkpt>')
    return f'<gpx><trk><trkseg>{"".join(points)}</trkseg></trk></gpx>'.encode()


SECOND_NS = 1_000_000_000


def one_hertz_with_gaps_ns(*exceptional_ns, ones=1800):
    """1 Hz intervals with the given long intervals spread evenly inside the track."""
    gaps = [SECOND_NS] * ones
    step = ones // (len(exceptional_ns) + 1)
    for position, gap in enumerate(exceptional_ns, start=1):
        gaps.insert(position * step + position - 1, gap)
    return gaps


# Every #171/#218 criterion fails: median, P95, count, longest and total, in order.
ALL_CRITERIA_GAPS_NS = [5 * SECOND_NS] * 18 + [11 * SECOND_NS, 12 * SECOND_NS, 100 * SECOND_NS]
ALL_CRITERIA_ERROR = (
    "GPX temporal quality failed: median 5 s > 2 s; P95 12 s > 5 s; "
    "exceptional gap count 3 > 2; longest exceptional gap 100 s > 90 s; "
    "exceptional gap total 123 s > 10.65 s (5% of track duration 213 s)"
)
# Shared controlled rejections for parser, email, Admin upload and Reprocess tests.
QUALITY_REJECTIONS = [
    (gpx_bytes((0, 3)), "GPX temporal quality failed: median 3 s > 2 s"),
    (gpx_from_gaps_ns([SECOND_NS] * 18 + [5_000_000_001, 10 * SECOND_NS]), "GPX temporal quality failed: P95 5.000000001 s > 5 s"),
    (gpx_from_gaps_ns(one_hertz_with_gaps_ns(90 * SECOND_NS + 1)), "GPX temporal quality failed: longest exceptional gap 90.000000001 s > 90 s"),
    (gpx_from_gaps_ns(ALL_CRITERIA_GAPS_NS), ALL_CRITERIA_ERROR),
]


@pytest.mark.parametrize("seconds", [(0, 1, 2, 3, 4), (0, 2, 4, 6), (0, 1, 2, 4, 9)])
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
    seconds = (0, 2, 7, 9, 14, 15, 16, 17, 18, 19, 20)
    samples = parse_gpx(gpx_bytes(seconds, [(0, x * .00001) for x in (0, 1, 4, 9, 16, 17, 18, 19, 20, 21, 22)]), "track.gpx").samples
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
    with pytest.raises(GPXParseError, match=r"exceptional gap total 10.000000001 s > 0.50000000005 s"):
        parse_gpx(content, "track.gpx")
    content = gpx_bytes((0, 1)).replace(b"08:00:01+00:00", b"08:00:01.123456789+00:00")
    samples = parse_gpx(content, "track.gpx").samples
    assert normalize_track("activity", samples).utc.iloc[-1] == "2031-06-15T08:00:01.123456789Z"


def test_one_hertz_and_quality_limit_equalities_preserve_all_samples():
    one_hertz = parse_gpx(gpx_bytes(range(21)), "track.gpx")
    assert len(one_hertz.samples) == 21
    # 20 intervals: median 1 s, nearest-rank P95 5 s, maximum 10 s.
    gaps = [1_000_000_000] * 17 + [2_000_000_000, 5_000_000_000, 10_000_000_000]
    activity = parse_gpx(gpx_from_gaps_ns(gaps), "track.gpx")
    assert len(activity.samples) == len(gaps) + 1
    assert [b["utc"].value - a["utc"].value for a, b in zip(activity.samples, activity.samples[1:])] == gaps


@pytest.mark.parametrize("gaps", [
    [2_000_000_000],  # One interval is its own median and P95.
    [1_000_000_000, 3_000_000_000],  # Even-count median equals 2 s.
])
def test_median_limit_equality_is_accepted(gaps):
    assert len(parse_gpx(gpx_from_gaps_ns(gaps), "track.gpx").samples) == len(gaps) + 1


def test_median_just_above_limit_rejects_independently():
    # Median is 2 s + 0.5 ns; P95 and maximum still pass.
    with pytest.raises(GPXParseError) as rejected:
        parse_gpx(gpx_from_gaps_ns([1_000_000_000, 3_000_000_001]), "track.gpx")
    assert str(rejected.value) == "GPX temporal quality failed: median 2.0000000005 s > 2 s"


def test_p95_just_above_limit_rejects_independently():
    # Nearest-rank P95 is the 19th of 20 sorted intervals.
    gaps = [1_000_000_000] * 18 + [5_000_000_001, 10_000_000_000]
    with pytest.raises(GPXParseError) as rejected:
        parse_gpx(gpx_from_gaps_ns(gaps), "track.gpx")
    assert str(rejected.value) == "GPX temporal quality failed: P95 5.000000001 s > 5 s"


def test_single_64_second_gap_is_admitted_without_changing_samples():
    # Synthetic analogue of the private #218 pilot: 1 Hz with one 64 s interval.
    gaps = one_hertz_with_gaps_ns(64 * SECOND_NS, ones=3372)
    activity = parse_gpx(gpx_from_gaps_ns(gaps), "track.gpx")
    assert [b["utc"].value - a["utc"].value for a, b in zip(activity.samples, activity.samples[1:])] == gaps


@pytest.mark.parametrize("gaps", [
    one_hertz_with_gaps_ns(90 * SECOND_NS),  # Each gap may last exactly 90 s.
    one_hertz_with_gaps_ns(11 * SECOND_NS, 11 * SECOND_NS),  # At most two gaps.
    one_hertz_with_gaps_ns(64 * SECOND_NS, ones=1216),  # Total exactly 5% of 1280 s.
    one_hertz_with_gaps_ns(10 * SECOND_NS, 10 * SECOND_NS, 10 * SECOND_NS, ones=100),  # 10 s is not exceptional.
])
def test_exceptional_gap_budget_equalities_are_admitted(gaps):
    assert len(parse_gpx(gpx_from_gaps_ns(gaps), "track.gpx").samples) == len(gaps) + 1


@pytest.mark.parametrize("gaps,criterion", [
    (one_hertz_with_gaps_ns(90 * SECOND_NS + 1), "longest exceptional gap 90.000000001 s > 90 s"),
    (one_hertz_with_gaps_ns(*[11 * SECOND_NS] * 3), "exceptional gap count 3 > 2"),
    (one_hertz_with_gaps_ns(64 * SECOND_NS, ones=1215), "exceptional gap total 64 s > 63.95 s (5% of track duration 1279 s)"),
    (one_hertz_with_gaps_ns(64 * SECOND_NS + 1, ones=1216), "exceptional gap total 64.000000001 s > 64.00000000005 s (5% of track duration 1280.000000001 s)"),
])
def test_exceptional_gap_budget_violations_reject_independently(gaps, criterion):
    with pytest.raises(GPXParseError) as rejected:
        parse_gpx(gpx_from_gaps_ns(gaps), "track.gpx")
    assert str(rejected.value) == "GPX temporal quality failed: " + criterion


def test_every_violated_criterion_is_reported_in_stable_order():
    with pytest.raises(GPXParseError) as rejected:
        parse_gpx(gpx_from_gaps_ns(ALL_CRITERIA_GAPS_NS), "track.gpx")
    assert str(rejected.value) == ALL_CRITERIA_ERROR


def test_two_temporal_quality_failures_are_reported_in_order():
    # Median and P95 fail while every interval remains within 10 s.
    with pytest.raises(GPXParseError) as rejected:
        parse_gpx(gpx_from_gaps_ns([1_000_000_000, 6_000_000_000]), "track.gpx")
    assert str(rejected.value) == (
        "GPX temporal quality failed: median 3.5 s > 2 s; P95 6 s > 5 s"
    )


def test_sparse_garmin_like_cadence_fails_temporal_quality():
    # Synthetic 5 s median with a few 11–12 s gaps, without private track data.
    gaps = [5_000_000_000] * 18 + [11_000_000_000, 12_000_000_000]
    with pytest.raises(GPXParseError) as rejected:
        parse_gpx(gpx_from_gaps_ns(gaps), "track.gpx")
    assert str(rejected.value) == (
        "GPX temporal quality failed: median 5 s > 2 s; P95 11 s > 5 s; "
        "exceptional gap total 23 s > 5.65 s (5% of track duration 113 s)"
    )


def _runs_track(*runs, gap_seconds=64):
    """Runs of (lat, lon) unit steps per second, separated by long intervals."""
    seconds, positions, now, lat, lon = [], [], 0, 0.0, 0.0
    for run_index, (count, step) in enumerate(runs):
        if run_index:
            now += gap_seconds
        for sample in range(count):
            if sample or run_index:
                lat, lon = lat + step[0], lon + step[1]
            seconds.append(now)
            positions.append((lat, lon))
            now += 1
    # Pad with stationary 1 Hz samples so the gap budget admits the track.
    padding = range(now, now + 2000)
    return parse_gpx(gpx_bytes([*seconds, *padding], positions + [positions[-1]] * 2000), "track.gpx").samples


def test_movement_never_uses_a_neighbour_across_an_exceptional_gap():
    east, north = (0, .00001), (.00001, 0)
    samples = _runs_track((5, east), (5, north))
    unit = 2.16146
    # Run boundaries use one-sided evidence from their own run only.
    assert samples[4]["sog"] == pytest.approx(unit, rel=1e-5)  # t2 -> t4
    assert samples[4]["cog"] == pytest.approx(90)
    assert samples[5]["sog"] == pytest.approx(unit, rel=1e-5)  # t+0 -> t+2 after the gap
    assert samples[5]["cog"] == pytest.approx(0)
    assert samples[2]["sog"] == pytest.approx(unit, rel=1e-5)  # centered inside the first run


def test_sample_alone_in_its_run_has_no_movement():
    east = (0, .00001)
    samples = _runs_track((3, east), (1, east), (3, east), gap_seconds=20)
    assert samples[3]["sog"] is None and samples[3]["cog"] is None
    assert all(sample["sog"] is not None for index, sample in enumerate(samples) if index != 3)
    frame = normalize_track("activity", samples)
    assert pd.isna(frame.sog.iloc[3]) and pd.isna(frame.cog.iloc[3])
    # Canonical dist stays the consecutive-position calculation (#218 scope).
    assert frame.dist.iloc[3] == round(1.1119508, 2)


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
