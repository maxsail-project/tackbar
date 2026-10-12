import json
import re
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.identity import require_uuid
from app.models import TemporarySessionShare
from app.runtime_paths import runtime_paths


_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{32,}")
_FINGERPRINT_PATTERN = re.compile(r"[0-9a-f]{64}")


class TemporarySessionShareRepository:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = (
            runtime_paths().temporary_session_shares
            if path is None
            else Path(path)
        )

    def all(self) -> list[TemporarySessionShare]:
        if not self.path.exists():
            return []
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError(
                "Temporary Session share storage must contain a JSON list"
            )
        shares = [_deserialize_share(item) for item in data]
        _validate_shares(shares)
        return shares

    def get_by_token(self, token: str) -> TemporarySessionShare | None:
        return next((share for share in self.all() if share.token == token), None)

    def add(self, share: TemporarySessionShare) -> TemporarySessionShare:
        shares = self.all()
        shares.append(share)
        self._save(shares)
        return share

    def _save(self, shares: list[TemporarySessionShare]) -> None:
        _validate_shares(shares)
        records = []
        for share in shares:
            record = asdict(share)
            record["created_at"] = share.created_at.isoformat()
            record["expires_at"] = share.expires_at.isoformat()
            records.append(record)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def is_temporary_session_share_token(value: object) -> bool:
    return isinstance(value, str) and _TOKEN_PATTERN.fullmatch(value) is not None


def _deserialize_share(item: object) -> TemporarySessionShare:
    if not isinstance(item, dict):
        raise ValueError("Persisted temporary Session share must be a JSON object")
    return TemporarySessionShare(
        id=_required_string(item, "id"),
        token=_required_string(item, "token"),
        session_id=_required_string(item, "session_id"),
        originating_capability_fingerprint=_required_string(
            item, "originating_capability_fingerprint"
        ),
        created_at=_parse_datetime(item.get("created_at"), "created_at"),
        expires_at=_parse_datetime(item.get("expires_at"), "expires_at"),
    )


def _required_string(item: dict[str, object], field_name: str) -> str:
    value = item.get(field_name)
    if not isinstance(value, str):
        raise ValueError(f"Temporary Session share {field_name} must be a string")
    return value


def _parse_datetime(value: object, field_name: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(
            f"Temporary Session share {field_name} must be an ISO-8601 string"
        )
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(
            f"Temporary Session share {field_name} must be an ISO-8601 string"
        ) from error
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError(f"Temporary Session share {field_name} must be UTC-aware")
    return parsed.astimezone(timezone.utc)


def _validate_shares(shares: list[TemporarySessionShare]) -> None:
    ids: set[str] = set()
    tokens: set[str] = set()
    for share in shares:
        require_uuid(share.id, "Temporary Session share")
        require_uuid(share.session_id, "Temporary Session share Session")
        if not is_temporary_session_share_token(share.token):
            raise ValueError("Invalid temporary Session share token")
        if _FINGERPRINT_PATTERN.fullmatch(
            share.originating_capability_fingerprint
        ) is None:
            raise ValueError("Invalid originating capability fingerprint")
        if (
            share.created_at.tzinfo is None
            or share.created_at.utcoffset() != timedelta(0)
        ):
            raise ValueError("Temporary Session share created_at must be UTC-aware")
        if (
            share.expires_at.tzinfo is None
            or share.expires_at.utcoffset() != timedelta(0)
        ):
            raise ValueError("Temporary Session share expires_at must be UTC-aware")
        if share.expires_at <= share.created_at:
            raise ValueError("Temporary Session share expiry must follow creation")
        if share.expires_at - share.created_at > timedelta(hours=48):
            raise ValueError("Temporary Session share lifetime must not exceed 48 hours")
        if share.id in ids:
            raise ValueError("Duplicate temporary Session share id")
        if share.token in tokens:
            raise ValueError("Duplicate temporary Session share token")
        ids.add(share.id)
        tokens.add(share.token)
