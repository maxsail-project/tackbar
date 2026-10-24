"""Internal staged OVH first processing remains separate from mailbox review."""

from dataclasses import replace
from hashlib import sha256
from pathlib import Path

import pytest

from app.email_providers.ovh import (
    OVHAcquisitionBatch, OVHAttachmentOccurrence, OVHExaminedMessage,
    OVHMessageOutcome, OVHStagedMail,
)
from app.models import ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services import ingestion_processing as processing
from app.services.ingestion_history import IngestionHistory, STAGED_MAIL_INTERRUPTED
from app.services.mail_receipts import MailReceiptStore
from app.services.mailbox_review import MailboxReviewError
from app.services.ovh_mailbox_cursor import OVHMailboxCursor, OVHMailboxCursorStore
from app.services.staged_mail_acquisition import recover_unattempted_ingestions, stage_ovh_mailbox_now
from app.storage.ingestion_original_storage import IngestionOriginalStorage
from scripts.migrate_ingestion_history_v2 import check, verify


FIXTURES = Path(__file__).parent / "fixtures"
GPX = (FIXTURES / "2025-06-21-ESP30782-P01.gpx").read_bytes()
VAKAROS = (FIXTURES / "vakaros-demo.csv.gz").read_bytes()


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")

    class NoEnrichment:
        def enrich_new_session_context(self, _session_id):
            pass

    monkeypatch.setattr(processing, "automatic_session_enrichment_service", lambda *_: NoEnrichment())
    return (
        SailorRepository(), BoatRepository(), ActivityRepository(),
        SessionRepository(), IngestionHistory(),
    )


def _stage(attachments, sender="sailor@example.test"):
    mail = OVHStagedMail(
        "456:1", sender, None,
        tuple(OVHAttachmentOccurrence(index, name, content) for index, (name, content) in enumerate(attachments, 1)),
    )
    examined = OVHExaminedMessage(1, None, OVHMessageOutcome.SUPPORTED, staged_mail=mail)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity, *, staged):
            assert staged
            return OVHAcquisitionBatch(456, (examined,))

    return Provider()


def _process(record, runtime):
    return processing.process_staged_ingestion(record["id"], *runtime)


def _forbid_outbound(monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("staged processing reached a legacy delivery path")

    monkeypatch.setattr(processing.AutomaticConsentRequestService, "attempt_for_sailor", forbidden)
    monkeypatch.setattr(processing.SessionResultDeliveryService, "attempt_for_new_activity", forbidden)


@pytest.mark.parametrize("count", [1, 6, 9])
def test_each_staged_track_processes_independently_after_cursor_advance(runtime, monkeypatch, count):
    _forbid_outbound(monkeypatch)
    sources = [("same.gpx", GPX), ("race.csv.gz", VAKAROS), ("broken.gpx", b"bad GPX")]
    attachments = [sources[index % len(sources)] for index in range(count)]
    stage_ovh_mailbox_now(_stage(attachments))
    sailors, boats, activities, sessions, history = runtime
    records = recover_unattempted_ingestions(history.path)
    assert len(records) == count
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 1)
    results = [_process(record, runtime) for record in records]
    assert [result["status"] for result in results] == [
        "failed" if name == "broken.gpx" else "processed" for name, _ in attachments
    ]
    assert all(result["attempts"] == 1 for result in results)
    assert [result["attachment_ordinal"] for result in results] == list(range(1, count + 1))
    assert [result["attachment_name"] for result in results] == [name for name, _ in attachments]
    assert all((history.path.parent / result["original_file"]).read_bytes() == content for result, (_, content) in zip(results, attachments))
    assert all(result["session_result_notification_candidate"] is False and result["session_result_notification"] is None for result in results)
    assert len(activities.all()) == len({sha256(content).hexdigest() for name, content in attachments if name != "broken.gpx"})
    assert all(result["activity_id"] is not None and result["session_id"] is not None for result in results if result["status"] == "processed")
    assert recover_unattempted_ingestions(history.path) == []
    assert not (history.path.parent / "consent_requests.json").exists()
    receipt = MailReceiptStore(history.path).get("ovh", "456:1")
    assert receipt["receipt_state"] == "complete" and receipt["feedback_attempts"] == []
    assert _process(records[0], runtime) == results[0]
    if count > 2:
        assert _process(records[2], runtime) == results[2]
    if count > 3:
        assert results[0]["activity_id"] == results[3]["activity_id"]
        assert results[0]["activity_created_by_ingestion"] is True
        assert results[3]["activity_created_by_ingestion"] is False
    assert results[0]["pending_onboarding_reservation"] is not None
    assert sum(result["pending_onboarding_reservation"] is not None for result in results) == 1
    assert sailors.find_by_email("sailor@example.test").consent_status == ConsentStatus.PENDING
    assert sessions.all()


@pytest.mark.parametrize("initial_status", [ConsentStatus.ACTIVE, ConsentStatus.REVOKED])
def test_staged_processing_preserves_consent_state_and_explicit_reprocess_is_silent(runtime, monkeypatch, initial_status):
    _forbid_outbound(monkeypatch)
    sailors, boats, activities, sessions, history = runtime
    sailor, _ = sailors.find_or_create_by_email("sailor@example.test")
    sailors.replace(replace(sailor, consent_status=initial_status))
    stage_ovh_mailbox_now(_stage([("race.gpx", GPX)]))
    first = _process(recover_unattempted_ingestions(history.path)[0], runtime)
    assert first["status"] == "processed"
    assert first["session_result_notification_candidate"] is False
    assert first["session_result_notification"] is None
    assert sailors.get_by_id(sailor.id).consent_status == (
        ConsentStatus.ACTIVE if initial_status == ConsentStatus.ACTIVE else ConsentStatus.PENDING
    )
    matched = sessions.get_by_id(first["session_id"])
    assert (matched.capability_token is not None) == (initial_status == ConsentStatus.ACTIVE)
    assert not (history.path.parent / "consent_requests.json").exists()
    again = processing.reprocess_ingestion(first["id"], *runtime)
    assert again["status"] == "processed" and again["attempts"] == 2
    assert again["activity_id"] == first["activity_id"]
    assert again["activity_created_by_ingestion"] is True
    assert again["session_result_notification_candidate"] is False
    assert not (history.path.parent / "consent_requests.json").exists()
    assert len(activities.all()) == 1


def test_incomplete_receipt_does_not_allow_first_processing(runtime):
    _, _, _, _, history = runtime
    original = IngestionOriginalStorage(history.path.parent)
    record = history.create("ovh", "456:1", "sailor@example.test", "race.gpx", sha256(GPX).hexdigest(), attachment_ordinal=1, status="pending")
    record["original_file"] = original.preserve(record["id"], "race.gpx", GPX)
    history.replace(record)
    MailReceiptStore(history.path).add({
        "provider": "ovh", "provider_message_id": "456:1", "receipt_state": "incomplete",
        "attachment_ingestion_ids": [record["id"]], "feedback_state": "unreserved", "feedback_attempts": [],
    })
    with pytest.raises(ValueError, match="incomplete"):
        _process(record, runtime)
    assert history.get(record["id"])["status"] == "pending"


def test_invalid_staged_track_does_not_create_sailor_or_send(runtime, monkeypatch):
    _forbid_outbound(monkeypatch)
    stage_ovh_mailbox_now(_stage([("broken.gpx", b"not GPX")]))
    failed = _process(recover_unattempted_ingestions()[0], runtime)
    assert failed["status"] == "failed" and failed["attempts"] == 1
    assert failed["activity_id"] is None and failed["session_id"] is None
    assert runtime[0].all() == [] and runtime[2].all() == []
    assert not (runtime[-1].path.parent / "consent_requests.json").exists()


def test_claim_failure_keeps_unattempted_work_recoverable(runtime, monkeypatch):
    stage_ovh_mailbox_now(_stage([("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    history = runtime[-1]
    original_replace = IngestionHistory.replace

    def interrupted(self, replacement):
        if replacement["status"] == "processing":
            raise OSError("claim interrupted")
        return original_replace(self, replacement)

    monkeypatch.setattr(IngestionHistory, "replace", interrupted)
    with pytest.raises(OSError, match="claim interrupted"):
        _process(record, runtime)
    assert history.get(record["id"])["status"] == "pending"
    assert history.get(record["id"])["attempts"] == 0
    assert [item["id"] for item in recover_unattempted_ingestions()] == [record["id"]]


def test_staged_history_requires_claimed_attempt_before_terminal_result(runtime):
    stage_ovh_mailbox_now(_stage([("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    history = runtime[-1]
    with pytest.raises(ValueError, match="transition"):
        history.replace({**record, "status": "processed", "activity_id": "unclaimed"})
    with pytest.raises(ValueError, match="attempt"):
        history.replace({
            **record, "status": "processing", "session_result_notification_candidate": False,
            "attempts": 2, "last_attempt_at": "2026-10-24T00:00:00+00:00",
        })
    assert history.get(record["id"])["status"] == "pending"


def test_original_read_failure_becomes_terminal_without_retry(runtime, monkeypatch):
    stage_ovh_mailbox_now(_stage([("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]

    def interrupted(*_args):
        raise OSError("original read interrupted")

    monkeypatch.setattr(IngestionOriginalStorage, "read", interrupted)
    failed = _process(record, runtime)
    assert failed["status"] == "failed" and failed["attempts"] == 1
    assert _process(record, runtime) == failed
    assert recover_unattempted_ingestions() == []
    assert runtime[2].all() == []


def test_explicit_reprocess_original_read_failure_is_terminal(runtime, monkeypatch):
    stage_ovh_mailbox_now(_stage([("broken.gpx", b"not GPX")]))
    record = recover_unattempted_ingestions()[0]
    assert _process(record, runtime)["status"] == "failed"

    def unreadable(*_args):
        raise OSError("preserved original unreadable")

    monkeypatch.setattr(IngestionOriginalStorage, "read", unreadable)
    failed = processing.reprocess_ingestion(record["id"], *runtime)
    assert failed["status"] == "failed" and failed["attempts"] == 2
    assert "unreadable" in failed["last_error"]
    assert _process(record, runtime) == failed
    assert recover_unattempted_ingestions() == []


def test_capability_interruption_precedes_terminal_result(runtime, monkeypatch):
    _forbid_outbound(monkeypatch)
    sailors, _, activities, sessions, history = runtime
    sailor, _ = sailors.find_or_create_by_email("sailor@example.test")
    sailors.replace(replace(sailor, consent_status=ConsentStatus.ACTIVE))
    stage_ovh_mailbox_now(_stage([("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    original_ensure = processing.SessionCapabilityService.ensure_for_session

    def interrupted(*_args):
        raise KeyboardInterrupt("capability interrupted")

    monkeypatch.setattr(processing.SessionCapabilityService, "ensure_for_session", interrupted)
    with pytest.raises(KeyboardInterrupt, match="capability interrupted"):
        _process(record, runtime)
    monkeypatch.setattr(processing.SessionCapabilityService, "ensure_for_session", original_ensure)
    assert history.get(record["id"])["status"] == "processing"
    assert len(activities.all()) == 1
    assert sessions.all()[0].capability_token is None
    assert recover_unattempted_ingestions() == []
    assert history.get(record["id"])["status"] == "failed"
    repaired = processing.reprocess_ingestion(record["id"], *runtime)
    assert repaired["status"] == "processed" and repaired["attempts"] == 2
    assert len(activities.all()) == 1
    assert sessions.get_by_id(repaired["session_id"]).capability_token is not None


def test_hard_interruption_during_original_read_requires_explicit_reprocess(runtime, monkeypatch):
    stage_ovh_mailbox_now(_stage([("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    original_read = IngestionOriginalStorage.read

    def interrupted(*_args):
        raise KeyboardInterrupt("read interrupted")

    monkeypatch.setattr(IngestionOriginalStorage, "read", interrupted)
    with pytest.raises(KeyboardInterrupt):
        _process(record, runtime)
    monkeypatch.setattr(IngestionOriginalStorage, "read", original_read)
    assert runtime[-1].get(record["id"])["status"] == "processing"
    assert recover_unattempted_ingestions() == []
    assert runtime[-1].get(record["id"])["last_error"] == STAGED_MAIL_INTERRUPTED
    assert runtime[2].all() == []
    assert _process(record, runtime)["status"] == "failed"
    repaired = processing.reprocess_ingestion(record["id"], *runtime)
    assert repaired["status"] == "processed" and repaired["attempts"] == 2
    assert repaired["activity_created_by_ingestion"] is None


@pytest.mark.parametrize("point", ["activity", "final_status"])
def test_interrupted_started_attempt_is_reconciled_without_replay(runtime, monkeypatch, point):
    _forbid_outbound(monkeypatch)
    stage_ovh_mailbox_now(_stage([("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    if point == "activity":
        original = ActivityRepository.find_or_create

        def interrupted(self, *args):
            original(self, *args)
            raise KeyboardInterrupt("after Activity persistence")

        monkeypatch.setattr(ActivityRepository, "find_or_create", interrupted)
    else:
        original = IngestionHistory.replace

        def interrupted(self, replacement):
            if replacement["status"] == "processed":
                raise KeyboardInterrupt("before final status write")
            return original(self, replacement)

        monkeypatch.setattr(IngestionHistory, "replace", interrupted)
    with pytest.raises(KeyboardInterrupt):
        _process(record, runtime)
    assert runtime[-1].get(record["id"])["status"] == "processing"
    assert check(runtime[-1].path)["ingestions"] == 1
    assert verify(runtime[-1].path)["stored_receipts"] == 1
    assert len(runtime[2].all()) == 1
    if point == "activity":
        monkeypatch.setattr(ActivityRepository, "find_or_create", original)
    else:
        monkeypatch.setattr(IngestionHistory, "replace", original)
    assert recover_unattempted_ingestions() == []
    failed = runtime[-1].get(record["id"])
    assert failed["status"] == "failed" and failed["attempts"] == 1
    assert failed["last_error"] == STAGED_MAIL_INTERRUPTED
    assert _process(record, runtime) == failed
    assert len(runtime[2].all()) == 1
    repaired = processing.reprocess_ingestion(record["id"], *runtime)
    assert repaired["status"] == "processed" and repaired["attempts"] == 2
    assert len(runtime[2].all()) == 1
    assert repaired["activity_id"] == runtime[2].all()[0].id
    if point == "activity":
        assert repaired["activity_created_by_ingestion"] is None
    else:
        assert repaired["activity_created_by_ingestion"] is True
    assert repaired["session_result_notification_candidate"] is False


def test_complete_receipt_rereview_accepts_processed_child_and_rejects_corrupt_original(runtime, monkeypatch):
    provider = _stage([("race.gpx", GPX), ("bad.gpx", b"not GPX")])
    original_write = OVHMailboxCursorStore.write
    fail_once = True

    def interrupted(self, cursor):
        nonlocal fail_once
        if fail_once:
            fail_once = False
            raise OSError("cursor interrupted")
        return original_write(self, cursor)

    monkeypatch.setattr(OVHMailboxCursorStore, "write", interrupted)
    with pytest.raises(MailboxReviewError, match="cursor"):
        stage_ovh_mailbox_now(provider)
    records = recover_unattempted_ingestions()
    record = records[0]
    processed = _process(record, runtime)
    failed = _process(records[1], runtime)
    assert processed["status"] == "processed"
    assert failed["status"] == "failed"
    stage_ovh_mailbox_now(provider)
    assert runtime[-1].get(record["id"])["attempts"] == 1
    assert runtime[-1].get(records[1]["id"])["attempts"] == 1
    original_write(OVHMailboxCursorStore(), OVHMailboxCursor(456, 0))
    (runtime[-1].path.parent / processed["original_file"]).write_bytes(b"corrupt")
    with pytest.raises(MailboxReviewError, match="incomplete"):
        stage_ovh_mailbox_now(provider)
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 0)


def test_interruption_after_terminal_write_does_not_replay(runtime, monkeypatch):
    stage_ovh_mailbox_now(_stage([("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    original_replace = IngestionHistory.replace

    def interrupted(self, replacement):
        result = original_replace(self, replacement)
        if replacement["status"] == "processed":
            raise KeyboardInterrupt("after final status write")
        return result

    monkeypatch.setattr(IngestionHistory, "replace", interrupted)
    with pytest.raises(KeyboardInterrupt):
        _process(record, runtime)
    monkeypatch.setattr(IngestionHistory, "replace", original_replace)
    terminal = runtime[-1].get(record["id"])
    assert terminal["status"] == "processed" and terminal["attempts"] == 1
    assert recover_unattempted_ingestions() == []
    assert _process(record, runtime) == terminal
    assert len(runtime[2].all()) == 1
