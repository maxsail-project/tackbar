import gzip
import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.models import ConsentStatus, InboundEmail
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services import ingestion_processing
from app.services.admin_consent_requests import AdminConsentRequestService
from app.services.consent_requests import ConsentRequestService
from app.services.ingestion_history import IngestionHistory, SESSION_RESULT_DELIVERY_FAILURE
from app.services.ingestion_processing import process_provider_email, reprocess_ingestion
from app.services.mailbox_review import review_mailbox_now
from app.services.outbound_mail import OutboundMailError, OvhSmtpTransport
from app.services.sailor_consent import SailorConsentService
from app.services.session_result_delivery import SessionResultDeliveryService
from app.services.session_result_email import SESSION_RESULT_SUBJECT, compose_session_result_email
from app.services.web_consent import WebConsentService
from app.services.welcome_email import WELCOME_EMAIL_SUBJECT
from app.services.welcome_email_resend import WelcomeEmailResendService


FIXTURE = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
PERSONAL_TOKEN = "p" * 43
ORIGIN = "https://configured.example.test"


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_PUBLIC_BASE_URL", ORIGIN)
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    sent = []
    monkeypatch.setattr(
        OvhSmtpTransport, "from_environment",
        classmethod(lambda cls: SimpleNamespace(send=sent.append)),
    )
    return SimpleNamespace(
        root=tmp_path, sailors=SailorRepository(), boats=BoatRepository(),
        activities=ActivityRepository(), sessions=SessionRepository(),
        history=IngestionHistory(), events=ConsentEventRepository(),
        requests=ConsentRequestRepository(), sent=sent,
    )


def email(message_id="message-1", day="05"):
    content = gzip.decompress(FIXTURE.read_bytes()).replace(b"2031-04-05", f"2031-04-{day}".encode())
    return InboundEmail(
        sender_email=" SAILOR@EXAMPLE.TEST ", subject="A sailing track",
        attachment_filename="track.csv", attachment_bytes=content,
        provider_message_id=message_id,
    )


def process(runtime, message=None, **kwargs):
    return process_provider_email(
        "ovh", message or email(), runtime.sailors, runtime.boats,
        runtime.activities, runtime.sessions, runtime.history, **kwargs,
    )


def reprocess(runtime, record_id):
    return reprocess_ingestion(
        record_id, runtime.sailors, runtime.boats, runtime.activities,
        runtime.sessions, IngestionHistory(runtime.history.path),
    )


def active_sailor(runtime):
    sailor, _ = runtime.sailors.find_or_create_by_email("sailor@example.test")
    return runtime.sailors.replace(replace(
        sailor, consent_status=ConsentStatus.ACTIVE,
        personal_capability_token=PERSONAL_TOKEN,
    ))


def requests(runtime, **kwargs):
    return ConsentRequestService(
        ConsentRequestRepository(runtime.requests.path), runtime.sailors,
        runtime.events, runtime.sessions, **kwargs,
    )


def activate(runtime, sailor_id, method="web"):
    if method == "admin":
        return SailorConsentService(runtime.sailors, runtime.events).confirm_consent(
            sailor_id, "admin_confirmed_email"
        )
    service = requests(runtime)
    request = service.find_current_for_sailor(sailor_id)
    web = WebConsentService(
        service, runtime.sailors,
        lambda version: SailorConsentService(runtime.sailors, runtime.events, version),
    )
    web.accept(request.token)
    web.accept(request.token)
    return runtime.sailors.get_by_id(sailor_id)


def test_session_result_copy_is_bilingual_with_session_primary():
    message = compose_session_result_email(
        "sailor@example.test", "/s/session", "/me/personal", ORIGIN + "/"
    )
    assert message.recipient == "sailor@example.test"
    assert message.subject == "Your TackBar session is ready / Tu sesión de TackBar está lista"
    english, spanish = message.body.split("\n---\n")
    assert english.startswith("Hi,")
    assert "Your sailing activity has been processed and is now available in TackBar." in english
    assert "Open this session:\n" + ORIGIN + "/s/session" in english
    assert "My TackBar:\n" + ORIGIN + "/me/personal" in english
    assert spanish.strip().startswith("Hola,")
    assert "Tu navegación ha sido procesada y ya está disponible en TackBar." in spanish
    assert "Abre esta sesión:\n" + ORIGIN + "/s/session" in spanish
    assert "Mi TackBar:\n" + ORIGIN + "/me/personal" in spanish
    for section in (english, spanish):
        assert section.index("/s/session") < section.index("/me/personal")
        assert "Maxi\nTackBar — Sail. Debrief. Learn." in section


@pytest.mark.parametrize("method", ["web", "admin"])
def test_pending_onboarding_is_immutable_and_activation_uses_exact_session(runtime, method):
    first = process(runtime, email("first", "06"))
    request = runtime.requests.all()[0]
    assert request.onboarding_activity_id == first.activity.id
    assert request.onboarding_session_id == first.session_match.session.id
    later = process(runtime, email("later-but-earlier-gps", "05"))
    assert later.session_match.session.id != request.onboarding_session_id
    assert runtime.requests.all()[0] == request
    assert len(runtime.sent) == 1  # Consent only, even with two PENDING Activities.
    assert all(r["session_result_notification"] is None for r in runtime.history.records())

    sailor = activate(runtime, first.sailor.id, method)
    assert len(runtime.sent) == 2
    welcome = runtime.sent[-1]
    assert welcome.subject == WELCOME_EMAIL_SUBJECT
    session = runtime.sessions.get_by_id(request.onboarding_session_id)
    other = runtime.sessions.get_by_id(later.session_match.session.id)
    assert welcome.body.count(f"{ORIGIN}/s/{session.capability_token}") == 2
    assert other.capability_token not in welcome.body
    assert welcome.body.count(f"{ORIGIN}/me/{sailor.personal_capability_token}") == 2
    for record in runtime.history.records():
        reprocess(runtime, record["id"])
    process(runtime, email("duplicate-after-activation", "06"))
    assert len(runtime.sent) == 2

    process(runtime, email("new-active-track", "07"))
    assert len(runtime.sent) == 3
    assert runtime.sent[-1].subject == SESSION_RESULT_SUBJECT
    assert runtime.requests.all()[0].onboarding_activity_id == first.activity.id


def test_first_processed_persistence_already_contains_onboarding_reservation(
    runtime, monkeypatch,
):
    persisted_as_processed = []
    original_replace = IngestionHistory.replace

    def record_processed_persistence(history, replacement):
        persisted = original_replace(history, replacement)
        if history.path == runtime.history.path and replacement["status"] == "processed":
            persisted_as_processed.append(json.loads(json.dumps(persisted)))
        return persisted

    monkeypatch.setattr(IngestionHistory, "replace", record_processed_persistence)

    result = process(runtime)

    assert len(persisted_as_processed) == 1
    persisted = persisted_as_processed[0]
    assert persisted["activity_id"] == result.activity.id
    assert persisted["session_id"] == result.session_match.session.id
    assert persisted["pending_onboarding_reservation"] == {
        "sailor_id": result.sailor.id,
        "consent_cycle_sequence": 0,
        "activity_id": result.activity.id,
        "session_id": result.session_match.session.id,
    }


@pytest.mark.parametrize("method", ["web", "admin"])
def test_reprocess_recovers_onboarding_binding_after_request_persistence_interruption(
    runtime, monkeypatch, method,
):
    sailor, _ = runtime.sailors.find_or_create_by_email("sailor@example.test")
    assert sailor.consent_status == ConsentStatus.PENDING

    with monkeypatch.context() as patch:
        def interrupt_request_persistence(_repository, _request):
            raise OSError("interrupted before consent request persistence")

        patch.setattr(ConsentRequestRepository, "add", interrupt_request_persistence)
        with pytest.raises(OSError, match="before consent request persistence"):
            process(runtime, email("interrupted-onboarding", "05"))

    interrupted = runtime.history.records()[0]
    activity = runtime.activities.get_by_id(interrupted["activity_id"])
    session = runtime.sessions.get_by_id(interrupted["session_id"])
    assert interrupted["status"] == "processed"
    assert interrupted["last_error"] is None
    assert interrupted["activity_created_by_ingestion"] is True
    assert interrupted["session_result_notification_candidate"] is False
    assert activity.sailor_id == sailor.id
    assert (runtime.root / activity.track_file).is_file()
    assert session.activity_ids == [activity.id]
    assert len(runtime.activities.all()) == len(runtime.sessions.all()) == 1
    assert runtime.requests.all() == []
    assert runtime.sent == []

    reconstructed = []
    original_process = ingestion_processing._process_known_email
    with monkeypatch.context() as patch:
        def record_reconstructed_result(*args, **kwargs):
            result = original_process(*args, **kwargs)
            reconstructed.append(result)
            return result

        patch.setattr(ingestion_processing, "_process_known_email", record_reconstructed_result)
        recovered = reprocess(runtime, interrupted["id"])

    assert len(reconstructed) == 1
    assert reconstructed[0].activity_created is False
    assert recovered["status"] == "processed"
    assert recovered["activity_created_by_ingestion"] is True
    assert recovered["session_result_notification_candidate"] is False
    assert recovered["activity_id"] == activity.id
    assert recovered["session_id"] == session.id
    assert len(runtime.activities.all()) == len(runtime.sessions.all()) == 1
    request = runtime.requests.all()[0]
    assert request.onboarding_activity_id == activity.id
    assert request.onboarding_session_id == session.id

    # A newer PENDING Session must not replace the recovered association.
    later = process(runtime, email("later-pending", "06"))
    assert later.session_match.session.id != session.id
    assert runtime.requests.all() == [request]
    assert len(runtime.sent) == 1
    assert runtime.sent[0].subject not in (WELCOME_EMAIL_SUBJECT, SESSION_RESULT_SUBJECT)
    assert runtime.sailors.get_by_id(sailor.id).consent_status == ConsentStatus.PENDING

    activated = activate(runtime, sailor.id, method)
    assert len(runtime.sent) == 2
    welcome = runtime.sent[-1]
    assert welcome.subject == WELCOME_EMAIL_SUBJECT
    onboarding_session = runtime.sessions.get_by_id(session.id)
    other_session = runtime.sessions.get_by_id(later.session_match.session.id)
    assert welcome.body.count(f"{ORIGIN}/s/{onboarding_session.capability_token}") == 2
    assert welcome.body.count(f"{ORIGIN}/me/{activated.personal_capability_token}") == 2
    assert other_session.capability_token not in welcome.body

    reprocess(runtime, interrupted["id"])
    assert len(runtime.sent) == 2
    assert all(message.subject != SESSION_RESULT_SUBJECT for message in runtime.sent)
    assert all(record["session_result_notification"] is None for record in runtime.history.records())


def test_first_pending_reservation_survives_request_persistence_failure(
    runtime, monkeypatch,
):
    sailor, _ = runtime.sailors.find_or_create_by_email("sailor@example.test")

    with monkeypatch.context() as patch:
        def interrupt_request_persistence(_repository, _request):
            raise OSError("interrupted before consent request persistence")

        patch.setattr(ConsentRequestRepository, "add", interrupt_request_persistence)
        with pytest.raises(OSError, match="before consent request persistence"):
            process(runtime, email("first-reserved", "05"))

    first_record = runtime.history.records()[0]
    first_activity = runtime.activities.get_by_id(first_record["activity_id"])
    first_session = runtime.sessions.get_by_id(first_record["session_id"])
    reservation = first_record["pending_onboarding_reservation"]
    assert first_record["status"] == "processed"
    assert reservation == {
        "sailor_id": sailor.id,
        "consent_cycle_sequence": 0,
        "activity_id": first_activity.id,
        "session_id": first_session.id,
    }
    assert runtime.requests.all() == []
    assert runtime.sent == []

    runtime.history = IngestionHistory(runtime.history.path)
    second = process(runtime, email("second-after-interruption", "06"))

    assert second.activity.id != first_activity.id
    assert second.session_match.session.id != first_session.id
    assert len(runtime.activities.all()) == 2
    assert len(runtime.sessions.all()) == 2
    request = runtime.requests.all()[0]
    assert request.onboarding_activity_id == first_activity.id
    assert request.onboarding_session_id == first_session.id
    reservations = [
        record["pending_onboarding_reservation"]
        for record in runtime.history.records()
        if record["pending_onboarding_reservation"] is not None
    ]
    assert reservations == [reservation]

    changed = runtime.history.get(first_record["id"])
    changed["pending_onboarding_reservation"] = {
        **reservation,
        "activity_id": second.activity.id,
        "session_id": second.session_match.session.id,
    }
    with pytest.raises(ValueError, match="reservation is immutable"):
        runtime.history.replace(changed)

    activated = activate(runtime, sailor.id, "web")
    activated_first_session = runtime.sessions.get_by_id(first_session.id)
    activated_second_session = runtime.sessions.get_by_id(second.session_match.session.id)
    welcome = runtime.sent[-1]
    assert welcome.subject == WELCOME_EMAIL_SUBJECT
    assert welcome.body.count(
        f"{ORIGIN}/s/{activated_first_session.capability_token}"
    ) == 2
    assert activated_second_session.capability_token not in welcome.body
    assert welcome.body.count(
        f"{ORIGIN}/me/{activated.personal_capability_token}"
    ) == 2
    assert all(message.subject != SESSION_RESULT_SUBJECT for message in runtime.sent)


def test_automatic_request_keeps_reservation_after_manual_request_marker(
    runtime, monkeypatch,
):
    with monkeypatch.context() as patch:
        def interrupt_request_persistence(_repository, _request):
            raise OSError("interrupted before consent request persistence")

        patch.setattr(ConsentRequestRepository, "add", interrupt_request_persistence)
        with pytest.raises(OSError, match="before consent request persistence"):
            process(runtime, email("reserved-before-manual-marker", "05"))

    reservation = runtime.history.records()[0]["pending_onboarding_reservation"]
    SailorConsentService(runtime.sailors, runtime.events).mark_consent_requested(
        reservation["sailor_id"],
        "manual",
    )

    later = process(runtime, email("automatic-after-manual-marker", "06"))

    request = runtime.requests.all()[0]
    assert later.activity.id != reservation["activity_id"]
    assert request.onboarding_activity_id == reservation["activity_id"]
    assert request.onboarding_session_id == reservation["session_id"]


def test_admin_send_uses_reservation_after_request_persistence_failure(
    runtime, monkeypatch,
):
    with monkeypatch.context() as patch:
        def interrupt_request_persistence(_repository, _request):
            raise OSError("interrupted before consent request persistence")

        patch.setattr(ConsentRequestRepository, "add", interrupt_request_persistence)
        with pytest.raises(OSError, match="before consent request persistence"):
            process(runtime, email("admin-send-reserved"))

    record = runtime.history.records()[0]
    reservation = record["pending_onboarding_reservation"]
    assert reservation is not None
    assert runtime.requests.all() == []

    reloaded_history = IngestionHistory(runtime.history.path)
    delivered = AdminConsentRequestService(
        requests(runtime),
        runtime.sailors,
        SailorConsentService(runtime.sailors, runtime.events),
        history=reloaded_history,
    ).send(reservation["sailor_id"])

    assert delivered.onboarding_activity_id == reservation["activity_id"]
    assert delivered.onboarding_session_id == reservation["session_id"]

    activated = activate(runtime, reservation["sailor_id"], "admin")
    session = runtime.sessions.get_by_id(reservation["session_id"])
    welcome = runtime.sent[-1]
    assert welcome.subject == WELCOME_EMAIL_SUBJECT
    assert welcome.body.count(f"{ORIGIN}/s/{session.capability_token}") == 2
    assert welcome.body.count(
        f"{ORIGIN}/me/{activated.personal_capability_token}"
    ) == 2
    assert all(message.subject != SESSION_RESULT_SUBJECT for message in runtime.sent)


def test_direct_admin_confirmation_uses_reservation_without_request(
    runtime, monkeypatch,
):
    with monkeypatch.context() as patch:
        def interrupt_request_persistence(_repository, _request):
            raise OSError("interrupted before consent request persistence")

        patch.setattr(ConsentRequestRepository, "add", interrupt_request_persistence)
        with pytest.raises(OSError, match="before consent request persistence"):
            process(runtime, email("admin-confirm-reserved"))

    record = runtime.history.records()[0]
    reservation = record["pending_onboarding_reservation"]
    assert reservation is not None
    assert runtime.requests.all() == []

    runtime.history = IngestionHistory(runtime.history.path)
    activated = activate(runtime, reservation["sailor_id"], "admin")

    session = runtime.sessions.get_by_id(reservation["session_id"])
    assert activated.consent_status == ConsentStatus.ACTIVE
    assert runtime.requests.all() == []
    assert len(runtime.sent) == 1
    welcome = runtime.sent[0]
    assert welcome.subject == WELCOME_EMAIL_SUBJECT
    assert welcome.body.count(f"{ORIGIN}/s/{session.capability_token}") == 2
    assert welcome.body.count(
        f"{ORIGIN}/me/{activated.personal_capability_token}"
    ) == 2
    assert all(message.subject != SESSION_RESULT_SUBJECT for message in runtime.sent)


def test_pending_reprocess_recovers_onboarding_after_track_persistence_failure(
    runtime, monkeypatch,
):
    sailor, _ = runtime.sailors.find_or_create_by_email("sailor@example.test")

    with monkeypatch.context() as patch:
        def fail_track_persistence(*_args, **_kwargs):
            raise ValueError("interrupted during track persistence")

        patch.setattr(
            ingestion_processing,
            "persist_activity_track",
            fail_track_persistence,
        )
        with pytest.raises(ValueError, match="track persistence"):
            process(runtime, email("pending-track-interrupted"))

    interrupted = runtime.history.records()[0]
    activity = runtime.activities.all()[0]
    assert interrupted["status"] == "failed"
    assert interrupted["activity_created_by_ingestion"] is True
    assert interrupted["session_result_notification_candidate"] is None
    assert interrupted["pending_onboarding_reservation"] is None
    assert len(runtime.activities.all()) == 1
    assert runtime.sessions.all() == []
    assert runtime.requests.all() == []
    assert runtime.sent == []

    recovered = reprocess(runtime, interrupted["id"])

    assert recovered["status"] == "processed"
    assert recovered["activity_id"] == activity.id
    assert recovered["activity_created_by_ingestion"] is True
    assert recovered["session_result_notification_candidate"] is False
    assert len(runtime.activities.all()) == 1
    assert len(runtime.sessions.all()) == 1
    request = requests(runtime).find_current_for_sailor(sailor.id)
    assert request.onboarding_activity_id == activity.id
    assert request.onboarding_session_id == recovered["session_id"]

    activated = activate(runtime, sailor.id, "admin")
    session = runtime.sessions.get_by_id(recovered["session_id"])
    welcome = runtime.sent[-1]
    assert welcome.subject == WELCOME_EMAIL_SUBJECT
    assert welcome.body.count(f"{ORIGIN}/s/{session.capability_token}") == 2
    assert welcome.body.count(
        f"{ORIGIN}/me/{activated.personal_capability_token}"
    ) == 2
    assert all(message.subject != SESSION_RESULT_SUBJECT for message in runtime.sent)


@pytest.mark.parametrize("legacy", ["preissued", "old-json", "manual-email"])
def test_manual_or_legacy_cycle_remains_unbound(runtime, legacy):
    sailor, _ = runtime.sailors.find_or_create_by_email("sailor@example.test")
    if legacy == "manual-email":
        SailorConsentService(runtime.sailors, runtime.events).mark_consent_requested(sailor.id, "manual")
    else:
        requests(runtime).issue_for_pending_sailor(sailor.id)
        if legacy == "old-json":
            records = json.loads(runtime.requests.path.read_text(encoding="utf-8"))
            for record in records:
                del record["onboarding_activity_id"]
                del record["onboarding_session_id"]
            runtime.requests.path.write_text(json.dumps(records), encoding="utf-8")
    process(runtime)
    request = runtime.requests.all()[0]
    assert request.onboarding_activity_id is None
    assert request.onboarding_session_id is None
    activate(runtime, sailor.id, "admin")
    assert runtime.sent[-1].subject == WELCOME_EMAIL_SUBJECT
    assert "/s/" not in runtime.sent[-1].body
    assert "/me/" in runtime.sent[-1].body


def test_reissue_keeps_cycle_binding_and_repository_rejects_replacement(runtime):
    first = process(runtime)
    original = runtime.requests.all()[0]
    later = process(runtime, email("second", "06"))
    reissued = requests(runtime, clock=lambda: original.expires_at + timedelta(seconds=1)).reissue_expired_for_pending_sailor(first.sailor.id)
    assert reissued.token != original.token
    assert reissued.onboarding_activity_id == original.onboarding_activity_id
    assert reissued.onboarding_session_id == original.onboarding_session_id
    assert requests(runtime).find_current_for_sailor(first.sailor.id) == reissued
    with pytest.raises(ValueError, match="immutable"):
        runtime.requests.replace(replace(reissued, onboarding_activity_id=later.activity.id))


def test_active_new_tracks_send_once_per_activity_across_duplicates_and_reload(runtime):
    sailor = active_sailor(runtime)
    first = process(runtime)
    first_session = runtime.sessions.get_by_id(first.session_match.session.id)
    message = runtime.sent[0]
    assert message.subject == SESSION_RESULT_SUBJECT
    assert message.recipient == sailor.email
    assert message.body.count(f"{ORIGIN}/s/{first_session.capability_token}") == 2
    assert message.body.count(f"{ORIGIN}/me/{PERSONAL_TOKEN}") == 2
    original_state = runtime.history.records()[0]["session_result_notification"]
    assert runtime.history.records()[0]["activity_created_by_ingestion"] is True
    assert runtime.history.records()[0]["session_result_notification_candidate"] is True
    assert original_state["status"] == "sent"
    assert original_state["attempted_at"] <= original_state["sent_at"]
    assert process(runtime) is None
    duplicate = process(runtime, email("other-message"))
    assert not duplicate.activity_created
    assert runtime.history.records()[-1]["activity_created_by_ingestion"] is False
    assert runtime.history.records()[-1]["session_result_notification_candidate"] is False
    process_provider_email("gmail", email(), runtime.sailors, runtime.boats, runtime.activities, runtime.sessions, runtime.history)
    for record in runtime.history.records():
        reprocess(runtime, record["id"])
    reloaded = IngestionHistory(runtime.history.path)
    SessionResultDeliveryService(reloaded, runtime.sailors, runtime.activities, runtime.sessions).attempt_for_new_activity(reloaded.records()[0]["id"])
    assert len(runtime.sent) == 1
    assert reloaded.records()[0]["session_result_notification"] == original_state
    assert runtime.sessions.get_by_id(first_session.id) == first_session
    assert runtime.sailors.get_by_id(sailor.id) == sailor

    # Another exact-file identity can join the same Session and gets its own result.
    different = email("new-file")
    different.attachment_bytes += b"\n"
    second = process(runtime, different)
    assert second.activity_created
    assert second.session_match.session.id == first_session.id
    assert second.session_match.session.capability_token == first_session.capability_token
    assert len(runtime.sent) == 2


def test_reprocess_recovers_active_notification_after_pre_state_interruption(
    runtime, monkeypatch,
):
    active_sailor(runtime)

    with monkeypatch.context() as patch:
        def interrupt_before_notification_state(_service, _ingestion_id):
            raise OSError("interrupted before notification state")

        patch.setattr(
            SessionResultDeliveryService,
            "attempt_for_new_activity",
            interrupt_before_notification_state,
        )
        with pytest.raises(OSError, match="before notification state"):
            process(runtime)

    interrupted = runtime.history.records()[0]
    assert interrupted["status"] == "processed"
    assert interrupted["activity_created_by_ingestion"] is True
    assert interrupted["session_result_notification_candidate"] is True
    assert interrupted["session_result_notification"] is None
    assert runtime.sent == []

    reconstructed = []
    original_process = ingestion_processing._process_known_email
    with monkeypatch.context() as patch:
        def record_reconstructed_result(*args, **kwargs):
            result = original_process(*args, **kwargs)
            reconstructed.append(result)
            return result

        patch.setattr(
            ingestion_processing,
            "_process_known_email",
            record_reconstructed_result,
        )
        recovered = reprocess(runtime, interrupted["id"])

    assert len(reconstructed) == 1
    assert reconstructed[0].activity_created is False
    assert recovered["activity_created_by_ingestion"] is True
    assert recovered["session_result_notification_candidate"] is True
    assert recovered["session_result_notification"]["status"] == "sent"
    assert len(runtime.sent) == 1
    assert runtime.sent[0].subject == SESSION_RESULT_SUBJECT

    reprocess(runtime, interrupted["id"])
    assert len(runtime.sent) == 1


def test_active_reprocess_recovers_notification_after_track_persistence_failure(
    runtime, monkeypatch,
):
    active_sailor(runtime)

    with monkeypatch.context() as patch:
        def fail_track_persistence(*_args, **_kwargs):
            raise ValueError("interrupted during track persistence")

        patch.setattr(
            ingestion_processing,
            "persist_activity_track",
            fail_track_persistence,
        )
        with pytest.raises(ValueError, match="track persistence"):
            process(runtime, email("active-track-interrupted"))

    interrupted = runtime.history.records()[0]
    activity = runtime.activities.all()[0]
    assert interrupted["status"] == "failed"
    assert interrupted["activity_created_by_ingestion"] is True
    assert interrupted["session_result_notification_candidate"] is None
    assert interrupted["session_result_notification"] is None
    assert len(runtime.activities.all()) == 1
    assert runtime.sessions.all() == []
    assert runtime.sent == []

    recovered = reprocess(runtime, interrupted["id"])

    assert recovered["status"] == "processed"
    assert recovered["activity_id"] == activity.id
    assert recovered["activity_created_by_ingestion"] is True
    assert recovered["session_result_notification_candidate"] is True
    assert recovered["session_result_notification"]["status"] == "sent"
    assert len(runtime.activities.all()) == 1
    assert len(runtime.sessions.all()) == 1
    assert len(runtime.sent) == 1
    assert runtime.sent[0].subject == SESSION_RESULT_SUBJECT

    reprocess(runtime, interrupted["id"])
    assert len(runtime.sent) == 1


def test_attempt_is_claimed_before_smtp_and_safe_failure_is_terminal(runtime, monkeypatch, caplog):
    sailor = active_sailor(runtime)
    observed = []

    def fail(message):
        record = IngestionHistory(runtime.history.path).records()[0]
        assert record["status"] == "processed"
        assert record["last_error"] is None
        notification = record["session_result_notification"]
        assert notification["status"] == "attempted"
        assert notification["attempted_at"] is not None
        activity = runtime.activities.get_by_id(record["activity_id"])
        assert (runtime.root / activity.track_file).is_file()
        session = runtime.sessions.get_by_id(record["session_id"])
        assert activity.id in session.activity_ids
        observed.append((activity, session))
        raise OutboundMailError(f"private-smtp-error {message.recipient} {message.body} C:/private/secret")

    monkeypatch.setattr(OvhSmtpTransport, "from_environment", classmethod(lambda cls: SimpleNamespace(send=fail)))
    result = process(runtime)
    assert result is not None
    record = runtime.history.records()[0]
    assert record["status"] == "processed"
    assert record["last_error"] is None
    assert record["session_result_notification"]["status"] == "failed"
    assert record["session_result_notification"]["last_error"] == SESSION_RESULT_DELIVERY_FAILURE
    assert record["session_result_notification"]["sent_at"] is None
    state = json.dumps(record["session_result_notification"])
    for private in (sailor.email, PERSONAL_TOKEN, observed[0][1].capability_token, "private-smtp-error", "C:/private"):
        assert private not in state
        assert private not in caplog.text
    assert runtime.sailors.get_by_id(sailor.id) == sailor
    assert runtime.activities.get_by_id(result.activity.id) == observed[0][0]
    assert runtime.sessions.get_by_id(result.session_match.session.id) == observed[0][1]
    process(runtime)
    process(runtime, email("another-message"))
    reprocess(runtime, record["id"])
    assert len(observed) == 1
    assert runtime.history.get(record["id"])["session_result_notification"] == record["session_result_notification"]


@pytest.mark.parametrize("error_type", [RuntimeError, TypeError])
def test_uncertain_interruption_retains_claim_and_does_not_retry(runtime, monkeypatch, error_type):
    active_sailor(runtime)
    def fail(_message):
        raise error_type("unexpected transport error")
    monkeypatch.setattr(OvhSmtpTransport, "from_environment", classmethod(lambda cls: SimpleNamespace(send=fail)))
    with pytest.raises(error_type, match="unexpected"):
        process(runtime)
    record = runtime.history.records()[0]
    assert record["status"] == "processed"
    assert record["last_error"] is None
    assert record["session_result_notification"]["status"] == "attempted"
    reprocess(runtime, record["id"])
    assert runtime.history.get(record["id"])["session_result_notification"] == record["session_result_notification"]


@pytest.mark.parametrize("unavailable", ["personal-missing", "personal-revoked", "session-expired", "session-revoked"])
def test_unavailable_access_skips_notification_without_repair(runtime, unavailable):
    sailor = active_sailor(runtime)
    first = process(runtime)
    runtime.sent.clear()
    if unavailable.startswith("personal"):
        runtime.sailors.replace(replace(sailor, personal_capability_token=None if unavailable == "personal-missing" else PERSONAL_TOKEN, personal_capability_revoked=unavailable == "personal-revoked"))
    else:
        session = runtime.sessions.get_by_id(first.session_match.session.id)
        if unavailable == "session-expired":
            session = replace(session, created_at=datetime.now(timezone.utc) - timedelta(days=61), expires_at=datetime.now(timezone.utc) - timedelta(days=1))
        else:
            session = replace(session, capability_revoked=True)
        runtime.sessions.replace(session)
    sailor_before = runtime.sailors.get_by_id(sailor.id)
    session_before = runtime.sessions.get_by_id(first.session_match.session.id)
    different = email("new-track")
    different.attachment_bytes += b"\n"
    result = process(runtime, different)
    assert result.activity_created
    assert runtime.sent == []
    assert runtime.history.records()[-1]["session_result_notification"] is None
    assert runtime.sailors.get_by_id(sailor.id) == sailor_before
    session_after = runtime.sessions.get_by_id(session_before.id)
    assert session_after.capability_token == session_before.capability_token
    assert session_after.capability_revoked == session_before.capability_revoked
    assert session_after.expires_at == session_before.expires_at


@pytest.mark.parametrize("unavailable", [None, "expired", "revoked", "missing"])
def test_welcome_resend_reuses_onboarding_or_falls_back_to_personal(runtime, unavailable):
    first = process(runtime)
    sailor = activate(runtime, first.sailor.id)
    session = runtime.sessions.get_by_id(first.session_match.session.id)
    if unavailable == "expired":
        session = replace(session, created_at=datetime.now(timezone.utc) - timedelta(days=61), expires_at=datetime.now(timezone.utc) - timedelta(days=1))
    elif unavailable == "revoked":
        session = replace(session, capability_revoked=True)
    elif unavailable == "missing":
        session = replace(session, capability_token=None)
    runtime.sessions.replace(session)
    current_personal = "n" * 43
    runtime.sailors.replace(replace(sailor, personal_capability_token=current_personal))
    WelcomeEmailResendService(runtime.sailors).resend(sailor.id)
    message = runtime.sent[-1]
    assert message.subject == WELCOME_EMAIL_SUBJECT
    assert f"{ORIGIN}/me/{current_personal}" in message.body
    if unavailable is None:
        assert f"{ORIGIN}/s/{session.capability_token}" in message.body
    else:
        assert "/s/" not in message.body
    assert runtime.sessions.get_by_id(session.id) == session
    assert runtime.sailors.get_by_id(sailor.id).personal_capability_token == current_personal


def test_reentry_processing_preserves_welcome_state_and_does_not_send_session_result(runtime):
    first = process(runtime)
    sailor = activate(runtime, first.sailor.id)
    service = SailorConsentService(runtime.sailors, runtime.events)
    service.revoke_consent(sailor.id, "withdrawal")
    runtime.sent.clear()
    new = process(runtime, email("reentry", "06"))
    pending = runtime.sailors.get_by_id(sailor.id)
    assert pending.consent_status == ConsentStatus.PENDING
    assert pending.welcome_email_sent_at == sailor.welcome_email_sent_at
    assert pending.welcome_email_last_error == sailor.welcome_email_last_error
    assert len(runtime.sent) == 1
    assert runtime.sent[0].subject not in (SESSION_RESULT_SUBJECT, WELCOME_EMAIL_SUBJECT)
    current = requests(runtime).find_current_for_sailor(sailor.id)
    assert current.consent_cycle_sequence == 1
    assert current.onboarding_activity_id == new.activity.id
    assert runtime.history.records()[-1]["session_result_notification"] is None


def test_exact_file_duplicate_does_not_bind_historical_session_to_reentry_cycle(runtime):
    first = process(runtime)
    sailor = activate(runtime, first.sailor.id)
    historical_session = runtime.sessions.get_by_id(first.session_match.session.id)
    SailorConsentService(runtime.sailors, runtime.events).revoke_consent(
        sailor.id, "withdrawal"
    )
    runtime.sent.clear()

    duplicate = process(runtime, email("reentry-duplicate"))

    assert duplicate.activity_created is False
    record = runtime.history.records()[-1]
    assert record["activity_created_by_ingestion"] is False
    assert record["session_result_notification_candidate"] is False
    assert record["session_result_notification"] is None
    current = requests(runtime).find_current_for_sailor(sailor.id)
    assert current.consent_cycle_sequence == 1
    assert current.onboarding_activity_id is None
    assert current.onboarding_session_id is None
    assert len(runtime.sent) == 1
    assert runtime.sent[0].subject not in (WELCOME_EMAIL_SUBJECT, SESSION_RESULT_SUBJECT)

    activate(runtime, sailor.id, "admin")
    welcome = runtime.sent[-1]
    assert welcome.subject == WELCOME_EMAIL_SUBJECT
    assert "/s/" not in welcome.body
    assert historical_session.capability_token not in welcome.body
    assert all(message.subject != SESSION_RESULT_SUBJECT for message in runtime.sent)


def test_repeated_mailbox_review_does_not_send_another_session_result(runtime):
    active_sailor(runtime)
    class Provider:
        def get_candidate_emails(self):
            return [email()]
    first = review_mailbox_now(provider=Provider())
    second = review_mailbox_now(provider=Provider())
    assert first.processed == 1
    assert second.skipped_already_processed == 1
    assert len(runtime.sent) == 1
    assert runtime.sent[0].subject == SESSION_RESULT_SUBJECT


def test_legacy_ingestion_state_loads_without_rewriting_or_notifying(runtime):
    active_sailor(runtime)
    process(runtime)
    records = json.loads(runtime.history.path.read_text(encoding="utf-8"))
    del records[0]["activity_created_by_ingestion"]
    del records[0]["session_result_notification_candidate"]
    del records[0]["session_result_notification"]
    del records[0]["pending_onboarding_reservation"]
    legacy = json.dumps(records).encode()
    runtime.history.path.write_bytes(legacy)
    loaded = IngestionHistory(runtime.history.path).records()[0]
    assert loaded["activity_created_by_ingestion"] is None
    assert loaded["session_result_notification_candidate"] is None
    assert loaded["session_result_notification"] is None
    assert loaded["pending_onboarding_reservation"] is None
    assert runtime.history.path.read_bytes() == legacy
    runtime.sent.clear()
    reprocess(runtime, loaded["id"])
    process(runtime, email("duplicate-legacy"))
    assert runtime.sent == []


@pytest.mark.parametrize("stage", ["parse", "track", "session"])
def test_failed_core_processing_does_not_attempt_session_result(runtime, monkeypatch, stage):
    active_sailor(runtime)
    target = {"parse": "process_inbound_email", "track": "persist_activity_track", "session": "match_activity_to_session"}[stage]
    def fail(*_args, **_kwargs):
        raise ValueError("controlled core failure")
    monkeypatch.setattr(ingestion_processing, target, fail)
    with pytest.raises(ValueError, match="core failure"):
        process(runtime)
    record = runtime.history.records()[0]
    assert record["status"] == "failed"
    expected_provenance = None if stage == "parse" else True
    assert record["activity_created_by_ingestion"] is expected_provenance
    assert record["session_result_notification_candidate"] is None
    assert record["session_result_notification"] is None
    assert runtime.sent == []


def test_reprocessing_newly_successful_input_keeps_core_result_on_unexpected_mail_error(runtime, monkeypatch):
    active_sailor(runtime)
    with monkeypatch.context() as patch:
        def fail_processing(*_args, **_kwargs):
            raise ValueError("temporary processing failure")
        patch.setattr(ingestion_processing, "process_inbound_email", fail_processing)
        with pytest.raises(ValueError):
            process(runtime)
    record_id = runtime.history.records()[0]["id"]
    def fail_sender(*_args):
        raise ValueError("unexpected private sender detail")
    with pytest.raises(ValueError, match="unexpected private sender detail"):
        reprocess_ingestion(
            record_id, runtime.sailors, runtime.boats, runtime.activities,
            runtime.sessions, runtime.history, session_result_sender=fail_sender,
        )
    record = runtime.history.get(record_id)
    assert record["status"] == "processed"
    assert record["last_error"] is None
    assert record["session_result_notification"]["status"] == "attempted"
    assert "private sender detail" not in runtime.history.path.read_text(encoding="utf-8")
    reprocess(runtime, record_id)
    assert runtime.sent == []


def test_smtp_is_not_invoked_unless_the_attempt_claim_is_persisted(runtime, monkeypatch):
    active_sailor(runtime)
    original_replace = runtime.history.replace
    def fail_claim(record):
        notification = record["session_result_notification"]
        if notification is not None and notification["status"] == "attempted":
            raise OSError("cannot persist delivery claim")
        return original_replace(record)
    with monkeypatch.context() as patch:
        patch.setattr(runtime.history, "replace", fail_claim)
        with pytest.raises(OSError, match="delivery claim"):
            process(runtime)
    record = IngestionHistory(runtime.history.path).records()[0]
    assert record["status"] == "processed"
    assert record["last_error"] is None
    assert record["session_result_notification"]["status"] == "eligible"
    assert runtime.sent == []
    recovered = reprocess(runtime, record["id"])
    assert recovered["session_result_notification"]["status"] == "sent"
    assert len(runtime.sent) == 1
    assert runtime.sent[0].subject == SESSION_RESULT_SUBJECT
    reprocess(runtime, record["id"])
    assert len(runtime.sent) == 1


def test_notification_rechecks_active_consent_after_core_processing(runtime, monkeypatch):
    sailor = active_sailor(runtime)
    capabilities = ingestion_processing.SessionCapabilityService
    original = capabilities.ensure_for_session
    def revoke_after_capabilities(service, session_id):
        session = original(service, session_id)
        runtime.sailors.replace(replace(sailor, consent_status=ConsentStatus.REVOKED))
        return session
    monkeypatch.setattr(capabilities, "ensure_for_session", revoke_after_capabilities)
    process(runtime)
    assert runtime.sent == []
    assert runtime.history.records()[0]["status"] == "processed"
    assert runtime.history.records()[0]["session_result_notification"] is None


@pytest.mark.parametrize("failed_message", ["consent", "welcome"])
def test_onboarding_delivery_failure_preserves_binding_and_welcome_recovery(runtime, monkeypatch, failed_message):
    attempted = []
    def send(message):
        attempted.append(message)
        welcome = message.subject == WELCOME_EMAIL_SUBJECT
        if welcome == (failed_message == "welcome"):
            raise OutboundMailError("private provider detail")
        runtime.sent.append(message)
    with monkeypatch.context() as patch:
        patch.setattr(OvhSmtpTransport, "from_environment", classmethod(lambda cls: SimpleNamespace(send=send)))
        first = process(runtime)
        association = runtime.requests.all()[0]
        process(runtime, email("additional-pending", "06"))
        assert runtime.requests.all()[0].onboarding_activity_id == association.onboarding_activity_id
        sailor = activate(runtime, first.sailor.id)
    assert [message.subject for message in attempted].count(WELCOME_EMAIL_SUBJECT) == 1
    assert len(attempted) == 2
    assert sailor.consent_status == ConsentStatus.ACTIVE
    session = runtime.sessions.get_by_id(association.onboarding_session_id)
    assert f"{ORIGIN}/s/{session.capability_token}" in attempted[-1].body
    if failed_message == "welcome":
        assert sailor.welcome_email_sent_at is None
        assert sailor.welcome_email_last_error == "Welcome email delivery failed"
        resent = WelcomeEmailResendService(runtime.sailors).resend(sailor.id)
        assert resent.welcome_email_last_error is None
        assert f"{ORIGIN}/s/{session.capability_token}" in runtime.sent[-1].body
        assert runtime.sessions.get_by_id(session.id) == session
