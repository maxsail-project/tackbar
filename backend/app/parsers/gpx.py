"""Strict, bounded plain GPX intake for one continuous Activity.

Movement uses great-circle distance/initial bearing and elapsed UTC time, following
the mathematical approach in MaxSail utils.py without dropping or retiming points.
"""

from bisect import bisect_left
from decimal import Decimal
from io import BytesIO
import math
from pathlib import Path
import re
from statistics import median
from typing import BinaryIO
from xml.etree import ElementTree as ET

import pandas as pd

from app.models import Activity
from app.normalization.track_gaps import GAP_THRESHOLD_SECONDS
from app.normalization.track_normalizer import EARTH_RADIUS_METRES


# Resource ceilings, comfortably above the representative 0.6–0.8 MB pilot files.
MAX_GPX_BYTES = 16 * 1024 * 1024
MAX_XML_ELEMENTS = 500_000
MAX_XML_DEPTH = 32
MAX_GPX_SAMPLES = 100_000
# Plain GPX temporal-quality admission thresholds (Issues #171 and #218).
# Require sufficiently frequent and consistent GPS samples for sailing analysis.
# All limits must be satisfied simultaneously; equality passes; values in seconds.
# Changes to these thresholds require review of the product contract and tests.
MAX_MEDIAN_GAP_SECONDS = 2
MAX_P95_GAP_SECONDS = 5
# An exceptional gap is an adjacent interval strictly above this threshold; it is
# the same >10 s rule that separates continuous runs for every source (#218 D5).
EXCEPTIONAL_GAP_THRESHOLD_SECONDS = GAP_THRESHOLD_SECONDS
# Bounded isolated exceptional gaps admitted per GPX Activity (#218 D2).
MAX_EXCEPTIONAL_GAPS = 2
MAX_EXCEPTIONAL_GAP_SECONDS = 90
MAX_EXCEPTIONAL_GAP_TOTAL_PERCENT = 5

# Conversion factor for nanosecond-precision UTC interval comparisons.
NS_PER_SECOND = 1_000_000_000

TIMESTAMP = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?"
    r"(?:Z|[+-]\d{2}:\d{2})"
)


class GPXParseError(ValueError):
    """A controlled rejection that never includes private XML content."""

    def __init__(self, message: str, feedback_category: str | None = None) -> None:
        super().__init__(message)
        self.feedback_category = feedback_category


def _seconds_text(twice_nanoseconds: int) -> str:
    """Format an exact interval, including an even median's possible half-ns."""
    return format(Decimal(twice_nanoseconds) / (2 * NS_PER_SECOND), "f")


class _BoundedTreeBuilder(ET.TreeBuilder):
    def __init__(self) -> None:
        super().__init__()
        self.depth = 0
        self.count = 0

    def start(self, tag, attrs):
        self.depth += 1
        self.count += 1
        if self.depth > MAX_XML_DEPTH or self.count > MAX_XML_ELEMENTS:
            raise GPXParseError("GPX XML exceeds structural resource limits")
        return super().start(tag, attrs)

    def end(self, tag):
        self.depth -= 1
        return super().end(tag)

    def doctype(self, name, pubid, system):
        # Parser callback works for UTF-8/16, unlike a raw-byte DTD substring scan.
        raise GPXParseError("GPX XML DTDs and entities are unsupported")


def parse_gpx(
    source: str | Path | bytes | BinaryIO,
    original_filename: str | None = None,
) -> Activity:
    filename = original_filename
    if isinstance(source, (str, Path)):
        filename = filename or Path(source).name
        with Path(source).open("rb") as stream:
            content = stream.read(MAX_GPX_BYTES + 1)
    else:
        stream = BytesIO(source) if isinstance(source, bytes) else source
        content = stream.read(MAX_GPX_BYTES + 1)
    if not filename or not filename.lower().endswith(".gpx"):
        raise GPXParseError("GPX input filename must end with .gpx (uncompressed)")
    if len(content) > MAX_GPX_BYTES:
        raise GPXParseError("GPX XML exceeds the 16 MiB input limit")
    try:
        root = ET.fromstring(
            content, parser=ET.XMLParser(target=_BoundedTreeBuilder())
        )
    except (ET.ParseError, LookupError, ValueError) as error:
        if isinstance(error, GPXParseError):
            raise
        raise GPXParseError("Malformed GPX XML") from error

    namespace = root.tag.removesuffix("gpx")
    if root.tag not in (
        "gpx",
        "{http://www.topografix.com/GPX/1/0}gpx",
        "{http://www.topografix.com/GPX/1/1}gpx",
    ):
        raise GPXParseError("GPX XML must have a supported gpx root")
    tracks = root.findall(f"{namespace}trk")
    if len(tracks) != 1 or len(list(root.iter(f"{namespace}trk"))) != 1:
        raise GPXParseError("GPX requires exactly one track")
    segments = tracks[0].findall(f"{namespace}trkseg")
    if len(segments) != 1 or len(list(root.iter(f"{namespace}trkseg"))) != 1:
        raise GPXParseError("GPX requires exactly one nonempty segment")
    points = segments[0].findall(f"{namespace}trkpt")
    if len(points) != len(list(root.iter(f"{namespace}trkpt"))):
        raise GPXParseError("GPX contains misplaced trackpoints")
    if not 2 <= len(points) <= MAX_GPX_SAMPLES:
        raise GPXParseError(
            "GPX requires 2 to 100000 trackpoints",
            feedback_category="structure" if len(points) < 2 else None,
        )

    samples = []
    gaps_ns = []
    for point in points:
        try:
            lat, lon = float(point.attrib["lat"]), float(point.attrib["lon"])
        except (KeyError, ValueError) as error:
            raise GPXParseError("GPX trackpoint requires valid coordinates") from error
        if (
            not math.isfinite(lat) or not math.isfinite(lon)
            or not (-90 <= lat <= 90 and -180 <= lon <= 180)
        ):
            raise GPXParseError("GPX trackpoint requires finite WGS84 coordinates")
        times = point.findall(f"{namespace}time")
        text = (times[0].text or "").strip() if len(times) == 1 else ""
        if not TIMESTAMP.fullmatch(text):
            raise GPXParseError(
                "GPX trackpoint requires an explicit timezone-aware timestamp",
                feedback_category=(
                    "timezone" if re.fullmatch(
                        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?", text
                    ) else "chronology"
                ),
            )
        if not text.endswith("Z") and (
            int(text[-5:-3]) > 23 or int(text[-2:]) > 59
        ):
            raise GPXParseError("GPX trackpoint has an invalid timezone offset")
        try:
            utc = pd.Timestamp(text).tz_convert("UTC").as_unit("ns")
        except (ValueError, OverflowError) as error:
            raise GPXParseError("GPX trackpoint has an invalid timestamp") from error
        if samples:
            delta_ns = utc.value - samples[-1]["utc"].value
            if delta_ns <= 0:
                raise GPXParseError(
                    "GPX timestamps must be strictly increasing in source order"
                )
            gaps_ns.append(delta_ns)
        samples.append({"utc": utc, "lat": lat, "lon": lon})

    ordered_gaps = sorted(gaps_ns)
    middle = len(ordered_gaps) // 2
    # Twice the median keeps an even sample count's half-nanosecond exact.
    if len(ordered_gaps) % 2:
        median_twice_ns = 2 * ordered_gaps[middle]
    else:
        median_twice_ns = ordered_gaps[middle - 1] + ordered_gaps[middle]
    # Nearest-rank P95: sorted observed interval at rank ceil(0.95 * count).
    p95_index = (95 * len(ordered_gaps) + 99) // 100 - 1
    p95_ns = ordered_gaps[p95_index]
    failures = []
    if median_twice_ns > 2 * MAX_MEDIAN_GAP_SECONDS * NS_PER_SECOND:
        failures.append(
            f"median {_seconds_text(median_twice_ns)} s > {MAX_MEDIAN_GAP_SECONDS} s"
        )
    if p95_ns > MAX_P95_GAP_SECONDS * NS_PER_SECOND:
        failures.append(f"P95 {_seconds_text(2 * p95_ns)} s > {MAX_P95_GAP_SECONDS} s")
    failures.extend(_exceptional_gap_failures(gaps_ns))
    if failures:
        raise GPXParseError(
            "GPX temporal quality failed: " + "; ".join(failures)
        )

    _derive_movement(samples)
    latitudes = [sample["lat"] for sample in samples]
    longitudes = [sample["lon"] for sample in samples]
    return Activity(
        source="gpx",
        original_filename=filename,
        device_name="",
        start_time=samples[0]["utc"],
        end_time=samples[-1]["utc"],
        start_lat=latitudes[0],
        start_lon=longitudes[0],
        end_lat=latitudes[-1],
        end_lon=longitudes[-1],
        center_lat=median(latitudes),
        center_lon=median(longitudes),
        min_lat=min(latitudes),
        max_lat=max(latitudes),
        min_lon=min(longitudes),
        max_lon=max(longitudes),
        samples=samples,
    )


def _exceptional_gap_failures(gaps_ns: list[int]) -> list[str]:
    """Bounded isolated-gap budget (#218 D2), in count, longest, total order."""
    exceptional = [
        gap for gap in gaps_ns
        if gap > EXCEPTIONAL_GAP_THRESHOLD_SECONDS * NS_PER_SECOND
    ]
    if not exceptional:
        return []
    failures = []
    if len(exceptional) > MAX_EXCEPTIONAL_GAPS:
        failures.append(
            f"exceptional gap count {len(exceptional)} > {MAX_EXCEPTIONAL_GAPS}"
        )
    longest_ns = max(exceptional)
    if longest_ns > MAX_EXCEPTIONAL_GAP_SECONDS * NS_PER_SECOND:
        failures.append(
            f"longest exceptional gap {_seconds_text(2 * longest_ns)} s"
            f" > {MAX_EXCEPTIONAL_GAP_SECONDS} s"
        )
    total_ns = sum(exceptional)
    duration_ns = sum(gaps_ns)  # last UTC - first UTC
    # Exact integer comparison: total <= percent/100 * duration.
    if 100 * total_ns > MAX_EXCEPTIONAL_GAP_TOTAL_PERCENT * duration_ns:
        limit = Decimal(MAX_EXCEPTIONAL_GAP_TOTAL_PERCENT * duration_ns) / (
            100 * NS_PER_SECOND
        )
        failures.append(
            f"exceptional gap total {_seconds_text(2 * total_ns)} s"
            f" > {format(limit, 'f')} s"
            f" ({MAX_EXCEPTIONAL_GAP_TOTAL_PERCENT}% of track duration"
            f" {_seconds_text(2 * duration_ns)} s)"
        )
    return failures


def _nearest(times: list[int], target: int, lo: int, hi: int) -> int:
    """Nearest available sample; equal-distance ties choose the earlier UTC."""
    index = bisect_left(times, target, lo, hi)
    candidates = [i for i in (index - 1, index) if lo <= i < hi]
    return min(candidates, key=lambda i: (abs(times[i] - target), i))


def _continuous_run_bounds(times: list[int]) -> list[tuple[int, int]]:
    """Per sample, the half-open index range of its run between exceptional gaps."""
    threshold_ns = EXCEPTIONAL_GAP_THRESHOLD_SECONDS * NS_PER_SECOND
    starts = [0] + [
        index for index in range(1, len(times))
        if times[index] - times[index - 1] > threshold_ns
    ]
    bounds = []
    for start, stop in zip(starts, starts[1:] + [len(times)]):
        bounds.extend([(start, stop)] * (stop - start))
    return bounds


def _derive_movement(samples: list[dict]) -> None:
    times = [sample["utc"].value for sample in samples]
    runs = _continuous_run_bounds(times)
    for index, sample in enumerate(samples):
        start, stop = runs[index]
        # Use distinct evidence on each available side of the same continuous run,
        # closest to ±2 seconds; never a neighbor across an exceptional gap (#218 D3).
        # Coarse cadence falls back to the immediate neighbor, never a fake 1 Hz.
        left = (
            _nearest(times, times[index] - 2_000_000_000, start, index)
            if index > start else index
        )
        right = (
            _nearest(times, times[index] + 2_000_000_000, index + 1, stop)
            if index + 1 < stop else index
        )
        if left == right:
            # A sample alone in its run has no same-run movement evidence.
            sample["sog"] = sample["cog"] = None
            continue
        first, last = samples[left], samples[right]
        lat1, lat2 = math.radians(first["lat"]), math.radians(last["lat"])
        dlat = lat2 - lat1
        dlon = math.radians((last["lon"] - first["lon"] + 180) % 360 - 180)
        haversine = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        )
        haversine = min(1.0, max(0.0, haversine))
        distance = 2 * EARTH_RADIUS_METRES * math.atan2(
            math.sqrt(haversine), math.sqrt(1 - haversine)
        )
        elapsed = (times[right] - times[left]) / 1_000_000_000
        sample["sog"] = distance / elapsed * 3600 / 1852
        east = math.sin(dlon) * math.cos(lat2)
        north = (
            math.cos(lat1) * math.sin(lat2)
            - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
        )
        # Numerical degeneracy only (coincident/antipodal points), no GPS noise floor.
        sample["cog"] = (
            # Second modulo handles floating-point rounding of tiny negatives to 360.
            (math.degrees(math.atan2(east, north)) % 360) % 360
            if math.hypot(east, north) > 1e-15 else None
        )
