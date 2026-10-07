from app.api_models import (
    ActivityManeuverAnalyticsResponse,
    ActivityTrackResponse,
    ManeuverResponse,
    SharedSessionDetailResponse,
)
from app.services.activity_track_reader import ActivityTrackReader
from app.services.maneuver_analytics import get_or_generate_maneuver_analytics
from app.services.session_capabilities import SessionCapabilityService
from app.services.session_reader import SessionReader
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage
from app.storage.track_storage import TrackStorage


class ManeuverAnalyticsDataIntegrityError(Exception):
    pass


class SharedSessionReader:
    def __init__(
        self,
        capabilities: SessionCapabilityService,
        sessions: SessionReader,
        tracks: ActivityTrackReader,
        track_storage: TrackStorage,
        analytics_storage: ManeuverAnalyticsStorage,
    ) -> None:
        self.capabilities = capabilities
        self.sessions = sessions
        self.tracks = tracks
        self.track_storage = track_storage
        self.analytics_storage = analytics_storage

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

    def get_maneuvers(
        self,
        token: str,
        activity_id: str,
    ) -> ActivityManeuverAnalyticsResponse | None:
        resolved = self.capabilities.resolve(token)
        if resolved is None:
            return None
        detail = self.sessions.get_session(resolved.id)
        if detail is None or activity_id not in {
            activity.id for activity in detail.activities
        }:
            return None
        try:
            artifact = get_or_generate_maneuver_analytics(
                activity_id,
                self.track_storage,
                self.analytics_storage,
            )
        except (OSError, ValueError) as error:
            raise ManeuverAnalyticsDataIntegrityError from error
        return ActivityManeuverAnalyticsResponse(
            activity_id=activity_id,
            status=artifact["status"],
            reason=artifact.get("reason"),
            maneuvers=[
                ManeuverResponse(**maneuver)
                for maneuver in artifact["maneuvers"]
            ],
        )
