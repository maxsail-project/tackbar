"""Build an Admin review draft from a parsed GeoRacing elements file (#242).

The draft is a proposal only (human review before use): suggested roles,
duplicate and never-moved flags, stable intervals and relocation stretches per
track, and a pre-filled reviewed course that the Admin edits before validation.
Nothing is persisted and nothing touches Ingestions, Activities, Sailors or
Sessions.
"""

from datetime import datetime, timedelta, timezone
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.course.georacing_roles import suggest_role
from app.course.schema import (
    COURSE_SCHEMA_VERSION,
    CourseSource,
    ReviewedCourse,
    TimeRange,
)
from app.course.segmentation import (
    STABLE_MAX_DISPERSION_METRES,
    STABLE_MAX_SAMPLE_GAP_SECONDS,
    STABLE_MIN_DURATION_SECONDS,
    Segment,
    are_duplicates,
    is_stationary,
    segment_track,
)
from app.parsers.georacing_elements import GeoRacingElementsFile


PROVIDER_KIND = "georacing_elements_gpx"
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
_COORDINATE_DECIMALS = 6  # ~0.1 m


def utc_from_ns(utc_ns: int) -> datetime:
    return _EPOCH + timedelta(microseconds=utc_ns // 1000)


class DraftParameters(BaseModel):
    max_dispersion_m: float
    min_duration_s: float
    max_sample_gap_s: float


class DraftSegment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    kind: Literal["stable", "relocation"]
    from_: datetime = Field(alias="from")
    to: datetime
    sample_count: int
    # Only stable intervals carry a representative (median) position.
    lat: float | None
    lon: float | None
    dispersion_m: float | None


class DraftTrack(BaseModel):
    track_id: str
    label: str
    element_id: str
    sample_count: int
    first_utc: datetime
    last_utc: datetime
    suggested_role: str
    suggested_gate: str | None
    role_basis: str
    stationary: bool
    duplicate_of: str | None
    segments: list[DraftSegment]


class CourseImportDraft(BaseModel):
    provider: Literal["georacing_elements_gpx"]
    source: CourseSource
    file_name: str | None
    time_range: TimeRange
    parameters: DraftParameters
    tracks: list[DraftTrack]
    suggested_course: ReviewedCourse


def _slug(label: str, index: int, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:56] or f"track_{index}"
    if not base[0].isalnum():
        base = f"t{base}"
    candidate, suffix = base, 2
    while candidate in taken:
        candidate, suffix = f"{base}_{suffix}", suffix + 1
    taken.add(candidate)
    return candidate


def _segment_json(segment: Segment) -> DraftSegment:
    stable = segment.kind == "stable"
    return DraftSegment.model_validate({
        "kind": segment.kind,
        "from": utc_from_ns(segment.start_ns),
        "to": utc_from_ns(segment.end_ns),
        "sample_count": segment.sample_count,
        "lat": round(segment.lat, _COORDINATE_DECIMALS) if stable else None,
        "lon": round(segment.lon, _COORDINATE_DECIMALS) if stable else None,
        "dispersion_m": segment.dispersion_m,
    })


def build_course_draft(
    parsed: GeoRacingElementsFile,
    *,
    sha256: str,
    imported_at: datetime,
) -> CourseImportDraft:
    tracks = parsed.tracks
    taken: set[str] = set()
    track_ids = [f"t{track.index}" for track in tracks]
    element_ids = [_slug(track.name, track.index, taken) for track in tracks]
    suggestions = [suggest_role(track.name) for track in tracks]
    segments = [segment_track(track.samples) for track in tracks]
    stationary = [is_stationary(track.samples) for track in tracks]

    # Duplicate trackers: the copy is the name-ignored one, otherwise the later
    # one in source order. A track is a copy of at most one canonical track.
    duplicate_of: list[int | None] = [None] * len(tracks)
    for i in range(len(tracks)):
        for j in range(i + 1, len(tracks)):
            if not are_duplicates(tracks[i].samples, tracks[j].samples):
                continue
            copy, canonical = (
                (i, j)
                if suggestions[i].role == "ignored" and suggestions[j].role != "ignored"
                else (j, i)
            )
            if duplicate_of[copy] is None and duplicate_of[canonical] is None:
                duplicate_of[copy] = canonical

    elements, ignored = [], []
    for k, track in enumerate(tracks):
        stable = [s for s in segments[k] if s.kind == "stable"]
        reason = None
        if duplicate_of[k] is not None:
            canonical = duplicate_of[k]
            reason = f"duplicate_of:{element_ids[canonical]}"
        elif suggestions[k].role == "ignored":
            reason = "never_moved" if stationary[k] else "not_a_course_element"
        elif not stable:
            reason = "no_stable_interval"
        if reason is not None:
            ignored.append({"label": track.name, "reason": reason})
            continue
        elements.append({
            "id": element_ids[k],
            "role": suggestions[k].role,
            "gate": suggestions[k].gate,
            "label": track.name,
            "positions": [
                {
                    "from": utc_from_ns(s.start_ns),
                    "to": utc_from_ns(s.end_ns),
                    "lat": round(s.lat, _COORDINATE_DECIMALS),
                    "lon": round(s.lon, _COORDINATE_DECIMALS),
                }
                for s in stable
            ],
        })

    def single(role: str) -> str | None:
        matches = [e["id"] for e in elements if e["role"] == role]
        return matches[0] if len(matches) == 1 else None

    def line(pin_role: str) -> dict | None:
        boat, pin = single("committee_boat"), single(pin_role)
        return {"boat": boat, "pin": pin} if boat and pin else None

    time_range = {
        "from": utc_from_ns(min(track.samples[0].utc_ns for track in tracks)),
        "to": utc_from_ns(max(track.samples[-1].utc_ns for track in tracks)),
    }
    source = {
        "kind": PROVIDER_KIND,
        "filename": parsed.filename,
        "sha256": sha256,
        "imported_at": imported_at,
    }
    suggested_course = ReviewedCourse.model_validate({
        "schema_version": COURSE_SCHEMA_VERSION,
        "course_id": None,
        "source": source,
        "race": {
            "label": parsed.name or parsed.filename.rsplit(".", 1)[0] or "Race",
            "gun_utc": None,
            "gun_source": None,
            "end_utc": None,
        },
        "time_range": time_range,
        "start_line": line("start_pin"),
        "finish_line": line("finish_pin"),
        "elements": elements,
        "ignored_tracks": ignored,
    })
    return CourseImportDraft(
        provider=PROVIDER_KIND,
        source=CourseSource.model_validate(source),
        file_name=parsed.name,
        time_range=TimeRange.model_validate(time_range),
        parameters=DraftParameters(
            max_dispersion_m=STABLE_MAX_DISPERSION_METRES,
            min_duration_s=STABLE_MIN_DURATION_SECONDS,
            max_sample_gap_s=STABLE_MAX_SAMPLE_GAP_SECONDS,
        ),
        tracks=[
            DraftTrack(
                track_id=track_ids[k],
                label=track.name,
                element_id=element_ids[k],
                sample_count=len(track.samples),
                first_utc=utc_from_ns(track.samples[0].utc_ns),
                last_utc=utc_from_ns(track.samples[-1].utc_ns),
                suggested_role=suggestions[k].role,
                suggested_gate=suggestions[k].gate,
                role_basis=suggestions[k].basis,
                stationary=stationary[k],
                duplicate_of=(
                    track_ids[duplicate_of[k]] if duplicate_of[k] is not None else None
                ),
                segments=[_segment_json(s) for s in segments[k]],
            )
            for k, track in enumerate(tracks)
        ],
        suggested_course=suggested_course,
    )
