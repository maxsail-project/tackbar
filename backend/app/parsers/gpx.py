"""Strict, bounded plain GPX intake for one continuous Activity.

Movement uses great-circle distance/initial bearing and elapsed UTC time, following
the mathematical approach in MaxSail utils.py without dropping or retiming points.
"""

from bisect import bisect_left
from io import BytesIO
import math
from pathlib import Path
import re
from statistics import median
from typing import BinaryIO
from xml.etree import ElementTree as ET

import pandas as pd

from app.models import Activity
from app.normalization.track_normalizer import EARTH_RADIUS_METRES


# Resource ceilings, comfortably above the representative 0.6–0.8 MB pilot files.
MAX_GPX_BYTES = 16 * 1024 * 1024
MAX_XML_ELEMENTS = 500_000
MAX_XML_DEPTH = 32
MAX_GPX_SAMPLES = 100_000
TIMESTAMP = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?"
    r"(?:Z|[+-]\d{2}:\d{2})"
)


class GPXParseError(ValueError):
    """A controlled rejection that never includes private XML content."""


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
        raise GPXParseError("GPX requires 2 to 100000 trackpoints")

    samples = []
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
                "GPX trackpoint requires an explicit timezone-aware timestamp"
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
            if delta_ns > 10_000_000_000:
                raise GPXParseError("GPX adjacent timestamp gap exceeds 10 seconds")
        samples.append({"utc": utc, "lat": lat, "lon": lon})

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


def _nearest(times: list[int], target: int, lo: int, hi: int) -> int:
    """Nearest available sample; equal-distance ties choose the earlier UTC."""
    index = bisect_left(times, target, lo, hi)
    candidates = [i for i in (index - 1, index) if lo <= i < hi]
    return min(candidates, key=lambda i: (abs(times[i] - target), i))


def _derive_movement(samples: list[dict]) -> None:
    times = [sample["utc"].value for sample in samples]
    for index, sample in enumerate(samples):
        # Use distinct evidence on each available side, closest to ±2 seconds.
        # Coarse cadence falls back to the immediate neighbor, never a fake 1 Hz.
        left = (
            _nearest(times, times[index] - 2_000_000_000, 0, index)
            if index else 0
        )
        right = (
            _nearest(times, times[index] + 2_000_000_000, index + 1, len(times))
            if index + 1 < len(times) else index
        )
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
