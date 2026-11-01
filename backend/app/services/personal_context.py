"""Sailor-scoped context reads and edits using the current personal capability."""

from dataclasses import replace

from app.api_models import BoatContextResponse
from app.personal_api_models import (
    PersonalActivityContextPatch, PersonalActivityResponse,
    PersonalBoatResponse, PersonalDefaultBoatPatch, PersonalDefaultBoatResponse,
)
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.ingestion_lock import ingestion_lock, locked_sailor_write
from app.services.personal_capabilities import PersonalCapabilityService


class PersonalContextUnavailable(Exception):
    """The capability or scoped resource cannot be used."""


class PersonalContextService:
    def __init__(self, sailors: SailorRepository, boats: BoatRepository,
                 activities: ActivityRepository) -> None:
        self.sailors = sailors
        self.boats = boats
        self.activities = activities
        self.capabilities = PersonalCapabilityService(
            sailors, SessionRepository(sailors.path.with_name("sessions.json")),
        )

    def _sailor(self, token: str):
        sailor = self.capabilities.resolve(token)
        if sailor is None:
            raise PersonalContextUnavailable
        return sailor

    @locked_sailor_write
    def list_activities(self, token: str) -> list[PersonalActivityResponse]:
        sailor = self._sailor(token)
        boats = {boat.id: boat for boat in self.boats.all()}
        activities = [item for item in self.activities.all() if item.sailor_id == sailor.id]
        return [self._activity_response(item, boats.get(item.boat_id), sailor.id)
                for item in sorted(activities, key=lambda item: (item.start_time, item.id), reverse=True)]

    def update_activity(self, token: str, activity_id: str,
                        patch: PersonalActivityContextPatch) -> PersonalActivityResponse:
        with ingestion_lock(self.sailors.path.parent):
            sailor = self._sailor(token)
            activity = self.activities.get_by_id(activity_id)
            if activity is None or activity.sailor_id != sailor.id:
                raise PersonalContextUnavailable
            if not patch.model_fields_set:
                boat = self.boats.get_by_id(activity.boat_id) if activity.boat_id else None
                return self._activity_response(activity, boat, sailor.id)
            boat_id = patch.boat_id if "boat_id" in patch.model_fields_set else activity.boat_id
            device_label = (patch.device_label if "device_label" in patch.model_fields_set
                            else activity.device_label)
            if "boat_id" in patch.model_fields_set and boat_id is not None:
                if self.boats.get_for_sailor(sailor.id, boat_id) is None:
                    raise PersonalContextUnavailable
            updated = self.activities.update_context_for_sailor(
                sailor.id, activity_id, boat_id=boat_id, device_label=device_label,
            )
            if updated is None:
                raise PersonalContextUnavailable
            boat = self.boats.get_by_id(updated.boat_id) if updated.boat_id else None
            return self._activity_response(updated, boat, sailor.id)

    @locked_sailor_write
    def list_boats(self, token: str) -> list[PersonalBoatResponse]:
        sailor = self._sailor(token)
        return [PersonalBoatResponse(
            id=boat.id, name=boat.name, sailing_class=boat.sailing_class,
            sail_number=boat.sail_number,
        ) for boat in self.boats.list_for_sailor(sailor.id)]

    @locked_sailor_write
    def get_default_boat(self, token: str) -> PersonalDefaultBoatResponse:
        sailor = self._sailor(token)
        return PersonalDefaultBoatResponse(default_boat_id=sailor.default_boat_id)

    def update_default_boat(self, token: str,
                            patch: PersonalDefaultBoatPatch) -> PersonalDefaultBoatResponse:
        with ingestion_lock(self.sailors.path.parent):
            sailor = self._sailor(token)
            if "default_boat_id" not in patch.model_fields_set:
                return PersonalDefaultBoatResponse(default_boat_id=sailor.default_boat_id)
            boat_id = patch.default_boat_id
            if boat_id is not None and self.boats.get_for_sailor(sailor.id, boat_id) is None:
                raise PersonalContextUnavailable
            updated = self.sailors.replace(replace(sailor, default_boat_id=boat_id))
            return PersonalDefaultBoatResponse(default_boat_id=updated.default_boat_id)

    @staticmethod
    def _activity_response(activity, boat, sailor_id: str) -> PersonalActivityResponse:
        # Historical ownerless Boats are readable context; another Sailor's
        # catalogue metadata is never returned through a stale reference.
        visible = boat if boat is not None and boat.sailor_id in (None, sailor_id) else None
        return PersonalActivityResponse(
            id=activity.id, boat_id=activity.boat_id,
            boat=(BoatContextResponse(id=visible.id, name=visible.name,
                                      sailing_class=visible.sailing_class,
                                      sail_number=visible.sail_number) if visible else None),
            device_name=activity.device_name, device_label=activity.device_label,
            source=activity.source, original_filename=activity.original_filename,
            start_time=activity.start_time, end_time=activity.end_time,
        )
