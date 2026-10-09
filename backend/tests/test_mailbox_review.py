import logging
from pathlib import Path

import pytest

from app.models import InboundEmail
from app.email_providers.ovh import (
    OVHAcquisitionBatch,
    OVHExaminedMessage,
    OVHMessageOutcome,
    OVHUIDValidityMismatch,
)
from app.services.ingestion_history import IngestionHistory
from app.services.mailbox_review import MailboxReviewError, review_mailbox_now
from app.services import mailbox_review as mailbox_review_module
from app.services.ovh_mailbox_cursor import (
    OVHMailboxCursor,
    OVHMailboxCursorStore,
)


FIXTURE = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"


@pytest.fixture(autouse=True)
def _fresh_cycle_failure_suppression(monkeypatch):
    monkeypatch.setattr(
        mailbox_review_module,
        "_cycle_failure_logs",
        mailbox_review_module._CycleFailureLogSuppressor(),
    )


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
                        OVHExaminedMessage(
                            17, None, OVHMessageOutcome.UNSUPPORTED
                        ),
                        OVHExaminedMessage(
                            19,
                            _inbound("456:19"),
                            OVHMessageOutcome.SUPPORTED,
                        ),
                    ),
                )
            if last_seen_uid == 19:
                return OVHAcquisitionBatch(
                    456,
                    (
                        OVHExaminedMessage(
                            20,
                            _inbound("456:20"),
                            OVHMessageOutcome.SUPPORTED,
                        ),
                    ),
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
                456,
                (
                    OVHExaminedMessage(
                        20, None, OVHMessageOutcome.UNSUPPORTED
                    ),
                ),
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
                (
                    OVHExaminedMessage(
                        21,
                        _inbound("456:21"),
                        OVHMessageOutcome.SUPPORTED,
                    ),
                ),
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
                (
                    OVHExaminedMessage(
                        22,
                        _inbound("456:22"),
                        OVHMessageOutcome.SUPPORTED,
                    ),
                ),
            )

    def fail_processing(*args, **kwargs):
        raise RuntimeError("downstream failure")

    monkeypatch.setattr(
        "app.services.mailbox_review.process_provider_email", fail_processing
    )

    summary = review_mailbox_now(provider=Provider())

    assert summary.failed == 1
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 22)


def test_fetch_failure_persists_only_examined_prefix(
    monkeypatch, tmp_path, caplog
):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(
                456,
                (
                    OVHExaminedMessage(
                        100,
                        _inbound("456:100"),
                        OVHMessageOutcome.SUPPORTED,
                    ),
                ),
                acquisition_failed=True,
            )

    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)

    with pytest.raises(MailboxReviewError, match="Mailbox review unavailable"):
        review_mailbox_now(provider=Provider())

    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 100)
    assert IngestionHistory().find_provider_message("ovh", "456:100") is not None
    assert any(
        "stage=message_fetch" in record.getMessage()
        for record in caplog.records
    )


def test_malformed_message_does_not_block_later_examined_uid(
    monkeypatch, tmp_path
):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(
                456,
                (
                    OVHExaminedMessage(
                        23,
                        None,
                        OVHMessageOutcome.MALFORMED,
                        "ValueError",
                    ),
                    OVHExaminedMessage(
                        24,
                        _inbound("456:24"),
                        OVHMessageOutcome.SUPPORTED,
                    ),
                ),
            )

    summary = review_mailbox_now(provider=Provider())

    assert summary.processed == 1
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 24)


def test_uidvalidity_mismatch_preserves_cursor(
    monkeypatch, tmp_path, caplog
):
    _runtime(monkeypatch, tmp_path)
    store = OVHMailboxCursorStore()
    store.write(OVHMailboxCursor(456, 24))

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            assert (last_seen_uid, expected_uidvalidity) == (24, 456)
            raise OVHUIDValidityMismatch("Mailbox UIDVALIDITY changed")

    before = store.path.read_bytes()
    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)

    with pytest.raises(MailboxReviewError, match="Mailbox review unavailable"):
        review_mailbox_now(provider=Provider())

    assert store.path.read_bytes() == before
    assert any(
        "stage=acquisition error_class=OVHUIDValidityMismatch "
        "reason=uidvalidity_mismatch" in record.getMessage()
        for record in caplog.records
    )


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


def test_ovh_outcomes_and_relevant_cycle_counts_are_logged_safely(
    monkeypatch, tmp_path, caplog
):
    _runtime(monkeypatch, tmp_path)
    sensitive = _inbound("456:31")
    sensitive = InboundEmail(
        sender_email="private-sailor@example.test",
        subject="private race subject",
        attachment_filename="private-track.csv.gz",
        attachment_bytes=sensitive.attachment_bytes,
        provider_message_id=sensitive.provider_message_id,
    )

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(
                456,
                (
                    OVHExaminedMessage(
                        30, None, OVHMessageOutcome.UNSUPPORTED
                    ),
                    OVHExaminedMessage(
                        31, sensitive, OVHMessageOutcome.SUPPORTED
                    ),
                    OVHExaminedMessage(
                        32,
                        None,
                        OVHMessageOutcome.MALFORMED,
                        "ValueError",
                    ),
                ),
            )

    monkeypatch.setattr(
        mailbox_review_module,
        "process_provider_email",
        lambda *args, **kwargs: object(),
    )
    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)

    summary = review_mailbox_now(provider=Provider())

    assert summary.processed == 1
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "provider_message_id=456:30 outcome=unsupported" in messages
    assert "provider_message_id=456:31 outcome=supported" in messages
    assert "provider_message_id=456:32 outcome=malformed" in messages
    assert "examined=3" in messages
    assert "unsupported=1 malformed=1" in messages
    assert "private-sailor@example.test" not in messages
    assert "private race subject" not in messages
    assert "private-track.csv.gz" not in messages


def test_processing_failure_logs_safe_reason_before_history_persistence(
    monkeypatch, tmp_path, caplog
):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(
                456,
                (
                    OVHExaminedMessage(
                        33,
                        _inbound("456:33"),
                        OVHMessageOutcome.SUPPORTED,
                    ),
                ),
            )

    def fail_before_history(self, *args, **kwargs):
        raise PermissionError(
            "C:\\private-runtime\\secret-track.csv test-secret"
        )

    monkeypatch.setattr(
        IngestionHistory,
        "create",
        fail_before_history,
    )
    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)

    summary = review_mailbox_now(provider=Provider())

    assert summary.failed == 1
    assert IngestionHistory().records() == []
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 33)
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "provider_message_id=456:33" in messages
    assert "error_class=PermissionError reason=permission_denied" in messages
    assert "private-runtime" not in messages
    assert "secret-track.csv" not in messages
    assert "test-secret" not in messages


def test_known_processed_and_known_failed_outcomes_are_distinguishable(
    monkeypatch, tmp_path, caplog
):
    _runtime(monkeypatch, tmp_path)
    history = IngestionHistory()
    processed_record = history.create(
        "ovh", "456:34", "private@example.test", "private.csv", None
    )
    processed_record["status"] = "processed"
    history.replace(processed_record)
    history.create(
        "ovh", "456:35", "private@example.test", "private.csv", None
    )

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(
                456,
                (
                    OVHExaminedMessage(
                        34,
                        _inbound("456:34"),
                        OVHMessageOutcome.SUPPORTED,
                    ),
                    OVHExaminedMessage(
                        35,
                        _inbound("456:35"),
                        OVHMessageOutcome.SUPPORTED,
                    ),
                ),
            )

    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)

    summary = review_mailbox_now(provider=Provider())

    assert summary.skipped_already_processed == 1
    assert summary.known_failed == 1
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "outcome=skipped_already_processed" in messages
    assert "outcome=skipped_known_failed" in messages
    assert "private@example.test" not in messages
    assert "private.csv" not in messages


def test_empty_successful_cycle_has_no_info_log(monkeypatch, tmp_path, caplog):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            return OVHAcquisitionBatch(456, ())

    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)

    summary = review_mailbox_now(provider=Provider())

    assert summary.discovered_candidates == 0
    assert not caplog.records


def test_identical_cycle_failure_is_suppressed_and_reminded_hourly(
    monkeypatch, tmp_path, caplog
):
    _runtime(monkeypatch, tmp_path)
    now = [0.0]
    monkeypatch.setattr(
        mailbox_review_module,
        "_cycle_failure_logs",
        mailbox_review_module._CycleFailureLogSuppressor(
            clock=lambda: now[0]
        ),
    )

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            raise ConnectionError("test-secret private.example.test")

    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)
    provider = Provider()

    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)
    now[0] = 10
    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)
    now[0] = 3599
    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)
    now[0] = 3600
    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)
    now[0] = 4000
    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)

    messages = [record.getMessage() for record in caplog.records]
    assert sum("mailbox_review_cycle_failed" in item for item in messages) == 1
    reminders = [
        item for item in messages
        if "mailbox_review_cycle_still_failing" in item
    ]
    assert len(reminders) == 1
    assert "suppressed_cycles=3" in reminders[0]
    combined = "\n".join(messages)
    assert "test-secret" not in combined
    assert "private.example.test" not in combined


def test_changed_cycle_failure_logs_immediately(monkeypatch, tmp_path, caplog):
    _runtime(monkeypatch, tmp_path)
    errors = [
        ConnectionError("first secret"),
        TimeoutError("second secret"),
    ]

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            raise errors.pop(0)

    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)
    provider = Provider()

    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)
    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)

    failures = [
        record.getMessage()
        for record in caplog.records
        if "mailbox_review_cycle_failed" in record.getMessage()
    ]
    assert len(failures) == 2
    assert "error_class=ConnectionError reason=connection_failed" in failures[0]
    assert "error_class=TimeoutError reason=timeout" in failures[1]
    assert "first secret" not in "\n".join(failures)
    assert "second secret" not in "\n".join(failures)


def test_recovery_after_suppressed_failure_is_logged_once(
    monkeypatch, tmp_path, caplog
):
    _runtime(monkeypatch, tmp_path)

    class Provider:
        def __init__(self):
            self.fail = True

        def acquire_messages(self, last_seen_uid, expected_uidvalidity):
            if self.fail:
                raise ConnectionError("private failure")
            return OVHAcquisitionBatch(456, ())

    caplog.set_level(logging.INFO, logger=mailbox_review_module.__name__)
    provider = Provider()

    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)
    with pytest.raises(MailboxReviewError):
        review_mailbox_now(provider=provider)
    provider.fail = False
    review_mailbox_now(provider=provider)
    review_mailbox_now(provider=provider)

    recoveries = [
        record.getMessage()
        for record in caplog.records
        if "mailbox_review_cycle_recovered" in record.getMessage()
    ]
    assert len(recoveries) == 1
    assert "suppressed_cycles=1" in recoveries[0]
