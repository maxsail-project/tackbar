import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import median

from app.models import Session, StoredActivity
from app.repositories.activities import ActivityRepository
from app.repositories.sessions import SessionRepository


MAX_SESSION_DISTANCE_NM = 3.0
MAX_SESSION_TIME_GAP_MINUTES = 60
EARTH_RADIUS_NM = 3440.065


@dataclass
class SessionSummary:
    session: Session
    start_time: datetime
    end_time: datetime
    center_lat: float
    center_lon: float
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float


@dataclass
class SessionMatchResult:
    session: Session
    status: str

    @property
    def activity_count(self) -> int:
        return len(self.session.activity_ids)


def match_activity_to_session(
    activity: StoredActivity,
    activities: ActivityRepository,
    sessions: SessionRepository,
) -> SessionMatchResult:
    if activities.get_by_id(activity.id) is None:
        raise ValueError(f"Activity is not persisted: {activity.id}")

    existing_session = sessions.find_by_activity_id(activity.id)
    if existing_session is not None:
        return SessionMatchResult(existing_session, "already assigned")

    _require_spatial_metadata(activity)
    candidates: list[tuple[float, float, str, Session]] = []

    for session in sessions.all():
        summary = derive_session_summary(session, activities)
        if not intervals_are_compatible(
            activity.start_time,
            activity.end_time,
            summary.start_time,
            summary.end_time,
        ):
            continue

        distance_nm = haversine_nm(
            activity.center_lat,
            activity.center_lon,
            summary.center_lat,
            summary.center_lon,
        )
        if distance_nm > MAX_SESSION_DISTANCE_NM:
            continue

        midpoint_difference = abs(
            (_midpoint(activity.start_time, activity.end_time)
             - _midpoint(summary.start_time, summary.end_time)).total_seconds()
        )
        candidates.append(
            (midpoint_difference, distance_nm, session.id, session)
        )

    if not candidates:
        return SessionMatchResult(sessions.create(activity.id), "created")

    selected_session = min(candidates, key=lambda candidate: candidate[:3])[3]
    matched_session = sessions.add_activity(selected_session.id, activity.id)
    return SessionMatchResult(matched_session, "matched")


def derive_session_summary(
    session: Session,
    activities: ActivityRepository,
) -> SessionSummary:
    session_activities = []
    for activity_id in session.activity_ids:
        activity = activities.get_by_id(activity_id)
        if activity is None:
            raise ValueError(f"Session references unknown Activity: {activity_id}")
        _require_spatial_metadata(activity)
        session_activities.append(activity)

    if not session_activities:
        raise ValueError("Session contains no Activities")

    return SessionSummary(
        session=session,
        start_time=min(activity.start_time for activity in session_activities),
        end_time=max(activity.end_time for activity in session_activities),
        center_lat=median(
            activity.center_lat for activity in session_activities
        ),
        center_lon=median(
            activity.center_lon for activity in session_activities
        ),
        min_lat=min(activity.min_lat for activity in session_activities),
        max_lat=max(activity.max_lat for activity in session_activities),
        min_lon=min(activity.min_lon for activity in session_activities),
        max_lon=max(activity.max_lon for activity in session_activities),
    )


def intervals_are_compatible(
    first_start: datetime,
    first_end: datetime,
    second_start: datetime,
    second_end: datetime,
) -> bool:
    if first_end < second_start:
        gap = second_start - first_end
    elif second_end < first_start:
        gap = first_start - second_end
    else:
        gap = timedelta(0)
    return gap <= timedelta(minutes=MAX_SESSION_TIME_GAP_MINUTES)


def haversine_nm(
    first_lat: float,
    first_lon: float,
    second_lat: float,
    second_lon: float,
) -> float:
    first_lat_radians = math.radians(first_lat)
    second_lat_radians = math.radians(second_lat)
    latitude_delta = math.radians(second_lat - first_lat)
    longitude_delta = math.radians(second_lon - first_lon)

    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(first_lat_radians)
        * math.cos(second_lat_radians)
        * math.sin(longitude_delta / 2) ** 2
    )
    angular_distance = 2 * math.atan2(
        math.sqrt(haversine),
        math.sqrt(1 - haversine),
    )
    return EARTH_RADIUS_NM * angular_distance


def _midpoint(start_time: datetime, end_time: datetime) -> datetime:
    return start_time + (end_time - start_time) / 2


def _require_spatial_metadata(activity: StoredActivity) -> None:
    for field_name in (
        "center_lat",
        "center_lon",
        "min_lat",
        "max_lat",
        "min_lon",
        "max_lon",
    ):
        if getattr(activity, field_name) is None:
            raise ValueError(
                f"Activity {activity.id} is missing spatial metadata: {field_name}"
            )
