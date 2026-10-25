from email.message import EmailMessage
from hashlib import sha256

import pytest

from app.email_providers.ovh import (
    MAX_STAGED_RAW_BYTES, MAX_SUPPORTED_ATTACHMENTS, MAX_DECODED_SUPPORTED_BYTES,
    OVHAcquisitionBatch, OVHAdapter, OVHAttachmentOccurrence, OVHExaminedMessage,
    OVHMessageOutcome, OVHStagedMail, _extract_staged_mail,
    MAX_STAGED_MIME_PARTS,
)
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_processing import reprocess_ingestion
from app.services.mail_receipts import MailReceiptStore, validate_receipt
from app.services.mailbox_review import MailboxReviewError, review_mailbox_now
from app.models import InboundEmail
from app.services.ovh_mailbox_cursor import OVHMailboxCursor, OVHMailboxCursorStore
from app.services.staged_mail_acquisition import (
    recover_unattempted_ingestions, stage_ovh_mailbox_now,
)
from app.storage.ingestion_original_storage import IngestionOriginalStorage
from scripts.migrate_ingestion_history_v2 import check, verify


def _raw(attachments):
    mail = EmailMessage()
    mail["From"] = "sailor@example.test"
    mail["Subject"] = "Several tracks"
    for filename, content in attachments:
        mail.add_attachment(content, maintype="application", subtype="octet-stream", filename=filename)
    return mail.as_bytes()


def _mail(message_id="456:1", attachments=None, reason=None):
    if attachments is None:
        attachments = (OVHAttachmentOccurrence(1, "track.gpx", b"track"),)
    return OVHStagedMail(message_id, "sailor@example.test", None, tuple(attachments), reason)


def _provider(*examined, acquisition_failed=False, during_acquire=None):
    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity, *, staged):
            assert staged is True
            if during_acquire:
                during_acquire()
            return OVHAcquisitionBatch(456, tuple(examined), acquisition_failed)
    return Provider()


def _examined(uid, mail=None, outcome=OVHMessageOutcome.SUPPORTED):
    return OVHExaminedMessage(uid, None, outcome, staged_mail=mail or _mail(f"456:{uid}"))


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    return tmp_path


@pytest.mark.parametrize("count", [1, 6, 9, 12])
def test_mime_occurrence_ordinals_include_unsupported_and_preserve_duplicates(count):
    attachments = [("notes.txt", b"note")]
    attachments += [("same.gpx", b"identical") for _ in range(count)]
    attachments.insert(3, ("photo.jpg", b"photo"))
    staged = _extract_staged_mail(_raw(attachments), "456:17")
    assert staged is not None and staged.rejection_reason is None
    assert len(staged.attachments) == count
    assert [item.ordinal for item in staged.attachments] == [i for i, (name, _) in enumerate(attachments, 1) if name == "same.gpx"]
    assert all(item.filename == "same.gpx" and item.content == b"identical" for item in staged.attachments)


def test_mime_supported_formats_and_whole_mail_capacity():
    attachments = [("one.gpx", b"a"), ("two.csv", b"b"), ("three.csv.gz", b"c"), ("four.vkx", b"d"), ("five.vkx.gz", b"e")]
    assert len(_extract_staged_mail(_raw(attachments), "456:1").attachments) == 5
    assert _extract_staged_mail(_raw([("notes.txt", b"x")]), "456:1") is None
    assert _extract_staged_mail(_raw([("x.gpx", b"x")] * (MAX_SUPPORTED_ATTACHMENTS + 1)), "456:1").rejection_reason == "attachment_count_limit"
    exact = _extract_staged_mail(_raw([("x.gpx", b"x" * MAX_DECODED_SUPPORTED_BYTES)]), "456:1")
    assert exact.rejection_reason is None and len(exact.attachments[0].content) == MAX_DECODED_SUPPORTED_BYTES
    excess = _extract_staged_mail(_raw([("x.gpx", b"x" * MAX_DECODED_SUPPORTED_BYTES), ("last.gpx", b"y")]), "456:1")
    assert excess.rejection_reason == "decoded_bytes_limit" and excess.attachments == ()
    assert _extract_staged_mail(b"x" * (MAX_STAGED_RAW_BYTES + 1), "456:1").rejection_reason == "raw_message_limit"


def test_corrupt_supported_payload_is_controlled_without_losing_sibling():
    raw = _raw([("bad.gpx", b"abc"), ("good.csv", b"good")])
    raw = raw.replace(b"YWJj", b"YWJj!!!", 1)
    staged = _extract_staged_mail(raw, "456:1")
    assert staged.attachments[0].acquisition_error == "mime_decode_failed"
    assert staged.attachments[0].content is None
    assert staged.attachments[1].content == b"good"


def test_unenumerable_mime_structure_is_not_accepted():
    raw = b"From: sailor@example.test\r\nContent-Type: multipart/mixed; boundary=missing\r\n\r\nbody"
    with pytest.raises(ValueError, match="safely enumerated"):
        _extract_staged_mail(raw, "456:1")


def test_named_multipart_without_decoded_body_keeps_supported_child():
    raw = (
        b"From: sailor@example.test\r\n"
        b"Content-Type: multipart/mixed; boundary=outer\r\n\r\n"
        b"--outer\r\nContent-Type: multipart/mixed; boundary=inner; name=parent.gpx\r\n"
        b"Content-Disposition: attachment; filename=parent.gpx\r\n\r\n"
        b"--inner\r\nContent-Type: application/octet-stream\r\n"
        b"Content-Disposition: attachment; filename=child.csv\r\n\r\nchild\r\n"
        b"--inner--\r\n--outer--\r\n"
    )
    staged = _extract_staged_mail(raw, "456:1")
    assert [item.ordinal for item in staged.attachments] == [1, 2]
    assert staged.attachments[0].acquisition_error == "mime_decode_failed"
    assert staged.attachments[1].content == b"child"


def test_mime_part_limit_is_enforced_during_parse():
    mail = EmailMessage()
    mail["From"] = "sailor@example.test"
    for _ in range(MAX_STAGED_MIME_PARTS):
        mail.add_attachment(b"x", maintype="application", subtype="octet-stream")
    staged = _extract_staged_mail(mail.as_bytes(), "456:1")
    assert staged.rejection_reason == "mime_part_limit"


def test_staged_adapter_prefetches_size_and_skips_oversized_body(monkeypatch):
    raw = _raw([("track.gpx", b"track")])

    class FakeIMAP:
        def __init__(self):
            self.calls = []

        def login(self, *_args):
            return "OK", []

        def select(self, *_args, **_kwargs):
            return "OK", [b"2"]

        def response(self, *_args):
            return "UIDVALIDITY", [b"456"]

        def uid(self, command, *args):
            self.calls.append((command, *args))
            if command == "SEARCH":
                return "OK", [b"1 2"]
            uid, query = args
            if query == "(RFC822.SIZE)":
                size = len(raw) if uid == b"1" else MAX_STAGED_RAW_BYTES + 1
                return "OK", [f"1 (RFC822.SIZE {size})".encode()]
            assert uid == b"1" and query == "(BODY.PEEK[])"
            return "OK", [(b"1 (BODY[])", raw)]

        def close(self):
            pass

        def logout(self):
            pass

    fake = FakeIMAP()
    monkeypatch.setattr("app.email_providers.ovh.imaplib.IMAP4_SSL", lambda *_args: fake)
    batch = OVHAdapter("host", 993, "user", "password").acquire_messages(staged=True)
    assert [m.outcome for m in batch.examined_messages] == [OVHMessageOutcome.SUPPORTED, OVHMessageOutcome.REJECTED]
    assert batch.examined_messages[1].staged_mail.sender_email == ""
    assert not any(call == ("FETCH", b"2", "(BODY.PEEK[])") for call in fake.calls)


def test_staged_adapter_retains_fetched_prefix_on_size_fetch_exception(monkeypatch):
    raw = _raw([("track.gpx", b"track")])

    class FakeIMAP:
        def login(self, *_args):
            return "OK", []

        def select(self, *_args, **_kwargs):
            return "OK", [b"2"]

        def response(self, *_args):
            return "UIDVALIDITY", [b"456"]

        def uid(self, command, *args):
            if command == "SEARCH":
                return "OK", [b"1 2"]
            uid, query = args
            if uid == b"2":
                raise OSError("fetch interrupted")
            if query == "(RFC822.SIZE)":
                return "OK", [f"1 (RFC822.SIZE {len(raw)})".encode()]
            return "OK", [(b"1 (BODY[])", raw)]

        def close(self):
            pass

        def logout(self):
            pass

    monkeypatch.setattr("app.email_providers.ovh.imaplib.IMAP4_SSL", lambda *_args: FakeIMAP())
    batch = OVHAdapter("host", 993, "user", "password").acquire_messages(staged=True)
    assert batch.acquisition_failed
    assert [message.uid for message in batch.examined_messages] == [1]


def test_staged_receipt_survives_cursor_advance_and_has_no_processing(root):
    mail = _mail(attachments=(
        OVHAttachmentOccurrence(2, "same.gpx", b"same"),
        OVHAttachmentOccurrence(3, "same.gpx", b"same"),
    ))
    provider = _provider(_examined(1, mail))
    summary = stage_ovh_mailbox_now(provider)
    assert summary.completed == 1 and summary.last_seen_uid == 1
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 1)
    history = IngestionHistory()
    records = history.find_mail_attachments("ovh", "456:1")
    assert [r["attachment_ordinal"] for r in records] == [2, 3]
    assert records[0]["id"] != records[1]["id"]
    assert all(r["status"] == "pending" and r["attempts"] == 0 for r in records)
    assert all(r["attachment_sha256"] == sha256(b"same").hexdigest() for r in records)
    assert all(r["activity_id"] is None and r["session_id"] is None for r in records)
    assert len(recover_unattempted_ingestions()) == 2
    receipt = MailReceiptStore(history.path).get("ovh", "456:1")
    assert len(receipt["attachment_ingestion_ids"]) == 2
    assert receipt["feedback_state"] == "unreserved" and receipt["feedback_attempts"] == []
    assert not (root / "activities.json").exists()
    assert not (root / "sessions.json").exists()
    assert not (root / "sailors.json").exists()
    originals = IngestionOriginalStorage(root)
    assert all(originals.read(r["original_file"]) == b"same" for r in records)
    assert records[0]["original_file"] != records[1]["original_file"]
    with pytest.raises(ValueError, match="no processing attempt"):
        reprocess_ingestion(records[0]["id"], None, None, None, None, history)


@pytest.mark.parametrize("count", [1, 6, 9, 12])
def test_staged_receipt_accounts_for_each_supported_occurrence(root, count):
    attachments = tuple(
        OVHAttachmentOccurrence(index + 1, f"race-{index + 1}.gpx", bytes([index]))
        for index in range(count)
    )
    stage_ovh_mailbox_now(_provider(_examined(1, _mail(attachments=attachments))))
    records = IngestionHistory().find_mail_attachments("ovh", "456:1")
    receipt = MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")
    assert len(records) == count
    assert receipt["receipt_state"] == "complete"
    assert receipt["attachment_ingestion_ids"] == [record["id"] for record in records]
    assert len(recover_unattempted_ingestions()) == count


def test_whole_mail_rejection_has_no_child_and_advances_cursor(root):
    rejected = _mail(reason="attachment_count_limit", attachments=())
    summary = stage_ovh_mailbox_now(_provider(_examined(1, rejected, OVHMessageOutcome.REJECTED)))
    assert summary.rejected == 1
    assert IngestionHistory().records() == []
    receipt = MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")
    assert receipt["receipt_state"] == "rejected"
    assert receipt["rejection_reason"] == "attachment_count_limit"
    assert receipt["feedback_attempts"] == []


@pytest.mark.parametrize(
    ("attachments", "reason"),
    [
        ([("track.gpx", b"x")] * 13, "attachment_count_limit"),
        ([("track.gpx", b"x" * (MAX_DECODED_SUPPORTED_BYTES + 1))], "decoded_bytes_limit"),
    ],
)
def test_capacity_rejection_persists_parsed_outer_sender(root, attachments, reason):
    raw = _raw(attachments).replace(b"From: sailor@example.test", b"From: Sailor <sailor@example.test>")
    mail = _extract_staged_mail(raw, "456:1")
    assert mail.rejection_reason == reason and mail.sender_email == "sailor@example.test"
    stage_ovh_mailbox_now(_provider(_examined(1, mail, OVHMessageOutcome.REJECTED)))
    receipt = MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")
    assert receipt["sender_email"] == "sailor@example.test"
    assert receipt["rejection_reason"] == reason
    assert receipt["feedback_state"] == "unreserved" and receipt["feedback_attempts"] == []
    assert IngestionHistory().records() == []
    history_path = IngestionHistory().path
    history_path.write_text("[]", encoding="utf-8")
    before = MailReceiptStore(history_path).path.read_bytes()
    assert check(history_path)["ingestions"] == 0
    assert verify(history_path)["stored_receipts"] == 1
    assert MailReceiptStore(history_path).path.read_bytes() == before


@pytest.mark.parametrize(
    "from_headers",
    [b"", b"From: invalid sender text\n", b"From: bad@\n", b"From: first@example.test, second@example.test\n", b"From: first@example.test\nFrom: second@example.test\n"],
)
def test_unusable_outer_from_is_not_persisted_as_recipient(root, from_headers):
    raw = _raw([("track.gpx", b"x")] * 13).replace(b"From: sailor@example.test\n", from_headers)
    mail = _extract_staged_mail(raw, "456:1")
    assert mail.rejection_reason == "attachment_count_limit" and mail.sender_email == ""
    stage_ovh_mailbox_now(_provider(_examined(1, mail, OVHMessageOutcome.REJECTED)))
    assert "sender_email" not in MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")


def test_raw_size_rejection_has_no_invented_sender(root):
    mail = OVHStagedMail("456:1", "", None, (), "raw_message_limit")
    stage_ovh_mailbox_now(_provider(_examined(1, mail, OVHMessageOutcome.REJECTED)))
    receipt = MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")
    assert receipt["rejection_reason"] == "raw_message_limit"
    assert "sender_email" not in receipt
    assert IngestionHistory().records() == []


def test_rejected_receipt_rereview_preserves_terminal_sender_and_bytes(root, monkeypatch):
    mail = _extract_staged_mail(_raw([("track.gpx", b"x")] * 13), "456:1")
    original_write = OVHMailboxCursorStore.write
    fail_once = True

    def interrupted(self, cursor):
        nonlocal fail_once
        if fail_once:
            fail_once = False
            raise OSError("cursor interruption")
        return original_write(self, cursor)

    monkeypatch.setattr(OVHMailboxCursorStore, "write", interrupted)
    provider = _provider(_examined(1, mail, OVHMessageOutcome.REJECTED))
    with pytest.raises(MailboxReviewError, match="cursor"):
        stage_ovh_mailbox_now(provider)
    receipt_path = MailReceiptStore(IngestionHistory().path).path
    before = receipt_path.read_bytes()
    stage_ovh_mailbox_now(provider)
    assert receipt_path.read_bytes() == before
    assert IngestionHistory().records() == []


def test_legacy_rejected_receipt_without_sender_stays_readable_and_terminal(root):
    history = IngestionHistory()
    history.path.write_text("[]", encoding="utf-8")
    receipts = MailReceiptStore(history.path)
    original = {
        "provider": "ovh", "provider_message_id": "456:1", "receipt_state": "rejected",
        "attachment_ingestion_ids": [], "feedback_state": "unreserved",
        "feedback_attempts": [], "rejection_reason": "attachment_count_limit",
    }
    receipts.add(original)
    before = receipts.path.read_bytes()
    files_before = sorted(str(path.relative_to(root)) for path in root.rglob("*") if path.is_file())
    assert check(history.path)["ingestions"] == 0
    assert verify(history.path)["stored_receipts"] == 1
    assert receipts.path.read_bytes() == before
    assert sorted(str(path.relative_to(root)) for path in root.rglob("*") if path.is_file()) == files_before
    assert receipts.get("ovh", "456:1") == original
    stage_ovh_mailbox_now(_provider(_examined(1, _mail(reason="attachment_count_limit", attachments=()), OVHMessageOutcome.REJECTED)))
    assert receipts.path.read_bytes() == before
    with pytest.raises(ValueError, match="immutable"):
        receipts.replace({**original, "sender_email": "sailor@example.test"})


def test_rejected_sender_field_rejects_raw_headers_and_other_receipt_states(root):
    receipts = MailReceiptStore(IngestionHistory().path)
    rejected = {
        "provider": "ovh", "provider_message_id": "456:1", "receipt_state": "rejected",
        "attachment_ingestion_ids": [], "feedback_state": "unreserved",
        "feedback_attempts": [], "rejection_reason": "attachment_count_limit",
    }
    for sender in ("Sailor <sailor@example.test>", "invalid sender text", "first@example.test,second@example.test"):
        with pytest.raises(ValueError, match="sender"):
            receipts.add({**rejected, "sender_email": sender})
    validate_receipt({**rejected, "sender_email": None})
    with pytest.raises(ValueError, match="sender"):
        receipts.add({**rejected, "receipt_state": "incomplete", "rejection_reason": None, "sender_email": "sailor@example.test"})
    with pytest.raises(ValueError, match="sender"):
        validate_receipt({**rejected, "receipt_state": "incomplete", "rejection_reason": None, "sender_email": None})
    assert not receipts.path.exists()


def test_malformed_occurrence_keeps_valid_sibling_and_is_not_retryable(root):
    mail = _mail(attachments=(
        OVHAttachmentOccurrence(1, "bad.gpx", None, "mime_decode_failed"),
        OVHAttachmentOccurrence(2, "good.csv", b"good"),
    ))
    stage_ovh_mailbox_now(_provider(_examined(1, mail)))
    records = IngestionHistory().find_mail_attachments("ovh", "456:1")
    assert [r["status"] for r in records] == ["acquisition_failed", "pending"]
    assert records[0]["original_file"] is None
    assert [r["id"] for r in recover_unattempted_ingestions()] == [records[1]["id"]]


def test_incomplete_receipt_blocks_cursor_and_rereview_resumes(root, monkeypatch):
    mail = _mail(attachments=(
        OVHAttachmentOccurrence(1, "a.gpx", b"a"),
        OVHAttachmentOccurrence(2, "b.gpx", b"b"),
    ))
    provider = _provider(_examined(1, mail), _examined(2, _mail("456:2")))
    original_preserve = IngestionOriginalStorage.preserve
    fail_once = True

    def interrupted(self, record_id, filename, content):
        nonlocal fail_once
        if filename == "b.gpx" and fail_once:
            fail_once = False
            raise OSError("simulated original interruption")
        return original_preserve(self, record_id, filename, content)

    monkeypatch.setattr(IngestionOriginalStorage, "preserve", interrupted)
    with pytest.raises(MailboxReviewError, match="incomplete"):
        stage_ovh_mailbox_now(provider)
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 0)
    assert MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")["receipt_state"] == "incomplete"
    first_id = IngestionHistory().find_mail_attachment("ovh", "456:1", 1)["id"]
    assert recover_unattempted_ingestions() == []
    stage_ovh_mailbox_now(provider)
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 2)
    assert IngestionHistory().find_mail_attachment("ovh", "456:1", 1)["id"] == first_id
    assert len(IngestionHistory().find_mail_attachments("ovh", "456:1")) == 2


def test_identity_write_failure_leaves_incomplete_receipt_and_no_cursor(root, monkeypatch):
    original_create = IngestionHistory.create
    fail_once = True

    def interrupted(self, *args, **kwargs):
        nonlocal fail_once
        if fail_once:
            fail_once = False
            raise OSError("simulated identity interruption")
        return original_create(self, *args, **kwargs)

    monkeypatch.setattr(IngestionHistory, "create", interrupted)
    provider = _provider(_examined(1))
    with pytest.raises(MailboxReviewError, match="incomplete"):
        stage_ovh_mailbox_now(provider)
    assert IngestionHistory().records() == []
    assert MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")["receipt_state"] == "incomplete"
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 0)
    stage_ovh_mailbox_now(provider)
    assert len(IngestionHistory().records()) == 1


def test_receipt_completion_failure_keeps_cursor_before_mail(root, monkeypatch):
    original_replace = MailReceiptStore.replace
    fail_once = True

    def interrupted(self, replacement):
        nonlocal fail_once
        if replacement["receipt_state"] == "complete" and fail_once:
            fail_once = False
            raise OSError("simulated completion interruption")
        return original_replace(self, replacement)

    monkeypatch.setattr(MailReceiptStore, "replace", interrupted)
    provider = _provider(_examined(1))
    with pytest.raises(MailboxReviewError, match="incomplete"):
        stage_ovh_mailbox_now(provider)
    history = IngestionHistory()
    first_id = history.records()[0]["id"]
    assert MailReceiptStore(history.path).get("ovh", "456:1")["receipt_state"] == "incomplete"
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 0)
    stage_ovh_mailbox_now(provider)
    assert history.records()[0]["id"] == first_id
    assert MailReceiptStore(history.path).get("ovh", "456:1")["receipt_state"] == "complete"


def test_ordinary_review_cannot_process_or_skip_incomplete_staged_receipt(root, monkeypatch):
    provider = _provider(_examined(1))
    original_create = IngestionHistory.create

    def interrupted(*_args, **_kwargs):
        raise OSError("simulated identity interruption")

    monkeypatch.setattr(IngestionHistory, "create", interrupted)
    with pytest.raises(MailboxReviewError):
        stage_ovh_mailbox_now(provider)
    monkeypatch.setattr(IngestionHistory, "create", original_create)

    candidate = InboundEmail("sailor@example.test", "track", "track.gpx", b"track", "456:1")

    class LegacyProvider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(456, (OVHExaminedMessage(1, candidate, OVHMessageOutcome.SUPPORTED),))

    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=LegacyProvider())
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 0)
    assert IngestionHistory().records() == []
    assert not (root / "activities.json").exists()


def test_ordinary_review_does_not_process_complete_staged_receipt(root):
    stage_ovh_mailbox_now(_provider(_examined(1)))
    candidate = InboundEmail("sailor@example.test", "track", "track.gpx", b"track", "456:1")

    class LegacyProvider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(456, (OVHExaminedMessage(1, candidate, OVHMessageOutcome.SUPPORTED),))

    result = review_mailbox_now(provider=LegacyProvider())
    assert result.processed == 0
    assert len(IngestionHistory().records()) == 1
    assert IngestionHistory().records()[0]["status"] == "pending"
    assert not (root / "activities.json").exists()


def test_cursor_write_interruption_reuses_complete_receipt(root, monkeypatch):
    store = OVHMailboxCursorStore()
    original_write = OVHMailboxCursorStore.write
    fail_once = True

    def interrupted(self, cursor):
        nonlocal fail_once
        if fail_once:
            fail_once = False
            raise OSError("simulated cursor interruption")
        return original_write(self, cursor)

    monkeypatch.setattr(OVHMailboxCursorStore, "write", interrupted)
    provider = _provider(_examined(1))
    with pytest.raises(MailboxReviewError, match="cursor"):
        stage_ovh_mailbox_now(provider)
    records = IngestionHistory().records()
    assert len(records) == 1 and recover_unattempted_ingestions()[0]["id"] == records[0]["id"]
    stage_ovh_mailbox_now(provider)
    assert len(IngestionHistory().records()) == 1
    assert store.load() == OVHMailboxCursor(456, 1)


def test_conflicting_preserved_bytes_fail_without_duplicate_or_cursor_advance(root, monkeypatch):
    original_write = OVHMailboxCursorStore.write
    fail_once = True

    def interrupted(self, cursor):
        nonlocal fail_once
        if fail_once:
            fail_once = False
            raise OSError("simulated cursor interruption")
        return original_write(self, cursor)

    monkeypatch.setattr(OVHMailboxCursorStore, "write", interrupted)
    provider = _provider(_examined(1))
    with pytest.raises(MailboxReviewError):
        stage_ovh_mailbox_now(provider)
    first = IngestionHistory().records()[0]
    (root / first["original_file"]).write_bytes(b"different")
    with pytest.raises(MailboxReviewError, match="incomplete"):
        stage_ovh_mailbox_now(provider)
    assert [record["id"] for record in IngestionHistory().records()] == [first["id"]]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 0)


def test_unsafe_mime_blocks_prefix_but_fetch_failure_keeps_safe_prefix(root):
    unsafe = OVHExaminedMessage(2, None, OVHMessageOutcome.MALFORMED, "ValueError")
    provider = _provider(_examined(1), unsafe, _examined(3))
    with pytest.raises(MailboxReviewError):
        stage_ovh_mailbox_now(provider)
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 1)
    assert IngestionHistory().find_provider_message("ovh", "456:3") is None
    provider = _provider(_examined(2, _mail("456:2")), acquisition_failed=True)
    with pytest.raises(MailboxReviewError):
        stage_ovh_mailbox_now(provider)
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 2)


def test_overlapping_review_rechecks_cursor_and_uidvalidity(root):
    store = OVHMailboxCursorStore()
    def advance():
        store.write(OVHMailboxCursor(456, 20))
    summary = stage_ovh_mailbox_now(_provider(_examined(10, _mail("456:10")), during_acquire=advance))
    assert summary.last_seen_uid == 20
    assert IngestionHistory().records() == []
    with pytest.raises(MailboxReviewError, match="UIDVALIDITY"):
        stage_ovh_mailbox_now(_provider(_examined(21, _mail("456:21")), during_acquire=lambda: store.write(OVHMailboxCursor(789, 20))))
    assert store.load() == OVHMailboxCursor(789, 20)


def test_recovery_defers_original_corruption_to_claimed_processing(root):
    stage_ovh_mailbox_now(_provider(_examined(1)))
    record = IngestionHistory().records()[0]
    path = root / record["original_file"]
    path.write_bytes(b"different")
    assert [item["id"] for item in recover_unattempted_ingestions()] == [record["id"]]
