"""Stateless Admin course import endpoints (Issue #242, increment 242.1).

Course import is Admin-only and separate from track ingestion: these endpoints
never create or change an Ingestion, Activity, Sailor or Session, and persist
nothing. The provider is selected explicitly by the path, not detected.
"""

from datetime import datetime, timezone
import hashlib
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from app.admin_auth import require_admin_key
from app.course.draft import CourseImportDraft, build_course_draft
from app.course.schema import CourseContextV1, ReviewedCourse, course_json
from app.parsers.georacing_elements import (
    GeoRacingElementsParseError,
    parse_georacing_elements,
)
from app.parsers.gpx import MAX_GPX_BYTES


# A reviewed course is small (the real 11-track draft is ~20 KB); the schema
# bounds (32 elements x 200 positions) stay well below this raw JSON cap.
MAX_VALIDATE_BODY_BYTES = 1024 * 1024

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
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=422, detail="Request body must be valid JSON") from error
    try:
        reviewed = ReviewedCourse.model_validate(payload)
    except ValidationError as error:
        raise RequestValidationError(
            [{**item, "loc": ("body", *item["loc"])} for item in error.errors(include_url=False)]
        ) from error
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
