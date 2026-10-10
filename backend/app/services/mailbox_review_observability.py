import json
import math
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from uuid import uuid4

from app.runtime_paths import require_private_data_root, runtime_paths


_STATE_VERSION = 1
_PROVIDERS = {"gmail", "ovh", "unknown"}
_STAGES = {
    "configuration",
    "cursor_load",
    "acquisition",
    "cursor_write",
    "message_fetch",
}
_REASONS = {
    "uidvalidity_mismatch",
    "permission_denied",
    "file_not_found",
    "timeout",
    "connection_failed",
    "os_error",
    "invalid_value",
    "mailbox_unavailable",
    "operation_failed",
    "unexpected_error",
}
_STATE_FIELDS = {
    "version",
    "provider",
    "stage",
    "error_class",
    "reason",
    "last_emitted_at",
    "suppressed_since_reminder",
    "total_suppressed",
}


@dataclass(frozen=True)
class CycleFailureState:
    provider: str
    stage: str
    error_class: str
    reason: str
    last_emitted_at: float
    suppressed_since_reminder: int = 0
    total_suppressed: int = 0

    @property
    def fingerprint(self) -> tuple[str, str, str, str]:
        return (self.provider, self.stage, self.error_class, self.reason)


class CycleFailureStateStore:
    """Fail-open storage for safe mailbox-review observability state."""

    def __init__(self, path: str | Path | None = None) -> None:
        self._path = None if path is None else Path(path)

    @property
    def path(self) -> Path:
        if self._path is not None:
            return self._path
        return runtime_paths(
            require_private_data_root()
        ).mailbox_review_observability

    def load(self) -> CycleFailureState | None:
        try:
            path = self.path
            if not path.exists():
                return None
            value = json.loads(path.read_text(encoding="utf-8"))
            return _decode_state(value)
        except (
            OSError,
            UnicodeError,
            ValueError,
            TypeError,
            OverflowError,
        ):
            return None

    def write(self, state: CycleFailureState) -> bool:
        temporary: Path | None = None
        try:
            path = self.path
            encoded = (
                json.dumps(
                    {"version": _STATE_VERSION, **asdict(state)},
                    indent=2,
                )
                + "\n"
            ).encode("utf-8")
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_name(
                f".{path.name}.{uuid4().hex}.tmp"
            )
            with temporary.open("xb") as output:
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
            return True
        except (OSError, ValueError):
            return False
        finally:
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass

    def clear(self) -> bool:
        try:
            self.path.unlink(missing_ok=True)
            return True
        except (OSError, ValueError):
            return False


def safe_error_class(error: Exception) -> str:
    name = type(error).__name__
    if len(name) <= 128 and name.isidentifier():
        return name
    return "Exception"


def _decode_state(value: object) -> CycleFailureState:
    if not isinstance(value, dict) or set(value) != _STATE_FIELDS:
        raise ValueError("Malformed mailbox-review observability state")
    if (
        isinstance(value["version"], bool)
        or value["version"] != _STATE_VERSION
    ):
        raise ValueError("Malformed mailbox-review observability state")
    provider = value["provider"]
    stage = value["stage"]
    error_class = value["error_class"]
    reason = value["reason"]
    last_emitted_at = value["last_emitted_at"]
    suppressed_since_reminder = value["suppressed_since_reminder"]
    total_suppressed = value["total_suppressed"]
    if (
        not isinstance(provider, str)
        or provider not in _PROVIDERS
        or not isinstance(stage, str)
        or stage not in _STAGES
        or not isinstance(error_class, str)
        or len(error_class) > 128
        or not error_class.isidentifier()
        or not isinstance(reason, str)
        or reason not in _REASONS
        or isinstance(last_emitted_at, bool)
        or not isinstance(last_emitted_at, (int, float))
        or not math.isfinite(last_emitted_at)
        or last_emitted_at < 0
        or isinstance(suppressed_since_reminder, bool)
        or not isinstance(suppressed_since_reminder, int)
        or suppressed_since_reminder < 0
        or isinstance(total_suppressed, bool)
        or not isinstance(total_suppressed, int)
        or total_suppressed < 0
        or suppressed_since_reminder > total_suppressed
    ):
        raise ValueError("Malformed mailbox-review observability state")
    return CycleFailureState(
        provider,
        stage,
        error_class,
        reason,
        float(last_emitted_at),
        suppressed_since_reminder,
        total_suppressed,
    )
