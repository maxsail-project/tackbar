from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class PublicConsentResponse(BaseModel):
    status: Literal["ready", "confirmed"]
    agreement_version: str
    expires_at: datetime
