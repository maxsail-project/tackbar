import json
from pathlib import Path

import pytest
from scripts import migrate_ingestion_history_v2 as migration

from app.services.ingestion_history import IngestionHistory
from app.services.mail_receipts import MailReceiptStore
from app.storage.ingestion_original_storage import IngestionOriginalStorage
from scripts.migrate_ingestion_history_v2 import check, migrate, verify


def _legacy(id: str, provider: str = "ovh", message: str = "456:1") -> dict:
    return {
        "id": id, "provider": provider, "provider_message_id": message,
        "sender_email": "sailor@example.test", "received_at": "2026-01-01T00:00:00+00:00",
        "attachment_name": "same.gpx", "attachment_sha256": "a" * 64,
        "original_file": f"originals/ingestions/{id}/same.gpx",
        "status": "processed", "disposition": "discarded", "attempts": 1,
        "last_attempt_at": "2026-01-01T00:00:01+00:00", "last_error": None,
        "activity_id": "activity-1", "session_id": "session-1",
        "activity_created_by_ingestion": True,
        "session_result_notification_candidate": True,
        "session_result_notification": {
            "status": "sent", "attempted_at": "2026-01-01T00:00:02+00:00",
            "sent_at": "2026-01-01T00:00:03+00:00", "last_error": None,
        },
        "pending_onboarding_reservation": None,
    }


def _write(path: Path, records: list[dict]) -> None:
    path.write_text(json.dumps(records), encoding="utf-8")


def test_two_equal_attachment_occurrences_keep_distinct_ids(tmp_path):
    history = IngestionHistory(tmp_path / "ingestion_history.json")
    first = history.create("ovh", "456:1", "sailor@example.test", "same.gpx", "a" * 64, attachment_ordinal=2)
    second = history.create("ovh", "456:1", "sailor@example.test", "same.gpx", "a" * 64, attachment_ordinal=3)
    assert first["id"] != second["id"]
    assert history.find_mail_attachment("ovh", "456:1", 2) == first
    assert history.find_mail_attachment("ovh", "456:1", 3) == second
    assert history.find_mail_attachments("ovh", "456:1") == [first, second]
    originals = IngestionOriginalStorage(tmp_path)
    first_original = originals.preserve(first["id"], "same.gpx", b"identical bytes")
    second_original = originals.preserve(second["id"], "same.gpx", b"identical bytes")
    assert first_original != second_original
    assert originals.read(first_original) == originals.read(second_original) == b"identical bytes"
    with pytest.raises(ValueError, match="already exists"):
        history.create("ovh", "456:1", "sailor@example.test", "same.gpx", "a" * 64, attachment_ordinal=2)
    with pytest.raises(ValueError, match="immutable"):
        history.replace({**first, "attachment_ordinal": 4})
    assert len(IngestionHistory(history.path).records()) == 2


def test_mail_receipt_has_independent_state_and_unique_mail_identity(tmp_path):
    store = MailReceiptStore(tmp_path / "ingestion_history.json")
    receipt = {
        "provider": "ovh", "provider_message_id": "456:1",
        "receipt_state": "incomplete", "attachment_ingestion_ids": [],
        "feedback_state": "unreserved", "feedback_attempts": [],
    }
    store.add(receipt)
    assert store.get("ovh", "456:1") == receipt
    with pytest.raises(ValueError, match="already exists"):
        store.add(receipt)
    assert len(store.receipts()) == 1
    with pytest.raises(ValueError, match="Malformed mail receipt"):
        store.add({**receipt, "provider": "admin_upload"})


def test_check_is_byte_and_filesystem_read_only_then_migration_is_idempotent(tmp_path):
    path = tmp_path / "ingestion_history.json"
    old = _legacy("record-1")
    gmail = {"provider": "gmail", "provider_message_id": "gmail-1", "status": "failed", "processed_at": "2025-01-01T00:00:00+00:00", "activity_id": None}
    _write(path, [old, gmail])
    original = tmp_path / "originals" / "ingestions" / "record-1" / "same.gpx"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"original bytes")
    cursor = tmp_path / "ovh_mailbox_cursor.json"
    cursor.write_bytes(b'{"uidvalidity": 456, "last_seen_uid": 99}\n')
    before = {p.relative_to(tmp_path): p.read_bytes() for p in tmp_path.rglob("*") if p.is_file()}
    assert check(path)["missing_ids"] == 1
    after = {p.relative_to(tmp_path): p.read_bytes() for p in tmp_path.rglob("*") if p.is_file()}
    assert after == before
    assert migrate(path)["history_changed"]
    first_bytes = path.read_bytes()
    receipt_bytes = MailReceiptStore(path).path.read_bytes()
    migrated = IngestionHistory(path).records()
    assert migrated[0]["id"] == old["id"]
    assert migrated[0]["original_file"] == old["original_file"]
    assert migrated[0]["activity_id"] == old["activity_id"]
    assert migrated[0]["session_id"] == old["session_id"]
    assert migrated[0]["disposition"] == old["disposition"]
    assert migrated[0]["session_result_notification"] == old["session_result_notification"]
    assert migrated[0]["attachment_ordinal"] == 1
    assert migrated[0]["attachment_ordinal_verified"] is False
    assert migrated[1]["id"] and migrated[1]["provider"] == "gmail"
    assert all(r["feedback_state"] == "legacy_suppressed" for r in MailReceiptStore(path).receipts())
    assert original.read_bytes() == b"original bytes"
    assert cursor.read_bytes() == b'{"uidvalidity": 456, "last_seen_uid": 99}\n'
    after_first = {p.relative_to(tmp_path): p.read_bytes() for p in tmp_path.rglob("*") if p.is_file()}
    assert not migrate(path)["history_changed"]
    assert verify(path)["stored_receipts"] == 2
    assert path.read_bytes() == first_bytes
    assert MailReceiptStore(path).path.read_bytes() == receipt_bytes
    assert {p.relative_to(tmp_path): p.read_bytes() for p in tmp_path.rglob("*") if p.is_file()} == after_first


def test_migration_preserves_onboarding_reservation_and_manual_upload(tmp_path):
    path = tmp_path / "ingestion_history.json"
    mail = _legacy("record-1")
    mail["pending_onboarding_reservation"] = {
        "sailor_id": "30000000-0000-4000-8000-000000000001",
        "consent_cycle_sequence": 2,
        "activity_id": "10000000-0000-4000-8000-000000000001",
        "session_id": "20000000-0000-4000-8000-000000000001",
    }
    manual_id = "50000000-0000-4000-8000-000000000001"
    manual = {
        "id": manual_id, "operation_id": manual_id, "provider": "admin_upload",
        "owner_sailor_id": "30000000-0000-4000-8000-000000000001",
        "provider_message_id": None, "sender_email": None, "received_at": None,
        "accepted_at": "2026-01-01T00:00:00+00:00", "attachment_name": "same.gpx",
        "attachment_sha256": "a" * 64,
        "original_file": f"originals/ingestions/{manual_id}/same.gpx",
        "status": "pending", "disposition": "active", "attempts": 0,
        "last_attempt_at": None, "last_error": None, "activity_id": None,
        "session_id": None, "activity_created_by_ingestion": None,
        "session_result_notification_candidate": False,
        "session_result_notification": None, "pending_onboarding_reservation": None,
    }
    _write(path, [mail, manual])
    migrate(path)
    records = IngestionHistory(path).records()
    assert records[0]["pending_onboarding_reservation"] == mail["pending_onboarding_reservation"]
    assert records[1] == manual
    assert len(MailReceiptStore(path).receipts()) == 1


def test_verify_detects_receipt_identity_tampering(tmp_path):
    path = tmp_path / "ingestion_history.json"
    _write(path, [_legacy("record-1")])
    migrate(path)
    receipt_file = MailReceiptStore(path).path
    data = json.loads(receipt_file.read_text(encoding="utf-8"))
    data["receipts"][0]["attachment_ingestion_ids"] = ["other"]
    receipt_file.write_text(json.dumps(data), encoding="utf-8")
    before = receipt_file.read_bytes()
    with pytest.raises(ValueError, match="conflicts"):
        verify(path)
    assert receipt_file.read_bytes() == before


def test_verify_accepts_only_ordered_incomplete_prefix_without_writing(tmp_path):
    path = tmp_path / "ingestion_history.json"
    store = MailReceiptStore(path)
    receipt = {
        "provider": "ovh", "provider_message_id": "456:1",
        "receipt_state": "incomplete", "attachment_ingestion_ids": [],
        "feedback_state": "unreserved", "feedback_attempts": [],
    }
    store.add(receipt)
    before = store.path.read_bytes()
    assert verify(path)["stored_receipts"] == 1
    assert not path.exists() and store.path.read_bytes() == before
    history = IngestionHistory(path)
    first = history.create("ovh", "456:1", "sailor@example.test", "one.gpx", "a" * 64, attachment_ordinal=1, status="pending")
    second = history.create("ovh", "456:1", "sailor@example.test", "two.gpx", "b" * 64, attachment_ordinal=2, status="pending")
    store.replace({**receipt, "attachment_ingestion_ids": [first["id"]]})
    history_before, receipt_before = path.read_bytes(), store.path.read_bytes()
    assert verify(path)["stored_receipts"] == 1
    assert path.read_bytes() == history_before and store.path.read_bytes() == receipt_before
    for ids in ([second["id"]], [first["id"], "phantom"]):
        store.replace({**receipt, "attachment_ingestion_ids": ids})
        with pytest.raises(ValueError, match="conflicts"):
            verify(path)
    store.replace({**receipt, "attachment_ingestion_ids": [first["id"]]})
    store.replace({**receipt, "receipt_state": "complete", "attachment_ingestion_ids": [first["id"]]})
    with pytest.raises(ValueError, match="conflicts"):
        verify(path)


def test_verify_rejects_missing_verified_receipt_and_unmigrated_mail(tmp_path):
    path = tmp_path / "ingestion_history.json"
    IngestionHistory(path).create("ovh", "456:1", "sailor@example.test", "one.gpx", "a" * 64, attachment_ordinal=1, status="pending")
    with pytest.raises(ValueError, match="receipt"):
        verify(path)
    _write(path, [_legacy("old")])
    with pytest.raises(ValueError, match="Unmigrated"):
        verify(path)


def test_receipt_write_failure_restores_original_history(tmp_path, monkeypatch):
    path = tmp_path / "ingestion_history.json"
    _write(path, [_legacy("record-1")])
    before = path.read_bytes()

    original_write = migration.write_receipts

    def fail(receipt_path, receipts):
        original_write(receipt_path, receipts)
        raise OSError("simulated receipt write failure")

    monkeypatch.setattr(migration, "write_receipts", fail)
    with pytest.raises(OSError, match="receipt write failure"):
        migrate(path)
    assert path.read_bytes() == before
    assert not MailReceiptStore(path).path.exists()


@pytest.mark.parametrize("records", [
    [_legacy("same"), _legacy("same", message="456:2")],
    [_legacy("one"), _legacy("two")],
    [{**_legacy("one"), "status": "unknown"}],
    [{**_legacy("one"), "attachment_ordinal": True}],
])
def test_conflicting_or_malformed_history_fails_before_migration(tmp_path, records):
    path = tmp_path / "ingestion_history.json"
    _write(path, records)
    before = path.read_bytes()
    with pytest.raises(ValueError):
        check(path)
    with pytest.raises(ValueError):
        migrate(path)
    assert path.read_bytes() == before
    assert not MailReceiptStore(path).path.exists()
