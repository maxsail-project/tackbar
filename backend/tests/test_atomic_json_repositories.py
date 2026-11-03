import json
import os
import stat
import subprocess
from contextlib import contextmanager
from threading import Event, Thread

import pytest

from app.repositories import atomic_json
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.repositories.temporary_session_shares import TemporarySessionShareRepository


def _temporaries(path):
    return list(path.parent.glob(f".{path.name}.*.tmp"))


def test_existing_and_absent_collections_replace_complete_json(tmp_path):
    path = tmp_path / "metadata.json"
    assert atomic_json.read_text(path) is None
    assert not path.parent.joinpath(".metadata.json.access.lock").exists()
    atomic_json.write_text(path, '[{"value": 1}]\n')
    assert json.loads(atomic_json.read_text(path)) == [{"value": 1}]
    atomic_json.write_text(path, '[{"value": 2}]\n')
    assert json.loads(path.read_text(encoding="utf-8")) == [{"value": 2}]
    assert _temporaries(path) == []


def test_failed_partial_temporary_write_preserves_old_collection(tmp_path, monkeypatch):
    path = tmp_path / "metadata.json"
    path.write_text('[{"old": true}]\n', encoding="utf-8")
    original_fdopen = os.fdopen

    class PartialOutput:
        def __init__(self, output):
            self.output = output

        def __enter__(self):
            self.output.__enter__()
            return self

        def __exit__(self, *args):
            return self.output.__exit__(*args)

        def write(self, payload):
            self.output.write(payload[:5])
            raise OSError("simulated partial write")

    monkeypatch.setattr(atomic_json.os, "fdopen", lambda fd, mode: PartialOutput(original_fdopen(fd, mode)))
    with pytest.raises(OSError, match="partial write"):
        atomic_json.write_text(path, '[{"new": true}]\n')
    assert json.loads(path.read_text(encoding="utf-8")) == [{"old": True}]
    assert _temporaries(path) == []


def test_failed_replace_preserves_old_collection_and_cleans_temporary(tmp_path, monkeypatch):
    path = tmp_path / "metadata.json"
    path.write_text('[{"old": true}]\n', encoding="utf-8")

    def failed_replace(_source, _target):
        raise OSError("simulated replace failure")

    monkeypatch.setattr(atomic_json.os, "replace", failed_replace)
    with pytest.raises(OSError, match="replace failure"):
        atomic_json.write_text(path, '[{"new": true}]\n')
    assert json.loads(path.read_text(encoding="utf-8")) == [{"old": True}]
    assert _temporaries(path) == []


def test_serialization_failure_does_not_touch_existing_target(tmp_path, monkeypatch):
    path = tmp_path / "boats.json"
    path.write_text("[]\n", encoding="utf-8")

    def failed_dumps(*_args, **_kwargs):
        raise TypeError("simulated serialization failure")

    monkeypatch.setattr("app.repositories.boats.json.dumps", failed_dumps)
    with pytest.raises(TypeError, match="serialization failure"):
        BoatRepository(path)._save([])
    assert path.read_text(encoding="utf-8") == "[]\n"
    assert _temporaries(path) == []


def test_reader_waits_for_replacement_and_sees_complete_new_json(tmp_path, monkeypatch):
    path = tmp_path / "metadata.json"
    path.write_text('[{"old": true}]\n', encoding="utf-8")
    entered, release, read_done = Event(), Event(), Event()
    real_fsync = os.fsync
    observed = []

    def paused_fsync(descriptor):
        entered.set()
        if not release.wait(5):
            raise TimeoutError("writer was not released")
        return real_fsync(descriptor)

    monkeypatch.setattr(atomic_json.os, "fsync", paused_fsync)
    writer = Thread(target=lambda: atomic_json.write_text(path, '[{"new": true}]\n'))
    reader = Thread(target=lambda: (observed.append(atomic_json.read_text(path)), read_done.set()))
    writer.start()
    try:
        assert entered.wait(5)
        assert json.loads(path.read_text(encoding="utf-8")) == [{"old": True}]
        reader.start()
        assert not read_done.wait(0.1)
    finally:
        release.set()
        writer.join(5)
        if reader.ident is not None:
            reader.join(5)
    assert not writer.is_alive() and not reader.is_alive()
    assert json.loads(observed[0]) == [{"new": True}]
    assert _temporaries(path) == []


@pytest.mark.parametrize("repository", [
    ActivityRepository, SailorRepository, BoatRepository, SessionRepository,
    ConsentEventRepository, ConsentRequestRepository, TemporarySessionShareRepository,
])
def test_every_critical_repository_uses_atomic_collection_writer(tmp_path, repository):
    path = tmp_path / f"{repository.__name__}.json"
    instance = repository(path)
    instance._save([])
    assert path.read_text(encoding="utf-8") == "[]\n"
    assert (instance._load() if repository is ActivityRepository else instance.all()) == []
    assert _temporaries(path) == []


@pytest.mark.parametrize("repository", [
    ActivityRepository, SailorRepository, BoatRepository, SessionRepository,
    ConsentEventRepository, ConsentRequestRepository, TemporarySessionShareRepository,
])
def test_absent_collection_read_does_not_create_data_root(tmp_path, repository):
    path = tmp_path / "absent" / f"{repository.__name__}.json"
    instance = repository(path)
    assert (instance._load() if repository is ActivityRepository else instance.all()) == []
    assert not path.parent.exists()


def test_session_legacy_migration_releases_read_lock_before_write(tmp_path, monkeypatch):
    path = tmp_path / "sessions.json"
    path.write_text('[{"id": "legacy", "activity_ids": []}]', encoding="utf-8")
    real_lock = atomic_json.file_access_lock
    held = False

    @contextmanager
    def non_reentrant_lock(lock_path):
        nonlocal held
        assert not held
        held = True
        try:
            with real_lock(lock_path):
                yield
        finally:
            held = False

    monkeypatch.setattr(atomic_json, "file_access_lock", non_reentrant_lock)
    sessions = SessionRepository(path).all()
    assert len(sessions) == 1
    assert sessions[0].id == "legacy"
    assert "created_at" in json.loads(path.read_text(encoding="utf-8"))[0]


def test_replacement_preserves_existing_mode_bits(tmp_path):
    path = tmp_path / "credentials.json"
    path.write_text("[]\n", encoding="utf-8")
    path.chmod(0o600)
    before = stat.S_IMODE(path.stat().st_mode)
    atomic_json.write_text(path, '[{"token": "synthetic"}]\n')
    assert stat.S_IMODE(path.stat().st_mode) == before
    assert _temporaries(path) == []


@pytest.mark.skipif(os.name != "nt", reason="Windows access lists only")
def test_windows_replacement_preserves_explicit_access_list(tmp_path):
    path = tmp_path / "credentials.json"
    path.write_text("[]\n", encoding="utf-8")
    subprocess.run(["icacls", str(path), "/inheritance:d"], check=True, capture_output=True)
    before = subprocess.run(["icacls", str(path)], check=True, capture_output=True).stdout
    atomic_json.write_text(path, '[{"token": "synthetic"}]\n')
    after = subprocess.run(["icacls", str(path)], check=True, capture_output=True).stdout
    assert after == before
