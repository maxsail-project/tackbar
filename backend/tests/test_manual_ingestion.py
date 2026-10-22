from dataclasses import replace
import gzip
from hashlib import sha256
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models import Boat, ConsentStatus, InboundEmail
from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services import ingestion_processing as processing
from app.services.ingestion_history import ADMIN_UPLOAD, ADMIN_UPLOAD_INTERRUPTED, IngestionHistory
from app.services.outbound_mail import OvhSmtpTransport
from app.services.sailor_consent import SailorConsentService
from app.services.session_reader import SessionReader
from app.storage.ingestion_original_storage import IngestionOriginalStorage
from app.storage.track_storage import TrackStorage

from test_gpx import gpx_bytes
from test_ingestion_lock import processes, _blocked, _track


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_PUBLIC_BASE_URL", "https://example.test")
    sent = []
    monkeypatch.setattr(OvhSmtpTransport, "from_environment", classmethod(
        lambda cls: SimpleNamespace(send=sent.append),
    ))
    sailors = SailorRepository()
    sailor, _ = sailors.find_or_create_by_email("selected@example.test")
    sailor = sailors.replace(replace(sailor, consent_status=ConsentStatus.ACTIVE, personal_capability_token="p" * 43))
    return SimpleNamespace(
        root=tmp_path, sent=sent, sailors=sailors, sailor=sailor,
        boats=BoatRepository(), activities=ActivityRepository(),
        sessions=SessionRepository(), history=IngestionHistory(),
    )


def accept(runtime, content=None, filename="track.gpx", sailor_id=None):
    return processing.accept_admin_upload(
        sailor_id or runtime.sailor.id, filename,
        gpx_bytes() if content is None else content, runtime.sailors, runtime.history,
    )


def process(runtime, record, reprocess=False):
    method = processing.reprocess_ingestion if reprocess else processing.process_admin_upload
    return method(
        record["id"], runtime.sailors, runtime.boats, runtime.activities,
        runtime.sessions, runtime.history,
    )


def assert_silent(runtime, record):
    assert record["session_result_notification_candidate"] is False
    assert record["session_result_notification"] is None
    assert record["pending_onboarding_reservation"] is None
    assert ConsentRequestRepository().all() == []
    assert runtime.sailors.get_by_id(record["owner_sailor_id"]).welcome_email_sent_at is None
    assert runtime.sent == []


def test_acceptance_is_durable_owned_pending_and_has_no_mail_identity(runtime):
    content = gpx_bytes()
    record = accept(runtime, content, filename="../Training.GPX")
    loaded = IngestionHistory().get(record["id"])
    assert loaded == record
    assert loaded["provider"] == ADMIN_UPLOAD
    assert loaded["operation_id"] == loaded["id"]
    assert loaded["owner_sailor_id"] == runtime.sailor.id
    assert loaded["sender_email"] is loaded["provider_message_id"] is loaded["received_at"] is None
    assert loaded["accepted_at"]
    assert loaded["status"] == "pending" and loaded["attempts"] == 0
    assert loaded["last_attempt_at"] is None
    assert loaded["attachment_sha256"] == sha256(content).hexdigest()
    assert (runtime.root / loaded["original_file"]).read_bytes() == content
    assert Path(loaded["original_file"]).name == "Training.GPX"
    assert runtime.activities.all() == runtime.sessions.all() == []
    assert_silent(runtime, loaded)


@pytest.mark.parametrize("status", ["PENDING", "REVOKED", "missing"])
def test_initial_owner_must_exist_and_be_active_before_any_acceptance(runtime, status):
    identity = str(uuid4()) if status == "missing" else runtime.sailor.id
    if status != "missing":
        runtime.sailors.replace(replace(runtime.sailor, consent_status=ConsentStatus(status)))
    with pytest.raises(ValueError, match="ACTIVE Sailor"):
        accept(runtime, sailor_id=identity)
    assert runtime.history.records() == []
    assert not (runtime.root / "originals").exists()
    assert runtime.activities.all() == []
    assert len(runtime.sailors.all()) == 1


def test_processing_persists_each_state_uses_default_boat_and_is_silent(runtime, monkeypatch):
    boat = runtime.boats.add(Boat(str(uuid4()), "Default", "Snipe", None))
    runtime.sailors.replace(replace(runtime.sailor, default_boat_id=boat.id))
    record = accept(runtime)
    parse = processing.parse_track_attachment
    seen = []

    def inspect(content, filename):
        persisted = json.loads(runtime.history.path.read_text())[0]
        seen.append(persisted["status"])
        assert persisted["attempts"] == 1 and persisted["last_attempt_at"]
        assert (runtime.root / persisted["original_file"]).read_bytes() == content
        return parse(content, filename)

    def forbidden(*args, **kwargs):
        pytest.fail("Manual operations must not enter automatic communication paths")

    monkeypatch.setattr(processing, "parse_track_attachment", inspect)
    monkeypatch.setattr(processing, "_automatic_consent_requests", forbidden)
    monkeypatch.setattr(processing.SessionResultDeliveryService, "attempt_for_new_activity", forbidden)
    monkeypatch.setattr(processing, "process_inbound_email", forbidden)
    completed = process(runtime, record)
    assert seen == ["processing"]
    assert completed["status"] == "processed" and completed["attempts"] == 1
    activity = runtime.activities.get_by_id(completed["activity_id"])
    assert activity.sailor_id == runtime.sailor.id and activity.boat_id == boat.id
    assert activity.source == "gpx"  # Format provenance stays separate from acquisition.
    assert completed["activity_created_by_ingestion"] is True
    assert runtime.sessions.get_by_id(completed["session_id"]).activity_ids == [activity.id]
    storage = TrackStorage()
    assert storage.original_path(activity.id, activity.original_filename).read_bytes() == gpx_bytes()
    assert list(storage.read_normalized_track(activity.id).columns) == CANONICAL_TRACK_COLUMNS
    assert process(runtime, completed) == completed  # No implicit second processing.
    assert_silent(runtime, completed)


def test_reupload_and_reprocess_reuse_raw_bytes_within_selected_sailor(runtime):
    first = process(runtime, accept(runtime))
    second = process(runtime, accept(runtime))
    assert first["id"] != second["id"] and first["original_file"] != second["original_file"]
    assert first["activity_id"] == second["activity_id"]
    assert second["activity_created_by_ingestion"] is False
    assert process(runtime, first, reprocess=True)["attempts"] == 2
    assert len(runtime.activities.all()) == 1
    other, _ = runtime.sailors.find_or_create_by_email("other@example.test")
    runtime.sailors.replace(replace(other, consent_status=ConsentStatus.ACTIVE))
    third = process(runtime, accept(runtime, sailor_id=other.id))
    assert third["activity_id"] != first["activity_id"]
    assert third["session_id"] == first["session_id"]
    assert len(runtime.activities.all()) == 2
    assert runtime.sent == []


def test_manual_and_ovh_share_activity_reuse_but_keep_separate_provenance(runtime):
    first = process(runtime, accept(runtime))
    email = InboundEmail(runtime.sailor.email, "email", "track.gpx", gpx_bytes(), "456:17")
    reused = processing.process_provider_email(
        "ovh", email, runtime.sailors, runtime.boats, runtime.activities,
        runtime.sessions, runtime.history,
    )
    assert reused.activity.id == first["activity_id"] and not reused.activity_created
    assert runtime.sent == []
    newer = InboundEmail(runtime.sailor.email, "email", "track.gpx", gpx_bytes().replace(b"<trk>", b"<trk><name>new</name>"), "456:18")
    processing.process_provider_email("ovh", newer, runtime.sailors, runtime.boats, runtime.activities, runtime.sessions, runtime.history)
    assert len(runtime.sent) == 1  # OVH retains ordinary ACTIVE Session-result delivery.
    assert len(runtime.history.records()) == 3


@pytest.mark.parametrize("revoked_before_processing", [False, True])
def test_original_ownership_and_revoked_cycle_survive_processing_and_reprocess(runtime, revoked_before_processing):
    record = accept(runtime)
    if not revoked_before_processing:
        record = process(runtime, record)
    consent = SailorConsentService(runtime.sailors, ConsentEventRepository())
    consent.revoke_consent(runtime.sailor.id, "test")
    runtime.sailors.replace(replace(runtime.sailors.get_by_id(runtime.sailor.id), email="changed@example.test"))
    # An email reassignment must not change ownership during reprocessing.
    runtime.sailors.find_or_create_by_email("selected@example.test")
    updated = process(runtime, record, reprocess=not revoked_before_processing)
    assert updated["status"] == "processed"
    assert runtime.activities.get_by_id(updated["activity_id"]).sailor_id == runtime.sailor.id
    current = runtime.sailors.get_by_id(runtime.sailor.id)
    assert current.consent_status == ConsentStatus.PENDING
    assert current.consent_request_sent_at is None
    events = ConsentEventRepository().for_sailor(runtime.sailor.id)
    assert events[-1].event_type.value == "consent_cycle_started"
    assert events[-1].source == "admin_upload_valid_track"
    assert SessionReader(runtime.sessions, runtime.activities, runtime.sailors, runtime.boats).get_session(updated["session_id"]) is None
    process(runtime, updated, reprocess=True)
    assert len(ConsentEventRepository().for_sailor(runtime.sailor.id)) == len(events)
    assert_silent(runtime, updated)


def test_silent_manual_cycle_does_not_consume_later_ovh_consent_delivery(runtime):
    record = process(runtime, accept(runtime))
    SailorConsentService(runtime.sailors, ConsentEventRepository()).revoke_consent(runtime.sailor.id, "test")
    manual = process(runtime, record, reprocess=True)
    assert_silent(runtime, manual)
    processing.process_provider_email(
        "ovh", InboundEmail(runtime.sailor.email, "email", "track.gpx", gpx_bytes(), "456:17"),
        runtime.sailors, runtime.boats, runtime.activities, runtime.sessions, runtime.history,
    )
    assert len(runtime.sent) == len(ConsentRequestRepository().all()) == 1
    assert runtime.sailors.get_by_id(runtime.sailor.id).consent_status == ConsentStatus.PENDING
    assert runtime.sailors.get_by_id(runtime.sailor.id).consent_request_sent_at is not None


def test_invalid_manual_track_cannot_restart_revoked_consent(runtime):
    record = accept(runtime, b"invalid private track")
    consent = SailorConsentService(runtime.sailors, ConsentEventRepository())
    consent.revoke_consent(runtime.sailor.id, "test")
    failed = process(runtime, record)
    assert failed["status"] == "failed"
    assert runtime.sailors.get_by_id(runtime.sailor.id).consent_status == ConsentStatus.REVOKED
    assert process(runtime, failed, reprocess=True)["status"] == "failed"
    assert len(ConsentEventRepository().for_sailor(runtime.sailor.id)) == 1
    assert_silent(runtime, failed)


def test_partial_domain_failure_recovers_without_duplicating_activity_or_provenance(runtime, monkeypatch):
    record = accept(runtime)

    def fail(*args):
        raise RuntimeError("Synthetic Session write failure")

    with monkeypatch.context() as patch:
        patch.setattr(processing, "match_activity_to_session", fail)
        failed = process(runtime, record)
    assert failed["status"] == "failed"
    assert failed["activity_created_by_ingestion"] is True
    activity_id = runtime.activities.all()[0].id
    recovered = process(runtime, failed, reprocess=True)
    assert recovered["status"] == "processed" and recovered["attempts"] == 2
    assert recovered["activity_id"] == activity_id
    assert recovered["activity_created_by_ingestion"] is True
    assert len(runtime.activities.all()) == len(runtime.sessions.all()) == 1
    assert_silent(runtime, recovered)


@pytest.mark.parametrize("content,filename", [
    (b"not XML private content", "track.gpx"), (b"bad csv private content", "track.csv"),
    (b"bad VKX private content", "track.vkx"), (b"unsupported", "track.fit"),
    (b"compressed", "track.gpx.gz"),
])
def test_invalid_files_are_preserved_failed_and_never_automatically_retried(runtime, content, filename):
    pending = accept(runtime, content, filename)
    failed = process(runtime, pending)
    assert failed["status"] == "failed" and failed["attempts"] == 1
    assert failed["last_error"] == "Manual track processing failed"
    assert (runtime.root / failed["original_file"]).read_bytes() == content
    assert runtime.activities.all() == []
    with pytest.raises(ValueError, match="explicit Reprocess"):
        process(runtime, failed)
    repeated = process(runtime, failed, reprocess=True)
    assert repeated["status"] == "failed" and repeated["attempts"] == 2
    assert_silent(runtime, repeated)


@pytest.mark.parametrize("problem", ["missing", "tampered", "owner_removed"])
def test_reprocess_cannot_replace_original_bytes_or_owner(runtime, problem):
    completed = process(runtime, accept(runtime))
    if problem == "missing":
        (runtime.root / completed["original_file"]).unlink()
    elif problem == "tampered":
        (runtime.root / completed["original_file"]).write_bytes(b"different")
    else:
        runtime.sailors.path.write_text("[]", encoding="utf-8")
    failed = process(runtime, completed, reprocess=True)
    assert failed["status"] == "failed" and failed["owner_sailor_id"] == runtime.sailor.id
    assert failed["activity_id"] == completed["activity_id"]
    assert len(runtime.activities.all()) == 1 and runtime.sent == []


def test_interruption_is_persisted_without_retry_and_explicit_reprocess_recovers(runtime, monkeypatch):
    record = accept(runtime)

    def interrupt(*args):
        raise SystemExit("Simulated process interruption")

    with monkeypatch.context() as patch:
        patch.setattr(processing, "parse_track_attachment", interrupt)
        with pytest.raises(SystemExit):
            process(runtime, record)
    interrupted = IngestionHistory().get(record["id"])
    assert interrupted["status"] == "processing"
    assert runtime.history.fail_interrupted_manual() == [record["id"]]
    failed = IngestionHistory().get(record["id"])
    assert failed["last_error"] == ADMIN_UPLOAD_INTERRUPTED and failed["attempts"] == 1
    assert runtime.activities.all() == []
    assert runtime.history.fail_interrupted_manual() == []
    completed = process(runtime, failed, reprocess=True)
    assert completed["status"] == "processed" and completed["attempts"] == 2
    assert_silent(runtime, completed)


@pytest.mark.parametrize("terminate", [False, True])
def test_reconciliation_cannot_mark_a_live_process_interrupted(runtime, processes, terminate):
    record = accept(runtime)
    owner = processes("manual", hold=True, record_id=record["id"])
    assert owner.entered.wait(10)
    waiter = processes("reconcile")
    _blocked(waiter)
    if terminate:
        owner.child.terminate()
        owner.child.join(5)
    else:
        owner.release.set()
        assert owner.result()[0] == "ok"
    result = waiter.result()
    assert result == ("ok", [record["id"]] if terminate else [])
    loaded = IngestionHistory().get(record["id"])
    assert loaded["status"] == ("failed" if terminate else "processed")
    if terminate:
        assert loaded["last_error"] == ADMIN_UPLOAD_INTERRUPTED
        assert process(runtime, loaded, reprocess=True)["status"] == "processed"
    assert not (runtime.root / "deliveries.txt").exists()


@pytest.mark.parametrize("action", ["manual", "reprocess"])
def test_manual_processing_and_reprocess_share_exclusion_with_ovh(runtime, processes, action):
    runtime.sailors.replace(replace(runtime.sailor, email="sailor@example.test"))
    record = accept(runtime, _track())
    if action == "reprocess":
        record = process(runtime, record)
    owner = processes(action, hold=True, record_id=record["id"])
    assert owner.entered.wait(10)
    waiter = processes("process", message_id="456:17")
    _blocked(waiter)
    owner.release.set()
    assert owner.result()[0] == "ok"
    result = waiter.result()
    assert result[0] == "ok" and result[1]["created"] is False
    assert len(runtime.activities.all()) == len(runtime.sessions.all()) == 1
    assert not (runtime.root / "deliveries.txt").exists()


def test_existing_email_records_are_not_reinterpreted_or_extended(runtime):
    email = runtime.history.create("ovh", "456:17", "outer@example.test", "old.csv", "a" * 64)
    before = json.loads(runtime.history.path.read_text())[0]
    manual = accept(runtime)
    persisted = IngestionHistory().records()
    assert persisted[0] == before == email
    assert "owner_sailor_id" not in persisted[0] and "operation_id" not in persisted[0]
    assert runtime.history.find_provider_message("ovh", "456:17") == email
    assert persisted[1]["id"] == manual["id"]
    assert runtime.history.fail_interrupted_manual() == []  # Pending is not interrupted.
    assert runtime.history.get(manual["id"])["status"] == "pending"


@pytest.mark.parametrize("field,value", [
    ("owner_sailor_id", "30000000-0000-4000-8000-000000000099"),
    ("provider", "ovh"), ("sender_email", "invented@example.test"),
    ("provider_message_id", "456:1"), ("session_result_notification_candidate", True),
    ("attachment_sha256", "a" * 64),
])
def test_manual_identity_and_suppression_cannot_be_reassigned(runtime, field, value):
    record = accept(runtime)
    with pytest.raises(ValueError):
        runtime.history.replace({**record, field: value})
    assert runtime.history.get(record["id"]) == record


def test_email_entrypoint_cannot_fabricate_manual_provenance(runtime):
    with pytest.raises(ValueError, match="cannot be processed as email"):
        processing.process_provider_email(
            ADMIN_UPLOAD, InboundEmail(runtime.sailor.email, "fake", "track.gpx", gpx_bytes(), "fake-id"),
            runtime.sailors, runtime.boats, runtime.activities, runtime.sessions, runtime.history,
        )
    assert runtime.history.records() == []


def test_preservation_failure_does_not_acknowledge_pending_ingestion(runtime, monkeypatch):
    def fail(*args):
        raise OSError("Synthetic preservation failure")

    monkeypatch.setattr(IngestionOriginalStorage, "preserve", fail)
    with pytest.raises(OSError):
        accept(runtime)
    assert runtime.history.records() == []


def test_history_write_failure_preserves_previous_committed_collection(runtime, monkeypatch):
    first = accept(runtime)
    committed = runtime.history.path.read_bytes()

    def fail(*args):
        raise OSError("Synthetic atomic replacement failure")

    monkeypatch.setattr("app.services.ingestion_history.os.replace", fail)
    with pytest.raises(OSError):
        accept(runtime)
    assert runtime.history.path.read_bytes() == committed
    assert IngestionHistory().records() == [first]
    assert not list(runtime.root.glob(".ingestion_history.json.*.tmp"))


@pytest.mark.parametrize("filename", ["track.csv", "track.CSV.GZ", "track.GPX", "track.vkx", "track.VKX.GZ"])
def test_manual_formats_use_delivered_parsers(runtime, filename, vakaros_vkx_bytes):
    if ".csv" in filename.lower():
        content = (Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz").read_bytes()
        if not filename.lower().endswith(".gz"):
            content = gzip.decompress(content)
    elif ".vkx" in filename.lower():
        content = gzip.compress(vakaros_vkx_bytes) if filename.lower().endswith(".gz") else vakaros_vkx_bytes
    else:
        content = gpx_bytes()
    completed = process(runtime, accept(runtime, content, filename))
    assert completed["status"] == "processed"
    assert list(TrackStorage().read_normalized_track(completed["activity_id"]).columns) == CANONICAL_TRACK_COLUMNS
    assert_silent(runtime, completed)
