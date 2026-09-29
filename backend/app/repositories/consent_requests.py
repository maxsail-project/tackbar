import json
import re
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path

from app.identity import require_uuid
from app.models import ConsentRequest
from app.runtime_paths import runtime_paths


CONSENT_REQUEST_LIFETIME = timedelta(days=28)
_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{32,}")
_TIMESTAMP_FIELDS = (
    "automatic_delivery_attempted_at",
    "delivery_sent_at",
    "accepted_at",
)


class ConsentRequestRepository:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = runtime_paths().consent_requests if path is None else Path(path)

    def all(self) -> list[ConsentRequest]:
        if not self.path.exists():
            return []

        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Consent request storage must contain a JSON list")
        requests = [_deserialize_request(item) for item in data]
        _validate_requests(requests)
        return requests

    def for_sailor(self, sailor_id: str) -> list[ConsentRequest]:
        return [request for request in self.all() if request.sailor_id == sailor_id]

    def get_by_id(self, request_id: str) -> ConsentRequest | None:
        return next(
            (request for request in self.all() if request.id == request_id),
            None,
        )

    def get_by_token(self, token: str) -> ConsentRequest | None:
        return next(
            (request for request in self.all() if request.token == token),
            None,
        )

    def add(self, request: ConsentRequest) -> ConsentRequest:
        requests = self.all()
        requests.append(request)
        self._save(requests)
        return request

    def replace(self, replacement: ConsentRequest) -> ConsentRequest:
        requests = self.all()
        for index, request in enumerate(requests):
            if request.id == replacement.id:
                requests[index] = replacement
                self._save(requests)
                return replacement
        raise ValueError("Consent request not found")

    @staticmethod
    def validate(request: ConsentRequest) -> None:
        _validate_request(request)

    def _save(self, requests: list[ConsentRequest]) -> None:
        _validate_requests(requests)
        records = []
        for request in requests:
            record = asdict(request)
            record["created_at"] = request.created_at.isoformat()
            record["expires_at"] = request.expires_at.isoformat()
            for field_name in _TIMESTAMP_FIELDS:
                value = getattr(request, field_name)
                record[field_name] = value.isoformat() if value is not None else None
            records.append(record)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def is_consent_request_token(value: object) -> bool:
    return isinstance(value, str) and _TOKEN_PATTERN.fullmatch(value) is not None


def _deserialize_request(item: object) -> ConsentRequest:
    if not isinstance(item, dict):
        raise ValueError("Persisted consent request must be a JSON object")
    try:
        return ConsentRequest(
            id=_required_string(item, "id"),
            sailor_id=_required_string(item, "sailor_id"),
            token=_required_string(item, "token"),
            agreement_version=_required_string(item, "agreement_version"),
            consent_cycle_sequence=item["consent_cycle_sequence"],
            created_at=_parse_datetime(item.get("created_at"), "created_at"),
            expires_at=_parse_datetime(item.get("expires_at"), "expires_at"),
            automatic_delivery_attempted_at=_parse_optional_datetime(
                item.get("automatic_delivery_attempted_at"),
                "automatic_delivery_attempted_at",
            ),
            delivery_sent_at=_parse_optional_datetime(
                item.get("delivery_sent_at"),
                "delivery_sent_at",
            ),
            delivery_last_error=item.get("delivery_last_error"),
            accepted_at=_parse_optional_datetime(
                item.get("accepted_at"),
                "accepted_at",
            ),
        )
    except KeyError as error:
        raise ValueError("Persisted consent request is missing required data") from error


def _required_string(item: dict[str, object], field_name: str) -> str:
    value = item.get(field_name)
    if not isinstance(value, str):
        raise ValueError(
            f"Persisted consent request {field_name} must be a string"
        )
    return value


def _parse_datetime(value: object, field_name: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(
            f"Consent request {field_name} must be an ISO-8601 string"
        )
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(
            f"Consent request {field_name} must be an ISO-8601 string"
        ) from error


def _parse_optional_datetime(value: object, field_name: str) -> datetime | None:
    return None if value is None else _parse_datetime(value, field_name)


def _validate_requests(requests: list[ConsentRequest]) -> None:
    seen_ids: set[str] = set()
    seen_tokens: set[str] = set()
    for request in requests:
        _validate_request(request)
        if request.id in seen_ids:
            raise ValueError("Duplicate consent request id")
        if request.token in seen_tokens:
            raise ValueError("Duplicate consent request token")
        seen_ids.add(request.id)
        seen_tokens.add(request.token)


def _validate_request(request: ConsentRequest) -> None:
    require_uuid(request.id, "Consent request")
    require_uuid(request.sailor_id, "Consent request Sailor")
    if (
        not is_consent_request_token(request.token)
        or request.token in (request.id, request.sailor_id)
    ):
        raise ValueError("Invalid consent request token")
    if not request.agreement_version.strip():
        raise ValueError("Consent request agreement version must not be empty")
    if (
        isinstance(request.consent_cycle_sequence, bool)
        or not isinstance(request.consent_cycle_sequence, int)
        or request.consent_cycle_sequence < 0
    ):
        raise ValueError("Consent request cycle sequence must be non-negative")

    _require_utc(request.created_at, "created_at")
    _require_utc(request.expires_at, "expires_at")
    if request.expires_at - request.created_at != CONSENT_REQUEST_LIFETIME:
        raise ValueError("Consent request lifetime must be exactly 28 days")

    for field_name in _TIMESTAMP_FIELDS:
        value = getattr(request, field_name)
        if value is None:
            continue
        _require_utc(value, field_name)
        if value < request.created_at:
            raise ValueError(
                f"Consent request {field_name} must not precede creation"
            )
    if request.accepted_at is not None and request.accepted_at >= request.expires_at:
        raise ValueError("Consent request acceptance must precede expiry")
    if request.delivery_last_error is not None and (
        not isinstance(request.delivery_last_error, str)
        or not request.delivery_last_error.strip()
        or len(request.delivery_last_error) > 200
    ):
        raise ValueError("Invalid consent request delivery error")


def _require_utc(value: datetime, field_name: str) -> None:
    if value.tzinfo is None or value.utcoffset() != timedelta(0):
        raise ValueError(f"Consent request {field_name} must be UTC-aware")
