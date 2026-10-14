"""Focused Admin read and maintenance operations for Activities."""

from dataclasses import asdict

import pandas as pd

from app.admin_api_models import (
    AdminActivityBoatResponse,
    AdminActivityRelatedIngestionResponse,
    AdminActivityResponse,
    AdminActivitySummaryResponse,
    AdminActivityTechnicalTrackResponse,
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
        related_ingestions = [
            record for record in self.history.records()
            if record["activity_id"] == activity.id
        ]
        source_ingestions = [
            record for record in related_ingestions
            if record["activity_created_by_ingestion"] is True
        ]
        if len(source_ingestions) > 1:
            raise AdminDataIntegrityError("Activity has multiple source Ingestions")
        if source_ingestions:
            source_ingestion = source_ingestions[0]
            source_ingestion_resolution = "authoritative"
        elif len(related_ingestions) == 1:
            source_ingestion = related_ingestions[0]
            source_ingestion_resolution = "related"
        else:
            source_ingestion = None
            source_ingestion_resolution = (
                "ambiguous" if related_ingestions else "none"
            )
        source_ingestion_id = (
            source_ingestion["id"] if source_ingestion else None
        )
        ambiguous_related_ingestions = (
            [
                AdminActivityRelatedIngestionResponse(
                    id=record["id"],
                    attachment_name=record["attachment_name"],
                    received_at=record["received_at"],
                )
                for record in related_ingestions
            ]
            if source_ingestion_resolution == "ambiguous"
            else []
        )
        track_available = self.tracks.track_path(activity.id).is_file()
        technical_track = (
            self._technical_track(activity.id) if track_available else None
        )
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
            "source_ingestion_resolution": source_ingestion_resolution,
            "source_ingestion_activity_created_by_ingestion": (
                source_ingestion["activity_created_by_ingestion"]
                if source_ingestion else None
            ),
            "related_ingestion_count": len(related_ingestions),
        }
        return AdminActivityResponse(
            **summary.model_dump(),
            boat=AdminActivityBoatResponse(**boat.__dict__) if boat else None,
            attachment_sha256=activity.attachment_sha256,
            track_available=track_available,
            source_ingestion_id=source_ingestion_id,
            source_ingestion_resolution=source_ingestion_resolution,
            related_ingestions=ambiguous_related_ingestions,
            technical_track=technical_track,
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
            source=activity.source,
            device_name=activity.device_name,
            original_filename=activity.original_filename,
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

    def _technical_track(
        self,
        activity_id: str,
    ) -> AdminActivityTechnicalTrackResponse:
        track = self.tracks.read_normalized_track(activity_id)
        timestamps = pd.to_datetime(track["utc"], format="mixed", utc=True)
        duration_seconds = float(
            (timestamps.max() - timestamps.min()).total_seconds()
        )
        sample_count = len(track)
        frequency = (
            (sample_count - 1) / duration_seconds
            if sample_count > 1 and duration_seconds > 0
            else None
        )
        available_channels = [
            label
            for label, column in (
                ("SOG", "sog"),
                ("COG", "cog"),
                ("HDG", "hdg"),
                ("HEEL", "heel"),
                ("TRIM", "trim"),
            )
            if track[column].notna().any()
        ]
        return AdminActivityTechnicalTrackResponse(
            sample_count=sample_count,
            duration_seconds=duration_seconds,
            effective_sample_frequency_hz=frequency,
            available_channels=available_channels,
        )
