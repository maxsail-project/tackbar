import json
import os
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from app.runtime_paths import runtime_paths


@dataclass(frozen=True)
class OVHMailboxCursor:
    uidvalidity: int
    last_seen_uid: int


class OVHMailboxCursorStore:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = (
            runtime_paths().ovh_mailbox_cursor if path is None else Path(path)
        )

    def load(self) -> OVHMailboxCursor | None:
        if not self.path.exists():
            return None
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise ValueError("Malformed OVH mailbox cursor") from error
        if not isinstance(value, dict) or set(value) != {
            "uidvalidity",
            "last_seen_uid",
        }:
            raise ValueError("Malformed OVH mailbox cursor")
        uidvalidity = value["uidvalidity"]
        last_seen_uid = value["last_seen_uid"]
        if (
            isinstance(uidvalidity, bool)
            or not isinstance(uidvalidity, int)
            or uidvalidity <= 0
            or isinstance(last_seen_uid, bool)
            or not isinstance(last_seen_uid, int)
            or last_seen_uid < 0
        ):
            raise ValueError("Malformed OVH mailbox cursor")
        return OVHMailboxCursor(uidvalidity, last_seen_uid)

    def write(self, cursor: OVHMailboxCursor) -> None:
        encoded = (
            json.dumps(
                {
                    "uidvalidity": cursor.uidvalidity,
                    "last_seen_uid": cursor.last_seen_uid,
                },
                indent=2,
            )
            + "\n"
        ).encode("utf-8")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(
            f".{self.path.name}.{uuid4().hex}.tmp"
        )
        try:
            with temporary.open("xb") as output:
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            if temporary.exists():
                temporary.unlink()
