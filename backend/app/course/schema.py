"""Provider-independent course context, schema version 1 (Issue #242).

A course context describes one race (D1): its time range, the Admin-entered gun
and optional end (D2), the start and finish lines by element reference, and the
course elements whose positions are valid only within stable intervals. Course
changes (relocation, recovery, a pin changing role) are expressed only through
position intervals and separate elements. Provider specifics stay in ``source``.
"""

from datetime import datetime, timezone
import math
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)


COURSE_SCHEMA_VERSION = 1
# D5 (approved 2026-11-26). ``ignored`` tracks are listed in ``ignored_tracks``.
ROLE_VOCABULARY = (
    "committee_boat",
    "start_pin",
    "finish_pin",
    "gate",
    "mark",
    "change_mark",
    "ignored",
)
ElementRole = Literal[
    "committee_boat", "start_pin", "finish_pin", "gate", "mark", "change_mark"
]
SourceKind = Literal["georacing_elements_gpx"]

MAX_COURSE_ELEMENTS = 32
MAX_POSITIONS_PER_ELEMENT = 200
MAX_LABEL_LENGTH = 120
MAX_FILENAME_LENGTH = 255

_NO_CONTROL = r"^[^\x00-\x1f\x7f]*$"


def _to_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc)


UtcDatetime = Annotated[AwareDatetime, AfterValidator(_to_utc)]
Label = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=MAX_LABEL_LENGTH, pattern=_NO_CONTROL
    ),
]
ElementId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")]
GateId = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32, pattern=_NO_CONTROL)
]


def _finite(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("must be finite")
    return value


Latitude = Annotated[float, Field(ge=-90, le=90), AfterValidator(_finite)]
Longitude = Annotated[float, Field(ge=-180, le=180), AfterValidator(_finite)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CourseSource(_Strict):
    kind: SourceKind
    filename: Annotated[
        str,
        StringConstraints(min_length=1, max_length=MAX_FILENAME_LENGTH, pattern=_NO_CONTROL),
    ]
    sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
    imported_at: UtcDatetime


class CourseRace(_Strict):
    label: Label
    gun_utc: UtcDatetime | None = None
    gun_source: Literal["admin_entered"] | None = None
    end_utc: UtcDatetime | None = None

    @model_validator(mode="after")
    def _gun(self) -> "CourseRace":
        # D2: the gun is only ever Admin-entered; suggestions are never persisted.
        if (self.gun_utc is None) != (self.gun_source is None):
            raise ValueError("gun_source must be 'admin_entered' exactly when gun_utc is set")
        if self.gun_utc and self.end_utc and self.end_utc <= self.gun_utc:
            raise ValueError("end_utc must be after gun_utc")
        return self


class CourseRaceTimes(_Strict):
    """Admin edit of an attached course's race times (D14): both keys, null clears.

    The rules between the times and the course (gun source, time_range, end
    after gun) are those of the whole updated course.
    """

    gun_utc: UtcDatetime | None
    end_utc: UtcDatetime | None


class TimeRange(_Strict):
    from_: UtcDatetime = Field(alias="from")
    to: UtcDatetime

    @model_validator(mode="after")
    def _ordered(self) -> "TimeRange":
        if self.to <= self.from_:
            raise ValueError("'to' must be after 'from'")
        return self


class CourseLine(_Strict):
    boat: ElementId
    pin: ElementId


class ElementPosition(_Strict):
    from_: UtcDatetime = Field(alias="from")
    to: UtcDatetime
    lat: Latitude
    lon: Longitude

    @model_validator(mode="after")
    def _ordered(self) -> "ElementPosition":
        if self.to <= self.from_:
            raise ValueError("position 'to' must be after 'from'")
        return self


class CourseElement(_Strict):
    id: ElementId
    role: ElementRole
    gate: GateId | None = None
    label: Label
    positions: list[ElementPosition] = Field(min_length=1, max_length=MAX_POSITIONS_PER_ELEMENT)

    @model_validator(mode="after")
    def _consistent(self) -> "CourseElement":
        if (self.role == "gate") != (self.gate is not None):
            raise ValueError(f"element '{self.id}': gate id is required exactly for role 'gate'")
        for previous, current in zip(self.positions, self.positions[1:]):
            if current.from_ < previous.to:
                raise ValueError(
                    f"element '{self.id}': positions must be in time order without overlap"
                )
        return self


class IgnoredTrack(_Strict):
    label: Label
    reason: Label


class _CourseBody(_Strict):
    schema_version: Literal[1]
    course_id: UUID | None = None
    source: CourseSource
    race: CourseRace
    time_range: TimeRange
    start_line: CourseLine | None = None
    finish_line: CourseLine | None = None
    elements: list[CourseElement] = Field(max_length=MAX_COURSE_ELEMENTS)
    ignored_tracks: list[IgnoredTrack] = Field(default_factory=list, max_length=MAX_COURSE_ELEMENTS)

    @model_validator(mode="after")
    def _references(self) -> "_CourseBody":
        errors = []
        roles: dict[str, str] = {}
        for element in self.elements:
            if element.id in roles:
                errors.append(f"element id '{element.id}' is duplicated")
            roles[element.id] = element.role
        start, end = self.time_range.from_, self.time_range.to
        for element in self.elements:
            if any(p.from_ < start or p.to > end for p in element.positions):
                errors.append(f"element '{element.id}': positions must lie within time_range")
        for name, value in (("gun_utc", self.race.gun_utc), ("end_utc", self.race.end_utc)):
            if value is not None and not start <= value <= end:
                errors.append(f"race {name} must lie within time_range")
        # D5: lines reference elements by role.
        for line_name, line, pin_role in (
            ("start_line", self.start_line, "start_pin"),
            ("finish_line", self.finish_line, "finish_pin"),
        ):
            if line is None:
                continue
            for end_name, element_id, role in (
                ("boat", line.boat, "committee_boat"),
                ("pin", line.pin, pin_role),
            ):
                if element_id not in roles:
                    errors.append(f"{line_name}.{end_name} references unknown element '{element_id}'")
                elif roles[element_id] != role:
                    errors.append(f"{line_name}.{end_name} must reference a '{role}' element")
        if len(self.elements) + len(self.ignored_tracks) > MAX_COURSE_ELEMENTS:
            errors.append(f"at most {MAX_COURSE_ELEMENTS} elements and ignored tracks in total")
        if errors:
            raise ValueError("; ".join(errors))
        return self


class ReviewedCourse(_CourseBody):
    """An Admin-reviewed draft; ``course_id`` is assigned on validation if absent."""


class CourseContextV1(_CourseBody):
    """A schema-valid course context."""

    course_id: UUID


class PublicCourseSource(_Strict):
    """Shared-read provenance: no content hash and no stored paths (#242 D7)."""

    kind: SourceKind
    filename: Annotated[
        str,
        StringConstraints(min_length=1, max_length=MAX_FILENAME_LENGTH, pattern=_NO_CONTROL),
    ]
    imported_at: UtcDatetime


class PublicCourseContext(_CourseBody):
    """A Session course context as exposed to shared Session capabilities."""

    course_id: UUID
    source: PublicCourseSource


def public_course(course: CourseContextV1) -> PublicCourseContext:
    payload = course.model_dump(by_alias=True)
    payload["source"] = {
        key: payload["source"][key] for key in ("kind", "filename", "imported_at")
    }
    return PublicCourseContext.model_validate(payload)


def course_json(course: CourseContextV1) -> dict:
    """Canonical JSON form: aliases (``from``), UTC ``Z`` timestamps."""
    return course.model_dump(mode="json", by_alias=True)
