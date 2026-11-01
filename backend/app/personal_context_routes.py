from fastapi import APIRouter, HTTPException

from app.personal_api_models import (
    PersonalActivityContextPatch, PersonalActivityResponse,
    PersonalBoatResponse, PersonalDefaultBoatPatch, PersonalDefaultBoatResponse,
)
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.services.personal_context import PersonalContextService, PersonalContextUnavailable


router = APIRouter(prefix="/api/me/{token}")


def _service() -> PersonalContextService:
    return PersonalContextService(SailorRepository(), BoatRepository(), ActivityRepository())


def _unavailable() -> HTTPException:
    return HTTPException(status_code=404, detail="Personal context not found")


def _integrity_error() -> HTTPException:
    return HTTPException(status_code=500, detail="Persisted personal data is inconsistent")


@router.get("/activities", response_model=list[PersonalActivityResponse])
def list_personal_activities(token: str) -> list[PersonalActivityResponse]:
    try:
        return _service().list_activities(token)
    except PersonalContextUnavailable as error:
        raise _unavailable() from error
    except ValueError as error:
        raise _integrity_error() from error


@router.patch("/activities/{activity_id}", response_model=PersonalActivityResponse)
def update_personal_activity(token: str, activity_id: str,
                             patch: PersonalActivityContextPatch) -> PersonalActivityResponse:
    try:
        return _service().update_activity(token, activity_id, patch)
    except PersonalContextUnavailable as error:
        raise _unavailable() from error
    except ValueError as error:
        raise _integrity_error() from error


@router.get("/boats", response_model=list[PersonalBoatResponse])
def list_personal_boats(token: str) -> list[PersonalBoatResponse]:
    try:
        return _service().list_boats(token)
    except PersonalContextUnavailable as error:
        raise _unavailable() from error
    except ValueError as error:
        raise _integrity_error() from error


@router.get("/default-boat", response_model=PersonalDefaultBoatResponse)
def get_personal_default_boat(token: str) -> PersonalDefaultBoatResponse:
    try:
        return _service().get_default_boat(token)
    except PersonalContextUnavailable as error:
        raise _unavailable() from error
    except ValueError as error:
        raise _integrity_error() from error


@router.patch("/default-boat", response_model=PersonalDefaultBoatResponse)
def update_personal_default_boat(token: str,
                                 patch: PersonalDefaultBoatPatch) -> PersonalDefaultBoatResponse:
    try:
        return _service().update_default_boat(token, patch)
    except PersonalContextUnavailable as error:
        raise _unavailable() from error
    except ValueError as error:
        raise _integrity_error() from error
