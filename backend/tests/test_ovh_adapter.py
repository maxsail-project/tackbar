import gzip
from datetime import timezone
from email.message import EmailMessage
from pathlib import Path

import pytest

from app.email_providers.ovh import OVHAdapter


FIXTURE = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"


class FakeIMAP:
    def __init__(self, messages: dict[bytes, bytes]) -> None:
        self.messages = messages
        self.calls: list[tuple] = []

    def login(self, username, password):
        self.calls.append(("login", username, password))
        return "OK", []

    def select(self, mailbox, readonly=False):
        self.calls.append(("select", mailbox, readonly))
        return "OK", [str(len(self.messages)).encode()]

    def response(self, code):
        self.calls.append(("response", code))
        return "UIDVALIDITY", [b"456"]

    def uid(self, command, *args):
        self.calls.append(("uid", command, *args))
        if command == "SEARCH":
            return "OK", [b" ".join(self.messages)]
        return "OK", [(b"1 (BODY[] {123})", self.messages[args[0]]), b")"]

    def close(self):
        self.calls.append(("close",))

    def logout(self):
        self.calls.append(("logout",))


def _message(subject="vakaros-demo.csv.gz", attachments=None, date="Sat, 12 Sep 2026 09:30:00 +0200") -> bytes:
    message = EmailMessage()
    message["From"] = "Sailor A <sailor-a@example.com>"
    message["Subject"] = subject
    if date is not None:
        message["Date"] = date
    for filename, content in attachments or [("vakaros-demo.csv.gz", FIXTURE.read_bytes())]:
        message.add_attachment(content, maintype="application", subtype="octet-stream", filename=filename)
    return message.as_bytes()


def _adapter(monkeypatch, messages):
    fake = FakeIMAP(messages)
    calls = []

    def connect(host, port):
        calls.append((host, port))
        return fake

    monkeypatch.setattr("app.email_providers.ovh.imaplib.IMAP4_SSL", connect)
    return OVHAdapter("imap.mail.ovh.net", 993, "share@tackbar.eu", "test-secret"), fake, calls


def test_ovh_extracts_one_message_using_read_only_uid_fetch(monkeypatch):
    content = FIXTURE.read_bytes()
    adapter, fake, calls = _adapter(monkeypatch, {b"17": _message()})

    candidates = adapter.get_candidate_emails()

    assert calls == [("imap.mail.ovh.net", 993)]
    assert fake.calls == [
        ("login", "share@tackbar.eu", "test-secret"),
        ("select", "INBOX", True),
        ("response", "UIDVALIDITY"),
        ("uid", "SEARCH", None, "ALL"),
        ("uid", "FETCH", b"17", "(BODY.PEEK[])"),
        ("close",), ("logout",),
    ]
    assert len(candidates) == 1
    email = candidates[0]
    assert email.sender_email == "sailor-a@example.com"
    assert email.subject == "vakaros-demo.csv.gz"
    assert email.attachment_filename == "vakaros-demo.csv.gz"
    assert email.attachment_bytes == content
    assert email.provider_message_id == "456:17"
    assert email.received_at is not None
    assert email.received_at.astimezone(timezone.utc).isoformat() == "2026-09-12T07:30:00+00:00"


def test_ovh_filters_subject_and_attachment_and_accepts_csv(monkeypatch):
    csv = gzip.decompress(FIXTURE.read_bytes())
    messages = {
        b"1": _message(subject="Training notes"),
        b"2": _message(attachments=[("notes.txt", b"notes")]),
        b"3": _message(subject="vakaros-demo.CSV", attachments=[("vakaros-demo.CSV", csv)]),
    }
    adapter, _, _ = _adapter(monkeypatch, messages)

    candidates = adapter.get_candidate_emails()

    assert len(candidates) == 1
    assert candidates[0].provider_message_id == "456:3"
    assert candidates[0].attachment_bytes == csv


def test_ovh_decodes_filename_and_tolerates_bad_date(monkeypatch):
    raw = _message(date=None).replace(b'filename="vakaros-demo.csv.gz"', b'filename="=?utf-8?b?dmFrYXJvcy1kZW1vLmNzdi5neg==?="')
    adapter, _, _ = _adapter(monkeypatch, {b"8": raw})

    candidates = adapter.get_candidate_emails()

    assert candidates[0].attachment_filename == "vakaros-demo.csv.gz"
    assert candidates[0].received_at is None


def test_ovh_rejects_multiple_supported_attachments_and_logs_out(monkeypatch):
    adapter, fake, _ = _adapter(monkeypatch, {b"4": _message(attachments=[("one.csv", b"one"), ("two.csv.gz", b"two")])})

    with pytest.raises(ValueError, match="multiple supported attachments"):
        adapter.get_candidate_emails()

    assert fake.calls[-2:] == [("close",), ("logout",)]
