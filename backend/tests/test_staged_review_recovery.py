"""Recovery through the gated scheduled/Admin mailbox review entry point."""

import json
from dataclasses import replace
from pathlib import Path

import pytest

from app.email_providers.ovh import (
    OVHAcquisitionBatch, OVHAttachmentOccurrence, OVHExaminedMessage,
    OVHMessageOutcome, OVHStagedMail,
)
from app.models import ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.sailors import SailorRepository
from app.services.ingestion_history import IngestionHistory
from app.services.mail_receipts import MailReceiptStore
from app.services.mailbox_review import MailboxReviewError, review_mailbox_now
from app.services.ovh_mailbox_cursor import OVHMailboxCursor, OVHMailboxCursorStore
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.staged_mail_acquisition import stage_ovh_mailbox_now
from app.repositories.sessions import SessionRepository
from scripts.migrate_ingestion_history_v2 import check, verify


GPX = (Path(__file__).parent / "fixtures" / "2025-06-21-ESP30782-P01.gpx").read_bytes()


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    monkeypatch.setenv("TACKBAR_OVH_STAGED_MAIL_ENABLED", "1")
    monkeypatch.setenv("TACKBAR_PUBLIC_BASE_URL", "https://app.example.test")
    from app.services import ingestion_processing

    class NoEnrichment:
        def enrich_new_session_context(self, _session_id):
            pass

    monkeypatch.setattr(ingestion_processing, "automatic_session_enrichment_service", lambda *_: NoEnrichment())
    sent = []
    monkeypatch.setattr("app.services.mail_feedback._send", sent.append)
    sailor, _ = SailorRepository().find_or_create_by_email("sailor@example.test")
    sailors = SailorRepository()
    sailors.replace(replace(sailor, consent_status=ConsentStatus.ACTIVE))
    PersonalCapabilityService(sailors, SessionRepository()).regenerate_capability(sailor.id)
    return tmp_path, sent


def _provider(*mails):
    examined = tuple(
        OVHExaminedMessage(int(mail.provider_message_id.split(":")[1]), None, OVHMessageOutcome.SUPPORTED, staged_mail=mail)
        for mail in mails
    )

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity, *, staged):
            assert staged is True
            return OVHAcquisitionBatch(456, examined)

    return Provider()


def _mail(uid, *names):
    return OVHStagedMail(
        f"456:{uid}", "sailor@example.test", None,
        tuple(OVHAttachmentOccurrence(index, name, GPX) for index, name in enumerate(names, 1)),
    )


def test_gated_review_recovers_receipt_before_first_child_without_history(runtime, monkeypatch):
    root, sent = runtime
    provider = _provider(_mail(1, "race.gpx"))
    original_create = IngestionHistory.create
    once = True

    def interrupt(self, *args, **kwargs):
        nonlocal once
        if once:
            once = False
            raise OSError("interrupted before child")
        return original_create(self, *args, **kwargs)

    monkeypatch.setattr(IngestionHistory, "create", interrupt)
    with pytest.raises(MailboxReviewError, match="incomplete"):
        review_mailbox_now(provider)
    history = IngestionHistory()
    receipt = MailReceiptStore(history.path).get("ovh", "456:1")
    assert not history.path.exists()
    assert receipt["receipt_state"] == "incomplete" and receipt["attachment_ingestion_ids"] == []
    receipt_bytes = MailReceiptStore(history.path).path.read_bytes()
    assert verify(history.path)["stored_receipts"] == 1
    assert not history.path.exists() and MailReceiptStore(history.path).path.read_bytes() == receipt_bytes
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 0)
    summary = review_mailbox_now(provider)
    records = history.find_mail_attachments("ovh", "456:1")
    assert summary.staged_mode and summary.processed == 1
    assert len(records) == 1 and records[0]["attachment_ordinal"] == 1
    assert records[0]["status"] == "processed" and records[0]["attempts"] == 1
    assert MailReceiptStore(history.path).get("ovh", "456:1")["attachment_ingestion_ids"] == [records[0]["id"]]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 1)
    assert len(sent) == 1
    review_mailbox_now(provider)
    assert len(sent) == 1 and len(history.records()) == 1


def test_gated_review_recovers_child_before_receipt_append(runtime, monkeypatch):
    _, sent = runtime
    provider = _provider(_mail(1, "first.gpx", "second.gpx"))
    original_replace = MailReceiptStore.replace
    once = True

    def interrupt(self, replacement):
        nonlocal once
        if once and replacement["receipt_state"] == "incomplete" and replacement["attachment_ingestion_ids"]:
            once = False
            raise OSError("interrupted before receipt append")
        return original_replace(self, replacement)

    monkeypatch.setattr(MailReceiptStore, "replace", interrupt)
    with pytest.raises(MailboxReviewError, match="incomplete"):
        review_mailbox_now(provider)
    history = IngestionHistory()
    first = history.find_mail_attachments("ovh", "456:1")[0]
    assert MailReceiptStore(history.path).get("ovh", "456:1")["attachment_ingestion_ids"] == []
    before = (history.path.read_bytes(), MailReceiptStore(history.path).path.read_bytes())
    assert verify(history.path)["stored_receipts"] == 1
    assert before == (history.path.read_bytes(), MailReceiptStore(history.path).path.read_bytes())
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 0)
    review_mailbox_now(provider)
    records = history.find_mail_attachments("ovh", "456:1")
    assert len(records) == 2 and records[0]["id"] == first["id"]
    assert [record["status"] for record in records] == ["processed", "processed"]
    assert all(record["attempts"] == 1 for record in records)
    assert MailReceiptStore(history.path).get("ovh", "456:1")["attachment_ingestion_ids"] == [record["id"] for record in records]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 1)
    assert len(ActivityRepository().all()) == 1 and len(sent) == 1
    review_mailbox_now(provider)
    assert len(sent) == 1 and [record["id"] for record in history.records()] == [record["id"] for record in records]


@pytest.mark.parametrize("damage", ["missing", "sha_mismatch"])
def test_gated_review_isolates_corrupt_pending_original_across_mails(runtime, damage):
    root, sent = runtime
    provider = _provider(_mail(1, "bad.gpx", "healthy.gpx"), _mail(2, "other.gpx"))
    stage_ovh_mailbox_now(provider)
    history = IngestionHistory()
    records = history.find_mail_attachments("ovh", "456:1")
    original = root / records[0]["original_file"]
    if damage == "missing":
        original.unlink()
    else:
        original.write_bytes(b"different bytes")
    before = (history.path.read_bytes(), MailReceiptStore(history.path).path.read_bytes())
    assert verify(history.path)["stored_receipts"] == 2
    assert check(history.path)["missing_ids"] == 0
    assert before == (history.path.read_bytes(), MailReceiptStore(history.path).path.read_bytes())
    summary = review_mailbox_now(provider)
    first = history.find_mail_attachments("ovh", "456:1")
    second = history.find_mail_attachments("ovh", "456:2")
    assert summary.failed == 1 and summary.processed == 2
    assert [item["status"] for item in first + second] == ["failed", "processed", "processed"]
    assert all(item["attempts"] == 1 for item in first + second)
    assert first[0]["activity_id"] is None and first[0]["session_id"] is None
    assert first[0]["last_error"] and first[0]["original_file"] == records[0]["original_file"]
    if damage == "missing":
        assert not original.exists()
    else:
        assert original.read_bytes() == b"different bytes"
    assert len(ActivityRepository().all()) == 1
    assert len(sent) == 2
    assert all(MailReceiptStore(history.path).get("ovh", f"456:{uid}")["feedback_state"] == "sent" for uid in (1, 2))
    review_mailbox_now(provider)
    assert len(sent) == 2
    assert [item["attempts"] for item in history.records()] == [1, 1, 1]


@pytest.mark.parametrize("damage", ["missing_receipt", "reordered_members", "invalid_state"])
def test_gated_review_rejects_structural_corruption_before_acquisition(runtime, damage):
    _, sent = runtime
    provider = _provider(_mail(1, "first.gpx", "second.gpx"))
    stage_ovh_mailbox_now(provider)
    history = IngestionHistory()
    receipt_path = MailReceiptStore(history.path).path
    if damage == "missing_receipt":
        receipt_path.unlink()
    else:
        data = json.loads(receipt_path.read_text(encoding="utf-8"))
        receipt = data["receipts"][0]
        if damage == "reordered_members":
            receipt["attachment_ingestion_ids"].reverse()
        else:
            receipt["receipt_state"] = "invalid"
        receipt_path.write_text(json.dumps(data), encoding="utf-8")
    before_history = history.path.read_bytes()
    before_receipt = receipt_path.read_bytes() if receipt_path.exists() else None
    before_cursor = OVHMailboxCursorStore().path.read_bytes()

    class ForbiddenProvider:
        def acquire_messages(self, *_args, **_kwargs):
            pytest.fail("Acquisition ran before integrity verification")

    with pytest.raises(MailboxReviewError, match="verified migration"):
        review_mailbox_now(ForbiddenProvider())
    assert history.path.read_bytes() == before_history
    assert (receipt_path.read_bytes() if receipt_path.exists() else None) == before_receipt
    assert OVHMailboxCursorStore().path.read_bytes() == before_cursor
    assert sent == []
