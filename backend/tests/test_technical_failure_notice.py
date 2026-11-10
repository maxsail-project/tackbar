from email.message import EmailMessage
import gzip
import json
from pathlib import Path

import pytest

from app.email_providers.ovh import OVHAdapter, OVHMessageOutcome
from app.parsers.gpx import GPXParseError
from app.models import ConsentStatus
from app.repositories.sailors import SailorRepository
from app.services.ingestion_history import IngestionHistory
from app.services.mailbox_review import review_mailbox_now
from app.services.ovh_mailbox_cursor import OVHMailboxCursor, OVHMailboxCursorStore
from app.services.outbound_mail import CONTACT_FOOTER
from app.services.technical_failure_notice import TechnicalNoticeStore
from app.services.technical_failure_notice import _body
from test_gpx import gpx_bytes
from test_vakaros_vkx import _position, _vkx


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
                        lambda recipient, reason, *feedback: sent.append((recipient, reason, *feedback)))
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
                        lambda recipient, reason, *feedback: sent.append((recipient, reason, *feedback)))
    assert review_mailbox_now(provider=adapter).failed == 1
    record = IngestionHistory().records()[0]
    assert record["status"] == "failed"
    assert record["technical_notice_reason"] == "invalid_track"
    expected_feedback = ()
    if filename.endswith(".gpx"):
        expected_feedback = ({"category": "structure"},)
    elif filename.endswith(".csv"):
        expected_feedback = ({
            "category": "vakaros_incomplete",
            "missing_columns": sorted([
                "timestamp", "latitude", "longitude", "sog_kts", "cog",
                "hdg_true", "heel", "trim",
            ]),
        },)
    assert sent == [("sailor@example.test", "invalid_track", *expected_feedback)]
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


def test_classified_notice_uncertain_send_is_at_most_once(tmp_path):
    store = TechnicalNoticeStore(tmp_path)
    feedback = {"category": "quality", "metrics": {"median": "3"}}
    observed = []

    def interrupt(recipient, reason, safe_context):
        observed.append((store.records()["456:1"]["status"], recipient, reason, safe_context))
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        store.attempt_once("456:1", "sailor@example.test", "invalid_track", interrupt, feedback)
    assert observed == [("attempted", "sailor@example.test", "invalid_track", feedback)]
    assert not TechnicalNoticeStore(tmp_path).attempt_once(
        "456:1", "sailor@example.test", "invalid_track",
        lambda *_: pytest.fail("classified notice resent"), feedback)


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
    assert sent == [("sailor@example.test", "invalid_track", {"category": "structure"})]
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
    assert sent == [("sailor@example.test", "invalid_track", {"category": "structure"})]
    assert [record["status"] for record in IngestionHistory().records()] == ["failed", "processed"]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 2)


@pytest.mark.parametrize("content,category", [
    (gpx_bytes((0, 3)), "quality"),
    (gpx_bytes().replace(b"+00:00", b"", 1), "timezone"),
    (gpx_bytes().replace(b"2031-06-15T08:00:00+00:00", b"not-a-time", 1), "chronology"),
    (gpx_bytes((0, 1, 1, 3)), "chronology"),
    (b"<gpx/>", "structure"),
    (gpx_bytes().replace(b'lat="0"', b'lat="999"', 1), "coordinates"),
])
def test_ovh_persists_and_sends_each_gpx_feedback_category(monkeypatch, tmp_path, content, category):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([("private-name.gpx", content)])})
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).failed == 1
    record = IngestionHistory().records()[0]
    assert record["technical_notice_feedback"]["category"] == category
    assert sent == [("sailor@example.test", "invalid_track", record["technical_notice_feedback"])]
    body = _body("invalid_track", record["technical_notice_feedback"])
    assert "Hola" in body and "Hi" in body
    assert "private-name.gpx" not in body and record["last_error"] not in body
    assert TechnicalNoticeStore(tmp_path).records()["456:1"]["status"] == "sent"


@pytest.mark.parametrize("filename,content,category", [
    ("track.csv", b"", "vakaros_incomplete"),
    ("track.csv.gz", gzip.compress(b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim\n"), "vakaros_incomplete"),
    ("track.csv", b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim\nbad-time,38,-0.2,5,90,90,0,0\n", "vakaros_gps"),
    ("track.csv", b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim\n,38,-0.2,5,90,90,0,0\n", "vakaros_gps"),
    ("track.csv", b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim,q_w\n2031-06-10T10:00:00Z,38,-0.2,5,90,90,0,0,1\n", "vakaros_sensor"),
    ("track.vkx", _vkx(_position()) + bytes([0x04]) + bytes(12), "vakaros_incomplete"),
    ("track.vkx.gz", gzip.compress(_vkx(_position(), revision=0x04)), "vakaros_format"),
    ("track.vkx", _vkx(_position(latitude_raw=910_000_000)), "vakaros_gps"),
    ("track.vkx", _vkx(_position(quat_w=float("nan"))), "vakaros_sensor"),
])
def test_ovh_persists_and_sends_vakaros_feedback(monkeypatch, tmp_path, filename, content, category):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([(filename, content)])})
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).failed == 1
    record = IngestionHistory().records()[0]
    assert record["technical_notice_feedback"]["category"] == category
    assert sent == [("sailor@example.test", "invalid_track", record["technical_notice_feedback"])]
    body = _body("invalid_track", record["technical_notice_feedback"])
    assert "Hola" in body and "Hi" in body
    assert "correo nuevo" in body and "new email" in body
    assert filename not in body and record["last_error"] not in body
    assert "0x04" not in body and "0x05" not in body
    assert TechnicalNoticeStore(tmp_path).records()["456:1"]["status"] == "sent"


@pytest.mark.parametrize("filename,content", [
    ("track.csv", b"\xff"),
    ("track.vkx", _vkx(_position()) + bytes([0x99])),
    ("track.vkx.gz", b"not gzip"),
])
def test_ambiguous_vakaros_rejection_keeps_generic_ovh_notice(monkeypatch, tmp_path, filename, content):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([(filename, content)])})
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).failed == 1
    assert IngestionHistory().records()[0]["technical_notice_feedback"] is None
    assert sent == [("sailor@example.test", "invalid_track")]


@pytest.mark.parametrize("content,expected", [
    (_vkx(_position(), revision=0x04), {"category": "vakaros_format"}),
    (_vkx(_position()) + bytes([0x04]) + bytes(12),
     {"category": "vakaros_incomplete", "subtype": "vkx_truncated"}),
])
def test_vakaros_interrupted_notice_recovers_without_reparse(monkeypatch, tmp_path, content, expected):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([("track.vkx", content)])})
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
    record = IngestionHistory().records()[0]
    assert record["technical_notice_feedback"] == expected
    monkeypatch.setattr("app.services.email_ingestion.parse_track_attachment",
                        lambda *_args, **_kwargs: pytest.fail("track reparsed"))
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).known_failed == 1
    assert sent == [("sailor@example.test", "invalid_track", expected)]
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 1)
    assert not TechnicalNoticeStore(tmp_path).attempt_once(
        "456:1", "sailor@example.test", "invalid_track", lambda *_: pytest.fail("resent"))


def test_classified_vakaros_mail_respects_unsafe_recipient(monkeypatch, tmp_path):
    adapter = _runtime(monkeypatch, tmp_path, {
        1: _mail([("track.vkx", _vkx(_position(), revision=0x04))],
                 sender="share@tackbar.eu"),
    })
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).failed == 1
    assert IngestionHistory().records()[0]["technical_notice_feedback"] == {"category": "vakaros_format"}
    assert sent == [] and TechnicalNoticeStore(tmp_path).records() == {}


def test_interrupted_quality_decision_uses_persisted_safe_metrics_without_reparse(monkeypatch, tmp_path):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([("bad.gpx", gpx_bytes((0, 3)))])})
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
    record = IngestionHistory().records()[0]
    assert record["technical_notice_feedback"] == {"category": "quality", "metrics": {"median": "3"}}
    sent = []
    monkeypatch.setattr("app.services.email_ingestion.parse_track_attachment",
                        lambda *_args, **_kwargs: pytest.fail("track reparsed"))
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).known_failed == 1
    assert sent == [("sailor@example.test", "invalid_track", record["technical_notice_feedback"])]
    assert not TechnicalNoticeStore(tmp_path).attempt_once(
        "456:1", "sailor@example.test", "invalid_track", lambda *_: pytest.fail("resent"))
    assert review_mailbox_now(provider=adapter).discovered_candidates == 0
    assert len(sent) == 1


def test_unclassified_gpx_exception_never_enters_notice(monkeypatch, tmp_path):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([("private-file.gpx", b"<secret>private XML</secret>")])})
    monkeypatch.setattr("app.services.email_ingestion.parse_track_attachment",
                        lambda *_args, **_kwargs: (_ for _ in ()).throw(GPXParseError("C:/private/path <secret>private XML</secret>")))
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).failed == 1
    record = IngestionHistory().records()[0]
    assert record["technical_notice_feedback"] is None
    assert sent == [("sailor@example.test", "invalid_track")]
    body = _body("invalid_track", record["technical_notice_feedback"])
    assert "C:/private/path" not in body and "private XML" not in body
    assert "private-file.gpx" not in body


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
    del records[0]["technical_notice_feedback"]
    old_bytes = (json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode()
    history.path.write_bytes(old_bytes)
    assert history.records()[0]["technical_notice_reason"] is None
    assert history.records()[0]["technical_notice_feedback"] is None
    assert history.path.read_bytes() == old_bytes


@pytest.mark.parametrize("feedback", [None, {"category": ["quality"]}, {"category": "quality", "metrics": {"median": "C:/secret"}}])
def test_interrupted_historical_or_malformed_feedback_uses_generic_notice(monkeypatch, tmp_path, feedback):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([("bad.gpx", b"<gpx/>")])})
    history = IngestionHistory()
    record = history.create("ovh", "456:1", "sailor@example.test", "bad.gpx", None)
    record.update(status="failed", technical_notice_reason="invalid_track")
    history.replace(record)
    raw = json.loads(history.path.read_text(encoding="utf-8"))
    if feedback is None:
        del raw[0]["technical_notice_feedback"]
    else:
        raw[0]["technical_notice_feedback"] = feedback
    history.path.write_text(json.dumps(raw), encoding="utf-8")
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).known_failed == 1
    assert sent == [("sailor@example.test", "invalid_track")]
    assert TechnicalNoticeStore(tmp_path).records()["456:1"]["status"] == "sent"


@pytest.mark.parametrize("feedback,expected", [
    ({"category": "vakaros_incomplete"}, {"category": "vakaros_incomplete"}),
    ({"category": "vakaros_incomplete", "missing_columns": ["C:/private/secret"]}, None),
    ({"category": "vakaros_incomplete", "subtype": "private_subtype"}, None),
])
def test_historical_or_malformed_vakaros_feedback_recovers_safely(monkeypatch, tmp_path, feedback, expected):
    adapter = _runtime(monkeypatch, tmp_path, {1: _mail([("old.vkx", b"not a vkx")])})
    history = IngestionHistory()
    record = history.create("ovh", "456:1", "sailor@example.test", "old.vkx", None)
    record.update(status="failed", technical_notice_reason="invalid_track")
    history.replace(record)
    raw = json.loads(history.path.read_text(encoding="utf-8"))
    raw[0]["technical_notice_feedback"] = feedback
    history.path.write_text(json.dumps(raw), encoding="utf-8")
    sent = []
    monkeypatch.setattr("app.services.technical_failure_notice.send_technical_failure_notice",
                        lambda *args: sent.append(args))
    assert review_mailbox_now(provider=adapter).known_failed == 1
    expected_args = ("sailor@example.test", "invalid_track", expected) if expected else ("sailor@example.test", "invalid_track")
    assert sent == [expected_args]
    assert TechnicalNoticeStore(tmp_path).records()["456:1"]["status"] == "sent"


def test_failure_notice_copy_has_common_footer_and_no_private_data():
    from app.services.technical_failure_notice import _body, SUBJECT
    from app.services.outbound_mail import compose_automated_mail

    for reason in ("multiple_supported", "invalid_track"):
        message = compose_automated_mail("sailor@example.test", SUBJECT, _body(reason))
        assert message.body.count(CONTACT_FOOTER) == 1
        assert "Hola" in message.body and "Hi" in message.body
        assert "https://" not in message.body
        assert "/me/" not in message.body and "/s/" not in message.body


def test_generic_and_multiple_supported_copy_is_unchanged():
    assert _body("invalid_track") == (
        "Hola,\n\nNo pudimos procesar tu envío de track a TackBar. "
        "Revisa el archivo del track y vuelve a enviarlo en un correo nuevo."
        "\n\n---\n\nHi,\n\nWe could not process your TackBar track submission. "
        "Check the track file and send it again in a new email."
    )
    assert _body("multiple_supported") == (
        "Hola,\n\nNo pudimos procesar tu envío de track a TackBar. "
        "Envía cada track compatible en un correo separado."
        "\n\n---\n\nHi,\n\nWe could not process your TackBar track submission. "
        "Send each supported track in a separate email."
    )


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
