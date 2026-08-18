import json
from pathlib import Path

from app.models import Participant


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_PARTICIPANTS_PATH = BACKEND_DIR / "data" / "participants.json"


class ParticipantRepository:
    def __init__(
        self,
        path: str | Path = DEFAULT_PARTICIPANTS_PATH,
    ) -> None:
        self.path = Path(path)

    def find_by_email(self, sender_email: str) -> Participant | None:
        normalized_email = sender_email.strip().casefold()
        for participant in self._load():
            if participant.email.strip().casefold() == normalized_email:
                return participant
        return None

    def _load(self) -> list[Participant]:
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Participant configuration must contain a JSON list")
        return [Participant(**item) for item in data]
