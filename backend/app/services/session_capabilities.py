from dataclasses import replace
from datetime import datetime, timezone
from secrets import token_urlsafe
from typing import Callable

from app.models import ConsentStatus, Session
from app.repositories.activities import ActivityRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository


class SessionCapabilityIntegrityError(Exception):
    pass


class SessionCapabilityService:
    def __init__(
        self,
        sessions: SessionRepository,
        activities: ActivityRepository,
        sailors: SailorRepository,
        clock: Callable[[], datetime] | None = None,
        token_generator: Callable[[], str] | None = None,
    ) -> None:
        self.sessions = sessions
        self.activities = activities
        self.sailors = sailors
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.token_generator = token_generator or (lambda: token_urlsafe(32))

    def ensure_for_session(self, session_id: str) -> Session:
        session = self._require_session(session_id)
        if (
            session.capability_token is not None
            or session.capability_revoked
            or self._is_expired(session)
            or not self._has_active_activity(session)
        ):
            return session
        return self._replace_token(session)

    def ensure_for_sailor(self, sailor_id: str) -> list[Session]:
        activity_ids = {
            activity.id
            for activity in self.activities.all()
            if activity.sailor_id == sailor_id
        }
        updated = []
        for session in self.sessions.all():
            if activity_ids.intersection(session.activity_ids):
                updated.append(self.ensure_for_session(session.id))
        return updated

    def regenerate_capability(self, session_id: str) -> Session:
        session = self._require_session(session_id)
        if self._is_expired(session):
            raise ValueError("Cannot regenerate capability for expired Session")
        return self._replace_token(session)

    def revoke_capability(self, session_id: str) -> Session:
        session = self._require_session(session_id)
        return self.sessions.replace(
            replace(
                session,
                capability_token=None,
                capability_revoked=True,
            )
        )

    def resolve(self, token: str) -> Session | None:
        session = self.sessions.get_by_capability_token(token)
        if session is None:
            return None
        if self._is_expired(session):
            return None
        return session

    def _replace_token(self, session: Session) -> Session:
        token = self._new_unique_token(excluded_token=session.capability_token)
        return self.sessions.replace(
            replace(
                session,
                capability_token=token,
                capability_revoked=False,
            )
        )

    def _new_unique_token(self, excluded_token: str | None = None) -> str:
        for _ in range(10):
            token = self.token_generator()
            if len(token) < 32:
                raise ValueError("Capability token generator returned low entropy")
            if (
                token != excluded_token
                and self.sessions.get_by_capability_token(token) is None
            ):
                return token
        raise ValueError("Unable to generate a unique capability token")

    def _is_expired(self, session: Session) -> bool:
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("Capability clock must return timezone-aware time")
        return now >= session.expires_at

    def _require_session(self, session_id: str) -> Session:
        session = self.sessions.get_by_id(session_id)
        if session is None:
            raise ValueError(f"Session not found: {session_id}")
        return session

    def _has_active_activity(self, session: Session) -> bool:
        activities = {activity.id: activity for activity in self.activities.all()}
        sailors = {sailor.id: sailor for sailor in self.sailors.all()}
        has_active = False
        for activity_id in session.activity_ids:
            activity = activities.get(activity_id)
            if activity is None:
                raise SessionCapabilityIntegrityError(
                    "Session references unknown Activity"
                )
            sailor = sailors.get(activity.sailor_id)
            if sailor is None:
                raise SessionCapabilityIntegrityError(
                    "Activity references unknown Sailor"
                )
            has_active = has_active or sailor.consent_status == ConsentStatus.ACTIVE
        return has_active
