"""Defensive preflight for maintenance that will mutate runtime files."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable


RUNTIME_OWNER_GUIDANCE = (
    "Run production maintenance as the runtime owner/service-compatible user "
    "(for example, sudo -u <runtime-owner> ...); plain sudo is unsafe because "
    "it changes the effective user."
)


class RuntimeMutationPreflightError(ValueError):
    """Raised when runtime mutation would use an unsafe execution context."""


def preflight_runtime_mutation(
    data_root: str | Path,
    mutation_paths: Iterable[str | Path],
) -> None:
    """Require owner-compatible, writable access without changing permissions."""

    root = Path(data_root).expanduser().resolve()
    if root == Path(root.anchor) or not root.is_dir():
        raise RuntimeMutationPreflightError(
            "Runtime preflight failed: the selected data root is not a usable "
            f"runtime directory. {RUNTIME_OWNER_GUIDANCE}"
        )

    try:
        paths = _existing_paths_and_parents(root, mutation_paths)
        effective_user_id = _effective_user_id()
        if effective_user_id is not None and any(
            _owner_user_id(path) != effective_user_id for path in paths
        ):
            raise RuntimeMutationPreflightError(
                "Runtime ownership preflight failed: the effective user does "
                "not own every runtime location that must be changed. "
                f"{RUNTIME_OWNER_GUIDANCE}"
            )

        if not _has_access(root, os.R_OK | os.W_OK | os.X_OK) or any(
            not _path_is_writable(path) for path in paths
        ):
            raise RuntimeMutationPreflightError(
                "Runtime writability preflight failed: the effective user "
                "cannot write every runtime location required by this "
                f"operation. {RUNTIME_OWNER_GUIDANCE}"
            )
    except RuntimeMutationPreflightError:
        raise
    except OSError as error:
        raise RuntimeMutationPreflightError(
            "Runtime preflight could not inspect the selected data root. "
            f"{RUNTIME_OWNER_GUIDANCE}"
        ) from error


def _existing_paths_and_parents(
    root: Path,
    mutation_paths: Iterable[str | Path],
) -> tuple[Path, ...]:
    paths = {root}
    for value in mutation_paths:
        path = Path(value).expanduser().resolve(strict=False)
        try:
            path.relative_to(root)
        except ValueError as error:
            raise RuntimeMutationPreflightError(
                "Runtime preflight rejected a mutation path outside the "
                f"selected data root. {RUNTIME_OWNER_GUIDANCE}"
            ) from error

        current = path
        while True:
            if current.exists():
                paths.add(current)
            if current == root:
                break
            current = current.parent
    return tuple(sorted(paths, key=str))


def _effective_user_id() -> int | None:
    get_effective_user_id = getattr(os, "geteuid", None)
    if get_effective_user_id is None:
        return None
    return int(get_effective_user_id())


def _owner_user_id(path: Path) -> int:
    return int(path.stat(follow_symlinks=False).st_uid)


def _path_is_writable(path: Path) -> bool:
    mode = os.W_OK | os.X_OK if path.is_dir() else os.W_OK
    return _has_access(path, mode)


def _has_access(path: Path, mode: int) -> bool:
    try:
        return os.access(path, mode, effective_ids=True)
    except (NotImplementedError, TypeError):
        return os.access(path, mode)
