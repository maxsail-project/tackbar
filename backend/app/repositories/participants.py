import json
from dataclasses import asdict
from pathlib import Path

from app.models import Participant
from app.runtime_paths import runtime_paths


def normalize_email(email: str) -> str:
    return email.strip().lower()


class ParticipantRepository:
    def __init__(
        self,
        path: str | Path | None = None,
    ) -> None:
        self.path = (
            runtime_paths().participants if path is None else Path(path)
        )

    def find_by_email(self, sender_email: str) -> Participant | None:
        normalized_email = normalize_email(sender_email)
        for participant in self._load():
            if normalize_email(participant.id) == normalized_email:
                return participant
        return None

    def find_or_create_by_email(
        self,
        sender_email: str,
    ) -> tuple[Participant, bool]:
        existing_participant = self.find_by_email(sender_email)
        if existing_participant is not None:
            return existing_participant, False

        participants = self._load()
        participant = Participant(
            id=normalize_email(sender_email),
            name=None,
            boat_name=None,
            sailing_class=None,
            sail_number=None,
        )
        participants.append(participant)
        self._save(participants)
        return participant, True

    def _load(self) -> list[Participant]:
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Participant configuration must contain a JSON list")
        return [Participant(**item) for item in data]

    def _save(self, participants: list[Participant]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(
                [asdict(participant) for participant in participants],
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
