from dataclasses import replace
import hashlib
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models import Boat, ConsentStatus
from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_processing import process_provider_email, reprocess_ingestion
from app.services.mailbox_review import review_mailbox_now
from app.services.outbound_mail import OvhSmtpTransport
from app.services.sailor_consent import SailorConsentService
from app.services.session_result_email import SESSION_RESULT_SUBJECT
from app.storage.track_storage import TrackStorage

# Reuse the existing offline MIME/IMAP and ASGI harnesses.
from test_activity_track_api import _get
from test_gpx import gpx_bytes
from test_ovh_adapter import _adapter, _message


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("TACKBAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TACKBAR_PUBLIC_BASE_URL", "https://example.test")
    monkeypatch.setenv("TACKBAR_MAILBOX_PROVIDER", "ovh")
    sent = []
    monkeypatch.setattr(
        OvhSmtpTransport, "from_environment",
        classmethod(lambda cls: SimpleNamespace(send=sent.append)),
    )
    return SimpleNamespace(
        root=tmp_path, sent=sent, sailors=SailorRepository(),
        boats=BoatRepository(), activities=ActivityRepository(),
        sessions=SessionRepository(), history=IngestionHistory(),
    )


def reprocess(runtime, record):
    return reprocess_ingestion(
        record["id"], runtime.sailors, runtime.boats, runtime.activities,
        runtime.sessions, runtime.history,
    )


def test_offline_ovh_gpx_onboarding_storage_apis_and_idempotency(runtime, monkeypatch):
    content = gpx_bytes(positions=[(39, -.3)] * 5)
    raw = _message(subject="Forwarded track from someone else", sender="Outer <OUTER@EXAMPLE.TEST>", attachments=[("training.GPX", content)])
    adapter, fake, _ = _adapter(monkeypatch, {b"17": raw})
    summary = review_mailbox_now(adapter)
    assert (summary.processed, summary.failed) == (1, 0)
    sailor = runtime.sailors.all()[0]
    activity = runtime.activities.all()[0]
    session = runtime.sessions.all()[0]
    record = runtime.history.records()[0]
    assert sailor.email == "outer@example.test"
    assert sailor.consent_status == ConsentStatus.PENDING
    assert activity.sailor_id == sailor.id
    assert activity.boat_id is None
    assert session.activity_ids == [activity.id]
    assert session.capability_token is None
    assert record["provider_message_id"] == "456:17"
    assert record["activity_created_by_ingestion"] is True
    assert record["status"] == "processed"
    assert record["attachment_sha256"] == hashlib.sha256(content).hexdigest()
    assert (runtime.root / record["original_file"]).read_bytes() == content
    storage = TrackStorage(runtime.root)
    assert storage.original_path(activity.id, "training.GPX").read_bytes() == content
    frame = storage.read_normalized_track(activity.id)
    assert list(frame.columns) == CANONICAL_TRACK_COLUMNS
    assert len(frame) == 5
    assert frame.sog.eq(0).all() and frame.cog.isna().all()
    assert frame[["hdg", "heel", "trim", "quat_w", "quat_x", "quat_y", "quat_z"]].isna().all().all()
    assert len(runtime.sent) == 1  # Consent request, no Session result.
    assert process_provider_email(
        "ovh", adapter.get_candidate_emails()[0], runtime.sailors, runtime.boats,
        runtime.activities, runtime.sessions, runtime.history,
    ) is None
    request = ConsentRequestRepository().all()[0]
    assert request.onboarding_activity_id == activity.id
    assert request.onboarding_session_id == session.id
    # An internal Session ID cannot substitute for a shared capability.
    assert _get(f"/api/shared/sessions/{session.id}").status_code == 404
    assert review_mailbox_now(adapter).discovered_candidates == 0
    assert reprocess(runtime, record)["status"] == "processed"
    fake.messages[b"18"] = raw  # Same bytes, a distinct provider message.
    assert review_mailbox_now(adapter).processed == 1
    assert len(runtime.activities.all()) == 1
    assert len(runtime.sent) == 1
    assert runtime.history.find_provider_message("ovh", "456:18")["activity_created_by_ingestion"] is False

    SailorConsentService(runtime.sailors, ConsentEventRepository()).confirm_consent(sailor.id, "admin_confirmed_email")
    session = runtime.sessions.get_by_id(session.id)
    token = session.capability_token
    assert token
    base = f"/api/shared/sessions/{token}"
    assert _get(base).status_code == 200
    response = _get(f"{base}/activities/{activity.id}/track")
    assert response.status_code == 200
    assert len(response.json["samples"]) == 5
    assert response.json["samples"][0]["cog"] is None
    assert response.json["samples"][0]["sog"] == 0
    assert response.json["samples"][0]["hdg"] is None
    analytics = _get(f"{base}/activities/{activity.id}/maneuvers")
    assert analytics.status_code == 200
    assert analytics.json == {"activity_id": activity.id, "status": "unavailable", "reason": "missing_cog", "detector_mode": None, "signal_basis": [], "maneuvers": []}
    assert len(runtime.sent) == 2  # The existing welcome flow.
    runtime.sailors.replace(replace(runtime.sailors.get_by_id(sailor.id), consent_status=ConsentStatus.REVOKED))
    assert _get(base).status_code == 404
    assert _get(f"{base}/activities/{activity.id}/track").status_code == 404
    assert _get(f"{base}/activities/{activity.id}/maneuvers").status_code == 404


def test_active_gpx_default_boat_raw_byte_identity_and_notification_compatibility(runtime, monkeypatch):
    sailor, _ = runtime.sailors.find_or_create_by_email("sailor-a@example.com")
    boat = runtime.boats.add(Boat(str(uuid4()), "Default", "Snipe", "123"))
    runtime.sailors.replace(replace(sailor, consent_status=ConsentStatus.ACTIVE, personal_capability_token="p" * 43, default_boat_id=boat.id))
    content = gpx_bytes()
    raw = _message(attachments=[("track.gpx", content)])
    adapter, fake, _ = _adapter(monkeypatch, {b"1": raw})
    assert review_mailbox_now(adapter).processed == 1
    first = runtime.activities.all()[0]
    assert first.boat_id == boat.id
    assert len(runtime.sent) == 1 and runtime.sent[0].subject == SESSION_RESULT_SUBJECT
    first_record = runtime.history.records()[0]
    assert first_record["session_result_notification"] is not None
    fake.messages[b"2"] = raw
    assert review_mailbox_now(adapter).processed == 1
    assert len(runtime.activities.all()) == 1
    assert reprocess(runtime, first_record)["status"] == "processed"
    assert len(runtime.sent) == 1
    # Changed bytes with identical GPS samples are deliberately a new Activity.
    changed = content.replace(b"<trk>", b"<trk><name>Other encoding</name>")
    fake.messages[b"3"] = _message(attachments=[("track.gpx", changed)])
    assert review_mailbox_now(adapter).processed == 1
    assert len(runtime.activities.all()) == 2
    assert len(runtime.sessions.all()) == 1
    assert len(runtime.sessions.all()[0].activity_ids) == 2
    assert len(runtime.sent) == 2
    # Exact-file reuse remains Sailor-scoped.
    fake.messages[b"4"] = _message(sender="other@example.test", attachments=[("track.gpx", content)])
    assert review_mailbox_now(adapter).processed == 1
    assert len(runtime.activities.all()) == 3
    assert len(runtime.sessions.all()) == 1


def test_gpx_failure_preserves_original_and_history_and_review_continues(runtime, monkeypatch):
    invalid = gpx_bytes((0, 11))
    adapter, _, _ = _adapter(monkeypatch, {
        b"1": _message(attachments=[("invalid.gpx", invalid)]),
        b"2": _message(attachments=[("valid.gpx", gpx_bytes())]),
    })
    summary = review_mailbox_now(adapter)
    assert (summary.processed, summary.failed) == (1, 1)
    record = runtime.history.find_provider_message("ovh", "456:1")
    assert record["status"] == "failed" and "10 seconds" in record["last_error"]
    assert (runtime.root / record["original_file"]).read_bytes() == invalid
    assert len(runtime.activities.all()) == 1
    updated = reprocess(runtime, record)
    assert updated["status"] == "failed" and updated["attempts"] == 2
    assert review_mailbox_now(adapter).discovered_candidates == 0
