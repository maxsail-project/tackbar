import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import gzip
import json
import multiprocessing
import os
from pathlib import Path
from queue import Empty
from threading import Event
import time
from urllib.parse import urlencode
from uuid import uuid4

import pytest

from app.main import app, lifespan
from app.models import ConsentStatus
from app.services import ingestion_processing as processing
from app.services.ingestion_history import ADMIN_UPLOAD_INTERRUPTED, IngestionHistory
from app.services.manual_upload_worker import (
    ACTIVATION_FAILURE, MAX_UPLOAD_BYTES, ManualUploadWorker, reconcile_manual_uploads,
)

from test_gpx import gpx_bytes
from test_manual_ingestion import runtime


KEY = "offline-admin-key"


@pytest.fixture
def worker(runtime, monkeypatch):
    monkeypatch.setenv("TACKBAR_ADMIN_KEY", KEY)
    manager = ManualUploadWorker(runtime.root)
    monkeypatch.setattr(app.state, "manual_upload_worker", manager, raising=False)
    yield manager
    manager.executor.shutdown(wait=True, cancel_futures=True)


@pytest.fixture
def gate(worker, monkeypatch):
    entered, release = Event(), Event()
    process = worker._process

    def delayed(record_id):
        entered.set()
        if not release.wait(20):
            raise RuntimeError("Test worker gate timed out")
        return process(record_id)

    monkeypatch.setattr(worker, "_process", delayed)
    yield entered, release
    release.set()


def http(method="POST", path="/api/admin/ingestions/upload", *, sailor_id=None,
         filename="track.gpx", body=None, chunks=None, key=KEY, declared="actual",
         disconnect=False, cancel_response=False, content_type="application/octet-stream"):
    payload = gpx_bytes() if body is None else body
    pieces = iter(chunks if chunks is not None else [payload])
    headers = [(b"content-type", content_type.encode())]
    if key is not None:
        headers.append((b"x-tackbar-admin-key", key.encode()))
    if declared is not None:
        headers.append((b"content-length", str(len(payload) if declared == "actual" else declared).encode()))
    messages, reads = [], []
    query = urlencode({"sailor_id": sailor_id, "filename": filename}) if sailor_id is not None else ""

    async def call():
        async def receive():
            reads.append(True)
            if disconnect:
                return {"type": "http.disconnect"}
            try:
                part = next(pieces)
                return {"type": "http.request", "body": part, "more_body": True}
            except StopIteration:
                return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            if cancel_response and message["type"] == "http.response.start":
                raise asyncio.CancelledError
            messages.append(message)

        await asyncio.wait_for(app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": method, "scheme": "http", "path": path,
            "raw_path": path.encode(), "query_string": query.encode(), "headers": headers,
            "client": ("test", 1), "server": ("test", 80), "root_path": "",
        }, receive, send), timeout=5)

    asyncio.run(call())
    start = next(message for message in messages if message["type"] == "http.response.start")
    content = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return start["status"], json.loads(content), len(reads)


def terminal(runtime, record_id):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        record = next(item for item in runtime.history.snapshot() if item["id"] == record_id)
        if record["status"] in ("processed", "failed"):
            return record
        time.sleep(.01)
    pytest.fail("Worker did not reach a terminal state")


@pytest.mark.parametrize("key", [None, "wrong", "a-personal-or-session-capability"])
def test_upload_authorization_precedes_body_read_or_preservation(runtime, worker, key):
    status, _, reads = http(sailor_id=runtime.sailor.id, key=key)
    assert status == 401 and reads == 0
    assert runtime.history.records() == []
    assert not (runtime.root / "originals").exists()


def test_upload_admin_configuration_fails_closed(runtime, worker, monkeypatch):
    monkeypatch.delenv("TACKBAR_ADMIN_KEY")
    status, _, reads = http(sailor_id=runtime.sailor.id)
    assert status == 503 and reads == 0 and runtime.history.records() == []


@pytest.mark.parametrize("status", [ConsentStatus.PENDING, ConsentStatus.REVOKED, None])
def test_http_requires_existing_active_sailor(runtime, worker, status):
    sailor_id = str(uuid4()) if status is None else runtime.sailor.id
    if status is not None:
        runtime.sailors.replace(replace(runtime.sailor, consent_status=status))
    code, _, _ = http(sailor_id=sailor_id)
    assert code == 422
    assert runtime.history.records() == []
    assert not (runtime.root / "originals").exists()
    assert len(runtime.sailors.all()) == 1


def test_acceptance_is_durable_and_worker_runs_after_request_loop_has_closed(runtime, worker, gate):
    status, response, _ = http(sailor_id=runtime.sailor.id)
    assert status == 202 and response["status"] == "pending"
    assert gate[0].wait(2)  # Immediate activation, not the mailbox timer.
    assert response["provider"] == "admin_upload"
    assert response["provider_message_id"] is response["sender_email"] is response["received_at"] is None
    assert response["operation_id"] == response["id"]
    assert response["owner_sailor_id"] == response["sailor_id"] == runtime.sailor.id
    record = IngestionHistory().get(response["id"])
    assert (runtime.root / record["original_file"]).read_bytes() == gpx_bytes()
    assert record["attempts"] == 0
    gate[1].set()
    completed = terminal(runtime, record["id"])
    assert completed["status"] == "processed" and completed["attempts"] == 1
    assert completed["session_result_notification"] is None and runtime.sent == []


def test_manual_acceptance_time_sorts_with_historical_mail_receipt_time(runtime, worker, gate):
    old = runtime.history.create("ovh", "456:17", "old@example.test", "old.csv", None)
    old["received_at"] = "2000-01-01T00:00:00+00:00"
    runtime.history.replace(old)
    _, accepted, _ = http(sailor_id=runtime.sailor.id)
    code, listed, _ = http("GET", "/api/admin/ingestions")
    assert code == 200 and [record["id"] for record in listed] == [accepted["id"], old["id"]]
    assert listed[1]["provider_message_id"] == "456:17"


def test_response_cancellation_does_not_cancel_already_accepted_work(runtime, worker, gate):
    with pytest.raises(asyncio.CancelledError):
        http(sailor_id=runtime.sailor.id, cancel_response=True)
    assert gate[0].wait(2)
    record = runtime.history.snapshot()[0]
    gate[1].set()
    assert terminal(runtime, record["id"])["status"] == "processed"
    assert runtime.sent == []


def test_disconnect_before_acceptance_creates_no_ingestion(runtime, worker):
    status, _, _ = http(sailor_id=runtime.sailor.id, disconnect=True)
    assert status == 400 and runtime.history.records() == []


def test_processing_state_is_readable_without_waiting_for_ingestion_lock(runtime, worker, monkeypatch):
    entered, release = Event(), Event()
    parse = processing.parse_track_attachment

    def delayed(*args):
        entered.set()
        assert release.wait(20)
        return parse(*args)

    monkeypatch.setattr(processing, "parse_track_attachment", delayed)
    try:
        status, accepted, _ = http(sailor_id=runtime.sailor.id)
        assert status == 202 and entered.wait(2)
        code, detail, _ = http("GET", f"/api/admin/ingestions/{accepted['id']}")
        assert code == 200 and detail["status"] == "processing"
        assert detail["owner_sailor_id"] == runtime.sailor.id
        code, listed, _ = http("GET", "/api/admin/ingestions")
        assert code == 200 and listed[0]["status"] == "processing"
        code, _, _ = http("POST", f"/api/admin/ingestions/{accepted['id']}/reprocess")
        assert code == 409
    finally:
        release.set()
    assert terminal(runtime, accepted["id"])["status"] == "processed"


def test_declared_oversize_is_rejected_without_reading_body(runtime, worker):
    status, _, reads = http(sailor_id=runtime.sailor.id, declared=MAX_UPLOAD_BYTES + 1)
    assert status == 413 and reads == 0
    assert runtime.history.records() == [] and not (runtime.root / "originals").exists()


@pytest.mark.parametrize("declared,expected", [("-1", 400), ("not-a-size", 400), ("9" * 5000, 413)])
def test_invalid_or_excessive_length_header_is_controlled(runtime, worker, declared, expected):
    status, _, reads = http(sailor_id=runtime.sailor.id, declared=declared)
    assert status == expected and reads == 0 and runtime.history.records() == []


def test_multipart_transport_is_rejected_before_reading_multiple_files(runtime, worker):
    code, _, reads = http(sailor_id=runtime.sailor.id, content_type="multipart/form-data; boundary=test")
    assert code == 415 and reads == 0 and runtime.history.records() == []


@pytest.mark.parametrize("declared", [None, 1])
def test_actual_stream_limit_enforced_for_chunked_or_false_content_length(runtime, worker, declared):
    status, _, _ = http(sailor_id=runtime.sailor.id, declared=declared,
                        chunks=[b"x" * (MAX_UPLOAD_BYTES // 2)] * 2 + [b"x"])
    assert status == 413 and runtime.history.records() == []
    assert not (runtime.root / "originals").exists()


def test_exact_16_mib_plain_gpx_is_accepted_and_preserved(runtime, worker, gate):
    base = gpx_bytes()
    content = base + b" " * (MAX_UPLOAD_BYTES - len(base))
    status, accepted, _ = http(sailor_id=runtime.sailor.id, body=content)
    assert status == 202
    record = runtime.history.get(accepted["id"])
    assert (runtime.root / record["original_file"]).read_bytes() == content
    gate[1].set()
    assert terminal(runtime, accepted["id"])["status"] == "processed"


@pytest.mark.parametrize("filename", ["track.gpx.gz", "track.zip", "track.fit", "track.gpx"])
def test_unsupported_or_corrupt_accepted_size_file_is_inspectable_failed_original(runtime, worker, filename):
    status, accepted, _ = http(sailor_id=runtime.sailor.id, filename=filename, body=b"invalid private content")
    assert status == 202
    record = terminal(runtime, accepted["id"])
    assert record["status"] == "failed" and record["last_error"] == "Manual track processing failed"
    assert (runtime.root / record["original_file"]).read_bytes() == b"invalid private content"
    code, detail, _ = http("GET", f"/api/admin/ingestions/{accepted['id']}")
    assert code == 200 and detail["original_available"]
    assert detail["sailor_id"] == runtime.sailor.id and detail["sender_email"] is None
    assert detail["diagnostic"]["owner_sailor_id"] == runtime.sailor.id


@pytest.mark.parametrize("filename", ["track.csv", "track.CSV.GZ", "track.GPX", "track.vkx", "track.VKX.GZ"])
def test_all_delivered_formats_fit_available_fixture_boundary_and_process(runtime, worker, filename, vakaros_vkx_bytes):
    if ".csv" in filename.lower():
        content = (Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz").read_bytes()
        if not filename.lower().endswith(".gz"):
            content = gzip.decompress(content)
    elif ".vkx" in filename.lower():
        content = gzip.compress(vakaros_vkx_bytes) if filename.lower().endswith(".gz") else vakaros_vkx_bytes
    else:
        content = gpx_bytes()
    assert len(content) < MAX_UPLOAD_BYTES
    code, accepted, _ = http(sailor_id=runtime.sailor.id, filename=filename, body=content)
    assert code == 202
    assert terminal(runtime, accepted["id"])["status"] == "processed"
    assert runtime.sent == []


def test_worker_activation_failure_retains_failed_inspectable_operation(runtime, worker, monkeypatch):
    def fail(*args):
        raise RuntimeError("Private activation error")

    monkeypatch.setattr(worker.executor, "submit", fail)
    code, response, _ = http(sailor_id=runtime.sailor.id)
    assert code == 202 and response["status"] == "failed"
    assert response["last_error"] == ACTIVATION_FAILURE
    assert response["original_available"] and response["attempts"] == 0
    assert runtime.activities.all() == []


def test_preservation_failure_is_not_acknowledged_as_acceptance(runtime, worker, monkeypatch):
    def fail(*args):
        raise OSError("Private file write failure")

    monkeypatch.setattr("app.storage.ingestion_original_storage.IngestionOriginalStorage.preserve", fail)
    code, response, _ = http(sailor_id=runtime.sailor.id)
    assert code == 503 and "Private file" not in str(response)
    assert runtime.history.records() == []


def test_concurrent_uploads_remain_owned_while_queued_and_reuse_one_activity(runtime, worker, gate):
    with ThreadPoolExecutor(max_workers=2) as clients:
        replies = list(clients.map(lambda _: http(sailor_id=runtime.sailor.id), range(2)))
    assert all(reply[0] == 202 for reply in replies) and gate[0].wait(2)
    ids = [reply[1]["id"] for reply in replies]
    assert ids[0] != ids[1]
    assert reconcile_manual_uploads(runtime.root, blocking=True) == []
    assert all(record["status"] == "pending" for record in runtime.history.snapshot())
    gate[1].set()
    records = [terminal(runtime, identity) for identity in ids]
    assert all(record["status"] == "processed" for record in records)
    assert records[0]["activity_id"] == records[1]["activity_id"]
    assert sorted(record["activity_created_by_ingestion"] for record in records) == [False, True]
    assert len(runtime.activities.all()) == len(runtime.sessions.all()) == 1 and runtime.sent == []


def test_shutdown_cancels_queued_work_to_failed_without_retrying_it(runtime, worker, gate):
    _, first, _ = http(sailor_id=runtime.sailor.id)
    assert gate[0].wait(2)
    _, second, _ = http(sailor_id=runtime.sailor.id)
    worker.shutdown()
    records = {record["id"]: record for record in runtime.history.snapshot()}
    assert records[first["id"]]["status"] == "pending"
    assert records[second["id"]]["status"] == "failed"
    assert records[second["id"]]["last_error"] == ADMIN_UPLOAD_INTERRUPTED
    assert records[second["id"]]["attempts"] == 0
    gate[1].set()
    assert terminal(runtime, first["id"])["status"] == "processed"
    assert len(runtime.activities.all()) == 1 and runtime.sent == []


def test_history_snapshots_remain_readable_during_repeated_atomic_updates(runtime):
    record = runtime.history.create("ovh", "456:17", "old@example.test", "old.csv", None)

    def write():
        for index in range(20):
            runtime.history.set_disposition(record["id"], "discarded" if index % 2 else "active")

    with ThreadPoolExecutor(max_workers=1) as writers:
        future = writers.submit(write)
        for _ in range(50):
            snapshot = runtime.history.snapshot()
            assert len(snapshot) == 1 and snapshot[0]["id"] == record["id"]
            assert snapshot[0]["status"] == "failed"
        future.result(timeout=10)


def test_unexpected_worker_exit_marks_failed_without_automatic_retry(runtime, worker, monkeypatch):
    attempts = []

    def interrupted(*args):
        attempts.append(True)
        raise SystemExit("Synthetic worker interruption")

    monkeypatch.setattr(processing, "parse_track_attachment", interrupted)
    code, accepted, _ = http(sailor_id=runtime.sailor.id)
    assert code == 202
    failed = terminal(runtime, accepted["id"])
    assert failed["status"] == "failed" and failed["last_error"] == ADMIN_UPLOAD_INTERRUPTED
    assert failed["attempts"] == 1 and len(attempts) == 1
    code, detail, _ = http("GET", f"/api/admin/ingestions/{accepted['id']}")
    assert code == 200 and detail["status"] == "failed"
    assert len(attempts) == 1 and runtime.activities.all() == [] and runtime.sent == []


def test_lifespan_marks_abandoned_pending_without_executing_it(runtime, monkeypatch):
    pending = processing.accept_admin_upload(runtime.sailor.id, "track.gpx", gpx_bytes(), runtime.sailors, runtime.history)

    def forbidden(*args):
        pytest.fail("Startup must never execute abandoned operations")

    monkeypatch.setattr("app.services.manual_upload_worker.process_admin_upload", forbidden)

    async def restart():
        async with lifespan(app):
            record = runtime.history.get(pending["id"])
            assert record["status"] == "failed" and record["last_error"] == ADMIN_UPLOAD_INTERRUPTED

    asyncio.run(restart())
    assert runtime.activities.all() == [] and runtime.sent == []


def _probe(root, results):
    results.put(reconcile_manual_uploads(Path(root), blocking=True))


def test_live_pending_lease_survives_concurrent_backend_reconciliation(runtime, worker, gate):
    code, accepted, _ = http(sailor_id=runtime.sailor.id)
    assert code == 202 and gate[0].wait(2)
    context = multiprocessing.get_context("spawn")
    results = context.Queue()
    child = context.Process(target=_probe, args=(runtime.root, results))
    try:
        child.start()
        child.join(10)
        assert child.exitcode == 0 and results.get(timeout=3) == []
        assert runtime.history.get(accepted["id"])["status"] == "pending"
    finally:
        if child.is_alive():
            child.terminate()
        child.join(5)
        results.close()
        results.join_thread()
        gate[1].set()


def _interrupted_backend(root, mode, entered, release, results):
    os.environ["TACKBAR_DATA_DIR"] = str(root)
    import socket
    from app.services.session_enrichment import SessionEnrichmentService

    def no_network(*args, **kwargs):
        raise AssertionError("Interruption tests must remain offline")

    socket.create_connection = no_network
    processing.automatic_session_enrichment_service = (
        lambda sessions, activities: SessionEnrichmentService(sessions, activities)
    )
    manager = ManualUploadWorker(Path(root))
    from app.repositories.sailors import SailorRepository
    sailor = SailorRepository().all()[0]
    if mode == "pending":
        process = manager._process

        def delayed(record_id):
            entered.set()
            release.wait(30)
            return process(record_id)

        manager._process = delayed
    else:
        parse = processing.parse_track_attachment

        def delayed_parse(*args):
            entered.set()
            release.wait(30)
            return parse(*args)

        processing.parse_track_attachment = delayed_parse
    record = manager.accept(sailor.id, "track.gpx", gpx_bytes())
    results.put(record["id"])
    release.wait(30)


@pytest.mark.parametrize("mode", ["pending", "processing"])
def test_process_termination_marks_both_states_failed_and_requires_manual_reprocess(runtime, worker, mode):
    context = multiprocessing.get_context("spawn")
    entered, release, results = context.Event(), context.Event(), context.Queue()
    child = context.Process(target=_interrupted_backend, args=(runtime.root, mode, entered, release, results))
    try:
        child.start()
        record_id = results.get(timeout=10)
        assert entered.wait(5)
        assert runtime.history.snapshot()[0]["status"] == mode
        child.terminate()
        child.join(5)
        code, detail, _ = http("GET", f"/api/admin/ingestions/{record_id}")
        assert code == 200 and detail["status"] == "failed"
        assert detail["last_error"] == ADMIN_UPLOAD_INTERRUPTED
        assert detail["attempts"] == (0 if mode == "pending" else 1)
        assert detail["original_available"] and runtime.activities.all() == []
        code, recovered, _ = http("POST", f"/api/admin/ingestions/{record_id}/reprocess")
        assert code == 200 and recovered["status"] == "processed"
        assert runtime.sent == []
    except Empty:
        pytest.fail("Child backend did not accept its operation")
    finally:
        if child.is_alive():
            child.terminate()
        child.join(5)
        results.close()
        results.join_thread()
