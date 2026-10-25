"""One-track pilot journeys through staged OVH review with fake IMAP and SMTP."""

from email.message import EmailMessage
from pathlib import Path

import pytest

from app.email_providers.ovh import OVHAdapter
from app.models import ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.consent_request_email import CONSENT_REQUEST_EMAIL_SUBJECT
from app.services.consent_requests import ConsentRequestService
from app.services.ingestion_history import IngestionHistory
from app.services.mail_feedback_email import RESULT_SUBJECT
from app.services.mail_receipts import MailReceiptStore
from app.services.mailbox_review import review_mailbox_now
from app.services.outbound_mail import OvhSmtpTransport
from app.services.sailor_consent import SailorConsentService
from app.services.web_consent import PublicConsentState, WebConsentService
from app.services.welcome_email import WELCOME_EMAIL_SUBJECT


VAKAROS = (Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz").read_bytes()


class FakeIMAP:
    def __init__(self, raw: bytes):
        self.raw = raw
        self.calls = []

    def login(self, *_args):
        return "OK", []

    def select(self, mailbox, readonly=False):
        assert mailbox == "INBOX" and readonly is True
        return "OK", [b"1"]

    def response(self, _code):
        return "UIDVALIDITY", [b"456"]

    def uid(self, command, *args):
        self.calls.append((command, *args))
        if command == "SEARCH":
            return "OK", [b"1"]
        assert command == "FETCH" and args[0] == b"1"
        if args[1] == "(RFC822.SIZE)":
            return "OK", [f"1 (RFC822.SIZE {len(self.raw)})".encode()]
        assert args[1] == "(BODY.PEEK[])"
        return "OK", [(b"1 (BODY[])", self.raw)]

    def close(self):
        pass

    def logout(self):
        pass


@pytest.fixture
def pilot(tmp_path, monkeypatch):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    monkeypatch.setenv("TACKBAR_OVH_STAGED_MAIL_ENABLED", "1")
    monkeypatch.setenv("TACKBAR_PUBLIC_BASE_URL", "https://app.example.test")
    from app.services import ingestion_processing

    class NoEnrichment:
        def enrich_new_session_context(self, _session_id):
            pass

    monkeypatch.setattr(ingestion_processing, "automatic_session_enrichment_service", lambda *_: NoEnrichment())
    outgoing = []

    class FakeSMTP:
        def send(self, message):
            outgoing.append(message)

    monkeypatch.setattr(OvhSmtpTransport, "from_environment", lambda: FakeSMTP())
    raw_mail = EmailMessage()
    raw_mail["From"] = "Pilot Sailor <pilot@example.test>"
    raw_mail["Subject"] = "Race track"
    raw_mail.add_attachment(VAKAROS, maintype="application", subtype="octet-stream", filename="race.csv.gz")
    fake_imap = FakeIMAP(raw_mail.as_bytes())
    monkeypatch.setattr("app.email_providers.ovh.imaplib.IMAP4_SSL", lambda *_: fake_imap)
    adapter = OVHAdapter("fake-imap", 993, "share@example.test", "secret")
    return adapter, fake_imap, outgoing


def test_active_single_vakaros_mail_has_one_result_and_live_links(pilot):
    adapter, imap, outgoing = pilot
    sailors = SailorRepository()
    sailor, _ = sailors.find_or_create_by_email("pilot@example.test")
    SailorConsentService(sailors, ConsentEventRepository()).confirm_consent(sailor.id, "admin_confirmed_email")
    assert outgoing[0].subject == WELCOME_EMAIL_SUBJECT
    outgoing.clear()

    first = review_mailbox_now(adapter)
    records = IngestionHistory().find_mail_attachments("ovh", "456:1")
    assert first.staged_mode and first.processed == 1
    assert len(records) == 1 and records[0]["status"] == "processed"
    assert records[0]["activity_id"] and records[0]["session_id"]
    assert records[0]["session_result_notification"] is None
    assert records[0]["first_processing_consent"]["sailor_id"] == sailor.id
    assert records[0]["first_processing_consent"]["consent_status"] == "ACTIVE"
    assert len(ActivityRepository().all()) == 1
    session = SessionRepository().get_by_id(records[0]["session_id"])
    assert session is not None and session.capability_token
    personal = sailors.get_by_id(sailor.id).personal_capability_token
    assert personal
    assert len(outgoing) == 1 and outgoing[0].subject == RESULT_SUBJECT
    assert f"https://app.example.test/s/{session.capability_token}" in outgoing[0].body
    assert f"https://app.example.test/me/{personal}" in outgoing[0].body
    assert MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")["feedback_state"] == "sent"

    review_mailbox_now(adapter)
    assert len(IngestionHistory().records()) == len(ActivityRepository().all()) == len(outgoing) == 1
    assert sum(call == ("FETCH", b"1", "(BODY.PEEK[])") for call in imap.calls) == 1


def test_new_sailor_single_vakaros_mail_requests_then_welcomes_once(pilot):
    adapter, _, outgoing = pilot
    first = review_mailbox_now(adapter)
    sailors = SailorRepository()
    sailor = sailors.find_by_email("pilot@example.test")
    records = IngestionHistory().find_mail_attachments("ovh", "456:1")
    assert first.staged_mode and first.processed == 1
    assert sailor is not None and sailor.consent_status == ConsentStatus.PENDING
    assert len(records) == 1 and records[0]["status"] == "processed"
    assert records[0]["activity_id"] and records[0]["session_id"]
    assert records[0]["first_processing_consent"]["consent_status"] == "PENDING"
    assert len(ActivityRepository().all()) == 1 and len(SessionRepository().all()) == 1
    assert len(outgoing) == 1 and outgoing[0].subject == CONSENT_REQUEST_EMAIL_SUBJECT
    assert all(message.subject != RESULT_SUBJECT for message in outgoing)
    receipt = MailReceiptStore(IngestionHistory().path).get("ovh", "456:1")
    assert receipt["feedback_state"] == "suppressed" and receipt["feedback_suppressed_reason"] == "non_active"

    events = ConsentEventRepository()
    requests = ConsentRequestService(ConsentRequestRepository(), sailors, events, SessionRepository())
    request = requests.find_current_for_sailor(sailor.id)
    assert request is not None
    web = WebConsentService(
        requests, sailors,
        lambda agreement: SailorConsentService(sailors, events, agreement_version=agreement),
    )
    assert web.accept(request.token).state == PublicConsentState.CONFIRMED
    assert sailors.get_by_id(sailor.id).consent_status == ConsentStatus.ACTIVE
    assert len(outgoing) == 2 and outgoing[1].subject == WELCOME_EMAIL_SUBJECT
    assert "https://app.example.test/me/" in outgoing[1].body
    assert "/s/" not in outgoing[1].body and "456:1" not in outgoing[1].body
    review_mailbox_now(adapter)
    assert web.accept(request.token).state == PublicConsentState.CONFIRMED
    assert len(outgoing) == 2
    assert len(IngestionHistory().records()) == len(ActivityRepository().all()) == 1


def test_default_ordinary_single_track_review_keeps_new_sailor_consent(pilot, monkeypatch):
    adapter, _, outgoing = pilot
    monkeypatch.setenv("TACKBAR_OVH_STAGED_MAIL_ENABLED", "0")
    first = review_mailbox_now(adapter)
    sailor = SailorRepository().find_by_email("pilot@example.test")
    records = IngestionHistory().records()
    assert first.staged_mode is False and first.processed == 1
    assert sailor is not None and sailor.consent_status == ConsentStatus.PENDING
    assert len(records) == 1 and records[0]["attachment_ordinal_verified"] is False
    assert records[0]["status"] == "processed" and records[0]["activity_id"]
    assert len(outgoing) == 1 and outgoing[0].subject == CONSENT_REQUEST_EMAIL_SUBJECT
    assert MailReceiptStore(IngestionHistory().path).receipts() == []
    review_mailbox_now(adapter)
    assert len(outgoing) == 1 and len(IngestionHistory().records()) == 1
