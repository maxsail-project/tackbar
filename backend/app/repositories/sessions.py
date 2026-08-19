import json
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4

from app.models import Session


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SESSIONS_PATH = BACKEND_DIR / "data" / "sessions.json"


class SessionRepository:
    def __init__(self, path: str | Path = DEFAULT_SESSIONS_PATH) -> None:
        self.path = Path(path)

    def all(self) -> list[Session]:
        if not self.path.exists():
            return []

        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Session storage must contain a JSON list")
        return [Session(**item) for item in data]

    def find_by_activity_id(self, activity_id: str) -> Session | None:
        return next(
            (
                session
                for session in self.all()
                if activity_id in session.activity_ids
            ),
            None,
        )

    def create(self, activity_id: str) -> Session:
        if self.find_by_activity_id(activity_id) is not None:
            raise ValueError("Activity already belongs to a Session")

        sessions = self.all()
        session = Session(id=str(uuid4()), activity_ids=[activity_id])
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

    def _save(self, sessions: list[Session]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(
                [asdict(session) for session in sessions],
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
