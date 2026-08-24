from app.api_models import (
    ActivityContextResponse,
    BoatContextResponse,
    SailorContextResponse,
    SessionDetailResponse,
    SessionSummaryResponse,
)
from app.models import Boat, Sailor, Session, StoredActivity
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.shared_activity_visibility import (
    SharedActivityVisibilityError,
    shareable_sailor,
)


class SessionDataIntegrityError(Exception):
    pass


class SessionReader:
    def __init__(
        self,
        sessions: SessionRepository,
        activities: ActivityRepository,
        sailors: SailorRepository,
        boats: BoatRepository,
    ) -> None:
        self.sessions = sessions
        self.activities = activities
        self.sailors = sailors
        self.boats = boats

    def list_sessions(self) -> list[SessionSummaryResponse]:
        sessions = self.sessions.all()
        if not sessions:
            return []
        state = self._load_state()
        details = [
            detail
            for session in sessions
            if (detail := self._compose_session(session, *state)) is not None
        ]
        return [
            SessionSummaryResponse(
                id=detail.id,
                start_time=detail.start_time,
                end_time=detail.end_time,
                activity_count=len(detail.activities),
            )
            for detail in sorted(
                details,
                key=lambda detail: (detail.start_time, detail.id),
                reverse=True,
            )
        ]

    def get_session(self, session_id: str) -> SessionDetailResponse | None:
        session = self.sessions.get_by_id(session_id)
        if session is None:
            return None
        return self._compose_session(session, *self._load_state())

    def _load_state(
        self,
    ) -> tuple[
        dict[str, StoredActivity],
        dict[str, Sailor],
        dict[str, Boat],
    ]:
        return (
            {activity.id: activity for activity in self.activities.all()},
            {sailor.id: sailor for sailor in self.sailors.all()},
            {boat.id: boat for boat in self.boats.all()},
        )

    def _compose_session(
        self,
        session: Session,
        activities_by_id: dict[str, StoredActivity],
        sailors_by_id: dict[str, Sailor],
        boats_by_id: dict[str, Boat],
    ) -> SessionDetailResponse | None:
        activities = []
        for activity_id in session.activity_ids:
            activity = activities_by_id.get(activity_id)
            if activity is None:
                raise SessionDataIntegrityError(
                    f"Session references unknown Activity: {activity_id}"
                )

            try:
                sailor = shareable_sailor(activity, sailors_by_id)
            except SharedActivityVisibilityError as error:
                raise SessionDataIntegrityError(
                    f"Activity references unknown Sailor: {activity.id}"
                ) from error

            boat = None
            if activity.boat_id is not None:
                boat = boats_by_id.get(activity.boat_id)
                if boat is None:
                    raise SessionDataIntegrityError(
                        f"Activity references unknown Boat: {activity.id}"
                    )

            if sailor is None:
                continue

            activities.append(
                ActivityContextResponse(
                    id=activity.id,
                    source=activity.source,
                    device_name=activity.device_name,
                    original_filename=activity.original_filename,
                    start_time=activity.start_time,
                    end_time=activity.end_time,
                    sample_count=activity.sample_count,
                    sailor=SailorContextResponse(
                        id=sailor.id,
                        name=sailor.name,
                        email=sailor.email,
                    ),
                    boat=(
                        BoatContextResponse(
                            id=boat.id,
                            name=boat.name,
                            sailing_class=boat.sailing_class,
                            sail_number=boat.sail_number,
                        )
                        if boat is not None
                        else None
                    ),
                )
            )

        if not activities:
            return None

        return SessionDetailResponse(
            id=session.id,
            start_time=min(activity.start_time for activity in activities),
            end_time=max(activity.end_time for activity in activities),
            activities=activities,
        )
