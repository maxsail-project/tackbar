"""Focused ownership and access checks for TackBar runtime files."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from app.runtime_paths import runtime_paths


RUNTIME_OWNER_GUIDANCE = (
    "Run production maintenance as the runtime owner/service-compatible user "
    "(for example, sudo -u <runtime-owner> ...); plain sudo is unsafe because "
    "it changes the effective user."
)


class RuntimeMutationPreflightError(ValueError):
    """Raised when runtime mutation would use an unsafe execution context."""


@dataclass(frozen=True)
class RuntimeDataPreflightResult:
    """Read-only diagnostic result for one explicit runtime data root."""

    root: Path
    checked_path_count: int
    ownership_checked: bool
    probe_checked: bool
    problems: tuple[str, ...]

    @property
    def healthy(self) -> bool:
        return not self.problems


def check_runtime_data(
    data_root: str | Path,
) -> RuntimeDataPreflightResult:
    """Inspect runtime ownership and access without reading domain content."""

    configured_root = Path(data_root).expanduser()
    try:
        root = configured_root.resolve(strict=False)
    except (OSError, RuntimeError):
        return RuntimeDataPreflightResult(
            root=configured_root,
            checked_path_count=0,
            ownership_checked=_effective_user_id() is not None,
            probe_checked=False,
            problems=(
                "root: <runtime-root> could not be resolved safely",
            ),
        )
    effective_user_id = _effective_user_id()
    ownership_checked = effective_user_id is not None
    if root == Path(root.anchor) or not root.is_dir():
        return RuntimeDataPreflightResult(
            root=root,
            checked_path_count=0,
            ownership_checked=ownership_checked,
            probe_checked=False,
            problems=(
                "root: <runtime-root> does not exist or is not a usable "
                "runtime directory",
            ),
        )

    problems: list[str] = []
    try:
        paths = (root, *root.rglob("*"))
    except OSError:
        return RuntimeDataPreflightResult(
            root=root,
            checked_path_count=0,
            ownership_checked=ownership_checked,
            probe_checked=False,
            problems=(
                "readability: <runtime-root> could not be inspected",
            ),
        )

    safe_direct_names = _safe_runtime_direct_names(root)
    root_probe_ready = True
    for path in paths:
        label = _safe_runtime_path_label(root, path, safe_direct_names)
        if effective_user_id is not None:
            try:
                owner_mismatch = (
                    _owner_user_id(path) != effective_user_id
                )
            except OSError:
                _append_problem(
                    problems,
                    f"inspection: {label} ownership could not be inspected",
                )
                if path == root:
                    root_probe_ready = False
            else:
                if owner_mismatch:
                    _append_problem(
                        problems,
                        f"ownership: {label} is not owned by the effective user",
                    )
                    if path == root:
                        root_probe_ready = False

        readable_mode = (
            os.R_OK | os.X_OK if path.is_dir() else os.R_OK
        )
        if not _has_access(path, readable_mode):
            _append_problem(
                problems,
                f"readability: {label} is not readable by the effective user",
            )
            if path == root:
                root_probe_ready = False
        if not _path_is_writable(path):
            _append_problem(
                problems,
                f"writability: {label} is not writable by the effective user",
            )
            if path == root:
                root_probe_ready = False

    probe_checked = False
    if root_probe_ready:
        probe_checked = True
        try:
            _probe_root_writability(root)
        except OSError:
            _append_problem(
                problems,
                "writability probe: <runtime-root> could not safely create "
                "and remove a temporary file",
            )

    return RuntimeDataPreflightResult(
        root=root,
        checked_path_count=len(paths),
        ownership_checked=ownership_checked,
        probe_checked=probe_checked,
        problems=tuple(problems),
    )


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


def _probe_root_writability(root: Path) -> None:
    with tempfile.NamedTemporaryFile(
        mode="wb",
        prefix=".tackbar-runtime-preflight-",
        dir=root,
        delete=True,
    ) as probe:
        probe.flush()


def _safe_runtime_direct_names(root: Path) -> set[str]:
    known_paths = runtime_paths(root)
    return {
        value.name
        for value in vars(known_paths).values()
        if isinstance(value, Path) and value != root
    }


def _safe_runtime_path_label(
    root: Path,
    path: Path,
    safe_direct_names: set[str],
) -> str:
    if path == root:
        return "<runtime-root>"
    relative = path.relative_to(root)
    first_name = relative.parts[0]
    if len(relative.parts) == 1 and first_name in safe_direct_names:
        return f"<runtime-root>/{first_name}"
    if first_name in safe_direct_names:
        return f"<runtime-root>/{first_name}/..."
    return "<runtime-root>/<runtime-entry>"


def _append_problem(problems: list[str], problem: str) -> None:
    if problem not in problems:
        problems.append(problem)


def _has_access(path: Path, mode: int) -> bool:
    try:
        return os.access(path, mode, effective_ids=True)
    except (NotImplementedError, TypeError):
        return os.access(path, mode)
