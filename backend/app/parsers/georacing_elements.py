"""Strict, bounded intake of a GeoRacing course *elements* GPX (Issue #242).

A GeoRacing elements export is a plain GPX with one ``trk`` per tracked course
element (committee boat, pins, marks, spare trackers). It is course evidence for
an Admin review, never an Activity: this parser is used only by the Admin course
import tool and never by Activity ingestion, whose one-``trk`` rule is unchanged.

The safe-XML protections (no DTD/entities, depth and element-count ceilings) and
the received-byte limit are those of the plain GPX Activity parser.
"""

from dataclasses import dataclass
from io import BytesIO
import math
import re
from typing import BinaryIO, NamedTuple
from xml.etree import ElementTree as ET

import pandas as pd

from app.parsers.gpx import (
    MAX_GPX_BYTES,
    TIMESTAMP,
    GPXParseError,
    _BoundedTreeBuilder,
)


# One elements file per race; the observed export has 11 tracks.
MAX_ELEMENT_TRACKS = 32
MAX_TRACK_NAME_LENGTH = 120

_SUPPORTED_ROOTS = (
    "gpx",
    "{http://www.topografix.com/GPX/1/0}gpx",
    "{http://www.topografix.com/GPX/1/1}gpx",
)
_LOCAL_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?")
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


class GeoRacingElementsParseError(ValueError):
    """A controlled rejection that never includes private XML content."""


class ElementSample(NamedTuple):
    utc_ns: int
    lat: float
    lon: float


@dataclass(frozen=True)
class ElementTrack:
    index: int  # 1-based position in source order
    name: str
    samples: tuple[ElementSample, ...]


@dataclass(frozen=True)
class GeoRacingElementsFile:
    filename: str
    name: str | None
    tracks: tuple[ElementTrack, ...]


def parse_georacing_elements(
    source: bytes | BinaryIO,
    original_filename: str,
) -> GeoRacingElementsFile:
    stream = BytesIO(source) if isinstance(source, bytes) else source
    content = stream.read(MAX_GPX_BYTES + 1)
    filename = (original_filename or "").strip()
    if not filename.lower().endswith(".gpx"):
        raise GeoRacingElementsParseError(
            "Course elements filename must end with .gpx (uncompressed)"
        )
    if len(content) > MAX_GPX_BYTES:
        raise GeoRacingElementsParseError(
            "Course elements GPX exceeds the 16 MiB input limit"
        )
    try:
        root = ET.fromstring(
            content, parser=ET.XMLParser(target=_BoundedTreeBuilder())
        )
    except GPXParseError as error:
        raise GeoRacingElementsParseError(str(error)) from error
    except (ET.ParseError, LookupError, ValueError) as error:
        raise GeoRacingElementsParseError("Malformed GPX XML") from error

    if root.tag not in _SUPPORTED_ROOTS:
        raise GeoRacingElementsParseError("GPX XML must have a supported gpx root")
    namespace = root.tag.removesuffix("gpx")
    tracks = root.findall(f"{namespace}trk")
    if len(tracks) != len(list(root.iter(f"{namespace}trk"))):
        raise GeoRacingElementsParseError("GPX contains misplaced tracks")
    if not 1 <= len(tracks) <= MAX_ELEMENT_TRACKS:
        raise GeoRacingElementsParseError(
            f"Course elements GPX requires 1 to {MAX_ELEMENT_TRACKS} tracks"
        )
    segments = [
        segment for track in tracks for segment in track.findall(f"{namespace}trkseg")
    ]
    if len(segments) != len(list(root.iter(f"{namespace}trkseg"))):
        raise GeoRacingElementsParseError("GPX contains misplaced track segments")
    points_in_segments = sum(
        len(segment.findall(f"{namespace}trkpt")) for segment in segments
    )
    if points_in_segments != len(list(root.iter(f"{namespace}trkpt"))):
        raise GeoRacingElementsParseError("GPX contains misplaced trackpoints")

    parsed = tuple(
        _parse_track(track, index, namespace)
        for index, track in enumerate(tracks, start=1)
    )
    return GeoRacingElementsFile(
        filename=filename,
        name=_clean_name(root.find(f"{namespace}name")),
        tracks=parsed,
    )


def _parse_track(track: ET.Element, index: int, namespace: str) -> ElementTrack:
    segments = track.findall(f"{namespace}trkseg")
    if len(segments) != 1:
        raise GeoRacingElementsParseError(
            f"Course element track {index} requires exactly one segment"
        )
    points = segments[0].findall(f"{namespace}trkpt")
    if len(points) < 2:
        raise GeoRacingElementsParseError(
            f"Course element track {index} requires at least 2 trackpoints"
        )
    samples: list[ElementSample] = []
    for point in points:
        try:
            lat, lon = float(point.attrib["lat"]), float(point.attrib["lon"])
        except (KeyError, ValueError) as error:
            raise GeoRacingElementsParseError(
                f"Course element track {index} has a trackpoint without valid coordinates"
            ) from error
        if (
            not math.isfinite(lat) or not math.isfinite(lon)
            or not (-90 <= lat <= 90 and -180 <= lon <= 180)
        ):
            raise GeoRacingElementsParseError(
                f"Course element track {index} requires finite WGS84 coordinates"
            )
        times = point.findall(f"{namespace}time")
        text = (times[0].text or "").strip() if len(times) == 1 else ""
        if not TIMESTAMP.fullmatch(text):
            if _LOCAL_TIMESTAMP.fullmatch(text):
                raise GeoRacingElementsParseError(
                    f"Course element track {index} requires timezone-aware timestamps"
                )
            raise GeoRacingElementsParseError(
                f"Course element track {index} has a missing or invalid timestamp"
            )
        if not text.endswith("Z") and (int(text[-5:-3]) > 23 or int(text[-2:]) > 59):
            raise GeoRacingElementsParseError(
                f"Course element track {index} has an invalid timezone offset"
            )
        try:
            utc_ns = pd.Timestamp(text).tz_convert("UTC").as_unit("ns").value
        except (ValueError, OverflowError) as error:
            raise GeoRacingElementsParseError(
                f"Course element track {index} has an invalid timestamp"
            ) from error
        if samples and utc_ns <= samples[-1].utc_ns:
            raise GeoRacingElementsParseError(
                f"Course element track {index} timestamps must be strictly increasing"
            )
        samples.append(ElementSample(utc_ns=utc_ns, lat=lat, lon=lon))
    name = _clean_name(track.find(f"{namespace}name")) or f"Track {index}"
    return ElementTrack(index=index, name=name, samples=tuple(samples))


def _clean_name(element: ET.Element | None) -> str | None:
    if element is None:
        return None
    text = " ".join(_CONTROL_CHARACTERS.sub(" ", element.text or "").split())
    return text[:MAX_TRACK_NAME_LENGTH] or None
