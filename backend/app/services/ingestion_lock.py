"""Cooperating ingestion writers share one OS lock per persistence directory.

Keep the lock file in place: deleting/replacing it can create two independently
locked inodes. OS ownership ends on close/process exit, so no stale-PID recovery
or persisted busy state is needed. This is exclusion, not crash rollback.
"""

from contextlib import contextmanager
import errno
import os
from pathlib import Path
from threading import RLock
import time
from typing import Iterator


_local_lock = RLock()
_held: dict[Path, int] = {}


def _after_fork() -> None:
    global _local_lock
    # Close inherited descriptors without explicitly unlocking the parent's flock.
    for descriptor in _held.values():
        os.close(descriptor)
    _held.clear()
    _local_lock = RLock()


if hasattr(os, "register_at_fork"):
    os.register_at_fork(after_in_child=_after_fork)


@contextmanager
def ingestion_lock(data_root: str | Path, *, blocking: bool = True) -> Iterator[bool]:
    """Block until exclusive ownership; nesting in the same thread is safe.

    Callers must enter before reading state used by a persistence mutation and
    retain ownership through follow-up consent/notification writes. The history
    directory anchors the lock for injected repositories as well as runtime use.
    """
    path = Path(data_root).resolve() / ".ingestion.lock"
    if not _local_lock.acquire(blocking=blocking):
        yield False
        return
    try:
        if path in _held:
            yield True
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            if blocking:
                _acquire(descriptor)
            elif not _try_acquire(descriptor):
                yield False
                return
            _held[path] = descriptor
            try:
                yield True
            finally:
                del _held[path]
                _release(descriptor)
        finally:
            os.close(descriptor)
    finally:
        _local_lock.release()


def _try_acquire(descriptor: int) -> bool:
    try:
        if os.name == "posix":
            import fcntl

            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        elif os.name == "nt":
            import msvcrt

            msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
        else:
            raise OSError("Cross-process ingestion locking is unsupported on this platform")
        return True
    except OSError as error:
        if error.errno not in (errno.EACCES, errno.EAGAIN):
            raise
        return False


class FileLease:
    """OS-owned liveness, transferable between threads; never delete its file."""

    def __init__(self, descriptor: int) -> None:
        self.descriptor = descriptor

    @classmethod
    def try_acquire(cls, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            if _try_acquire(descriptor):
                return cls(descriptor)
        except BaseException:
            os.close(descriptor)
            raise
        os.close(descriptor)
        return None

    def close(self) -> None:
        if self.descriptor is not None:
            descriptor, self.descriptor = self.descriptor, None
            try:
                _release(descriptor)
            finally:
                os.close(descriptor)


@contextmanager
def file_access_lock(path: Path) -> Iterator[None]:
    """Short file-I/O exclusion, independent of the ingestion critical section.

    Windows read handles can conflict with atomic file replacement. Never retain
    this lock while acquiring ingestion_lock; writers acquire ingestion first.
    """
    lease = FileLease.try_acquire(path)
    while lease is None:
        time.sleep(0.005)
        lease = FileLease.try_acquire(path)
    try:
        yield
    finally:
        lease.close()


def _acquire(descriptor: int) -> None:
    if os.name == "posix":
        import fcntl

        fcntl.flock(descriptor, fcntl.LOCK_EX)
    elif os.name == "nt":
        import msvcrt

        # LK_LOCK has a fixed retry limit; poll nonblocking byte ownership instead.
        # Windows permits locking byte ranges beyond EOF, including an empty file.
        while True:
            try:
                msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
                return
            except OSError as error:
                if error.errno not in (errno.EACCES, errno.EAGAIN):
                    raise
                time.sleep(0.05)
    else:
        raise OSError("Cross-process ingestion locking is unsupported on this platform")


def _release(descriptor: int) -> None:
    if os.name == "posix":
        import fcntl

        fcntl.flock(descriptor, fcntl.LOCK_UN)
    elif os.name == "nt":
        import msvcrt

        msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
