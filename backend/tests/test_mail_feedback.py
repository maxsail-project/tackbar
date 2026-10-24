"""#132.4 internal per-mail communication, with fake transports only."""

from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path

import pytest

from app.email_providers.ovh import (
    OVHAcquisitionBatch, OVHAttachmentOccurrence, OVHExaminedMessage,
    OVHMessageOutcome, OVHStagedMail,
)
from app.models import ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.ingestion_history import IngestionHistory
from app.services.mail_feedback import MailFeedbackEligibilityError, MailFeedbackService, orchestrate_staged_mailbox_now
from app.services.mail_receipts import MailReceiptStore
from app.services.outbound_mail import OutboundMailDefiniteFailure, OutboundMailError, OutboundMailUncertainError
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.sailor_consent import SailorConsentService
from app.services.ingestion_processing import process_staged_ingestion
from app.services.staged_mail_acquisition import recover_unattempted_ingestions, stage_ovh_mailbox_now
from app.services.mail_feedback_email import compose_results_email
from scripts.migrate_ingestion_history_v2 import check, verify


FIXTURES = Path(__file__).parent / "fixtures"
GPX = (FIXTURES / "2025-06-21-ESP30782-P01.gpx").read_bytes()
VAKAROS = (FIXTURES / "vakaros-demo.csv.gz").read_bytes()


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    monkeypatch.setenv("TACKBAR_PUBLIC_BASE_URL", "https://app.example.test")
    from app.services import ingestion_processing as processing

    class NoEnrichment:
        def enrich_new_session_context(self, _session_id):
            pass

    monkeypatch.setattr(processing, "automatic_session_enrichment_service", lambda *_: NoEnrichment())
    return SailorRepository(), BoatRepository(), ActivityRepository(), SessionRepository(), IngestionHistory()


def _provider(uid, attachments=(), sender="sailor@example.test", rejection=None):
    mail = OVHStagedMail(
        f"456:{uid}", sender, None,
        tuple(OVHAttachmentOccurrence(index, name, content) for index, (name, content) in enumerate(attachments, 1)),
        rejection,
    )
    outcome = OVHMessageOutcome.REJECTED if rejection else OVHMessageOutcome.SUPPORTED
    examined = OVHExaminedMessage(uid, None, outcome, staged_mail=mail)

    class Provider:
        def acquire_messages(self, last_seen_uid, expected_uidvalidity, *, staged):
            assert staged
            return OVHAcquisitionBatch(456, (examined,))

    return Provider()


def _active(runtime, email="sailor@example.test"):
    sailors, _, _, sessions, _ = runtime
    sailor, _ = sailors.find_or_create_by_email(email)
    sailor = sailors.replace(replace(sailor, consent_status=ConsentStatus.ACTIVE))
    return PersonalCapabilityService(sailors, sessions).regenerate_capability(sailor.id)


def _feedback(runtime, sender=None, consent_sender=None):
    sailors, boats, activities, sessions, history = runtime
    return MailFeedbackService(history, sailors, boats, activities, sessions, sender, consent_sender)


def test_one_vakaros_track_has_direct_session_and_personal_link(runtime):
    sailor = _active(runtime)
    sent = []
    orchestrate_staged_mailbox_now(_provider(1, [("race.csv.gz", VAKAROS)]), feedback_sender=sent.append)
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    record = runtime[-1].find_mail_attachments("ovh", "456:1")[0]
    assert receipt["feedback_state"] == "sent" and len(sent) == 1
    assert record["status"] == "processed"
    session = runtime[3].get_by_id(record["session_id"])
    assert f"/s/{session.capability_token}" in sent[0].body
    assert f"/me/{sailor.personal_capability_token}" in sent[0].body
    assert "race.csv.gz" in sent[0].body
    assert "processed; new" in sent[0].body


def test_six_mixed_occurrences_send_one_result_with_distinct_links(runtime):
    _active(runtime)
    sent = []
    attachments = [
        ("race.gpx", GPX), ("race.gpx", GPX), ("bad.gpx", b"bad"),
        ("vakaros.csv.gz", VAKAROS), ("again.gpx", GPX), ("other-bad.gpx", b"bad"),
    ]
    orchestrate_staged_mailbox_now(_provider(1, attachments), feedback_sender=sent.append)
    records = runtime[-1].find_mail_attachments("ovh", "456:1")
    assert len(records) == 6 and len(sent) == 1
    assert [r["status"] for r in records] == ["processed", "processed", "failed", "processed", "processed", "failed"]
    assert sent[0].body.count("race.gpx") == 4  # two occurrences, both languages
    assert "previously received" in sent[0].body
    assert "failed: invalid track" in sent[0].body
    distinct_sessions = {r["session_id"] for r in records if r["status"] == "processed"}
    assert sent[0].body.count("https://app.example.test/s/") == 2 * len(distinct_sessions)
    assert len({r["activity_id"] for r in records if r["status"] == "processed"}) == 2
    assert MailReceiptStore(runtime[-1].path).get("ovh", "456:1")["feedback_state"] == "sent"


def test_all_reused_mail_gets_result_without_new_activity(runtime):
    _active(runtime)
    sent = []
    orchestrate_staged_mailbox_now(_provider(1, [("race.gpx", GPX)]), feedback_sender=sent.append)
    before = len(runtime[2].all())
    orchestrate_staged_mailbox_now(_provider(2, [("copy.gpx", GPX)]), feedback_sender=sent.append)
    assert len(runtime[2].all()) == before
    assert len(sent) == 2 and "previously received" in sent[1].body
    assert runtime[-1].find_mail_attachments("ovh", "456:2")[0]["activity_created_by_ingestion"] is False


@pytest.mark.parametrize("rejection,attachments", [
    (None, [("bad.gpx", b"bad")]),
    ("attachment_count_limit", []),
])
def test_all_failed_or_rejected_is_link_free_without_sailor(runtime, rejection, attachments):
    sent = []
    orchestrate_staged_mailbox_now(_provider(1, attachments, rejection=rejection), feedback_sender=sent.append)
    assert len(sent) == 1 and "/s/" not in sent[0].body and "/me/" not in sent[0].body
    assert runtime[0].all() == []
    assert MailReceiptStore(runtime[-1].path).get("ovh", "456:1")["feedback_state"] == "sent"


def test_missing_outer_sender_is_suppressed(runtime):
    sent = []
    orchestrate_staged_mailbox_now(
        _provider(1, [], sender="", rejection="attachment_count_limit"),
        feedback_sender=sent.append,
    )
    assert sent == []
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    assert receipt["feedback_state"] == "suppressed"
    assert receipt["feedback_suppressed_reason"] == "unsafe_recipient"


def test_pending_mail_suppresses_results_and_requests_consent_once(runtime):
    result_mail = []
    consent_mail = []
    orchestrate_staged_mailbox_now(
        _provider(1, [("race.gpx", GPX)]),
        feedback_sender=result_mail.append,
        consent_request_sender=lambda recipient, token: consent_mail.append((recipient, token)),
    )
    sailor = runtime[0].find_by_email("sailor@example.test")
    assert sailor.consent_status == ConsentStatus.PENDING
    assert len(consent_mail) == 1 and result_mail == []
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    assert receipt["feedback_state"] == "suppressed" and receipt["feedback_suppressed_reason"] == "non_active"
    orchestrate_staged_mailbox_now(
        _provider(2, [("again.gpx", GPX)]),
        feedback_sender=result_mail.append,
        consent_request_sender=lambda recipient, token: consent_mail.append((recipient, token)),
    )
    assert len(consent_mail) == 1 and result_mail == []
    sailor = runtime[0].replace(replace(sailor, consent_status=ConsentStatus.ACTIVE))
    _feedback(runtime, result_mail.append).attempt_automatic("456:1")
    _feedback(runtime, result_mail.append).attempt_automatic("456:2")
    assert result_mail == []
    assert all(MailReceiptStore(runtime[-1].path).get("ovh", f"456:{uid}")["feedback_state"] == "suppressed" for uid in (1, 2))


def test_old_suppressed_mail_cannot_request_consent_in_new_cycle(runtime):
    requests = []
    orchestrate_staged_mailbox_now(
        _provider(1, [("race.gpx", GPX)]),
        feedback_sender=lambda _: pytest.fail("results sent before consent"),
        consent_request_sender=lambda recipient, token: requests.append((recipient, token)),
    )
    sailor = runtime[0].find_by_email("sailor@example.test")
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    assert receipt["feedback_consent_sailor_id"] == sailor.id
    assert receipt["feedback_consent_cycle"] == 0
    consent = SailorConsentService(runtime[0], ConsentEventRepository(), welcome_email_sender=lambda *_: None)
    consent.revoke_consent(sailor.id, "test")
    consent.start_new_consent_cycle(sailor.id, "test")
    _feedback(runtime, consent_sender=lambda recipient, token: requests.append((recipient, token))).attempt_automatic("456:1")
    assert len(requests) == 1
    assert MailReceiptStore(runtime[-1].path).get("ovh", "456:1") == receipt
    root = runtime[-1].path.parent
    before = {path.name: path.read_bytes() for path in root.iterdir() if path.is_file()}
    assert check(runtime[-1].path)["ingestions"] == 1
    assert verify(runtime[-1].path)["stored_receipts"] == 1
    assert {path.name: path.read_bytes() for path in root.iterdir() if path.is_file()} == before


def test_suppressed_mail_retries_consent_request_only_in_original_cycle(runtime, monkeypatch):
    stage_ovh_mailbox_now(_provider(1, [("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    process_staged_ingestion(record["id"], *runtime)
    feedback = _feedback(runtime, consent_sender=lambda *_: None)
    original = feedback._attempt_pending_consent
    monkeypatch.setattr(feedback, "_attempt_pending_consent", lambda *_: (_ for _ in ()).throw(RuntimeError("interrupted")))
    with pytest.raises(RuntimeError, match="interrupted"):
        feedback.attempt_automatic("456:1")
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    assert receipt["feedback_state"] == "suppressed"
    requests = []
    monkeypatch.setattr(feedback, "_attempt_pending_consent", original)
    feedback.consent_request_sender = lambda recipient, token: requests.append((recipient, token))
    feedback.attempt_automatic("456:1")
    assert len(requests) == 1
    feedback.attempt_automatic("456:1")
    assert len(requests) == 1


def test_revoked_sailor_reenters_pending_cycle_with_one_request(runtime):
    sailor, _ = runtime[0].find_or_create_by_email("sailor@example.test")
    runtime[0].replace(replace(sailor, consent_status=ConsentStatus.REVOKED, consent_revoked_at=datetime.now(timezone.utc)))
    requests = []
    results = []
    orchestrate_staged_mailbox_now(
        _provider(1, [("race.gpx", GPX)]), feedback_sender=results.append,
        consent_request_sender=lambda recipient, token: requests.append((recipient, token)),
    )
    assert runtime[0].get_by_id(sailor.id).consent_status == ConsentStatus.PENDING
    assert len(requests) == 1 and results == []
    assert MailReceiptStore(runtime[-1].path).get("ovh", "456:1")["feedback_state"] == "suppressed"


def test_consent_acceptance_after_processing_crash_does_not_send_retrospective_results(runtime):
    stage_ovh_mailbox_now(_provider(1, [("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    assert process_staged_ingestion(record["id"], *runtime)["status"] == "processed"
    sailor = runtime[0].find_by_email("sailor@example.test")
    assert sailor.consent_status == ConsentStatus.PENDING
    SailorConsentService(
        runtime[0], ConsentEventRepository(),
        welcome_email_sender=lambda *_: None,
    ).confirm_consent(sailor.id, "admin_confirmed_email")
    sent = []
    feedback = _feedback(runtime, sent.append)
    feedback.attempt_automatic("456:1")
    assert sent == []
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    assert receipt["feedback_state"] == "suppressed"
    assert receipt["feedback_suppressed_reason"] == "non_active"


def test_reprocess_cannot_hide_preconsent_processing_from_feedback(runtime):
    stage_ovh_mailbox_now(_provider(1, [("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    process_staged_ingestion(record["id"], *runtime)
    sailor = runtime[0].find_by_email("sailor@example.test")
    SailorConsentService(
        runtime[0], ConsentEventRepository(), welcome_email_sender=lambda *_: None,
    ).confirm_consent(sailor.id, "admin_confirmed_email")
    from app.services.ingestion_processing import reprocess_ingestion

    reprocess_ingestion(record["id"], *runtime)
    sent = []
    _feedback(runtime, sent.append).attempt_automatic("456:1")
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    assert sent == []
    assert receipt["feedback_state"] == "suppressed"
    assert receipt["feedback_suppressed_reason"] == "uncertain_consent"


def test_active_mail_reprocessed_before_first_decision_is_conservatively_suppressed(runtime):
    _active(runtime)
    stage_ovh_mailbox_now(_provider(1, [("race.gpx", GPX)]))
    record = recover_unattempted_ingestions()[0]
    assert process_staged_ingestion(record["id"], *runtime)["status"] == "processed"
    from app.services.ingestion_processing import reprocess_ingestion

    reprocess_ingestion(record["id"], *runtime)
    sent = []
    _feedback(runtime, sent.append).attempt_automatic("456:1")
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    assert sent == []
    assert receipt["feedback_state"] == "suppressed"
    assert receipt["feedback_suppressed_reason"] == "uncertain_consent"


def test_restart_recovers_durable_children_and_feedback_without_imap(runtime):
    _active(runtime)
    stage_ovh_mailbox_now(_provider(1, [("race.gpx", GPX)]))
    sent = []
    summary = orchestrate_staged_mailbox_now(acquire=False, feedback_sender=sent.append)
    assert summary.processed_children == summary.evaluated_receipts == 1
    assert len(sent) == 1
    again = orchestrate_staged_mailbox_now(acquire=False, feedback_sender=sent.append)
    assert again.processed_children == 0
    assert len(sent) == 1


def test_explicit_reprocess_does_not_reopen_automatic_feedback(runtime):
    _active(runtime)
    sent = []
    orchestrate_staged_mailbox_now(_provider(1, [("race.gpx", GPX)]), feedback_sender=sent.append)
    record = runtime[-1].find_mail_attachments("ovh", "456:1")[0]
    from app.services.ingestion_processing import reprocess_ingestion

    reprocess_ingestion(record["id"], *runtime)
    _feedback(runtime, sent.append).attempt_automatic("456:1")
    assert len(sent) == 1
    assert len(MailReceiptStore(runtime[-1].path).get("ovh", "456:1")["feedback_attempts"]) == 1


@pytest.mark.parametrize("failure,expected", [
    ("controlled", "failed"), ("definite", "failed"),
    ("transport_uncertain", "attempted"), ("unexpected", "attempted"),
])
def test_transport_failure_is_reserved_once_and_manual_resend_is_audited(runtime, failure, expected):
    _active(runtime)
    sent = []

    def fail(_message):
        if failure == "definite":
            raise OutboundMailDefiniteFailure("secret transport detail")
        if failure == "controlled":
            raise OutboundMailError("secret transport detail")
        if failure == "transport_uncertain":
            raise OutboundMailUncertainError("secret transport detail")
        raise RuntimeError("uncertain acceptance")

    if failure == "unexpected":
        with pytest.raises(RuntimeError, match="uncertain acceptance"):
            orchestrate_staged_mailbox_now(_provider(1, [("race.gpx", GPX)]), feedback_sender=fail)
    else:
        orchestrate_staged_mailbox_now(_provider(1, [("race.gpx", GPX)]), feedback_sender=fail)
    receipt = MailReceiptStore(runtime[-1].path).get("ovh", "456:1")
    assert receipt["feedback_state"] == expected
    assert len(receipt["feedback_attempts"]) == 1
    assert "secret" not in str(receipt)
    _feedback(runtime, sent.append).attempt_automatic("456:1")
    assert sent == []
    resent = _feedback(runtime, sent.append).resend("456:1")
    assert len(sent) == 1
    assert [a["kind"] for a in resent["feedback_attempts"]] == ["automatic", "manual"]
    assert resent["feedback_attempts"][0]["status"] == expected
    assert resent["feedback_attempts"][1]["status"] == "sent"


def test_manual_resend_rechecks_current_consent_and_links(runtime):
    sailor = _active(runtime)
    sent = []
    orchestrate_staged_mailbox_now(_provider(1, [("race.gpx", GPX)]), feedback_sender=sent.append)
    original = sent[0].body
    runtime[0].replace(replace(sailor, consent_status=ConsentStatus.REVOKED))
    with pytest.raises(MailFeedbackEligibilityError):
        _feedback(runtime, sent.append).resend("456:1")
    assert len(sent) == 1
    runtime[0].replace(replace(sailor, personal_capability_revoked=True))
    session = runtime[3].all()[0]
    runtime[3].replace(replace(session, capability_token=None, capability_revoked=True))
    _feedback(runtime, sent.append).resend("456:1")
    assert len(sent) == 2 and "/s/" not in sent[1].body and "/me/" not in sent[1].body
    assert "/s/" in original and "/me/" in original


def test_manual_resend_omits_expired_session_and_rejects_other_sailor_activity(runtime):
    _active(runtime)
    sent = []
    orchestrate_staged_mailbox_now(_provider(1, [("race.gpx", GPX)]), feedback_sender=sent.append)
    session = runtime[3].all()[0]
    runtime[3].replace(replace(session, expires_at=datetime.now(timezone.utc)))
    _feedback(runtime, sent.append).resend("456:1")
    assert "/s/" not in sent[-1].body and "/me/" in sent[-1].body
    other = _active(runtime, "other@example.test")
    activity_rows = json.loads(runtime[2].path.read_text(encoding="utf-8"))
    activity_rows[0]["sailor_id"] = other.id
    runtime[2].path.write_text(json.dumps(activity_rows), encoding="utf-8")
    with pytest.raises(MailFeedbackEligibilityError):
        _feedback(runtime, sent.append).resend("456:1")
    assert len(sent) == 2


def test_legacy_receipt_never_enters_feedback(runtime):
    store = MailReceiptStore(runtime[-1].path)
    store.add({
        "provider": "ovh", "provider_message_id": "old",
        "receipt_state": "legacy_complete", "attachment_ingestion_ids": ["old-ingestion"],
        "feedback_state": "legacy_suppressed", "feedback_attempts": [],
    })
    assert _feedback(runtime, lambda _: pytest.fail("legacy feedback sent")).attempt_automatic("old") is None
    assert store.get("ovh", "old")["feedback_state"] == "legacy_suppressed"


def test_feedback_receipt_round_trips_through_read_only_migration_checks(runtime):
    _active(runtime)
    orchestrate_staged_mailbox_now(_provider(1, [("race.gpx", GPX)]), feedback_sender=lambda _: None)
    root = runtime[-1].path.parent
    before = {path.name: path.read_bytes() for path in root.iterdir() if path.is_file()}
    assert check(runtime[-1].path)["ingestions"] == 1
    assert verify(runtime[-1].path)["stored_receipts"] == 1
    assert {path.name: path.read_bytes() for path in root.iterdir() if path.is_file()} == before


def test_results_copy_sanitizes_filename_and_error_text():
    record = {
        "attachment_ordinal": 1, "attachment_name": "C:/private/secret\r\nBcc: victim@example.test.gpx",
        "status": "failed", "last_error": "C:/private/token-secret.xml",
    }
    message = compose_results_email("sailor@example.test", [record], [], None, "https://app.example.test")
    assert "Bcc:" in message.body
    assert "\r" not in message.body
    assert "C:/private" not in message.body and "token-secret" not in message.body
