"""Session course contexts: storage, attach/replace/detach, shared reads, gun
suggestion and Session deletion (Issue #242, increment 242.3).

Courses come from the deterministic synthetic elements GPX of 242.1.
"""

import asyncio
import base64
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import math
from pathlib import Path
from urllib.parse import urlencode

import pandas as pd
import pytest
from fastapi import HTTPException, Response

from app.course.draft import build_course_draft
from app.course.gun_suggestion import TrackPoint, first_crossing, suggest_gun, to_whole_second
from app.course.schema import ReviewedCourse
from app.main import app, get_temporary_shared_session_courses
from app.models import ConsentStatus
from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS
from app.parsers.georacing_elements import parse_georacing_elements
from app.repositories.sessions import SessionRepository
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE
from app.services.sailor_deletion import apply_sailor_deletion, format_sailor_deletion_report, plan_sailor_deletion
from app.services.session_courses import (
    CourseNotAttachedError,
    CourseOriginalMismatchError,
    SessionCourseService,
    SessionNotFoundError,
)
from app.storage.course_storage import CourseStorage
from app.storage.track_storage import TrackStorage

import synthetic_course_elements as synthetic
import test_sailor_deletion as deletion
import test_session_api as shared_api
import test_temporary_session_shares as temporary


KEY = "offline-admin-key"
FILENAME = "Synthetic Race 7_elements.gpx"
SESSION_ID = shared_api.SESSION_ID


@pytest.fixture(scope="module")
def elements_bytes() -> bytes:
    return synthetic.elements_gpx()


@pytest.fixture(scope="module")
def reviewed_payload(elements_bytes) -> dict:
    draft = build_course_draft(
        parse_georacing_elements(elements_bytes, FILENAME),
        sha256=hashlib.sha256(elements_bytes).hexdigest(),
        imported_at=datetime(2031, 3, 15, tzinfo=timezone.utc),
    )
    payload = draft.suggested_course.model_dump(mode="json", by_alias=True)
    payload["race"].update(gun_utc="2031-03-14T10:05:00Z", gun_source="admin_entered")
    return payload


def reviewed(payload: dict, **time_range) -> ReviewedCourse:
    """A reviewed course, optionally narrowed to another time range (minutes)."""
    data = json.loads(json.dumps(payload))
    if time_range:
        start, end = synthetic.at(time_range["start"]), synthetic.at(time_range["end"])
        iso = lambda value: value.isoformat().replace("+00:00", "Z")
        data["time_range"] = {"from": iso(start), "to": iso(end)}
        data["race"].update(gun_utc=None, gun_source=None)
        for element in data["elements"]:
            element["positions"] = [
                {**p, "from": iso(max(start, datetime.fromisoformat(p["from"]))),
                 "to": iso(min(end, datetime.fromisoformat(p["to"])))}
                for p in element["positions"]
                if datetime.fromisoformat(p["from"]) < end and datetime.fromisoformat(p["to"]) > start
            ]
        data["elements"] = [e for e in data["elements"] if e["positions"]]
        ids = {e["id"] for e in data["elements"]}
        for line in ("start_line", "finish_line"):
            if data[line] and not {data[line]["boat"], data[line]["pin"]} <= ids:
                data[line] = None
    return ReviewedCourse.model_validate(data)


@pytest.fixture
def root(monkeypatch, temporary_directory) -> Path:
    return shared_api._use_runtime(monkeypatch, temporary_directory)


@pytest.fixture
def service(root) -> SessionCourseService:
    return SessionCourseService(SessionRepository(root / "sessions.json"), CourseStorage(root), TrackStorage(root))


def course_files(root: Path) -> set[str]:
    return {
        p.relative_to(root).as_posix()
        for base in (root / "course_contexts", root / "originals" / "courses")
        if base.exists() for p in base.rglob("*")
        if p.is_file() and not p.name.endswith(".access.lock")
    }


def lock_files(root: Path) -> set[str]:
    base = root / "course_contexts"
    return {p.name for p in base.glob(".*.access.lock")} if base.exists() else set()


def session_record(root: Path, session_id: str = SESSION_ID) -> dict:
    return next(s for s in json.loads((root / "sessions.json").read_text(encoding="utf-8")) if s["id"] == session_id)


# --- Storage and Session records ------------------------------------------------


def test_storage_round_trip_exclusive_originals_and_containment(root):
    storage = CourseStorage(root)
    course_id = "6f1c2f0e-8a8e-4c3e-9a55-0d3f3b1c9e01"
    storage.write_context(course_id, {"schema_version": 1})
    assert storage.read_context(course_id) == {"schema_version": 1}
    relative = storage.preserve_original(course_id, "../race:1.gpx", b"<gpx/>")
    assert relative == f"originals/courses/{course_id}/race_1.gpx"
    assert storage.read_original(relative) == b"<gpx/>"
    with pytest.raises(FileExistsError):
        storage.preserve_original(course_id, "race:1.gpx", b"other")
    with pytest.raises(ValueError):
        storage.read_original("sessions.json")
    with pytest.raises(ValueError):
        storage.context_path("../escape")
    storage.delete(course_id)
    assert course_files(root) == set() and lock_files(root) == set()
    assert storage.read_context(course_id) is None


def test_legacy_session_records_without_the_field_read_as_no_courses(root):
    record = session_record(root)
    assert "course_context_ids" not in record
    session = SessionRepository(root / "sessions.json").get_by_id(SESSION_ID)
    assert session.course_context_ids == []
    SessionRepository(root / "sessions.json").replace(session)
    # Sessions without courses keep no course field when saved again.
    assert "course_context_ids" not in session_record(root)


def test_malformed_course_reference_list_is_rejected(root):
    records = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    records[0]["course_context_ids"] = "not-a-list"
    shared_api._write_json(root / "sessions.json", records)
    with pytest.raises(ValueError, match="course_context_ids"):
        SessionRepository(root / "sessions.json").all()


# --- Attach, replace, detach ------------------------------------------------------


def test_attach_preserves_original_writes_context_and_references_it(service, root, elements_bytes, reviewed_payload):
    result = service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload))
    course_id = str(result.course.course_id)
    assert result.replaced_course_ids == ()
    assert session_record(root)["course_context_ids"] == [course_id]
    assert course_files(root) == {
        f"course_contexts/{course_id}.json",
        f"originals/courses/{course_id}/{FILENAME}",
    }
    assert (root / "originals" / "courses" / course_id / FILENAME).read_bytes() == elements_bytes
    stored = json.loads((root / "course_contexts" / f"{course_id}.json").read_text(encoding="utf-8"))
    assert stored["schema_version"] == 1 and stored["course_id"] == course_id
    assert stored["race"]["gun_utc"] == "2031-03-14T10:05:00Z"
    # Activity membership and other Session fields are unchanged.
    assert session_record(root)["activity_ids"] == [shared_api.ACTIVITY_B, shared_api.ACTIVITY_A]


def test_attach_rejects_an_original_that_is_not_the_reviewed_file(service, root, elements_bytes, reviewed_payload):
    altered = elements_bytes.replace(b"Synthetic Race 7", b"Synthetic Race 8")
    with pytest.raises(CourseOriginalMismatchError):
        service.attach(SESSION_ID, FILENAME, altered, reviewed(reviewed_payload))
    assert course_files(root) == set()
    assert "course_context_ids" not in session_record(root)


def test_attach_to_an_unknown_session_writes_nothing(service, root, elements_bytes, reviewed_payload):
    with pytest.raises(SessionNotFoundError):
        service.attach("20000000-0000-4000-8000-00000000ffff", FILENAME, elements_bytes, reviewed(reviewed_payload))
    assert course_files(root) == set()


def test_overlapping_course_replaces_and_touching_courses_coexist(service, root, elements_bytes, reviewed_payload):
    late = service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload, start=30, end=60))
    early = service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload, start=0, end=30))
    late_id, early_id = str(late.course.course_id), str(early.course.course_id)
    assert early.replaced_course_ids == ()  # touching at 10:30 is a different race
    assert session_record(root)["course_context_ids"] == [early_id, late_id]  # by time_range.from

    replacement = service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload, start=20, end=40))
    new_id = str(replacement.course.course_id)
    assert set(replacement.replaced_course_ids) == {early_id, late_id}
    assert session_record(root)["course_context_ids"] == [new_id]
    assert course_files(root) == {
        f"course_contexts/{new_id}.json", f"originals/courses/{new_id}/{FILENAME}",
    }


def test_session_update_failure_keeps_the_previous_course_and_removes_new_files(
    service, root, elements_bytes, reviewed_payload, monkeypatch,
):
    first = service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload))
    first_id = str(first.course.course_id)
    before_files, before_session = course_files(root), session_record(root)

    def fail(_session):
        raise OSError("injected Session write failure")

    monkeypatch.setattr(service.sessions, "replace", fail)
    with pytest.raises(OSError, match="injected"):
        service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload))
    assert session_record(root) == before_session
    assert course_files(root) == before_files
    assert service.load(first_id) is not None


def test_context_write_failure_leaves_no_partial_course(service, root, elements_bytes, reviewed_payload, monkeypatch):
    def fail(*_args):
        raise OSError("injected context write failure")

    monkeypatch.setattr(service.storage, "write_context", fail)
    with pytest.raises(OSError, match="injected"):
        service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload))
    assert course_files(root) == set()
    assert "course_context_ids" not in session_record(root)


def test_detach_removes_the_reference_then_the_files(service, root, elements_bytes, reviewed_payload):
    course_id = str(service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload)).course.course_id)
    with pytest.raises(CourseNotAttachedError):
        service.detach(shared_api.OTHER_SESSION_ID, course_id)
    service.detach(SESSION_ID, course_id)
    assert "course_context_ids" not in session_record(root)
    assert course_files(root) == set()
    with pytest.raises(CourseNotAttachedError):
        service.detach(SESSION_ID, course_id)


def test_admin_list_marks_an_unreadable_course_unavailable(service, root, elements_bytes, reviewed_payload):
    course_id = str(service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload)).course.course_id)
    (root / "course_contexts" / f"{course_id}.json").write_text("{broken", encoding="utf-8")
    [summary] = service.list_attached(SESSION_ID)
    assert (summary.course_id, summary.available) == (course_id, False)


# --- Shared original and temporary reads (D7) -----------------------------------


def attach(root: Path, payload: dict, elements_bytes: bytes, **time_range) -> str:
    service = SessionCourseService(SessionRepository(root / "sessions.json"), CourseStorage(root))
    return str(service.attach(SESSION_ID, FILENAME, elements_bytes, reviewed(payload, **time_range)).course.course_id)


def test_original_shared_read_returns_public_courses_in_order(root, elements_bytes, reviewed_payload):
    late = attach(root, reviewed_payload, elements_bytes, start=30, end=60)
    early = attach(root, reviewed_payload, elements_bytes, start=0, end=30)
    response = shared_api._get(f"/api/shared/sessions/{shared_api.TOKEN}/courses")
    assert response.status_code == 200
    courses = response.json["courses"]
    assert [course["course_id"] for course in courses] == [early, late]
    assert courses[0]["source"] == {
        "kind": "georacing_elements_gpx", "filename": FILENAME, "imported_at": "2031-03-15T00:00:00Z",
    }
    assert "sha256" not in json.dumps(courses) and "originals" not in json.dumps(courses)
    assert courses[0]["elements"][0]["positions"][0].keys() == {"from", "to", "lat", "lon"}


def test_session_without_courses_returns_an_empty_list(root):
    response = shared_api._get(f"/api/shared/sessions/{shared_api.TOKEN}/courses")
    assert (response.status_code, response.json) == (200, {"courses": []})


def test_malformed_or_unknown_version_course_is_omitted_with_a_safe_log(root, elements_bytes, reviewed_payload, caplog):
    broken = attach(root, reviewed_payload, elements_bytes, start=0, end=20)
    future = attach(root, reviewed_payload, elements_bytes, start=20, end=40)
    kept = attach(root, reviewed_payload, elements_bytes, start=40, end=60)
    (root / "course_contexts" / f"{broken}.json").write_text("{not json", encoding="utf-8")
    stored = json.loads((root / "course_contexts" / f"{future}.json").read_text(encoding="utf-8"))
    (root / "course_contexts" / f"{future}.json").write_text(json.dumps({**stored, "schema_version": 2}), encoding="utf-8")
    records = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    missing = "6f1c2f0e-8a8e-4c3e-9a55-0d3f3b1c9e99"
    records[0]["course_context_ids"].append(missing)
    shared_api._write_json(root / "sessions.json", records)
    with caplog.at_level(logging.WARNING):
        response = shared_api._get(f"/api/shared/sessions/{shared_api.TOKEN}/courses")
    assert response.status_code == 200
    assert [course["course_id"] for course in response.json["courses"]] == [kept]
    assert {broken, future, missing} <= {
        record.args[0] for record in caplog.records if "Omitting unreadable course context" in record.getMessage()
    }
    assert "not json" not in caplog.text and str(root) not in caplog.text


@pytest.mark.parametrize("change", ["revoked", "expired", "unknown", "no_visible_activity"])
def test_original_shared_read_uses_the_existing_capability_rules(root, elements_bytes, reviewed_payload, change):
    attach(root, reviewed_payload, elements_bytes)
    token = shared_api.TOKEN
    records = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    if change == "revoked":
        records[0]["capability_revoked"] = True
    elif change == "expired":
        records[0]["expires_at"] = "2001-01-01T00:00:00+00:00"
        records[0]["created_at"] = "2000-12-01T00:00:00+00:00"
    elif change == "unknown":
        token = "unknown-shared-session-capability-token-000000000"
    shared_api._write_json(root / "sessions.json", records)
    if change == "no_visible_activity":
        shared_api._set_status(root, shared_api.SAILOR_A, "REVOKED")
    response = shared_api._get(f"/api/shared/sessions/{token}/courses")
    assert response.status_code == 404
    assert "courses" not in response.json


def test_temporary_shared_read_follows_share_validity_and_visibility(monkeypatch, temporary_directory, elements_bytes, reviewed_payload):
    current_time = [temporary.NOW]
    share_service, capabilities, sessions, sailors = temporary._runtime(temporary_directory, current_time)
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(temporary_directory))
    monkeypatch.setattr("app.main._temporary_share_service", lambda: share_service)
    course_service = SessionCourseService(sessions, CourseStorage(temporary_directory))
    course_id = str(course_service.attach(
        temporary.SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload),
    ).course.course_id)
    share = share_service.create_or_reuse(temporary.ORIGINAL_TOKEN)

    response = Response()
    loaded = get_temporary_shared_session_courses(share.token, response)
    assert response.headers["Cache-Control"] == "no-store"
    assert [str(course.course_id) for course in loaded.courses] == [course_id]
    assert "sha256" not in loaded.model_dump_json()

    with pytest.raises(HTTPException) as unknown:
        get_temporary_shared_session_courses("unknown-temporary-token", Response())
    assert unknown.value.status_code == 404
    sailor = sailors.get_by_id(temporary.SAILOR_ID)
    sailors.replace(replace(sailor, consent_status=ConsentStatus.REVOKED))
    with pytest.raises(HTTPException) as hidden:
        get_temporary_shared_session_courses(share.token, Response())
    assert hidden.value.status_code == 404
    sailors.replace(replace(sailor, consent_status=ConsentStatus.ACTIVE))
    capabilities.revoke_capability(temporary.SESSION_ID)
    with pytest.raises(HTTPException) as unavailable:
        get_temporary_shared_session_courses(share.token, Response())
    assert unavailable.value.status_code == 403
    current_time[0] = share.expires_at
    with pytest.raises(HTTPException) as expired:
        get_temporary_shared_session_courses(share.token, Response())
    assert expired.value.status_code in (403, 410)


# --- Gun suggestion (D2) ---------------------------------------------------------


def boat_track(*legs, start_s: int, step_s: int = 1) -> list[TrackPoint]:
    """Straight legs ((east, north) -> (east, north), seconds) in the synthetic frame."""
    points, t = [], start_s
    for (a, b, seconds) in legs:
        for k in range(0, seconds, step_s):
            f = k / seconds
            lat, lon = synthetic.to_latlon((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
            points.append(TrackPoint(utc=synthetic.T0 + timedelta(seconds=t), lat=lat, lon=lon))
            t += step_s
    return points


def test_first_crossing_follows_the_start_analysis_rule(reviewed_payload):
    course = reviewed(reviewed_payload)
    # Start pin is 150 m east of the committee boat; the course side of PIN->BOAT
    # (pointing west) is to its left, i.e. south.
    southward = boat_track(((75, 100), (75, -100), 40), start_s=300)  # crosses at 10:05:20
    crossing = first_crossing(course, "a", southward)
    assert crossing is not None
    assert abs((crossing.utc - synthetic.at(5 + 20 / 60)).total_seconds()) <= 1
    northward = boat_track(((75, -100), (75, 100), 40), start_s=300)
    assert first_crossing(course, "a", northward) is None  # course side -> behind
    beyond_end = boat_track(((200, 100), (200, -100), 40), start_s=300)  # 50 m past the pin
    assert first_crossing(course, "a", beyond_end) is None
    within_tolerance = boat_track(((-8, 100), (-8, -100), 40), start_s=300)  # 8 m past the boat
    assert first_crossing(course, "a", within_tolerance) is not None
    across_gap = boat_track(((75, 30), (75, -30), 24), start_s=300, step_s=12)  # 12 s samples
    assert first_crossing(course, "a", across_gap) is None
    before_range = boat_track(((75, 100), (75, -100), 40), start_s=-120)
    assert first_crossing(course, "a", before_range) is None


def test_suggest_gun_picks_the_earliest_crossing_and_rounds_to_a_second(reviewed_payload):
    course = reviewed(reviewed_payload)
    late = boat_track(((75, 100), (75, -100), 40), start_s=600)
    early = boat_track(((40, 50), (40, -50), 21), start_s=401)
    crossing = suggest_gun(course, [("late", late), ("early", early)])
    assert crossing.activity_id == "early"
    assert to_whole_second(crossing.utc).microsecond == 0
    assert suggest_gun(course, [("none", boat_track(((75, -100), (75, -200), 40), start_s=300))]) is None


def write_track(root: Path, activity_id: str, points: list[TrackPoint]) -> None:
    frame = pd.DataFrame([
        {"activity_id": activity_id, "utc": p.utc.isoformat().replace("+00:00", "Z"), "lat": p.lat, "lon": p.lon,
         "cog": None, "sog": None, "dist": 0.0, "hdg": None, "heel": None, "trim": None}
        for p in points
    ], columns=CANONICAL_TRACK_COLUMNS)
    frame.to_csv(root / "tracks" / f"{activity_id}.csv.gz", index=False, compression={"method": "gzip", "mtime": 0})


def test_service_gun_suggestion_reads_member_canonical_tracks(service, root, reviewed_payload):
    write_track(root, shared_api.ACTIVITY_A, boat_track(((75, 100), (75, -100), 40), start_s=300))
    # ACTIVITY_B has no canonical track: it is skipped, not fatal.
    crossing = service.suggest_gun(SESSION_ID, reviewed(reviewed_payload))
    assert crossing.activity_id == shared_api.ACTIVITY_A
    without_line = reviewed(reviewed_payload).model_copy(update={"start_line": None})
    with pytest.raises(ValueError, match="no start line"):
        service.suggest_gun(SESSION_ID, without_line)
    # A suggestion never changes persisted state.
    assert "course_context_ids" not in session_record(root)


# --- D11: Session deletion ---------------------------------------------------------


def test_sailor_deletion_removes_courses_of_deleted_sessions_only(temporary_directory, elements_bytes, reviewed_payload):
    root = deletion._runtime_root(temporary_directory)
    service = SessionCourseService(SessionRepository(root / "sessions.json"), CourseStorage(root))
    deleted = str(service.attach(deletion.DELETE_SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload)).course.course_id)
    retained = str(service.attach(deletion.SHARED_SESSION_ID, FILENAME, elements_bytes, reviewed(reviewed_payload)).course.course_id)

    plan = plan_sailor_deletion(root, "target@example.com")
    assert plan.deleted_course_context_ids == (deleted,)
    assert f"Course contexts of deleted Sessions: DELETE 1: {deleted}" in format_sailor_deletion_report(plan, applied=False)
    assert (root / "course_contexts" / f"{deleted}.json").exists()  # dry run writes nothing
    apply_sailor_deletion(plan)

    assert not (root / "course_contexts" / f"{deleted}.json").exists()
    assert not (root / "originals" / "courses" / deleted).exists()
    assert lock_files(root) == {f".{retained}.json.access.lock"}
    assert (root / "course_contexts" / f"{retained}.json").exists()
    assert (root / "originals" / "courses" / retained / FILENAME).exists()
    [kept] = SessionRepository(root / "sessions.json").all()
    assert kept.id == deletion.SHARED_SESSION_ID and kept.course_context_ids == [retained]


def test_sailor_deletion_refuses_a_course_shared_by_deleted_and_retained_sessions(temporary_directory):
    root = deletion._runtime_root(temporary_directory)
    records = json.loads((root / "sessions.json").read_text(encoding="utf-8"))
    for record in records:
        record["course_context_ids"] = ["6f1c2f0e-8a8e-4c3e-9a55-0d3f3b1c9e01"]
    deletion._write_json(root / "sessions.json", records)
    with pytest.raises(Exception, match="share one course context"):
        plan_sailor_deletion(root, "target@example.com")


# --- Admin API ---------------------------------------------------------------------


def call(method, path, *, body=b"", query=None, key=KEY, content_type="application/json"):
    headers = [(b"content-type", content_type.encode()), (b"content-length", str(len(body)).encode())]
    if key is not None:
        headers.append((b"x-tackbar-admin-key", key.encode()))
    messages, reads = [], []

    async def run():
        sent = False

        async def receive():
            nonlocal sent
            reads.append(True)
            if sent:
                return {"type": "http.disconnect"}
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message):
            messages.append(message)

        await app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
            "scheme": "http", "path": path, "raw_path": path.encode(), "headers": headers,
            "query_string": urlencode(query or {}).encode(), "client": ("test", 1),
            "server": ("test", 80), "root_path": "",
        }, receive, send)

    asyncio.run(run())
    start = next(m for m in messages if m["type"] == "http.response.start")
    content = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return start["status"], json.loads(content), len(reads)


@pytest.fixture
def admin_root(root, monkeypatch):
    monkeypatch.setenv("TACKBAR_ADMIN_KEY", KEY)
    return root


def attach_body(elements_bytes, payload) -> bytes:
    return json.dumps({"course": payload, "original_base64": base64.b64encode(elements_bytes).decode()}).encode()


def test_admin_attach_list_and_detach_over_http(admin_root, elements_bytes, reviewed_payload):
    path = f"/api/admin/sessions/{SESSION_ID}/courses"
    status, body, _ = call("POST", path, body=attach_body(elements_bytes, reviewed_payload), query={"filename": FILENAME})
    assert status == 200 and body["replaced_course_ids"] == []
    course_id = body["course"]["course_id"]
    status, listed, _ = call("GET", path)
    assert status == 200
    assert listed == {"courses": [{
        "course_id": course_id, "available": True, "race_label": "Synthetic Race 7",
        "time_range": {"from": "2031-03-14T10:00:00Z", "to": "2031-03-14T11:00:00Z"},
        "gun_utc": "2031-03-14T10:05:00Z", "source_filename": FILENAME,
        "imported_at": "2031-03-15T00:00:00Z", "element_count": len(reviewed_payload["elements"]),
    }]}
    status, after, _ = call("POST", f"{path}/{course_id}/detach")
    assert (status, after) == (200, {"courses": []})
    status, _, _ = call("POST", f"{path}/{course_id}/detach")
    assert status == 404


@pytest.mark.parametrize("mutate, status, detail", [
    (lambda body: {**body, "original_base64": "not base64!"}, 422, "valid base64"),
    (lambda body: {"course": body["course"]}, 422, "exactly 'course' and 'original_base64'"),
    (lambda body: {**body, "original_base64": base64.b64encode(b"<gpx></gpx>").decode()}, 422, "requires 1 to 32 tracks"),
])
def test_admin_attach_rejects_invalid_bodies(admin_root, elements_bytes, reviewed_payload, mutate, status, detail):
    body = json.loads(attach_body(elements_bytes, reviewed_payload))
    code, response, _ = call("POST", f"/api/admin/sessions/{SESSION_ID}/courses",
                             body=json.dumps(mutate(body)).encode(), query={"filename": FILENAME})
    assert code == status and detail in json.dumps(response)
    assert course_files(admin_root) == set()


def test_admin_attach_rejects_sha256_mismatch_and_unknown_session(admin_root, elements_bytes, reviewed_payload):
    altered = elements_bytes.replace(b"Synthetic Race 7", b"Synthetic Race 8")
    code, response, _ = call("POST", f"/api/admin/sessions/{SESSION_ID}/courses",
                             body=attach_body(altered, reviewed_payload), query={"filename": FILENAME})
    assert code == 422 and "not the file this course was reviewed from" in response["detail"]
    code, _, _ = call("POST", "/api/admin/sessions/20000000-0000-4000-8000-00000000ffff/courses",
                      body=attach_body(elements_bytes, reviewed_payload), query={"filename": FILENAME})
    assert code == 404
    assert course_files(admin_root) == set()


@pytest.mark.parametrize("method, suffix", [
    ("GET", "/courses"), ("POST", "/courses"), ("POST", "/courses/x/detach"), ("POST", "/courses/gun-suggestion"),
])
def test_admin_session_course_endpoints_require_authorization_before_reading(admin_root, method, suffix):
    code, _, reads = call(method, f"/api/admin/sessions/{SESSION_ID}{suffix}", body=b"{}", key="wrong",
                          query={"filename": FILENAME})
    assert code == 401 and reads == 0


def test_admin_gun_suggestion_over_http(admin_root, reviewed_payload):
    write_track(admin_root, shared_api.ACTIVITY_A, boat_track(((75, 100), (75, -100), 40), start_s=300))
    code, body, _ = call("POST", f"/api/admin/sessions/{SESSION_ID}/courses/gun-suggestion",
                         body=json.dumps(reviewed_payload).encode())
    assert code == 200
    suggestion = body["suggestion"]
    assert suggestion["activity_id"] == shared_api.ACTIVITY_A
    assert suggestion["basis"] == "earliest_start_line_crossing"
    gun = datetime.fromisoformat(suggestion["gun_utc"])
    assert gun.microsecond == 0 and abs((gun - synthetic.at(5 + 20 / 60)).total_seconds()) <= 1
    assert "course_context_ids" not in session_record(admin_root)
