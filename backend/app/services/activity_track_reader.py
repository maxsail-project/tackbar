import pandas as pd

from app.api_models import ActivityTrackResponse, TrackSampleResponse
from app.repositories.activities import ActivityRepository
from app.storage.track_storage import TrackStorage


class ActivityTrackDataIntegrityError(Exception):
    pass


class ActivityTrackReader:
    def __init__(
        self,
        activities: ActivityRepository,
        storage: TrackStorage,
    ) -> None:
        self.activities = activities
        self.storage = storage

    def get_track(self, activity_id: str) -> ActivityTrackResponse | None:
        if self.activities.get_by_id(activity_id) is None:
            return None

        try:
            track = self.storage.read_normalized_track(activity_id)
        except (FileNotFoundError, OSError, ValueError) as error:
            raise ActivityTrackDataIntegrityError from error

        return ActivityTrackResponse(
            activity_id=activity_id,
            samples=[_sample_response(row) for row in track.itertuples()],
        )


def _sample_response(row: object) -> TrackSampleResponse:
    return TrackSampleResponse(
        utc=str(row.utc),
        lat=float(row.lat),
        lon=float(row.lon),
        cog=_optional_float(row.cog),
        sog=_optional_float(row.sog),
        dist=float(row.dist),
        hdg=_optional_float(row.hdg),
        heel=_optional_float(row.heel),
        trim=_optional_float(row.trim),
    )


def _optional_float(value: object) -> float | None:
    return None if pd.isna(value) else float(value)
