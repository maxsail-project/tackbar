from dataclasses import replace
from secrets import token_urlsafe
from typing import Callable

from app.models import ConsentStatus, Sailor
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository


class PersonalCapabilityService:
    def __init__(
        self,
        sailors: SailorRepository,
        sessions: SessionRepository,
        token_generator: Callable[[], str] | None = None,
    ) -> None:
        self.sailors = sailors
        self.sessions = sessions
        self.token_generator = token_generator or (lambda: token_urlsafe(32))

    def ensure_for_sailor(self, sailor_id: str) -> Sailor:
        sailor = self._require_sailor(sailor_id)
        if sailor.personal_capability_token is not None or sailor.personal_capability_revoked:
            return sailor
        return self._replace_token(sailor)

    def regenerate_capability(self, sailor_id: str) -> Sailor:
        return self._replace_token(self._require_sailor(sailor_id))

    def revoke_capability(self, sailor_id: str) -> Sailor:
        sailor = self._require_sailor(sailor_id)
        # Keep the token so revocation and consent remain independent, and a
        # subsequent regeneration cannot accidentally reuse the revoked value.
        return self.sailors.replace(replace(sailor, personal_capability_revoked=True))

    def resolve(self, token: str) -> Sailor | None:
        if not token:
            return None
        return next((
            sailor for sailor in self.sailors.all()
            if sailor.personal_capability_token == token
            and not sailor.personal_capability_revoked
            and sailor.consent_status == ConsentStatus.ACTIVE
        ), None)

    def _replace_token(self, sailor: Sailor) -> Sailor:
        excluded = {item.personal_capability_token for item in self.sailors.all()}
        excluded.update(item.id for item in self.sailors.all())
        excluded.update(item.capability_token for item in self.sessions.all())
        for _ in range(10):
            token = self.token_generator()
            if not isinstance(token, str) or len(token) < 32:
                raise ValueError("Personal capability generator returned low entropy")
            if token not in excluded:
                return self.sailors.replace(replace(
                    sailor, personal_capability_token=token,
                    personal_capability_revoked=False,
                ))
        raise ValueError("Unable to generate a unique personal capability token")

    def _require_sailor(self, sailor_id: str) -> Sailor:
        sailor = self.sailors.get_by_id(sailor_id)
        if sailor is None:
            raise ValueError("Sailor not found")
        return sailor
