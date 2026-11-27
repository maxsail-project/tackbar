"""Candidate Sessions for a reviewed course (Issue #242, 242.3 correction C).

Admin-only help for choosing where to attach a course; it never attaches.
A Session is a candidate when a member Activity's time span overlaps the
course time range AND a member Activity has a canonical sample within
``CANDIDATE_MAX_DISTANCE_METRES`` of the course start-line midpoint while that
line is valid (both referenced elements have a position at the sample time).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Iterable, Sequence

from app.course.gun_suggestion import TrackPoint, position_at
from app.course.schema import ReviewedCourse
from app.course.segmentation import distance_metres


CANDIDATE_MAX_DISTANCE_METRES = 2_000.0


@dataclass(frozen=True)
class MemberActivity:
    activity_id: str
    start: datetime
    end: datetime


@dataclass(frozen=True)
class SessionCandidate:
    session_id: str
    overlap_seconds: int
    min_distance_m: float


def start_line_midpoint(course: ReviewedCourse, moment: datetime) -> tuple[float, float] | None:
    if course.start_line is None:
        return None
    elements = {element.id: element for element in course.elements}
    boat = position_at(elements[course.start_line.boat], moment)
    pin = position_at(elements[course.start_line.pin], moment)
    if boat is None or pin is None:
        return None
    # Course lines span at most a few hundred metres: the coordinate mean is exact enough.
    return (boat[0] + pin[0]) / 2, (boat[1] + pin[1]) / 2


def _covered_seconds(intervals: Iterable[tuple[datetime, datetime]]) -> int:
    """Length of the union of closed intervals, in whole seconds."""
    total, current = 0.0, None
    for start, end in sorted(intervals):
        if current is None or start > current[1]:
            if current is not None:
                total += (current[1] - current[0]).total_seconds()
            current = [start, end]
        else:
            current[1] = max(current[1], end)
    if current is not None:
        total += (current[1] - current[0]).total_seconds()
    return round(total)


def evaluate_session(
    course: ReviewedCourse,
    session_id: str,
    members: Sequence[MemberActivity],
    points: Callable[[str], Sequence[TrackPoint] | None],
) -> SessionCandidate | None:
    start, end = course.time_range.from_, course.time_range.to
    overlapping = [m for m in members if m.start <= end and start <= m.end]
    if not overlapping or course.start_line is None:
        return None
    minimum = None
    for member in overlapping:
        for point in points(member.activity_id) or ():
            if not start <= point.utc <= end:
                continue
            midpoint = start_line_midpoint(course, point.utc)
            if midpoint is None:
                continue
            distance = distance_metres(point.lat, point.lon, *midpoint)
            if minimum is None or distance < minimum:
                minimum = distance
    if minimum is None or minimum > CANDIDATE_MAX_DISTANCE_METRES:
        return None
    overlap = _covered_seconds(
        (max(m.start, start), min(m.end, end)) for m in overlapping
    )
    return SessionCandidate(session_id=session_id, overlap_seconds=overlap, min_distance_m=round(minimum, 1))
