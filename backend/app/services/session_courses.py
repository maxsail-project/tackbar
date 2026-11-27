"""Session-owned course contexts (Issue #242, increment 242.3).

A Session owns zero or more course contexts, one per race (D1). Attaching a
course whose time range overlaps one already attached to that Session replaces
it atomically, without version history (D6). Writes run under the ingestion
lock and are ordered so a Session never references a missing course file:
course files first, then the Session record; superseded files are removed only
after the Session update.
"""

from dataclasses import dataclass, replace
from datetime import datetime, timezone
import hashlib
import logging
from pathlib import Path
from uuid import uuid4

import pandas as pd
from pydantic import ValidationError

from app.course.gun_suggestion import LineCrossing, TrackPoint, suggest_gun
from app.course.session_candidates import MemberActivity, SessionCandidate, evaluate_session
from app.course.schema import (
    COURSE_SCHEMA_VERSION,
    CourseContextV1,
    PublicCourseContext,
    ReviewedCourse,
    course_json,
    public_course,
)
from app.models import Session
from app.parsers.georacing_elements import parse_georacing_elements
from app.repositories.activities import ActivityRepository
from app.repositories.sessions import SessionRepository
from app.services.ingestion_lock import ingestion_lock
from app.storage.course_storage import CourseStorage
from app.storage.track_storage import TrackStorage


logger = logging.getLogger(__name__)


class SessionNotFoundError(LookupError):
    pass


class CourseNotAttachedError(LookupError):
    pass


class CourseOriginalMismatchError(ValueError):
    """The uploaded original is not the file the reviewed course was built from."""


@dataclass(frozen=True)
class AttachResult:
    course: CourseContextV1
    replaced_course_ids: tuple[str, ...]


@dataclass(frozen=True)
class AttachedCourseSummary:
    course_id: str
    available: bool
    race_label: str | None = None
    time_from: datetime | None = None
    time_to: datetime | None = None
    gun_utc: datetime | None = None
    source_filename: str | None = None
    imported_at: datetime | None = None
    element_count: int | None = None


def _overlaps(a: CourseContextV1 | ReviewedCourse, b: CourseContextV1) -> bool:
    # Touching ranges (one ends exactly when the other starts) are distinct races.
    return a.time_range.from_ < b.time_range.to and b.time_range.from_ < a.time_range.to


class SessionCourseService:
    def __init__(
        self,
        sessions: SessionRepository,
        storage: CourseStorage,
        track_storage: TrackStorage | None = None,
        clock=None,
        activities: ActivityRepository | None = None,
    ) -> None:
        self.sessions = sessions
        self.storage = storage
        self.track_storage = track_storage
        self.activities = activities
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    @property
    def _lock_root(self) -> Path:
        # The Session collection's directory anchors the shared ingestion lock.
        return self.sessions.path.parent

    # --- Reading ---

    def load(self, course_id: str) -> CourseContextV1 | None:
        """A stored course, or None when missing, malformed or of another version."""
        try:
            stored = self.storage.read_context(course_id)
            if stored is None:
                raise FileNotFoundError("missing")
            if stored.get("schema_version") != COURSE_SCHEMA_VERSION:
                raise ValueError("unsupported schema version")
            course = CourseContextV1.model_validate(stored)
            if str(course.course_id) != course_id:
                raise ValueError("course id mismatch")
            return course
        except (OSError, ValueError, ValidationError) as error:
            # Privacy-safe: the course id only, never file content or paths.
            logger.warning(
                "Omitting unreadable course context %s (%s)",
                course_id, type(error).__name__,
            )
            return None

    def courses_for(self, session: Session) -> list[CourseContextV1]:
        return [
            course for course_id in session.course_context_ids
            if (course := self.load(course_id)) is not None
        ]

    def public_courses_for(self, session: Session) -> list[PublicCourseContext]:
        return [public_course(course) for course in self.courses_for(session)]

    def list_attached(self, session_id: str) -> list[AttachedCourseSummary]:
        session = self._session(session_id)
        summaries = []
        for course_id in session.course_context_ids:
            course = self.load(course_id)
            if course is None:
                summaries.append(AttachedCourseSummary(course_id=course_id, available=False))
                continue
            summaries.append(AttachedCourseSummary(
                course_id=course_id,
                available=True,
                race_label=course.race.label,
                time_from=course.time_range.from_,
                time_to=course.time_range.to,
                gun_utc=course.race.gun_utc,
                source_filename=course.source.filename,
                imported_at=course.source.imported_at,
                element_count=len(course.elements),
            ))
        return summaries

    # --- Writing ---

    def attach(
        self,
        session_id: str,
        filename: str,
        original: bytes,
        reviewed: ReviewedCourse,
    ) -> AttachResult:
        # Re-parse the original: attachment requires the exact reviewed GPX (D9).
        parse_georacing_elements(original, filename)
        if hashlib.sha256(original).hexdigest() != reviewed.source.sha256:
            raise CourseOriginalMismatchError(
                "The uploaded original is not the file this course was reviewed from"
            )
        course_id = str(uuid4())
        candidate = reviewed.model_dump(by_alias=True)
        candidate["course_id"] = course_id
        course = CourseContextV1.model_validate(candidate)

        with ingestion_lock(self._lock_root):
            session = self._session(session_id)
            attached = {
                existing_id: self.load(existing_id)
                for existing_id in session.course_context_ids
            }
            replaced = tuple(
                existing_id for existing_id, existing in attached.items()
                if existing is not None and _overlaps(course, existing)
            )
            # 1. Course files first: a failure here leaves the Session untouched.
            try:
                self.storage.preserve_original(course_id, filename, original)
                self.storage.write_context(course_id, course_json(course))
            except Exception:
                self._discard(course_id)
                raise
            # 2. Then the Session record, ordered by course start.
            kept = [
                (existing_id, existing) for existing_id, existing in attached.items()
                if existing_id not in replaced
            ]
            ordered = sorted(
                [*kept, (course_id, course)],
                key=lambda item: (
                    item[1] is None,
                    item[1].time_range.from_ if item[1] is not None else datetime.max.replace(tzinfo=timezone.utc),
                ),
            )
            try:
                self.sessions.replace(replace(
                    session, course_context_ids=[item[0] for item in ordered],
                ))
            except Exception:
                self._discard(course_id)
                raise
            # 3. Only now remove superseded files.
            for superseded in replaced:
                self._discard(superseded)
        return AttachResult(course=course, replaced_course_ids=replaced)

    def detach(self, session_id: str, course_id: str) -> None:
        with ingestion_lock(self._lock_root):
            session = self._session(session_id)
            if course_id not in session.course_context_ids:
                raise CourseNotAttachedError("Course is not attached to this Session")
            self.sessions.replace(replace(
                session,
                course_context_ids=[item for item in session.course_context_ids if item != course_id],
            ))
            self._discard(course_id)

    # --- Gun suggestion (D2) ---

    def suggest_gun(self, session_id: str, course: ReviewedCourse) -> LineCrossing | None:
        if course.start_line is None:
            raise ValueError("The course has no start line")
        if self.track_storage is None:
            raise RuntimeError("Track storage is required for gun suggestions")
        session = self._session(session_id)
        return suggest_gun(course, (
            (activity_id, points) for activity_id in session.activity_ids
            if (points := self._track_points(activity_id)) is not None
        ))

    # --- Candidate Sessions (Admin help, never attaches) ---

    def session_candidates(self, course: ReviewedCourse) -> list[SessionCandidate]:
        if self.track_storage is None or self.activities is None:
            raise RuntimeError("Tracks and Activities are required for Session candidates")
        activities = {activity.id: activity for activity in self.activities.all()}
        candidates = []
        for session in self.sessions.all():
            members = [
                MemberActivity(activity_id, activities[activity_id].start_time, activities[activity_id].end_time)
                for activity_id in session.activity_ids if activity_id in activities
            ]
            candidate = evaluate_session(course, session.id, members, self._track_points)
            if candidate is not None:
                candidates.append(candidate)
        return sorted(candidates, key=lambda item: (item.min_distance_m, -item.overlap_seconds, item.session_id))

    def _track_points(self, activity_id: str) -> list[TrackPoint] | None:
        try:
            track = self.track_storage.read_normalized_track(activity_id)
        except (OSError, ValueError):
            logger.warning("Skipping unreadable canonical track %s for gun suggestion", activity_id)
            return None
        utc = pd.to_datetime(track["utc"], utc=True)
        return [
            TrackPoint(utc=moment.to_pydatetime(), lat=float(lat), lon=float(lon))
            for moment, lat, lon in zip(utc, track["lat"], track["lon"])
        ]

    # --- Helpers ---

    def _session(self, session_id: str) -> Session:
        session = self.sessions.get_by_id(session_id)
        if session is None:
            raise SessionNotFoundError("Session not found")
        return session

    def _discard(self, course_id: str) -> None:
        try:
            self.storage.delete(course_id)
        except (OSError, ValueError):
            logger.warning("Course files for %s could not be removed", course_id)
