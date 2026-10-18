from dataclasses import replace
from datetime import timedelta

from app.config import GeoapifyConfigurationError, load_geoapify_api_key
from app.repositories.activities import ActivityRepository
from app.repositories.sessions import SessionRepository
from app.services.session_matcher import derive_session_summary
from app.session_context_providers.geocoding import (
    GeoapifyGeocodingProvider,
    GeocodingProvider,
)
from app.session_context_providers.historical_conditions import (
    HistoricalConditionsProvider,
    OpenMeteoHistoricalConditionsProvider,
)


class SessionEnrichmentService:
    def __init__(
        self,
        sessions: SessionRepository,
        activities: ActivityRepository,
        *,
        geocoding: GeocodingProvider | None = None,
        conditions: HistoricalConditionsProvider | None = None,
    ) -> None:
        self.sessions = sessions
        self.activities = activities
        self.geocoding = geocoding
        self.conditions = conditions

    def enrich_new_session_geography(self, session_id: str) -> None:
        """Best-effort geography only; authoritative ingestion is already complete."""
        try:
            self._enrich_missing_geography(session_id)
        except Exception:
            return

    def enrich_from_admin(self, session_id: str) -> None:
        session = self.sessions.get_by_id(session_id)
        if session is None:
            raise ValueError(f"Session not found: {session_id}")
        self._enrich_missing_geography(session_id)
        self._refresh_conditions(session_id)

    def _enrich_missing_geography(self, session_id: str) -> None:
        session = self.sessions.get_by_id(session_id)
        if session is None or session.location_label is not None or self.geocoding is None:
            return
        if not session.activity_ids:
            return
        activity = self.activities.get_by_id(session.activity_ids[0])
        if activity is None:
            return
        try:
            context = self.geocoding.reverse(activity.start_lat, activity.start_lon)
        except Exception:
            return
        if context is None:
            return
        current = self.sessions.get_by_id(session_id)
        if current is None or current.location_label is not None:
            return
        self.sessions.replace(replace(
            current,
            location_label=context.label,
            location_region=context.region,
            location_country=context.country,
            location_country_code=context.country_code,
            location_provider=context.provider,
            location_resolved_at=context.resolved_at,
            location_source_activity_id=activity.id,
        ))

    def _refresh_conditions(self, session_id: str) -> None:
        if self.conditions is None:
            return
        session = self.sessions.get_by_id(session_id)
        if session is None:
            return
        persisted_activities = [
            self.activities.get_by_id(activity_id)
            for activity_id in session.activity_ids
        ]
        if not persisted_activities or any(
            activity is None for activity in persisted_activities
        ):
            return
        activity_values = [
            activity for activity in persisted_activities if activity is not None
        ]
        start_time = min(activity.start_time for activity in activity_values)
        end_time = max(activity.end_time for activity in activity_values)
        try:
            summary = derive_session_summary(session, self.activities)
            latitude, longitude = summary.center_lat, summary.center_lon
        except ValueError:
            creator = activity_values[0]
            latitude, longitude = creator.start_lat, creator.start_lon
        try:
            conditions = self.conditions.fetch(
                latitude,
                longitude,
                start_time - timedelta(hours=3),
                end_time + timedelta(hours=3),
                end_time,
            )
        except Exception:
            return
        if conditions is None:
            return
        current = self.sessions.get_by_id(session_id)
        if current is not None:
            self.sessions.replace(replace(current, historical_conditions=conditions))


def configured_geocoding_provider() -> GeocodingProvider | None:
    try:
        return GeoapifyGeocodingProvider(load_geoapify_api_key())
    except GeoapifyConfigurationError:
        return None


def automatic_session_enrichment_service(
    sessions: SessionRepository,
    activities: ActivityRepository,
) -> SessionEnrichmentService:
    return SessionEnrichmentService(
        sessions,
        activities,
        geocoding=configured_geocoding_provider(),
    )


def admin_session_enrichment_service(
    sessions: SessionRepository,
    activities: ActivityRepository,
) -> SessionEnrichmentService:
    return SessionEnrichmentService(
        sessions,
        activities,
        geocoding=configured_geocoding_provider(),
        conditions=OpenMeteoHistoricalConditionsProvider(),
    )
