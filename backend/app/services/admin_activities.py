"""Focused Admin read and maintenance operations for Activities."""

from dataclasses import asdict

import pandas as pd

from app.admin_api_models import (
    AdminActivityBoatResponse,
    AdminActivityRelatedIngestionResponse,
    AdminActivityResponse,
    AdminActivitySummaryResponse,
    AdminActivityTechnicalTrackResponse,
    AdminVkxRecordRowResponse,
    AdminVkxRecordSummaryResponse,
    AdminManeuverStateResponse,
)
from app.models import Boat, StoredActivity
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
from app.services.vkx_record_inventory import VKXInventoryError, count_vkx_rows


VKX_ROW_NAMES = {
    0xFF: "Page Header", 0xFE: "Page Terminator",
    0x02: "Position, Velocity, and Orientation", 0x03: "Declination",
    0x04: "Race Timer Event", 0x05: "Line Position", 0x06: "Shift Angle",
    0x08: "Device Configuration", 0x0A: "Wind",
    0x0B: "Speed Through Water", 0x0C: "Depth",
    0x0F: "Load", 0x10: "Temperature",
}


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
        boats = {boat.id: boat for boat in self.boats.all()}
        responses = [self._summary(activity, boats) for activity in self.activities.all()]
        return sorted(
            responses,
            key=lambda item: (item.start_time, item.id),
            reverse=True,
        )

    def get_activity(self, activity_id: str) -> AdminActivityResponse | None:
        activity = self.activities.get_by_id(activity_id)
        if activity is None:
            return None
        boats = {boat.id: boat for boat in self.boats.all()}
        summary = self._summary(activity, boats)
        boat = boats.get(activity.boat_id) if activity.boat_id else None
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
        vkx_record_summary = self._vkx_record_summary(activity, technical_track)
        diagnostic = {
            "id": activity.id,
            "sailor_id": activity.sailor_id,
            "boat_id": activity.boat_id,
            "source": activity.source,
            "device_name": activity.device_name,
            "device_label": activity.device_label,
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
            attachment_sha256=activity.attachment_sha256,
            track_available=track_available,
            source_ingestion_id=source_ingestion_id,
            source_ingestion_resolution=source_ingestion_resolution,
            related_ingestions=ambiguous_related_ingestions,
            technical_track=technical_track,
            vkx_record_summary=vkx_record_summary,
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

    def _summary(self, activity: StoredActivity, boats: dict[str, Boat]) -> AdminActivitySummaryResponse:
        sailor = self.sailors.get_by_id(activity.sailor_id)
        if sailor is None:
            raise AdminDataIntegrityError("Activity references unknown Sailor")
        session = self.sessions.find_by_activity_id(activity.id)
        return AdminActivitySummaryResponse(
            id=activity.id,
            sailor_id=activity.sailor_id,
            sailor_label=sailor.name or sailor.email,
            boat_id=activity.boat_id,
            source=activity.source,
            device_name=activity.device_name,
            device_label=activity.device_label,
            boat=(AdminActivityBoatResponse(
                id=boat.id, name=boat.name,
                sailing_class=boat.sailing_class, sail_number=boat.sail_number,
            ) if (boat := boats.get(activity.boat_id)) else None),
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
        quaternion_columns = ["quat_w", "quat_x", "quat_y", "quat_z"]
        if track[quaternion_columns].notna().all(axis=1).any():
            available_channels.append("QUATERNION")
        return AdminActivityTechnicalTrackResponse(
            sample_count=sample_count,
            duration_seconds=duration_seconds,
            effective_sample_frequency_hz=frequency,
            available_channels=available_channels,
        )

    def _vkx_record_summary(
        self,
        activity: StoredActivity,
        technical_track: AdminActivityTechnicalTrackResponse | None,
    ) -> AdminVkxRecordSummaryResponse | None:
        filename = activity.original_filename.lower()
        if activity.source != "vakaros" or not filename.endswith((".vkx", ".vkx.gz")):
            return None

        counts = None
        source_state = "unreadable"
        try:
            path = self.tracks.original_path(activity.id, activity.original_filename)
            if not path.exists():
                source_state = "missing"
            elif path.is_file():
                counts = count_vkx_rows(path, compressed=filename.endswith(".gz"))
                source_state = "available"
        except (OSError, EOFError, ValueError, VKXInventoryError):
            pass

        rows = None
        if counts is not None:
            rows = [
                AdminVkxRecordRowResponse(
                    code=f"0x{code:02X}",
                    name=VKX_ROW_NAMES.get(code, "Internal row"),
                    source_count=counts[code],
                    handling=(
                        "framing" if code in (0xFF, 0xFE) else
                        "normalized" if code == 0x02 else
                        "activity_observations" if code in (0x04, 0x05) else
                        "partially_used" if code == 0x08 else "ignored"
                    ),
                )
                for code in sorted(counts, key=lambda key: -1 if key == 0xFF else key)
            ]
        return AdminVkxRecordSummaryResponse(
            source_state=source_state,
            rows=rows,
            source_navigation_rows=counts.get(0x02, 0) if counts is not None else None,
            source_race_timer_rows=counts.get(0x04, 0) if counts is not None else None,
            source_line_position_rows=counts.get(0x05, 0) if counts is not None else None,
            normalized_navigation_samples=technical_track.sample_count if technical_track else None,
            persisted_race_timer_events=len(activity.race_timer_events),
            persisted_line_positions=len(activity.line_positions),
        )
