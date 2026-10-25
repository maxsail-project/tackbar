"""At-most-once technical notices for actionable OVH input failures."""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from uuid import uuid4

from app.services.ingestion_lock import ingestion_lock
from app.services.outbound_mail import OvhSmtpTransport, compose_automated_mail


REASONS = {"multiple_supported", "invalid_track"}
SUBJECT = "TackBar track submission needs correction / Corrige el envío de tu track"
ADDRESS_PATTERN = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+")


def _valid_recipient(recipient: str) -> bool:
    return (
        isinstance(recipient, str)
        and ADDRESS_PATTERN.fullmatch(recipient) is not None
        and "." in recipient.rsplit("@", 1)[1]
        and recipient.lower() not in {"share@tackbar.eu", "hello@tackbar.eu"}
    )


def _body(reason: str) -> str:
    if reason == "multiple_supported":
        action_es = "Envía cada track compatible en un correo separado."
        action_en = "Send each supported track in a separate email."
    else:
        action_es = "Revisa el archivo del track y vuelve a enviarlo en un correo nuevo."
        action_en = "Check the track file and send it again in a new email."
    return (
        "Hola,\n\nNo pudimos procesar tu envío de track a TackBar. " + action_es
        + "\n\n---\n\nHi,\n\nWe could not process your TackBar track submission. "
        + action_en
    )


def send_technical_failure_notice(recipient: str, reason: str) -> None:
    message = compose_automated_mail(recipient, SUBJECT, _body(reason))
    OvhSmtpTransport.from_environment().send(message)


class TechnicalNoticeStore:
    def __init__(self, data_root: Path) -> None:
        self.path = data_root / "ovh_technical_notices.json"

    def records(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        value = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Malformed OVH technical notice store")
        for message_id, record in value.items():
            if not re.fullmatch(r"[1-9][0-9]*:[1-9][0-9]*", message_id):
                raise ValueError("Malformed OVH technical notice identity")
            if not isinstance(record, dict) or set(record) != {
                "recipient", "reason", "status", "attempted_at", "sent_at"
            } or not _valid_recipient(record["recipient"]) or record["reason"] not in REASONS or record["status"] not in {"attempted", "sent", "failed"}:
                raise ValueError("Malformed OVH technical notice state")
            if not isinstance(record["attempted_at"], str) or (record["sent_at"] is not None) != (record["status"] == "sent"):
                raise ValueError("Inconsistent OVH technical notice state")
            for timestamp in (record["attempted_at"], record["sent_at"]):
                if timestamp is not None:
                    try:
                        parsed = datetime.fromisoformat(timestamp)
                        if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
                            raise ValueError
                    except (TypeError, ValueError):
                        raise ValueError("Malformed OVH technical notice timestamp") from None
        return value

    def _write(self, records: dict[str, dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.{uuid4().hex}.tmp")
        try:
            with temporary.open("xb") as output:
                output.write((json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def attempt_once(
        self, message_id: str, recipient: str, reason: str,
        sender: Callable[[str, str], None] | None = None,
    ) -> bool:
        if reason not in REASONS or not re.fullmatch(r"[1-9][0-9]*:[1-9][0-9]*", message_id) or not _valid_recipient(recipient):
            raise ValueError("Invalid OVH technical notice decision")
        with ingestion_lock(self.path.parent):
            sender = sender or send_technical_failure_notice
            records = self.records()
            if message_id in records:
                return False
            record = {
                "recipient": recipient, "reason": reason, "status": "attempted",
                "attempted_at": datetime.now(timezone.utc).isoformat(), "sent_at": None,
            }
            records[message_id] = record
            self._write(records)
            try:
                sender(recipient, reason)
            except Exception:
                record["status"] = "failed"
            else:
                record["status"] = "sent"
                record["sent_at"] = datetime.now(timezone.utc).isoformat()
            self._write(records)
            return True
