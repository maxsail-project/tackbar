"""Spawn real interpreters: a thread-only test cannot prove writer exclusion."""

from dataclasses import asdict
import json
import multiprocessing
import os
from pathlib import Path
from queue import Empty
import socket
from threading import Event, Thread

import pytest

from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_lock import ingestion_lock


def _track(label="track"):
    return (
        f'<gpx><trk><name>{label}</name><trkseg>'
        '<trkpt lat="39" lon="-.3"><time>2031-06-15T08:00:00Z</time></trkpt>'
        '<trkpt lat="39.00001" lon="-.3"><time>2031-06-15T08:00:01Z</time></trkpt>'
        '</trkseg></trk></gpx>'
    ).encode()


def _worker(root, action, attempting, entered, release, done, results,
            message_id="456:1", record_id=None, label="track", fail=False,
            uid=10, uidvalidity=456, acquired=None, acquisition_release=None):
    # Spawn does not inherit pytest's monkeypatches. Explicitly isolate every
    # external boundary in each child and reject unexpected network access.
    os.environ["TACKBAR_DATA_DIR"] = str(root)
    os.environ["TACKBAR_MAILBOX_PROVIDER"] = "ovh"

    def no_network(*args, **kwargs):
        raise AssertionError("Concurrency tests must not access the network")

    socket.create_connection = no_network
    from app.email_providers.ovh import OVHAcquisitionBatch, OVHExaminedMessage, OVHMessageOutcome
    from app.models import InboundEmail
    from app.repositories.activities import ActivityRepository
    from app.repositories.boats import BoatRepository
    from app.repositories.sailors import SailorRepository
    from app.repositories.sessions import SessionRepository
    from app.services import ingestion_processing as processing
    from app.services.mailbox_review import review_mailbox_now
    from app.services.session_enrichment import SessionEnrichmentService

    processing.automatic_session_enrichment_service = (
        lambda sessions, activities: SessionEnrichmentService(sessions, activities)
    )

    def delivery(*args):
        with (Path(root) / "deliveries.txt").open("a", encoding="utf-8") as output:
            output.write("sent\n")

    # Mailbox review uses the normal delivery path; replace the transport, too.
    from app.services.outbound_mail import OvhSmtpTransport
    from types import SimpleNamespace

    OvhSmtpTransport.from_environment = classmethod(
        lambda cls: SimpleNamespace(send=delivery)
    )
    parse = processing.process_inbound_email

    def gated_parse(email):
        entered.set()
        if release is not None and not release.wait(20):
            raise RuntimeError("Test parser gate timed out")
        if fail:
            raise ValueError("Synthetic parse failure")
        return parse(email)

    processing.process_inbound_email = gated_parse
    parse_track = processing.parse_track_attachment

    def gated_track_parse(content, filename):
        entered.set()
        if release is not None and not release.wait(20):
            raise RuntimeError("Test parser gate timed out")
        return parse_track(content, filename)

    processing.parse_track_attachment = gated_track_parse
    history = IngestionHistory()
    sailors, boats = SailorRepository(), BoatRepository()
    activities, sessions = ActivityRepository(), SessionRepository()
    email = InboundEmail("sailor@example.test", "Informational", "track.gpx", _track(label), message_id)

    class Provider:
        def acquire_messages(self, **kwargs):
            if acquired is not None:
                acquired.set()
            if acquisition_release is not None and not acquisition_release.wait(20):
                raise RuntimeError("Test acquisition gate timed out")
            email.provider_message_id = f"{uidvalidity}:{uid}"
            return OVHAcquisitionBatch(uidvalidity, (
                OVHExaminedMessage(uid, email, OVHMessageOutcome.SUPPORTED),
            ))

    try:
        attempting.set()
        if action == "lock":
            with ingestion_lock(root):
                with ingestion_lock(Path(root) / "."):
                    entered.set()
                    if release is not None and not release.wait(20):
                        raise RuntimeError("Test lock gate timed out")
                    if fail:
                        raise ValueError("Synthetic lock failure")
            value = "released"
        elif action == "process":
            result = processing.process_provider_email(
                "ovh", email, sailors, boats, activities, sessions, history,
                consent_request_sender=delivery, session_result_sender=delivery,
            )
            value = None if result is None else {
                "activity_id": result.activity.id,
                "created": result.activity_created,
            }
        elif action == "reprocess":
            value = processing.reprocess_ingestion(
                record_id, sailors, boats, activities, sessions, history,
                consent_request_sender=delivery, session_result_sender=delivery,
            )
        elif action == "review":
            value = asdict(review_mailbox_now(Provider()))
        elif action == "manual":
            value = processing.process_admin_upload(
                record_id, sailors, boats, activities, sessions, history,
            )
        elif action == "reconcile":
            value = history.fail_interrupted_manual()
        elif action == "read":
            value = history.records()
        elif action == "discard":
            value = history.set_disposition(record_id, "discarded")
        else:
            raise AssertionError(action)
        results.put(("ok", value))
    except BaseException as error:
        results.put(("error", type(error).__name__, str(error)))
    finally:
        done.set()


@pytest.fixture
def processes(tmp_path):
    context = multiprocessing.get_context("spawn")
    children = []

    def start(action, *, hold=False, **kwargs):
        attempting, entered, done = context.Event(), context.Event(), context.Event()
        release = context.Event() if hold else None
        results = context.Queue()
        child = context.Process(target=_worker, args=(
            tmp_path, action, attempting, entered, release, done, results,
        ), kwargs=kwargs)
        child.start()
        children.append((child, results))
        return SimpleProcess(child, attempting, entered, release, done, results)

    # Expose the same multiprocessing context for acquisition barrier events.
    start.event = context.Event
    start.root = tmp_path
    yield start
    for child, results in children:
        if child.is_alive():
            child.terminate()
        child.join(5)
        results.close()
        results.join_thread()


class SimpleProcess:
    def __init__(self, child, attempting, entered, release, done, results):
        self.child, self.attempting, self.entered = child, attempting, entered
        self.release, self.done, self.results = release, done, results

    def result(self):
        assert self.done.wait(25), "Child did not finish (possible lock deadlock)"
        self.child.join(5)
        assert self.child.exitcode == 0
        try:
            return self.results.get(timeout=5)
        except Empty:
            pytest.fail("Child exited without returning a result")


def _blocked(child):
    assert child.attempting.wait(10)
    assert not child.done.wait(.3), "Competing operation bypassed the held lock"
    assert not child.entered.is_set()


@pytest.mark.parametrize("fail", [False, True])
def test_reentrant_lock_excludes_other_process_and_releases_on_exception(processes, fail):
    owner = processes("lock", hold=True, fail=fail)
    assert owner.entered.wait(10)
    waiter = processes("lock")
    _blocked(waiter)
    owner.release.set()
    assert owner.result()[0] == ("error" if fail else "ok")
    assert waiter.result() == ("ok", "released")
    assert (processes.root / ".ingestion.lock").exists()


def test_process_termination_releases_os_ownership_without_deleting_lockfile(processes):
    owner = processes("lock", hold=True)
    assert owner.entered.wait(10)
    waiter = processes("lock")
    _blocked(waiter)
    owner.child.terminate()
    owner.child.join(5)
    assert waiter.result() == ("ok", "released")
    assert (processes.root / ".ingestion.lock").exists()


@pytest.mark.parametrize("message_id,label,records,activities", [
    ("456:1", "track", 1, 1),  # Same provider/message ID is skipped.
    ("456:2", "track", 2, 1),  # Raw bytes reuse the Activity.
    ("456:2", "different bytes", 2, 2),
])
def test_ingestion_serializes_dedup_and_domain_writes(processes, message_id, label, records, activities):
    owner = processes("process", hold=True)
    assert owner.entered.wait(10)
    waiter = processes("process", message_id=message_id, label=label)
    _blocked(waiter)
    owner.release.set()
    assert owner.result()[0] == "ok"
    assert waiter.result()[0] == "ok"
    history = IngestionHistory(processes.root / "ingestion_history.json").records()
    assert len(history) == records and all(record["status"] == "processed" for record in history)
    from app.repositories.activities import ActivityRepository
    from app.repositories.sailors import SailorRepository
    from app.repositories.sessions import SessionRepository

    assert len(ActivityRepository(processes.root / "activities.json").all()) == activities
    assert len(SailorRepository(processes.root / "sailors.json").all()) == 1
    sessions = SessionRepository(processes.root / "sessions.json").all()
    assert len(sessions) == 1 and len(sessions[0].activity_ids) == activities
    assert (processes.root / "deliveries.txt").read_text().splitlines() == ["sent"]


def test_failed_ingestion_releases_lock_and_preserves_failure_for_successor(processes):
    owner = processes("process", hold=True, fail=True)
    assert owner.entered.wait(10)
    waiter = processes("process", message_id="456:2")
    _blocked(waiter)
    owner.release.set()
    assert owner.result()[:2] == ("error", "ValueError")
    assert waiter.result()[0] == "ok"
    history = IngestionHistory(processes.root / "ingestion_history.json").records()
    assert [record["status"] for record in history] == ["failed", "processed"]
    assert all((processes.root / record["original_file"]).read_bytes() == _track() for record in history)


@pytest.mark.parametrize("action", ["process", "reprocess", "review", "read", "discard"])
def test_reprocess_serializes_with_ingestion_history_reads_and_disposition(processes, action):
    assert processes("process").result()[0] == "ok"
    history = IngestionHistory(processes.root / "ingestion_history.json")
    record = history.records()[0]
    owner = processes("reprocess", hold=True, record_id=record["id"])
    assert owner.entered.wait(10)
    waiter = processes(action, record_id=record["id"], message_id="456:2")
    _blocked(waiter)
    owner.release.set()
    assert owner.result()[0] == "ok"
    assert waiter.result()[0] == "ok"
    updated = history.get(record["id"])
    assert updated["attempts"] == (3 if action == "reprocess" else 2)
    assert updated["activity_id"] == record["activity_id"]
    assert updated["session_id"] == record["session_id"]
    assert updated["disposition"] == ("discarded" if action == "discard" else "active")
    assert len(json.loads((processes.root / "activities.json").read_text())) == 1
    assert (processes.root / "deliveries.txt").read_text().splitlines() == ["sent"]


@pytest.mark.parametrize("new_uidvalidity", [456, 789])
def test_overlapping_reviews_acquire_outside_lock_and_recheck_cursor(processes, new_uidvalidity):
    acquired, release = processes.event(), processes.event()
    slower = processes("review", uid=10, acquired=acquired, acquisition_release=release)
    assert acquired.wait(10)
    faster = processes("review", uid=20, uidvalidity=new_uidvalidity)
    assert faster.result()[0] == "ok"  # Acquisition must not hold ingestion lock.
    release.set()
    result = slower.result()
    assert result[0] == ("ok" if new_uidvalidity == 456 else "error")
    if new_uidvalidity != 456:
        assert result[1] == "MailboxReviewError"
    from app.services.ovh_mailbox_cursor import OVHMailboxCursor, OVHMailboxCursorStore

    assert OVHMailboxCursorStore(processes.root / "ovh_mailbox_cursor.json").load() == OVHMailboxCursor(new_uidvalidity, 20)
    records = IngestionHistory(processes.root / "ingestion_history.json").records()
    assert len(records) == (2 if new_uidvalidity == 456 else 1)
    assert all(record["status"] == "processed" for record in records)


def test_lock_acquisition_failure_is_fail_closed_and_does_not_poison_next_entry(tmp_path, monkeypatch):
    from app.services import ingestion_lock as locking

    acquire = locking._acquire

    def fail(descriptor):
        raise PermissionError("Synthetic lock failure")

    monkeypatch.setattr(locking, "_acquire", fail)
    entered = False
    with pytest.raises(PermissionError):
        with ingestion_lock(tmp_path):
            entered = True
    assert not entered
    monkeypatch.setattr(locking, "_acquire", acquire)
    with ingestion_lock(tmp_path):
        pass


def test_legacy_history_migration_waits_for_other_ingestion_writer(processes):
    path = processes.root / "ingestion_history.json"
    path.write_text(json.dumps([{
        "provider": "gmail", "provider_message_id": "legacy", "status": "failed",
    }]), encoding="utf-8")
    owner = processes("lock", hold=True)
    assert owner.entered.wait(10)
    reader = processes("read")
    _blocked(reader)
    owner.release.set()
    assert owner.result()[0] == "ok"
    result = reader.result()
    assert result[0] == "ok"
    assert result[1][0]["id"] == IngestionHistory(path).records()[0]["id"]


def test_reentrant_ownership_does_not_let_another_thread_bypass_lock(tmp_path):
    attempting, entered = Event(), Event()

    def enter():
        attempting.set()
        with ingestion_lock(tmp_path):
            entered.set()

    with ingestion_lock(tmp_path):
        with ingestion_lock(tmp_path):
            thread = Thread(target=enter, daemon=True)
            thread.start()
            assert attempting.wait(5)
            assert not entered.wait(.1)
    thread.join(5)
    assert not thread.is_alive() and entered.is_set()


@pytest.mark.skipif("fork" not in multiprocessing.get_all_start_methods(), reason="POSIX fork only")
def test_fork_child_cannot_reuse_parent_lock_ownership(tmp_path):
    context = multiprocessing.get_context("fork")
    attempting, entered, done = context.Event(), context.Event(), context.Event()
    results = context.Queue()
    child = context.Process(target=_worker, args=(
        tmp_path, "lock", attempting, entered, None, done, results,
    ))
    try:
        with ingestion_lock(tmp_path):
            child.start()
            assert attempting.wait(10)
            assert not entered.wait(.3)
        assert done.wait(10)
        child.join(5)
        assert child.exitcode == 0
        assert results.get(timeout=5) == ("ok", "released")
    finally:
        if child.is_alive():
            child.terminate()
        child.join(5)
        results.close()
        results.join_thread()
