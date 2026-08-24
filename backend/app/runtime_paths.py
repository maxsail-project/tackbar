import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
PUBLIC_TEST_DATA_ROOT = BACKEND_DIR / "test-data"
DATA_DIR_ENVIRONMENT_VARIABLE = "TACKBAR_DATA_DIR"


@dataclass(frozen=True)
class RuntimePaths:
    root: Path
    sailors: Path
    boats: Path
    activities: Path
    sessions: Path
    ingestion_history: Path
    consent_events: Path
    originals: Path
    tracks: Path


def resolve_data_root(
    environment: Mapping[str, str] | None = None,
) -> Path:
    values = os.environ if environment is None else environment
    configured_root = values.get(DATA_DIR_ENVIRONMENT_VARIABLE)
    if configured_root is None:
        return PUBLIC_TEST_DATA_ROOT
    if not configured_root.strip():
        raise ValueError(
            f"{DATA_DIR_ENVIRONMENT_VARIABLE} must not be empty"
        )
    return Path(configured_root).expanduser().resolve()


def runtime_paths(data_root: str | Path | None = None) -> RuntimePaths:
    root = (
        resolve_data_root()
        if data_root is None
        else Path(data_root).expanduser().resolve()
    )
    return RuntimePaths(
        root=root,
        sailors=root / "sailors.json",
        boats=root / "boats.json",
        activities=root / "activities.json",
        sessions=root / "sessions.json",
        ingestion_history=root / "ingestion_history.json",
        consent_events=root / "consent_events.json",
        originals=root / "originals",
        tracks=root / "tracks",
    )


def require_private_data_root() -> Path:
    configured_root = os.environ.get(DATA_DIR_ENVIRONMENT_VARIABLE)
    if configured_root is None or not configured_root.strip():
        raise ValueError(
            "Real ingestion requires TACKBAR_DATA_DIR to point to private "
            "runtime storage outside the repository"
        )
    private_root = resolve_data_root()
    try:
        private_root.relative_to(PROJECT_DIR)
    except ValueError:
        return private_root
    raise ValueError(
        f"{DATA_DIR_ENVIRONMENT_VARIABLE} must point outside the TackBar "
        "source repository"
    )
