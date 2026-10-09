from pathlib import Path

import pytest

from app.models import InboundEmail
from app.email_providers.ovh import OVHAcquisitionBatch, OVHExaminedMessage
from app.services.ingestion_history import IngestionHistory
from app.services.mailbox_review import MailboxReviewError, review_mailbox_now
from app.services.ovh_mailbox_cursor import (
    OVHMailboxCursor,
    OVHMailboxCursorStore,
)


FIXTURE = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"


def _runtime(monkeypatch, tmp_path):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    monkeypatch.setenv("TACKBAR_OVH_IMAP_USERNAME", "share@tackbar.eu")
    monkeypatch.setenv("TACKBAR_OVH_IMAP_PASSWORD", "test-secret")


def test_ovh_review_uses_distinct_history_identity_and_is_idempotent(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path)
    monkeypatch.setenv("TACKBAR_OVH_IMAP_HOST", "pilot-imap.example.test")
    monkeypatch.setenv("TACKBAR_OVH_IMAP_PORT", "1993")
    email = InboundEmail(
        sender_email="sailor-a@example.com",
        subject="vakaros-demo.csv.gz",
        attachment_filename="vakaros-demo.csv.gz",
        attachment_bytes=FIXTURE.read_bytes(),
        provider_message_id="456:17",
    )

    class Provider:
        def __init__(self, host, port, username, password):
            assert (host, port, username, password) == ("pilot-imap.example.test", 1993, "share@tackbar.eu", "test-secret")

        def get_candidate_emails(self):
            return [email]

    monkeypatch.setattr("app.services.mailbox_review.OVHAdapter", Provider)
    from app.services import mailbox_review

    actual_process = mailbox_review.process_provider_email
    processed_keys = []

    def capture_provider_key(provider_key, *args, **kwargs):
        processed_keys.append(provider_key)
        return actual_process(provider_key, *args, **kwargs)

    monkeypatch.setattr(mailbox_review, "process_provider_email", capture_provider_key)
    history = IngestionHistory()
    history.create("gmail", "456:17", email.sender_email, email.attachment_filename, None)

    first = review_mailbox_now()
    second = review_mailbox_now()

    assert first.discovered_candidates == 1
    assert first.processed == 1
    assert second.skipped_already_processed == 1
    assert second.processed == 0
    assert processed_keys == ["ovh"]
    assert len(history.records()) == 2
    assert history.find_provider_message("gmail", "456:17")["status"] == "failed"
    ovh = history.find_provider_message("ovh", "456:17")
    assert ovh is not None and ovh["status"] == "processed"
    assert ovh["activity_id"] is not None and ovh["session_id"] is not None


@pytest.mark.parametrize("configuration", [
    {"TACKBAR_OVH_IMAP_PASSWORD": ""},
    {"TACKBAR_OVH_IMAP_PASSWORD": "   "},
    {"TACKBAR_OVH_IMAP_USERNAME": ""},
    {"TACKBAR_OVH_IMAP_PORT": "invalid"},
    {"TACKBAR_OVH_IMAP_PORT": "0"},
    {"TACKBAR_MAILBOX_PROVIDER": "unknown"},
])
def test_invalid_provider_configuration_is_safe(monkeypatch, tmp_path, configuration):
    _runtime(monkeypatch, tmp_path)
    for key, value in configuration.items():
        monkeypatch.setenv(key, value)

    with pytest.raises(MailboxReviewError) as captured:
        review_mailbox_now()

    assert "test-secret" not in str(captured.value)
    assert IngestionHistory().records() == []


def test_connection_failure_is_safe_and_does_not_write_history(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path)

    def fail_connection(*args):
        raise OSError("connection rejected test-secret")

    monkeypatch.setattr("app.email_providers.ovh.imaplib.IMAP4_SSL", fail_connection)

    with pytest.raises(MailboxReviewError) as captured:
        review_mailbox_now()

    assert str(captured.value) == "Mailbox review unavailable"
    assert "test-secret" not in str(captured.value)
    assert IngestionHistory().records() == []


def test_authentication_failure_is_safe_and_logs_out(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path)

    class FailingLogin:
        logged_out = False

        def login(self, username, password):
            raise OSError(f"login rejected {password}")

        def logout(self):
            self.logged_out = True

    connection = FailingLogin()
    monkeypatch.setattr("app.email_providers.ovh.imaplib.IMAP4_SSL", lambda *args: connection)

    with pytest.raises(MailboxReviewError) as captured:
        review_mailbox_now()

    assert str(captured.value) == "Mailbox review unavailable"
    assert connection.logged_out
    assert IngestionHistory().records() == []


def test_injected_provider_uses_selected_key(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def get_candidate_emails(self):
            return [InboundEmail(
                sender_email="sailor-a@example.com",
                subject="vakaros-demo.csv.gz",
                attachment_filename="vakaros-demo.csv.gz",
                attachment_bytes=FIXTURE.read_bytes(),
                provider_message_id="456:18",
            )]

    assert review_mailbox_now(provider=Provider()).processed == 1
    assert IngestionHistory().find_provider_message("ovh", "456:18") is not None


def test_injected_provider_defaults_to_gmail_key(monkeypatch, tmp_path):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("TACKBAR_MAILBOX_PROVIDER", raising=False)

    class Provider:
        def get_candidate_emails(self):
            return [InboundEmail(
                sender_email="sailor-a@example.com",
                subject="vakaros-demo.csv.gz",
                attachment_filename="vakaros-demo.csv.gz",
                attachment_bytes=FIXTURE.read_bytes(),
                provider_message_id="gmail-message-1",
            )]

    assert review_mailbox_now(provider=Provider()).processed == 1
    assert IngestionHistory().find_provider_message("gmail", "gmail-message-1") is not None


def _inbound(provider_message_id: str) -> InboundEmail:
    return InboundEmail(
        sender_email="sailor-a@example.com",
        subject="vakaros-demo.csv.gz",
        attachment_filename="vakaros-demo.csv.gz",
        attachment_bytes=FIXTURE.read_bytes(),
        provider_message_id=provider_message_id,
    )


def test_ovh_bootstrap_establishes_cursor_and_next_review_is_incremental(
    monkeypatch, tmp_path
):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def __init__(self):
            self.calls = []

        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            self.calls.append((last_seen_uid, expected_uidvalidity))
            if last_seen_uid is None:
                return OVHAcquisitionBatch(
                    456,
                    (
                        OVHExaminedMessage(17, None),
                        OVHExaminedMessage(19, _inbound("456:19")),
                    ),
                )
            if last_seen_uid == 19:
                return OVHAcquisitionBatch(
                    456,
                    (OVHExaminedMessage(20, _inbound("456:20")),),
                )
            return OVHAcquisitionBatch(456, ())

    provider = Provider()

    first = review_mailbox_now(provider=provider)
    second = review_mailbox_now(provider=provider)
    third = review_mailbox_now(provider=provider)

    assert first.discovered_candidates == 1
    assert first.processed == 1
    assert second.processed == 1
    assert third.discovered_candidates == 0
    assert provider.calls == [(None, None), (19, 456), (20, 456)]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 20)


def test_unsupported_ovh_message_advances_cursor(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def __init__(self):
            self.calls = []

        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            self.calls.append((last_seen_uid, expected_uidvalidity))
            if last_seen_uid is not None:
                return OVHAcquisitionBatch(456, ())
            return OVHAcquisitionBatch(
                456, (OVHExaminedMessage(20, None),)
            )

    provider = Provider()
    first = review_mailbox_now(provider=provider)
    second = review_mailbox_now(provider=provider)

    assert first.discovered_candidates == 0
    assert second.discovered_candidates == 0
    assert provider.calls == [(None, None), (20, 456)]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 20)
    assert IngestionHistory().records() == []


def test_known_ovh_message_is_skipped_while_cursor_advances(
    monkeypatch, tmp_path
):
    _runtime(monkeypatch, tmp_path)
    history = IngestionHistory()
    record = history.create(
        "ovh", "456:21", "sailor-a@example.com", "vakaros-demo.csv.gz", None
    )
    record["status"] = "processed"
    history.replace(record)
    OVHMailboxCursorStore().write(OVHMailboxCursor(456, 20))

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            assert (last_seen_uid, expected_uidvalidity) == (20, 456)
            return OVHAcquisitionBatch(
                456,
                (OVHExaminedMessage(21, _inbound("456:21")),),
            )

    summary = review_mailbox_now(provider=Provider())

    assert summary.skipped_already_processed == 1
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 21)


def test_downstream_failure_does_not_block_cursor_advancement(
    monkeypatch, tmp_path
):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(
                456,
                (OVHExaminedMessage(22, _inbound("456:22")),),
            )

    def fail_processing(*args, **kwargs):
        raise RuntimeError("downstream failure")

    monkeypatch.setattr(
        "app.services.mailbox_review.process_provider_email", fail_processing
    )

    summary = review_mailbox_now(provider=Provider())

    assert summary.failed == 1
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 22)


def test_fetch_failure_persists_only_examined_prefix(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(
                456,
                (OVHExaminedMessage(100, _inbound("456:100")),),
                acquisition_failed=True,
            )

    with pytest.raises(MailboxReviewError, match="Mailbox review unavailable"):
        review_mailbox_now(provider=Provider())

    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 100)
    assert IngestionHistory().find_provider_message("ovh", "456:100") is not None


def test_malformed_message_does_not_block_later_examined_uid(
    monkeypatch, tmp_path
):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(
                456,
                (
                    OVHExaminedMessage(23, None),
                    OVHExaminedMessage(24, _inbound("456:24")),
                ),
            )

    summary = review_mailbox_now(provider=Provider())

    assert summary.processed == 1
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 24)


def test_uidvalidity_mismatch_preserves_cursor(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path)
    store = OVHMailboxCursorStore()
    store.write(OVHMailboxCursor(456, 24))

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            assert (last_seen_uid, expected_uidvalidity) == (24, 456)
            raise RuntimeError("Mailbox UIDVALIDITY changed")

    before = store.path.read_bytes()

    with pytest.raises(MailboxReviewError, match="Mailbox review unavailable"):
        review_mailbox_now(provider=Provider())

    assert store.path.read_bytes() == before


def test_malformed_persisted_cursor_fails_before_acquisition(
    monkeypatch, tmp_path
):
    _runtime(monkeypatch, tmp_path)
    store = OVHMailboxCursorStore()
    store.path.write_text('{"last_seen_uid": 999}\n', encoding="utf-8")

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            raise AssertionError("acquisition must not start")

    before = store.path.read_bytes()

    with pytest.raises(MailboxReviewError, match="Mailbox review unavailable"):
        review_mailbox_now(provider=Provider())

    assert store.path.read_bytes() == before
