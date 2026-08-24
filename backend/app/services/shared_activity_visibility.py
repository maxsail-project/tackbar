from app.models import ConsentStatus, Sailor, StoredActivity


class SharedActivityVisibilityError(Exception):
    pass


def shareable_sailor(
    activity: StoredActivity,
    sailors_by_id: dict[str, Sailor],
) -> Sailor | None:
    sailor = sailors_by_id.get(activity.sailor_id)
    if sailor is None:
        raise SharedActivityVisibilityError(
            f"Activity references unknown Sailor: {activity.id}"
        )
    if sailor.consent_status != ConsentStatus.ACTIVE:
        return None
    return sailor
