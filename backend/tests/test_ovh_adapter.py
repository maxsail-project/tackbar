import gzip
from datetime import timezone
from email.message import EmailMessage
from pathlib import Path

import pytest

from app.email_providers.ovh import (
    OVHAdapter,
    OVHMessageOutcome,
    OVHUIDValidityMismatch,
)


FIXTURE = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"


class FakeIMAP:
    def __init__(
        self,
        messages: dict[bytes, bytes],
        *,
        fail_uids: set[bytes] | None = None,
        uidvalidity: bytes = b"456",
    ) -> None:
        self.messages = messages
        self.fail_uids = fail_uids or set()
        self.uidvalidity = uidvalidity
        self.calls: list[tuple] = []

    def login(self, username, password):
        self.calls.append(("login", username, password))
        return "OK", []

    def select(self, mailbox, readonly=False):
        self.calls.append(("select", mailbox, readonly))
        return "OK", [str(len(self.messages)).encode()]

    def response(self, code):
        self.calls.append(("response", code))
        return "UIDVALIDITY", [self.uidvalidity]

    def uid(self, command, *args):
        self.calls.append(("uid", command, *args))
        if command == "SEARCH":
            return "OK", [b" ".join(self.messages)]
        if args[0] in self.fail_uids:
            return "NO", []
        return "OK", [(b"1 (BODY[] {123})", self.messages[args[0]]), b")"]

    def close(self):
        self.calls.append(("close",))

    def logout(self):
        self.calls.append(("logout",))


def _message(
    subject="vakaros-demo.csv.gz",
    attachments=None,
    date="Sat, 12 Sep 2026 09:30:00 +0200",
    sender="Sailor A <sailor-a@example.com>",
) -> bytes:
    message = EmailMessage()
    message["From"] = sender
    message["Subject"] = subject
    if date is not None:
        message["Date"] = date
    if attachments is None:
        attachments = [("vakaros-demo.csv.gz", FIXTURE.read_bytes())]
    for filename, content in attachments:
        message.add_attachment(content, maintype="application", subtype="octet-stream", filename=filename)
    return message.as_bytes()


def _adapter(monkeypatch, messages, **fake_options):
    fake = FakeIMAP(messages, **fake_options)
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


def test_ovh_candidate_eligibility_depends_only_on_supported_attachments(monkeypatch):
    csv = gzip.decompress(FIXTURE.read_bytes())
    messages = {
        b"1": _message(subject="Training notes"),
        b"2": _message(
            subject="activity.csv",
            attachments=[("notes.txt", b"notes")],
        ),
        b"3": _message(
            subject="Completely unrelated text",
            attachments=[("photo.jpg", b"photo"), ("vakaros-demo.CSV", csv)],
        ),
        b"4": _message(subject="No files", attachments=[]),
    }
    adapter, _, _ = _adapter(monkeypatch, messages)

    batch = adapter.acquire_messages()
    candidates = [
        item.candidate
        for item in batch.examined_messages
        if item.candidate is not None
    ]

    assert [candidate.provider_message_id for candidate in candidates] == [
        "456:1",
        "456:3",
    ]
    assert [item.outcome for item in batch.examined_messages] == [
        OVHMessageOutcome.SUPPORTED,
        OVHMessageOutcome.UNSUPPORTED,
        OVHMessageOutcome.SUPPORTED,
        OVHMessageOutcome.UNSUPPORTED,
    ]
    assert candidates[0].attachment_filename == "vakaros-demo.csv.gz"
    assert candidates[1].attachment_filename == "vakaros-demo.CSV"
    assert candidates[1].attachment_bytes == csv


def test_ovh_accepts_real_pilot_shape_without_private_track_data(monkeypatch):
    subject = "SHIMASAIL track ult. día track H. Reina."
    filename = "SHIMASAIL 5-7-2026.csv"
    csv = gzip.decompress(FIXTURE.read_bytes())
    adapter, _, _ = _adapter(
        monkeypatch,
        {
            b"5": _message(
                subject=subject,
                sender="aquaxsailing@gmail.com",
                attachments=[(filename, csv)],
            )
        },
    )

    candidates = adapter.get_candidate_emails()

    assert len(candidates) == 1
    assert candidates[0].sender_email == "aquaxsailing@gmail.com"
    assert candidates[0].subject == subject
    assert candidates[0].attachment_filename == filename
    assert candidates[0].attachment_bytes == csv


def test_ovh_decodes_filename_and_tolerates_bad_date(monkeypatch):
    raw = _message(date=None).replace(b'filename="vakaros-demo.csv.gz"', b'filename="=?utf-8?b?dmFrYXJvcy1kZW1vLmNzdi5neg==?="')
    adapter, _, _ = _adapter(monkeypatch, {b"8": raw})

    candidates = adapter.get_candidate_emails()

    assert candidates[0].attachment_filename == "vakaros-demo.csv.gz"
    assert candidates[0].received_at is None


def test_ovh_treats_malformed_message_as_examined_and_continues(monkeypatch):
    adapter, fake, _ = _adapter(
        monkeypatch,
        {
            b"4": _message(
                attachments=[("one.csv", b"one"), ("two.csv.gz", b"two")]
            ),
            b"5": _message(),
        },
    )

    batch = adapter.acquire_messages()

    assert [item.uid for item in batch.examined_messages] == [4, 5]
    assert batch.examined_messages[0].candidate is None
    assert batch.examined_messages[0].outcome == OVHMessageOutcome.MALFORMED
    assert batch.examined_messages[0].error_class == "ValueError"
    assert batch.examined_messages[1].candidate is not None
    assert batch.examined_messages[1].outcome == OVHMessageOutcome.SUPPORTED
    assert fake.calls[-2:] == [("close",), ("logout",)]


def test_ovh_incremental_search_fetches_only_uids_above_cursor(monkeypatch):
    adapter, fake, _ = _adapter(
        monkeypatch,
        {b"17": _message(), b"19": _message(), b"18": _message()},
    )

    batch = adapter.acquire_messages(
        last_seen_uid=17, expected_uidvalidity=456
    )

    assert [item.uid for item in batch.examined_messages] == [18, 19]
    assert ("uid", "SEARCH", None, "UID 18:*") in fake.calls
    assert ("uid", "FETCH", b"17", "(BODY.PEEK[])") not in fake.calls


def test_ovh_no_new_uids_does_not_fetch_historical_messages(monkeypatch):
    adapter, fake, _ = _adapter(monkeypatch, {b"17": _message()})

    batch = adapter.acquire_messages(
        last_seen_uid=17, expected_uidvalidity=456
    )

    assert batch.examined_messages == ()
    assert ("uid", "SEARCH", None, "UID 18:*") in fake.calls
    assert not any(call[:2] == ("uid", "FETCH") for call in fake.calls)


def test_ovh_fetch_failure_stops_at_highest_examined_prefix(monkeypatch):
    adapter, fake, _ = _adapter(
        monkeypatch,
        {b"100": _message(), b"101": _message(), b"102": _message()},
        fail_uids={b"101"},
    )

    batch = adapter.acquire_messages()

    assert batch.acquisition_failed
    assert [item.uid for item in batch.examined_messages] == [100]
    assert ("uid", "FETCH", b"102", "(BODY.PEEK[])") not in fake.calls


def test_ovh_uidvalidity_mismatch_fails_before_search(monkeypatch):
    adapter, fake, _ = _adapter(monkeypatch, {b"17": _message()})

    with pytest.raises(OVHUIDValidityMismatch):
        adapter.acquire_messages(
            last_seen_uid=16, expected_uidvalidity=999
        )

    assert not any(call[:2] == ("uid", "SEARCH") for call in fake.calls)
