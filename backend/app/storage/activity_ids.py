from uuid import UUID


def canonical_activity_id(activity_id: str) -> str:
    try:
        canonical = str(UUID(activity_id))
    except (ValueError, AttributeError) as error:
        raise ValueError(
            f"Invalid Activity id for storage: {activity_id}"
        ) from error
    if activity_id.lower() != canonical:
        raise ValueError(f"Invalid Activity id for storage: {activity_id}")
    return canonical
