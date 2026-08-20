from uuid import UUID


def normalize_email(email: str) -> str:
    return email.strip().lower()


def require_uuid(value: str, entity_name: str) -> None:
    try:
        canonical = str(UUID(value))
    except (ValueError, AttributeError) as error:
        raise ValueError(f"Invalid {entity_name} id: {value}") from error
    if value.lower() != canonical:
        raise ValueError(f"Invalid {entity_name} id: {value}")
