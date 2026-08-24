import hmac
import os
from typing import Annotated

from fastapi import Header, HTTPException


ADMIN_KEY_ENVIRONMENT_VARIABLE = "TACKBAR_ADMIN_KEY"


def require_admin_key(
    provided_key: Annotated[
        str | None,
        Header(alias="X-TackBar-Admin-Key"),
    ] = None,
) -> None:
    configured_key = os.getenv(ADMIN_KEY_ENVIRONMENT_VARIABLE)
    if not configured_key or not configured_key.strip():
        raise HTTPException(status_code=503, detail="Admin API unavailable")
    if provided_key is None or not hmac.compare_digest(
        provided_key,
        configured_key,
    ):
        raise HTTPException(status_code=401, detail="Admin authorization failed")
