import json
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from uuid import uuid4

from app.models import Session
from app.runtime_paths import runtime_paths


class SessionRepository:
    def __init__(
        self,
        path: str | Path | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.path = runtime_paths().sessions if path is None else Path(path)
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def all(self) -> list[Session]:
        if not self.path.exists():
            return []

        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Session storage must contain a JSON list")
        migrated = False
        migration_time = _require_utc(self.clock())
        sessions = []
        for item in data:
            record = dict(item)
            has_created_at = "created_at" in record
            has_expires_at = "expires_at" in record
            if has_created_at != has_expires_at:
                raise ValueError(
                    "Session timestamps must contain created_at and expires_at"
                )
            if not has_created_at:
                record["created_at"] = migration_time
                record["expires_at"] = migration_time + timedelta(days=60)
                record.setdefault("capability_token", None)
                record.setdefault("capability_revoked", False)
                migrated = True
            else:
                record["created_at"] = _parse_datetime(record["created_at"])
                record["expires_at"] = _parse_datetime(record["expires_at"])
            if record["expires_at"] != record["created_at"] + timedelta(days=60):
                raise ValueError("Session expiry must be exactly 60 days after creation")
            sessions.append(Session(**record))
        if migrated:
            self._save(sessions)
        return sessions

    def find_by_activity_id(self, activity_id: str) -> Session | None:
        return next(
            (
                session
                for session in self.all()
                if activity_id in session.activity_ids
            ),
            None,
        )

    def get_by_id(self, session_id: str) -> Session | None:
        return next(
            (session for session in self.all() if session.id == session_id),
            None,
        )

    def get_by_capability_token(self, token: str) -> Session | None:
        return next(
            (
                session
                for session in self.all()
                if session.capability_token == token
                and not session.capability_revoked
            ),
            None,
        )

    def create(self, activity_id: str) -> Session:
        if self.find_by_activity_id(activity_id) is not None:
            raise ValueError("Activity already belongs to a Session")

        sessions = self.all()
        created_at = _require_utc(self.clock())
        session = Session(
            id=str(uuid4()),
            activity_ids=[activity_id],
            created_at=created_at,
            expires_at=created_at + timedelta(days=60),
        )
        sessions.append(session)
        self._save(sessions)
        return session

    def add_activity(self, session_id: str, activity_id: str) -> Session:
        assigned_session = self.find_by_activity_id(activity_id)
        if assigned_session is not None:
            if assigned_session.id == session_id:
                return assigned_session
            raise ValueError("Activity already belongs to another Session")

        sessions = self.all()
        for session in sessions:
            if session.id == session_id:
                session.activity_ids.append(activity_id)
                self._save(sessions)
                return session
        raise ValueError(f"Session not found: {session_id}")

    def replace(self, replacement: Session) -> Session:
        sessions = self.all()
        for index, session in enumerate(sessions):
            if session.id == replacement.id:
                sessions[index] = replacement
                self._save(sessions)
                return replacement
        raise ValueError(f"Session not found: {replacement.id}")

    def _save(self, sessions: list[Session]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(
                [_serialize_session(session) for session in sessions],
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )


def _parse_datetime(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError("Session timestamp must be an ISO-8601 string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return _require_utc(parsed)


def _require_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Session timestamp must be timezone-aware")
    return value.astimezone(timezone.utc)


def _serialize_session(session: Session) -> dict[str, object]:
    record = asdict(session)
    record["created_at"] = session.created_at.isoformat()
    record["expires_at"] = session.expires_at.isoformat()
    return record
