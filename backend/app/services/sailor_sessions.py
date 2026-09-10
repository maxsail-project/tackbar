from dataclasses import dataclass
from datetime import datetime

from app.models import Sailor, Session, StoredActivity


@dataclass(frozen=True)
class SailorSession:
    session: Session
    sailing_start: datetime
    sailing_end: datetime
    sailor_activity_count: int
    sailor_count: int


def sailor_sessions(
    sailor_id: str,
    sessions: list[Session],
    activities: dict[str, StoredActivity],
    sailors: dict[str, Sailor],
) -> list[SailorSession]:
    """Derive the same participation history for Admin and Personal TackBar."""
    history = []
    for session in sessions:
        session_activities = []
        for activity_id in session.activity_ids:
            activity = activities.get(activity_id)
            if activity is None:
                raise ValueError("Session references unknown Activity")
            if activity.sailor_id not in sailors:
                raise ValueError("Activity references unknown Sailor")
            session_activities.append(activity)
        own_count = sum(activity.sailor_id == sailor_id for activity in session_activities)
        if own_count:
            history.append(SailorSession(
                session=session,
                sailing_start=min(activity.start_time for activity in session_activities),
                sailing_end=max(activity.end_time for activity in session_activities),
                sailor_activity_count=own_count,
                sailor_count=len({activity.sailor_id for activity in session_activities}),
            ))
    return sorted(history, key=lambda item: (
        item.sailing_end, item.sailing_start, item.session.id,
    ), reverse=True)
