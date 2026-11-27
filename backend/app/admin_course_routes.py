"""Admin course import and Session course endpoints (Issue #242).

Course import is Admin-only and separate from track ingestion. The draft and
validate endpoints (242.1) are stateless. The Session-scoped endpoints (242.3)
attach, list, detach and suggest a gun for course contexts, and edit the race
times of an attached one (242.3.2); they never create or change an Ingestion,
Activity or Sailor, nor Session membership. The provider is selected explicitly
by the path, not detected.
"""

from datetime import datetime, timezone
import base64
import binascii
import hashlib
import json
import math
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from app.admin_auth import require_admin_key
from app.course.draft import CourseImportDraft, build_course_draft
from app.course.gun_suggestion import LineCrossing, to_whole_second
from app.course.schema import CourseContextV1, CourseRaceTimes, ReviewedCourse, course_json
from app.parsers.georacing_elements import (
    GeoRacingElementsParseError,
    parse_georacing_elements,
)
from app.parsers.gpx import MAX_GPX_BYTES
from app.repositories.activities import ActivityRepository
from app.repositories.sessions import SessionRepository
from app.services.session_courses import (
    AttachedCourseSummary,
    CourseNotAttachedError,
    CourseOriginalMismatchError,
    CourseUnavailableError,
    SessionCourseService,
    SessionNotFoundError,
)
from app.storage.course_storage import CourseStorage
from app.storage.track_storage import TrackStorage


# A reviewed course is small (the real 11-track draft is ~20 KB); the schema
# bounds (32 elements x 200 positions) stay well below this raw JSON cap.
MAX_VALIDATE_BODY_BYTES = 1024 * 1024
# Attach carries the original GPX as base64 next to the reviewed course JSON.
MAX_ATTACH_BODY_BYTES = 4 * math.ceil(MAX_GPX_BYTES / 3) + MAX_VALIDATE_BODY_BYTES + 4096

router = APIRouter(
    prefix="/api/admin/course-imports",
    dependencies=[Depends(require_admin_key)],
)


@router.post("/georacing/draft", response_model=CourseImportDraft)
async def georacing_course_draft(
    request: Request,
    filename: str = Query(min_length=1, max_length=255),
) -> CourseImportDraft:
    """One raw GeoRacing elements GPX body; the filename is query metadata."""
    if len(request.query_params.getlist("filename")) != 1:
        raise HTTPException(status_code=400, detail="Exactly one filename is required")
    if request.headers.get("content-type", "").lower().startswith("multipart/"):
        raise HTTPException(status_code=415, detail="Upload one file as the raw request body")
    body = await _read_bounded_body(request, MAX_GPX_BYTES, "Upload exceeds 16 MiB")
    try:
        return await run_in_threadpool(_draft, body, filename)
    except GeoRacingElementsParseError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def _draft(content: bytes, filename: str) -> CourseImportDraft:
    parsed = parse_georacing_elements(content, filename)
    return build_course_draft(
        parsed,
        sha256=hashlib.sha256(content).hexdigest(),
        imported_at=datetime.now(timezone.utc).replace(microsecond=0),
    )


@router.post("/validate")
async def validate_course(request: Request) -> dict:
    """Reviewed draft -> schema-valid course context JSON, or 422 errors.

    The body is read only after Admin authorization (router dependency) and is
    capped before JSON parsing.
    """
    body = await _read_bounded_body(
        request, MAX_VALIDATE_BODY_BYTES, "Request body exceeds 1 MiB"
    )
    reviewed = _reviewed_course(_json_body(body))
    candidate = reviewed.model_dump(by_alias=True)
    candidate["course_id"] = reviewed.course_id or uuid4()
    return {"course": course_json(CourseContextV1.model_validate(candidate))}


async def _read_bounded_body(request: Request, limit: int, too_large: str) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None:
        if not declared.isdecimal():
            raise HTTPException(status_code=400, detail="Invalid upload length")
        declared = declared.lstrip("0") or "0"
        if len(declared) > len(str(limit)) or int(declared) > limit:
            raise HTTPException(status_code=413, detail=too_large)
    content = bytearray()
    try:
        async for chunk in request.stream():
            if len(content) + len(chunk) > limit:
                raise HTTPException(status_code=413, detail=too_large)
            content.extend(chunk)
    except ClientDisconnect as error:
        raise HTTPException(status_code=400, detail="Upload was interrupted") from error
    return bytes(content)


def _json_body(body: bytes):
    try:
        return json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=422, detail="Request body must be valid JSON") from error


def _reviewed_course(payload, location: tuple = ("body",)) -> ReviewedCourse:
    try:
        return ReviewedCourse.model_validate(payload)
    except ValidationError as error:
        raise _request_errors(error, location) from error


def _request_errors(error: ValidationError, location: tuple = ("body",)) -> RequestValidationError:
    """Schema errors in the standard 422 shape, located in the request."""
    return RequestValidationError(
        [{**item, "loc": (*location, *item["loc"])} for item in error.errors(include_url=False)]
    )


def _iso(value: datetime | None) -> str | None:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if value else None


# --- Session course contexts (242.3) -------------------------------------------

session_router = APIRouter(
    prefix="/api/admin/sessions",
    dependencies=[Depends(require_admin_key)],
)


def _course_service() -> SessionCourseService:
    return SessionCourseService(
        SessionRepository(), CourseStorage(), TrackStorage(), activities=ActivityRepository(),
    )


def _summary_json(summary: AttachedCourseSummary) -> dict:
    return {
        "course_id": summary.course_id,
        "available": summary.available,
        "race_label": summary.race_label,
        "time_range": (
            {"from": _iso(summary.time_from), "to": _iso(summary.time_to)}
            if summary.available else None
        ),
        "gun_utc": _iso(summary.gun_utc),
        "end_utc": _iso(summary.end_utc),
        "source_filename": summary.source_filename,
        "imported_at": _iso(summary.imported_at),
        "element_count": summary.element_count,
    }


def _session_not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Session not found")


def _course_not_attached() -> HTTPException:
    return HTTPException(status_code=404, detail="Course is not attached to this Session")


def _course_unavailable() -> HTTPException:
    return HTTPException(status_code=409, detail="Course file is unavailable")


@session_router.get("/{session_id}/courses")
def list_session_courses(session_id: str) -> dict:
    try:
        summaries = _course_service().list_attached(session_id)
    except SessionNotFoundError as error:
        raise _session_not_found() from error
    return {"courses": [_summary_json(summary) for summary in summaries]}


@session_router.post("/{session_id}/courses")
async def attach_session_course(
    session_id: str,
    request: Request,
    filename: str = Query(min_length=1, max_length=255),
) -> dict:
    """Attach a reviewed course with its original GeoRacing GPX (base64).

    Body: ``{"course": <reviewed course>, "original_base64": "<GPX bytes>"}``.
    The server re-parses the original and requires its sha256 to equal
    ``course.source.sha256``. An overlapping course of the Session is replaced.
    """
    if len(request.query_params.getlist("filename")) != 1:
        raise HTTPException(status_code=400, detail="Exactly one filename is required")
    body = await _read_bounded_body(request, MAX_ATTACH_BODY_BYTES, "Request body exceeds the attach limit")
    payload = _json_body(body)
    if not isinstance(payload, dict) or set(payload) != {"course", "original_base64"}:
        raise HTTPException(status_code=422, detail="Body must contain exactly 'course' and 'original_base64'")
    encoded = payload["original_base64"]
    try:
        if not isinstance(encoded, str):
            raise ValueError("not a string")
        original = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise HTTPException(status_code=422, detail="original_base64 must be valid base64") from error
    if len(original) > MAX_GPX_BYTES:
        raise HTTPException(status_code=413, detail="Upload exceeds 16 MiB")
    reviewed = _reviewed_course(payload["course"], ("body", "course"))
    try:
        result = await run_in_threadpool(_course_service().attach, session_id, filename, original, reviewed)
    except SessionNotFoundError as error:
        raise _session_not_found() from error
    except (GeoRacingElementsParseError, CourseOriginalMismatchError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {
        "course": course_json(result.course),
        "replaced_course_ids": list(result.replaced_course_ids),
    }


@session_router.post("/{session_id}/courses/{course_id}/detach")
def detach_session_course(session_id: str, course_id: str) -> dict:
    service = _course_service()
    try:
        service.detach(session_id, course_id)
        summaries = service.list_attached(session_id)
    except SessionNotFoundError as error:
        raise _session_not_found() from error
    except CourseNotAttachedError as error:
        raise _course_not_attached() from error
    return {"courses": [_summary_json(summary) for summary in summaries]}


@session_router.patch("/{session_id}/courses/{course_id}/race-times")
async def update_session_course_race_times(session_id: str, course_id: str, request: Request) -> dict:
    """Set, change or clear the gun and end of an attached course (D14).

    Body: ``{"gun_utc": <UTC or null>, "end_utc": <UTC or null>}``. Returns the
    Session's attached courses.
    """
    body = await _read_bounded_body(request, MAX_VALIDATE_BODY_BYTES, "Request body exceeds 1 MiB")
    try:
        times = CourseRaceTimes.model_validate(_json_body(body))
    except ValidationError as error:
        raise _request_errors(error) from error
    service = _course_service()
    try:
        await run_in_threadpool(
            service.update_race_times, session_id, course_id, times.gun_utc, times.end_utc,
        )
        summaries = await run_in_threadpool(service.list_attached, session_id)
    except SessionNotFoundError as error:
        raise _session_not_found() from error
    except CourseNotAttachedError as error:
        raise _course_not_attached() from error
    except CourseUnavailableError as error:
        raise _course_unavailable() from error
    except ValidationError as error:
        raise _request_errors(error) from error
    return {"courses": [_summary_json(summary) for summary in summaries]}


@session_router.post("/{session_id}/courses/{course_id}/gun-suggestion")
def suggest_attached_course_gun(session_id: str, course_id: str) -> dict:
    """The gun suggestion for an attached course (D14); a suggestion only."""
    try:
        crossing = _course_service().suggest_attached_gun(session_id, course_id)
    except SessionNotFoundError as error:
        raise _session_not_found() from error
    except CourseNotAttachedError as error:
        raise _course_not_attached() from error
    except CourseUnavailableError as error:
        raise _course_unavailable() from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _suggestion_json(crossing)


@session_router.post("/{session_id}/courses/gun-suggestion")
async def suggest_session_course_gun(session_id: str, request: Request) -> dict:
    """Earliest member-Activity start-line crossing; a suggestion only (D2)."""
    body = await _read_bounded_body(request, MAX_VALIDATE_BODY_BYTES, "Request body exceeds 1 MiB")
    reviewed = _reviewed_course(_json_body(body))
    try:
        crossing = await run_in_threadpool(_course_service().suggest_gun, session_id, reviewed)
    except SessionNotFoundError as error:
        raise _session_not_found() from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _suggestion_json(crossing)


def _suggestion_json(crossing: LineCrossing | None) -> dict:
    if crossing is None:
        return {"suggestion": None}
    return {"suggestion": {
        "gun_utc": _iso(to_whole_second(crossing.utc)),
        "crossing_utc": _iso(crossing.utc),
        "activity_id": crossing.activity_id,
        "basis": "earliest_start_line_crossing",
    }}


@router.post("/session-candidates")
async def course_session_candidates(request: Request) -> dict:
    """Sessions that plausibly sailed this course; preselection help only.

    Returns Session ids with time overlap and minimum distance to the start
    line midpoint; nothing is attached or persisted.
    """
    body = await _read_bounded_body(request, MAX_VALIDATE_BODY_BYTES, "Request body exceeds 1 MiB")
    reviewed = _reviewed_course(_json_body(body))
    candidates = await run_in_threadpool(_course_service().session_candidates, reviewed)
    return {"candidates": [
        {
            "session_id": candidate.session_id,
            "overlap_seconds": candidate.overlap_seconds,
            "min_distance_m": candidate.min_distance_m,
        }
        for candidate in candidates
    ]}
