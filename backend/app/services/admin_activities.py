"""Focused Admin read and maintenance operations for Activities."""

from dataclasses import asdict

from app.admin_api_models import (
    AdminActivityBoatResponse,
    AdminActivityResponse,
    AdminActivitySummaryResponse,
    AdminManeuverStateResponse,
)
from app.models import StoredActivity
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.admin_reader import AdminDataIntegrityError
from app.services.ingestion_history import IngestionHistory
from app.services.maneuver_analytics import (
    generate_maneuver_analytics,
    inspect_maneuver_analytics,
)
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage
from app.storage.track_storage import TrackStorage


class AdminActivityReader:
    def __init__(self) -> None:
        self.activities = ActivityRepository()
        self.sailors = SailorRepository()
        self.boats = BoatRepository()
        self.sessions = SessionRepository()
        self.history = IngestionHistory()
        self.tracks = TrackStorage()
        self.analytics = ManeuverAnalyticsStorage()

    def list_activities(self) -> list[AdminActivitySummaryResponse]:
        responses = [self._summary(activity) for activity in self.activities.all()]
        return sorted(
            responses,
            key=lambda item: (item.start_time, item.id),
            reverse=True,
        )

    def get_activity(self, activity_id: str) -> AdminActivityResponse | None:
        activity = self.activities.get_by_id(activity_id)
        if activity is None:
            return None
        summary = self._summary(activity)
        boat = self.boats.get_by_id(activity.boat_id) if activity.boat_id else None
        if activity.boat_id is not None and boat is None:
            raise AdminDataIntegrityError("Activity references unknown Boat")
        source_ingestions = [
            record for record in self.history.records()
            if record["activity_id"] == activity.id
            and record["activity_created_by_ingestion"] is True
        ]
        if len(source_ingestions) > 1:
            raise AdminDataIntegrityError("Activity has multiple source Ingestions")
        source_ingestion_id = (
            source_ingestions[0]["id"] if source_ingestions else None
        )
        track_available = self.tracks.track_path(activity.id).is_file()
        diagnostic = {
            "id": activity.id,
            "sailor_id": activity.sailor_id,
            "boat_id": activity.boat_id,
            "source": activity.source,
            "device_name": activity.device_name,
            "original_filename": activity.original_filename,
            "start_time": activity.start_time.isoformat(),
            "end_time": activity.end_time.isoformat(),
            "sample_count": activity.sample_count,
            "attachment_sha256": activity.attachment_sha256,
            "track_available": track_available,
            "session_id": summary.session_id,
            "source_ingestion_id": source_ingestion_id,
        }
        return AdminActivityResponse(
            **summary.model_dump(),
            boat=AdminActivityBoatResponse(**boat.__dict__) if boat else None,
            source=activity.source,
            device_name=activity.device_name,
            original_filename=activity.original_filename,
            attachment_sha256=activity.attachment_sha256,
            track_available=track_available,
            source_ingestion_id=source_ingestion_id,
            maneuvers=self._maneuver_state(activity.id),
            diagnostic=diagnostic,
        )

    def recalculate_maneuvers(
        self,
        activity_id: str,
    ) -> AdminManeuverStateResponse | None:
        if self.activities.get_by_id(activity_id) is None:
            return None
        generate_maneuver_analytics(activity_id, self.tracks, self.analytics)
        return self._maneuver_state(activity_id)

    def _summary(self, activity: StoredActivity) -> AdminActivitySummaryResponse:
        sailor = self.sailors.get_by_id(activity.sailor_id)
        if sailor is None:
            raise AdminDataIntegrityError("Activity references unknown Sailor")
        session = self.sessions.find_by_activity_id(activity.id)
        return AdminActivitySummaryResponse(
            id=activity.id,
            sailor_id=activity.sailor_id,
            sailor_label=sailor.name or sailor.email,
            start_time=activity.start_time,
            end_time=activity.end_time,
            sample_count=activity.sample_count,
            session_id=session.id if session else None,
        )

    def _maneuver_state(self, activity_id: str) -> AdminManeuverStateResponse:
        return AdminManeuverStateResponse(
            **asdict(
                inspect_maneuver_analytics(
                    activity_id,
                    self.tracks,
                    self.analytics,
                )
            )
        )
