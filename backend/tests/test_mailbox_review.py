from pathlib import Path

import pytest

from app.models import InboundEmail
from app.services.ingestion_history import IngestionHistory
from app.services.mailbox_review import MailboxReviewError, review_mailbox_now


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
