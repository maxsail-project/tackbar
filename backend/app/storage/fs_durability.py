"""Persist directory entries after file creation and atomic replacement on POSIX."""

import os
from pathlib import Path


def sync_parent_directory(path: Path) -> None:
    if os.name != "posix":
        return
    descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def mkdir_durable(path: Path) -> None:
    missing = []
    current = path
    while not current.exists():
        missing.append(current)
        current = current.parent
    for directory in reversed(missing):
        directory.mkdir()
        sync_parent_directory(directory)
