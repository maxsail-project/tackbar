from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from threading import Lock
from typing import Callable
from uuid import uuid4

from app.models import (
    TemporarySessionShare,
    TemporarySessionShareResolution,
    TemporarySessionShareState,
)
from app.repositories.sailors import SailorRepository
from app.repositories.temporary_session_shares import (
    TemporarySessionShareRepository,
    is_temporary_session_share_token,
)
from app.services.session_capabilities import SessionCapabilityService


TEMPORARY_SESSION_SHARE_LIFETIME = timedelta(hours=48)
_SHARE_CREATION_LOCK = Lock()


class TemporarySessionShareService:
    def __init__(
        self,
        shares: TemporarySessionShareRepository,
        capabilities: SessionCapabilityService,
        sailors: SailorRepository,
        clock: Callable[[], datetime] | None = None,
        token_generator: Callable[[], str] | None = None,
    ) -> None:
        self.shares = shares
        self.capabilities = capabilities
        self.sailors = sailors
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.token_generator = token_generator or (lambda: token_urlsafe(32))

    def create_or_reuse(self, originating_token: str) -> TemporarySessionShare | None:
        with _SHARE_CREATION_LOCK:
            session = self.capabilities.resolve(originating_token)
            if session is None or session.capability_token != originating_token:
                return None
            now = self._now()
            if now >= session.expires_at:
                return None
            fingerprint = _capability_fingerprint(originating_token)
            current = [
                share
                for share in self.shares.all()
                if share.session_id == session.id
                and share.originating_capability_fingerprint == fingerprint
                and self._state(share, now) == TemporarySessionShareState.VALID
            ]
            if current:
                return max(current, key=lambda share: (share.created_at, share.id))

            share = TemporarySessionShare(
                id=str(uuid4()),
                token=self._new_unique_token(),
                session_id=session.id,
                originating_capability_fingerprint=fingerprint,
                created_at=now,
                expires_at=min(
                    now + TEMPORARY_SESSION_SHARE_LIFETIME,
                    session.expires_at,
                ),
            )
            return self.shares.add(share)

    def resolve(self, token: str) -> TemporarySessionShareResolution:
        if not is_temporary_session_share_token(token):
            return TemporarySessionShareResolution(TemporarySessionShareState.NOT_FOUND)
        share = self.shares.get_by_token(token)
        if share is None:
            return TemporarySessionShareResolution(TemporarySessionShareState.NOT_FOUND)
        state = self._state(share, self._now())
        session = self.capabilities.sessions.get_by_id(share.session_id)
        return TemporarySessionShareResolution(
            state,
            share=share if state != TemporarySessionShareState.NOT_FOUND else None,
            session=session if state == TemporarySessionShareState.VALID else None,
        )

    def _state(
        self,
        share: TemporarySessionShare,
        now: datetime,
    ) -> TemporarySessionShareState:
        if now >= share.expires_at:
            return TemporarySessionShareState.EXPIRED
        session = self.capabilities.sessions.get_by_id(share.session_id)
        if (
            session is None
            or session.capability_token is None
            or session.capability_revoked
            or _capability_fingerprint(session.capability_token)
            != share.originating_capability_fingerprint
            or self.capabilities.resolve(session.capability_token) is None
        ):
            return TemporarySessionShareState.UNAVAILABLE
        return TemporarySessionShareState.VALID

    def _new_unique_token(self) -> str:
        sailors = self.sailors.all()
        shares = self.shares.all()
        sessions = self.capabilities.sessions.all()
        excluded = {share.token for share in shares}
        excluded.update(share.id for share in shares)
        excluded.update(
            session.capability_token
            for session in sessions
            if session.capability_token is not None
        )
        excluded.update(session.id for session in sessions)
        excluded.update(sailor.id for sailor in sailors)
        excluded.update(sailor.email for sailor in sailors)
        excluded.update(
            sailor.personal_capability_token
            for sailor in sailors
            if sailor.personal_capability_token is not None
        )
        for _ in range(10):
            token = self.token_generator()
            if not is_temporary_session_share_token(token):
                raise ValueError(
                    "Temporary Session share generator returned low-entropy token"
                )
            if token not in excluded:
                return token
        raise ValueError("Unable to generate a unique temporary Session share token")

    def _now(self) -> datetime:
        value = self.clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Temporary Session share clock must be timezone-aware")
        return value.astimezone(timezone.utc)


def _capability_fingerprint(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
