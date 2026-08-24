from dataclasses import replace
from datetime import datetime, timedelta, timezone
from typing import Callable

from app.models import Session
from app.repositories.sessions import SessionRepository


DEFAULT_RENEWAL_DAYS = 30
MAX_RENEWAL_DAYS = 365


class SessionLifetimeOperationError(ValueError):
    pass


class SessionLifetimeService:
    def __init__(
        self,
        sessions: SessionRepository,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.sessions = sessions
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def renew_session(
        self,
        session_id: str,
        days: int = DEFAULT_RENEWAL_DAYS,
    ) -> Session:
        if isinstance(days, bool) or not isinstance(days, int):
            raise SessionLifetimeOperationError("Renewal days must be an integer")
        if days < 1 or days > MAX_RENEWAL_DAYS:
            raise SessionLifetimeOperationError(
                f"Renewal days must be between 1 and {MAX_RENEWAL_DAYS}"
            )

        session = self.sessions.get_by_id(session_id)
        if session is None:
            raise ValueError(f"Session not found: {session_id}")

        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("Session renewal clock must be timezone-aware")
        expires_at = now.astimezone(timezone.utc) + timedelta(days=days)
        return self.sessions.replace(replace(session, expires_at=expires_at))
