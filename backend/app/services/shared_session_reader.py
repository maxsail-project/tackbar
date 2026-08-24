from app.api_models import ActivityTrackResponse, SharedSessionDetailResponse
from app.services.activity_track_reader import ActivityTrackReader
from app.services.session_capabilities import SessionCapabilityService
from app.services.session_reader import SessionReader


class SharedSessionReader:
    def __init__(
        self,
        capabilities: SessionCapabilityService,
        sessions: SessionReader,
        tracks: ActivityTrackReader,
    ) -> None:
        self.capabilities = capabilities
        self.sessions = sessions
        self.tracks = tracks

    def get_session(self, token: str) -> SharedSessionDetailResponse | None:
        resolved = self.capabilities.resolve(token)
        if resolved is None:
            return None
        detail = self.sessions.get_session(resolved.id)
        if detail is None:
            return None
        return SharedSessionDetailResponse(
            start_time=detail.start_time,
            end_time=detail.end_time,
            activities=detail.activities,
        )

    def get_track(
        self,
        token: str,
        activity_id: str,
    ) -> ActivityTrackResponse | None:
        resolved = self.capabilities.resolve(token)
        if resolved is None:
            return None
        detail = self.sessions.get_session(resolved.id)
        if detail is None or activity_id not in {
            activity.id for activity in detail.activities
        }:
            return None
        return self.tracks.get_track(activity_id)
