"""Gun suggestion from member-Activity start-line crossings (Issue #242 D2).

A suggestion only: the Admin may apply it, and it is never persisted as the gun.
The crossing rule mirrors Start Analysis #38 (frontend/src/utils/startAnalysis.ts,
frontend/src/config/startAnalysis.ts): a pre-start -> course-side transition
between two adjacent valid canonical samples separated by a positive interval
of at most the #218 gap threshold, whose crossing point lies on the PIN-BOAT
segment or up to 10 m beyond either end (D24). The course side is to the left
of PIN->BOAT (D7). Keep both implementations in step.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math
from typing import Iterable, Sequence

from app.course.schema import CourseElement, ReviewedCourse
from app.normalization.track_gaps import GAP_THRESHOLD_SECONDS


CROSSING_END_TOLERANCE_METRES = 10.0  # #38 D24
COURSE_SIDE = "left"  # #38 D7
_METRES_PER_DEGREE = 6_371_000 * math.pi / 180  # as the #38 frontend frame


@dataclass(frozen=True)
class TrackPoint:
    utc: datetime
    lat: float
    lon: float


@dataclass(frozen=True)
class LineCrossing:
    utc: datetime
    activity_id: str


def _position_at(element: CourseElement, moment: datetime) -> tuple[float, float] | None:
    # Closed intervals; where two touch, the later applies (as courseState.ts).
    match = None
    for position in element.positions:
        if position.from_ <= moment <= position.to:
            match = (position.lat, position.lon)
    return match


def _longitude_difference(longitude: float, origin: float) -> float:
    return ((((longitude - origin) % 360) + 540) % 360) - 180


class _LineFrame:
    def __init__(self, pin: tuple[float, float], boat: tuple[float, float]) -> None:
        self.pin = pin
        self.cos_latitude = math.cos(math.radians(pin[0]))
        self.line_x, self.line_y = self._local(*boat)
        self.length = math.hypot(self.line_x, self.line_y)

    def _local(self, lat: float, lon: float) -> tuple[float, float]:
        return (
            _longitude_difference(lon, self.pin[1]) * self.cos_latitude * _METRES_PER_DEGREE,
            (lat - self.pin[0]) * _METRES_PER_DEGREE,
        )

    def measure(self, lat: float, lon: float) -> tuple[float, float]:
        """(signed distance, positive behind / negative course side; line fraction)."""
        x, y = self._local(lat, lon)
        left = (self.line_x * y - self.line_y * x) / self.length
        distance = -left if COURSE_SIDE == "left" else left
        fraction = (x * self.line_x + y * self.line_y) / (self.length * self.length)
        return distance, fraction


def _frame_at(course: ReviewedCourse, moment: datetime) -> _LineFrame | None:
    if course.start_line is None:
        return None
    elements = {element.id: element for element in course.elements}
    boat = _position_at(elements[course.start_line.boat], moment)
    pin = _position_at(elements[course.start_line.pin], moment)
    if boat is None or pin is None:
        return None
    frame = _LineFrame(pin, boat)
    return frame if frame.length > 0 else None


def first_crossing(
    course: ReviewedCourse, activity_id: str, points: Sequence[TrackPoint],
) -> LineCrossing | None:
    """Earliest start-line crossing of one canonical track inside the course time range."""
    start, end = course.time_range.from_, course.time_range.to
    gap = timedelta(seconds=GAP_THRESHOLD_SECONDS)
    for before, after in zip(points, points[1:]):
        if before.utc < start or after.utc > end:
            continue
        elapsed = after.utc - before.utc
        if elapsed <= timedelta(0) or elapsed > gap:
            continue
        frame = _frame_at(course, before.utc)
        if frame is None:
            continue
        from_distance, from_fraction = frame.measure(before.lat, before.lon)
        to_distance, to_fraction = frame.measure(after.lat, after.lon)
        if not (from_distance >= 0 and to_distance < 0):
            continue
        share = from_distance / (from_distance - to_distance)
        line_fraction = from_fraction + share * (to_fraction - from_fraction)
        beyond = (
            -line_fraction * frame.length if line_fraction < 0
            else (line_fraction - 1) * frame.length if line_fraction > 1 else 0.0
        )
        if beyond > CROSSING_END_TOLERANCE_METRES + 1e-9:
            continue
        return LineCrossing(utc=before.utc + elapsed * share, activity_id=activity_id)
    return None


def suggest_gun(
    course: ReviewedCourse, tracks: Iterable[tuple[str, Sequence[TrackPoint]]],
) -> LineCrossing | None:
    """Earliest crossing across all given member-Activity tracks, or None."""
    crossings = [
        crossing for activity_id, points in tracks
        if (crossing := first_crossing(course, activity_id, points)) is not None
    ]
    return min(crossings, key=lambda crossing: (crossing.utc, crossing.activity_id), default=None)


def to_whole_second(moment: datetime) -> datetime:
    """Nearest whole UTC second, as the Admin gun input accepts."""
    rounded = (moment + timedelta(microseconds=500_000)).replace(microsecond=0)
    return rounded.astimezone(timezone.utc)
