from email.message import EmailMessage
import json
from pathlib import Path

import pytest

from app.email_providers.ovh import OVHAdapter, OVHMessageOutcome
from app.models import ConsentStatus
from app.repositories.sailors import SailorRepository
from app.services.ingestion_history import IngestionHistory
from app.services.mailbox_review import review_mailbox_now
from app.services.ovh_mailbox_cursor import OVHMailboxCursor, OVHMailboxCursorStore
from app.services.outbound_mail import CONTACT_FOOTER
from app.services.technical_failure_notice import TechnicalNoticeStore


FIXTURE = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"


def _mail(attachments, sender="Sailor <sailor@example.test>", headers=()):
    message = EmailMessage()
    if sender is not None:
        message["From"] = sender
    message["Subject"] = "track"
    for name, value in headers:
        message[name] = value
    for filename, content in attachments:
        message.add_attachment(content, maintype="application", subtype="octet-stream", filename=filename)
    return message.as_bytes()


class FakeIMAP:
    def __init__(self, messages):
        self.messages = messages

    def login(self, *_):
        return "OK", []

    def select(self, *_args, **_kwargs):
        return "OK", []

    def response(self, _code):
        return "UIDVALIDITY", [b"456"]

    def uid(self, command, *args):
        if command == "SEARCH":
            return "OK", [b" ".join(str(uid).encode() for uid in self.messages)]
        return "OK", [(b"FETCH", self.messages[int(args[0])])]

    def close(self):
        pass

    def logout(self):
        pass


def _runtime(monkeypatch, tmp_path, messages):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    monkeypatch.setattr(
        "app.email_providers.ovh.imaplib.IMAP4_SSL",
        lambda *_args: FakeIMAP(messages),
    )
    return OVHAdapter("imap.example.test", 993, "share@tackbar.eu", "secret")


def test_real_mime_zero_multi_and_later_healthy_mail(monkeypatch, tmp_path):
    adapter = _runtime(monkeypatch, tmp_path, {
        1: _mail([]),
        2: _mail([("notes.txt", b"notes")]),
        3: _mail([("one.gpx", b"x"), ("two.csv", b"y")]),
        4: _mail([("track.csv.gz", FIXTURE.read_bytes())]),
    })
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda recipient, reason: sent.append((recipient, reason)))
    batch = adapter.acquire_messages()
    assert [item.outcome for item in batch.examined_messages] == [
        OVHMessageOutcome.UNSUPPORTED, OVHMessageOutcome.UNSUPPORTED,
        OVHMessageOutcome.MULTIPLE_SUPPORTED, OVHMessageOutcome.SUPPORTED,
    ]

    summary = review_mailbox_now(provider=adapter)
    assert summary.processed == 1
    assert sent == [("sailor@example.test", "multiple_supported")]
    assert [r["provider_message_id"] for r in IngestionHistory().records()] == ["456:4"]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 4)
    assert TechnicalNoticeStore(tmp_path).records()["456:3"]["status"] == "sent"
    review_mailbox_now(provider=adapter)
    assert len(sent) == 1


@pytest.mark.parametrize("consent", [None, ConsentStatus.PENDING, ConsentStatus.REVOKED, ConsentStatus.ACTIVE])
@pytest.mark.parametrize("filename,content", [
    ("invalid.gpx", b"<gpx/>"),
    ("invalid.csv", b"wrong,column\n1,2\n"),
    ("invalid.vkx", b"not a vkx"),
])
def test_invalid_single_track_notice_is_consent_independent(
    monkeypatch, tmp_path, consent, filename, content,
):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([(filename, content)])})
    if consent is not None:
        sailors = SailorRepository()
        sailor, _ = sailors.find_or_create_by_email("sailor@example.test")
        sailor.consent_status = consent
        sailors.replace(sailor)
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda recipient, reason: sent.append((recipient, reason)))
    assert review_mailbox_now(provider=adapter).failed == 1
    record = IngestionHistory().records()[0]
    assert record["status"] == "failed"
    assert record["technical_notice_reason"] == "invalid_track"
    assert sent == [("sailor@example.test", "invalid_track")]
    assert len(SailorRepository().all()) == (0 if consent is None else 1)
    review_mailbox_now(provider=adapter)
    assert len(sent) == 1


@pytest.mark.parametrize("sender,headers", [
    (None, ()),
    ("not-an-address", ()),
    ("share@tackbar.eu", ()),
    ("hello@tackbar.eu", ()),
    ("sailor@example.test", (("Auto-Submitted", "auto-replied"),)),
    ("sailor@example.test", (("Precedence", "bulk"),)),
    ("sailor@example.test", (("List-Id", "a list"),)),
    ("sailor@example.test", (("X-Loop", "share@tackbar.eu"),)),
    ("sailor@example.test", (("Return-Path", "<>"),)),
])
def test_unsafe_sender_or_automatic_mail_gets_no_notice(monkeypatch, tmp_path, sender, headers):
    adapter = _runtime(monkeypatch, tmp_path, {
        1: _mail([("one.gpx", b"x"), ("two.gpx", b"y")], sender, headers),
    })
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert adapter.acquire_messages().examined_messages[0].notice_recipient is None
    review_mailbox_now(provider=adapter)
    assert sent == []
    assert TechnicalNoticeStore(tmp_path).records() == {}


def test_duplicate_from_is_ambiguous(monkeypatch, tmp_path):
    raw = _mail([("one.gpx", b"x"), ("two.gpx", b"y")])
    raw = raw.replace(b"From: Sailor <sailor@example.test>\n",
                      b"From: Sailor <sailor@example.test>\nFrom: victim@example.test\n", 1)
    adapter = _runtime(monkeypatch, tmp_path, {1: raw})
    assert adapter.acquire_messages().examined_messages[0].notice_recipient is None


def test_attempt_claim_precedes_smtp_and_uncertain_delivery_is_terminal(tmp_path):
    store = TechnicalNoticeStore(tmp_path)
    observed = []

    def interrupt(recipient, reason):
        observed.append(store.records()["456:1"]["status"])
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        store.attempt_once("456:1", "sailor@example.test", "multiple_supported", interrupt)
    assert observed == ["attempted"]
    assert store.records()["456:1"]["status"] == "attempted"
    assert not TechnicalNoticeStore(tmp_path).attempt_once(
        "456:1", "sailor@example.test", "multiple_supported", lambda *_: pytest.fail("resent")
    )
    assert store.attempt_once("456:2", "sailor@example.test", "invalid_track",
                              lambda *_: (_ for _ in ()).throw(RuntimeError("smtp failure")))
    assert store.records()["456:2"]["status"] == "failed"


def test_failed_reservation_write_prevents_smtp_and_allows_one_safe_later_attempt(
    monkeypatch, tmp_path,
):
    store = TechnicalNoticeStore(tmp_path)
    sent = []
    original_write = store._write

    def fail_reservation(_records):
        raise OSError("reservation unavailable")

    monkeypatch.setattr(store, "_write", fail_reservation)
    with pytest.raises(OSError, match="reservation unavailable"):
        store.attempt_once(
            "456:1", "sailor@example.test", "multiple_supported",
            lambda recipient, reason: sent.append((recipient, reason)),
        )
    assert sent == []
    assert store.records() == {}
    assert not store.path.exists()

    monkeypatch.setattr(store, "_write", original_write)
    assert store.attempt_once(
        "456:1", "sailor@example.test", "multiple_supported",
        lambda recipient, reason: sent.append((recipient, reason)),
    )
    assert store.records()["456:1"]["status"] == "sent"
    assert not store.attempt_once(
        "456:1", "sailor@example.test", "multiple_supported",
        lambda *_: pytest.fail("SMTP retried after durable attempt"),
    )
    assert sent == [("sailor@example.test", "multiple_supported")]


def test_failed_ingestion_recovers_notice_after_interruption(monkeypatch, tmp_path):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([("bad.gpx", b"<gpx/>")])})
    original = TechnicalNoticeStore.attempt_once
    interrupted = []

    def interrupt_once(self, *args, **kwargs):
        if not interrupted:
            interrupted.append(True)
            raise KeyboardInterrupt
        return original(self, *args, **kwargs)

    monkeypatch.setattr(TechnicalNoticeStore, "attempt_once", interrupt_once)
    with pytest.raises(KeyboardInterrupt):
        review_mailbox_now(provider=adapter)
    assert OVHMailboxCursorStore().load() is None
    assert IngestionHistory().records()[0]["technical_notice_reason"] == "invalid_track"
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).known_failed == 1
    assert sent == [("sailor@example.test", "invalid_track")]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 1)


def test_multi_rejection_uncertain_send_is_not_repeated_and_later_mail_processes(
    monkeypatch, tmp_path,
):
    adapter = _runtime(monkeypatch, tmp_path, {
        1: _mail([("one.gpx", b"x"), ("two.gpx", b"y")]),
        2: _mail([("track.csv.gz", FIXTURE.read_bytes())]),
    })
    attempts = []

    def interrupt(*args):
        attempts.append(args)
        raise KeyboardInterrupt

    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice", interrupt)
    with pytest.raises(KeyboardInterrupt):
        review_mailbox_now(provider=adapter)
    assert attempts == [("sailor@example.test", "multiple_supported")]
    assert TechnicalNoticeStore(tmp_path).records()["456:1"]["status"] == "attempted"
    assert OVHMailboxCursorStore().load() is None
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: attempts.append(args))
    assert review_mailbox_now(provider=adapter).processed == 1
    assert len(attempts) == 1
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 2)
    assert [record["provider_message_id"] for record in IngestionHistory().records()] == ["456:2"]


def test_invalid_track_notice_does_not_block_later_healthy_track(monkeypatch, tmp_path):
    adapter = _runtime(monkeypatch, tmp_path, {
        1: _mail([("bad.gpx", b"<gpx/>")]),
        2: _mail([("track.csv.gz", FIXTURE.read_bytes())]),
    })
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    summary = review_mailbox_now(provider=adapter)
    assert (summary.failed, summary.processed) == (1, 1)
    assert sent == [("sailor@example.test", "invalid_track")]
    assert [record["status"] for record in IngestionHistory().records()] == ["failed", "processed"]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 2)


def test_configured_owned_from_address_is_suppressed(monkeypatch, tmp_path):
    monkeypatch.setenv("TACKBAR_OVH_SMTP_FROM", "another-owned@example.test")
    adapter = _runtime(monkeypatch, tmp_path, {
        1: _mail([("one.gpx", b"x"), ("two.gpx", b"y")],
                 sender="another-owned@example.test"),
    })
    assert adapter.acquire_messages().examined_messages[0].notice_recipient is None


@pytest.mark.parametrize("failure", ["parser_io", "downstream"])
def test_infrastructure_or_downstream_failure_is_not_notified(monkeypatch, tmp_path, failure):
    adapter = _runtime(monkeypatch, tmp_path, {
        1: _mail([("track.csv.gz", FIXTURE.read_bytes())]),
    })
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    def fail(*_args, **_kwargs):
        if failure == "parser_io":
            raise OSError("storage unavailable")
        raise ValueError("downstream validation")
    target = (
        "app.services.email_ingestion.parse_track_attachment"
        if failure == "parser_io"
        else "app.services.ingestion_processing._process_activity"
    )
    monkeypatch.setattr(target, fail)
    assert review_mailbox_now(provider=adapter).failed == 1
    record = IngestionHistory().records()[0]
    assert record["status"] == "failed"
    assert record["technical_notice_reason"] is None
    assert sent == []
    assert TechnicalNoticeStore(tmp_path).records() == {}


def test_generic_malformed_acquisition_is_not_notified(monkeypatch, tmp_path):
    adapter = _runtime(monkeypatch, tmp_path, {1: b"arbitrary input"})
    def fail(*_args):
        raise ValueError("ambiguous MIME extraction")
    monkeypatch.setattr("app.email_providers.ovh._extract_email", fail)
    assert adapter.acquire_messages().examined_messages[0].outcome == OVHMessageOutcome.MALFORMED
    assert review_mailbox_now(provider=adapter).discovered_candidates == 0
    assert TechnicalNoticeStore(tmp_path).records() == {}


def test_historical_record_without_notice_classification_reads_without_rewrite(
    monkeypatch, tmp_path,
):
    _runtime(monkeypatch, tmp_path, {})
    history = IngestionHistory()
    history.create("ovh", "456:9", "sailor@example.test", "old.gpx", None)
    records = json.loads(history.path.read_text(encoding="utf-8"))
    del records[0]["technical_notice_reason"]
    old_bytes = (json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode()
    history.path.write_bytes(old_bytes)
    assert history.records()[0]["technical_notice_reason"] is None
    assert history.path.read_bytes() == old_bytes


def test_failure_notice_copy_has_common_footer_and_no_private_data():
    from app.services.technical_failure_notice import _body, SUBJECT
    from app.services.outbound_mail import compose_automated_mail

    for reason in ("multiple_supported", "invalid_track"):
        message = compose_automated_mail("sailor@example.test", SUBJECT, _body(reason))
        assert message.body.count(CONTACT_FOOTER) == 1
        assert "Hola" in message.body and "Hi" in message.body
        assert "https://" not in message.body
        assert "/me/" not in message.body and "/s/" not in message.body


def test_all_automated_templates_have_exactly_one_shared_footer():
    from app.services.consent_request_email import compose_consent_request_email
    from app.services.welcome_email import compose_welcome_email
    from app.services.session_result_email import compose_session_result_email
    from app.services.technical_failure_notice import _body, SUBJECT
    from app.services.outbound_mail import compose_automated_mail

    messages = [
        compose_consent_request_email("sailor@example.test", "request-" + "r" * 40,
                                      "https://app.example.test"),
        compose_welcome_email("sailor@example.test", "/me/personal", "https://app.example.test"),
        compose_session_result_email("sailor@example.test", "/s/session", "/me/personal",
                                     "https://app.example.test"),
        compose_automated_mail("sailor@example.test", SUBJECT, _body("invalid_track")),
    ]
    assert all(message.body.count(CONTACT_FOOTER) == 1 for message in messages)
    assert all(message.body.endswith(CONTACT_FOOTER + "\n") for message in messages)
