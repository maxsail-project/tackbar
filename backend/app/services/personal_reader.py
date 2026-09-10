from app.personal_api_models import PersonalSessionResponse, PersonalTackBarResponse
from app.repositories.activities import ActivityRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.sailor_sessions import sailor_sessions
from app.services.shared_session_reader import SharedSessionReader


class PersonalReader:
    def __init__(
        self,
        capabilities: PersonalCapabilityService,
        sailors: SailorRepository,
        sessions: SessionRepository,
        activities: ActivityRepository,
        shared: SharedSessionReader,
    ) -> None:
        self.capabilities = capabilities
        self.sailors = sailors
        self.sessions = sessions
        self.activities = activities
        self.shared = shared

    def get_personal(self, token: str) -> PersonalTackBarResponse | None:
        sailor = self.capabilities.resolve(token)
        if sailor is None:
            return None
        history = sailor_sessions(
            sailor.id, self.sessions.all(),
            {activity.id: activity for activity in self.activities.all()},
            {item.id: item for item in self.sailors.all()},
        )
        rows = []
        for item in history:
            shared_token = item.session.capability_token
            # The existing shared reader owns capability, lifetime and
            # ACTIVE-only visibility. Personal access never grants Viewer access.
            usable = bool(shared_token) and self.shared.get_session(shared_token) is not None
            rows.append(PersonalSessionResponse(
                sailing_start=item.sailing_start,
                sailing_end=item.sailing_end,
                sailor_count=item.sailor_count,
                session_path=f"/s/{shared_token}" if usable else None,
            ))
        return PersonalTackBarResponse(
            email=sailor.email,
            name=sailor.name,
            session_count=len(rows),
            last_sailing_end=rows[0].sailing_end if rows else None,
            sessions=rows,
        )
