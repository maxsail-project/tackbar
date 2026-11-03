"""Short, coordinated reads and atomic replacement of JSON collection files."""

import os
import stat
from pathlib import Path
from uuid import uuid4

from app.services.ingestion_lock import file_access_lock


def _access_lock(path: Path) -> Path:
    return path.with_name(f".{path.name}.access.lock")


def _copy_windows_security(source: Path, target: Path) -> None:
    """Require the same owner and copy the existing Windows access list."""
    import ctypes
    from ctypes import wintypes

    owner_information, dacl_information = 0x00000001, 0x00000004
    api = ctypes.WinDLL("advapi32", use_last_error=True)
    api.GetFileSecurityW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    api.GetFileSecurityW.restype = wintypes.BOOL
    api.SetFileSecurityW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p]
    api.SetFileSecurityW.restype = wintypes.BOOL
    api.GetSecurityDescriptorOwner.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.BOOL)]
    api.GetSecurityDescriptorOwner.restype = wintypes.BOOL
    api.EqualSid.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    api.EqualSid.restype = wintypes.BOOL

    def descriptor(path: Path, information: int):
        required = wintypes.DWORD()
        api.GetFileSecurityW(str(path), information, None, 0, ctypes.byref(required))
        if required.value == 0:
            raise ctypes.WinError(ctypes.get_last_error())
        value = ctypes.create_string_buffer(required.value)
        if not api.GetFileSecurityW(str(path), information, value, required, ctypes.byref(required)):
            raise ctypes.WinError(ctypes.get_last_error())
        return value

    def owner(value):
        sid = ctypes.c_void_p()
        defaulted = wintypes.BOOL()
        if not api.GetSecurityDescriptorOwner(value, ctypes.byref(sid), ctypes.byref(defaulted)):
            raise ctypes.WinError(ctypes.get_last_error())
        return sid

    original = descriptor(source, owner_information | dacl_information)
    replacement = descriptor(target, owner_information)
    if not api.EqualSid(owner(original), owner(replacement)):
        raise PermissionError("Atomic replacement would change the file owner")
    if not api.SetFileSecurityW(str(target), dacl_information, original):
        raise ctypes.WinError(ctypes.get_last_error())


def read_text(path: Path) -> str | None:
    """Return None for an absent collection without creating its data directory."""
    if not path.exists():
        return None
    with file_access_lock(_access_lock(path)):
        return path.read_text(encoding="utf-8") if path.exists() else None


def write_text(path: Path, content: str) -> None:
    """Publish a complete UTF-8 document or leave the previous target intact.

    The caller serializes before entry and, when needed, owns ingestion_lock
    before this short file-access lock. This is one-file replacement, not a
    multi-collection transaction or a power-loss durability guarantee.
    """
    payload = content.encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    with file_access_lock(_access_lock(path)):
        previous = path.stat() if path.exists() else None
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                output.write(payload)
                output.flush()
                os.fsync(output.fileno())
                if previous is not None and os.name == "posix":
                    if (previous.st_uid, previous.st_gid) != (os.getuid(), os.getgid()):
                        os.fchown(output.fileno(), previous.st_uid, previous.st_gid)
            if previous is not None:
                os.chmod(temporary, stat.S_IMODE(previous.st_mode))
                if os.name == "nt":
                    _copy_windows_security(path, temporary)
            os.replace(temporary, path)
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                # Preserve the write/replace failure; cleanup is best-effort.
                pass
