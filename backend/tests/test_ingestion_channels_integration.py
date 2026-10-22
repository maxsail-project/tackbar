"""Offline #130.5 checks across actual intake, persistence and read APIs.

Only IMAP/SMTP transport and optional external enrichment are substituted.
GPX/CSV are repository sailing fixtures; VKX inputs are explicitly synthetic.
"""

from dataclasses import replace
import gzip
from hashlib import sha256
from pathlib import Path
import socket
from uuid import uuid4

import pandas as pd
import pytest

from app.models import Boat, ConsentStatus
from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.services.mailbox_review import review_mailbox_now
from app.services.ovh_mailbox_cursor import OVHMailboxCursor, OVHMailboxCursorStore
from app.services.sailor_consent import SailorConsentService
from app.storage.track_storage import TrackStorage

from test_activity_track_api import _get
from test_admin_upload import http, terminal, worker
from test_manual_ingestion import runtime
from test_ovh_adapter import _adapter, _message


FIXTURES = Path(__file__).parent / "fixtures"
FORMATS = [
    "2025-06-21-ESP29375-P01.gpx", "2025-06-21-ESP30782-P01.gpx",
    "representative.csv", "representative.csv.gz", "synthetic.vkx", "synthetic.vkx.gz",
]


@pytest.fixture(autouse=True)
def forbid_external_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Channel integration tests must remain offline")

    monkeypatch.setattr(socket, "create_connection", forbidden)


def payload(filename, synthetic_vkx):
    if filename.endswith(".gpx"):
        return (FIXTURES / filename).read_bytes()
    if ".csv" in filename:
        compressed = (FIXTURES / "vakaros-demo.csv.gz").read_bytes()
        return compressed if filename.endswith(".gz") else gzip.decompress(compressed)
    return gzip.compress(synthetic_vkx, mtime=0) if filename.endswith(".gz") else synthetic_vkx


def upload(runtime, filename, content, sailor_id=None):
    status, accepted, _ = http(sailor_id=sailor_id or runtime.sailor.id, filename=filename, body=content)
    assert status == 202
    assert accepted["status"] in ("pending", "processing", "processed", "failed")
    assert accepted["provider"] == "admin_upload"
    assert accepted["provider_message_id"] is accepted["sender_email"] is accepted["received_at"] is None
    assert accepted["operation_id"] == accepted["id"]
    completed = terminal(runtime, accepted["id"])
    assert completed["status"] == "processed", completed["last_error"]
    assert completed["session_result_notification_candidate"] is False
    assert completed["session_result_notification"] is None
    assert completed["pending_onboarding_reservation"] is None
    return completed


@pytest.mark.parametrize("filename", FORMATS)
def test_both_channels_have_equivalent_canonical_results_and_distinct_policy(
    runtime, worker, monkeypatch, vakaros_vkx_bytes, filename,
):
    content = payload(filename, vakaros_vkx_bytes)
    assert len(content) <= 16 * 1024 * 1024
    manual_boat = runtime.boats.add(Boat(str(uuid4()), "Manual default", "Snipe", "1"))
    mail_boat = runtime.boats.add(Boat(str(uuid4()), "Email default", "Snipe", "2"))
    runtime.sailors.replace(replace(runtime.sailor, default_boat_id=manual_boat.id))
    mail_owner, _ = runtime.sailors.find_or_create_by_email("mail-owner@example.test")
    runtime.sailors.replace(replace(
        mail_owner, consent_status=ConsentStatus.ACTIVE,
        personal_capability_token="q" * 43, default_boat_id=mail_boat.id,
    ))

    manual = upload(runtime, filename, content)
    assert runtime.sent == []
    adapter, imap, _ = _adapter(monkeypatch, {
        b"17": _message(sender=mail_owner.email, attachments=[(filename, content)]),
    })
    assert review_mailbox_now(adapter).processed == 1
    email = runtime.history.find_provider_message("ovh", "456:17")
    assert email["status"] == "processed"
    assert email["sender_email"] == mail_owner.email and email["received_at"] is not None
    assert len(runtime.sent) == 1  # Existing ACTIVE email Session-result policy.
    assert email["session_result_notification"]["status"] == "sent"

    manual_activity = runtime.activities.get_by_id(manual["activity_id"])
    mail_activity = runtime.activities.get_by_id(email["activity_id"])
    assert manual_activity.id != mail_activity.id
    assert (manual_activity.sailor_id, manual_activity.boat_id) == (runtime.sailor.id, manual_boat.id)
    assert (mail_activity.sailor_id, mail_activity.boat_id) == (mail_owner.id, mail_boat.id)
    assert manual_activity.source == mail_activity.source
    assert manual_activity.device_name == mail_activity.device_name
    storage = TrackStorage()
    manual_frame = storage.read_normalized_track(manual_activity.id)
    mail_frame = storage.read_normalized_track(mail_activity.id)
    assert list(manual_frame.columns) == list(mail_frame.columns) == CANONICAL_TRACK_COLUMNS
    pd.testing.assert_frame_equal(
        manual_frame.drop(columns="activity_id"), mail_frame.drop(columns="activity_id"), check_exact=True,
    )
    assert len(manual_frame) == manual_activity.sample_count == mail_activity.sample_count
    assert manual["session_id"] == email["session_id"]
    session = runtime.sessions.get_by_id(manual["session_id"])
    assert set(session.activity_ids) == {manual_activity.id, mail_activity.id}
    assert session.capability_token
    for record, activity, owner, boat in (
        (manual, manual_activity, runtime.sailor, manual_boat),
        (email, mail_activity, mail_owner, mail_boat),
    ):
        assert record["attachment_sha256"] == activity.attachment_sha256 == sha256(content).hexdigest()
        assert (runtime.root / record["original_file"]).read_bytes() == content
        assert storage.original_path(activity.id, filename).read_bytes() == content
        code, detail, _ = http("GET", f"/api/admin/ingestions/{record['id']}")
        assert code == 200 and detail["sailor_id"] == owner.id
        assert detail["activity_id"] == activity.id and detail["session_id"] == session.id
        code, detail, _ = http("GET", f"/api/admin/activities/{activity.id}")
        assert code == 200 and detail["boat"]["id"] == boat.id
        assert detail["source_ingestion_id"] == record["id"]
    code, detail, _ = http("GET", f"/api/admin/sessions/{session.id}")
    assert code == 200 and {item["id"] for item in detail["activities"]} == set(session.activity_ids)
    base = f"/api/shared/sessions/{session.capability_token}"
    shared = _get(base)
    assert shared.status_code == 200
    assert {item["sailor"]["id"] for item in shared.json["activities"]} == {runtime.sailor.id, mail_owner.id}
    tracks = [_get(f"{base}/activities/{identity}/track") for identity in session.activity_ids]
    assert all(track.status_code == 200 for track in tracks)
    assert tracks[0].json["samples"] == tracks[1].json["samples"]
    assert len(tracks[0].json["samples"]) == len(manual_frame)
    assert _get(f"/api/shared/sessions/{session.id}").status_code == 404

    # Repeated submissions create history, while raw-byte reuse stays Sailor-scoped.
    repeated = upload(runtime, filename, content)
    assert repeated["id"] != manual["id"] and repeated["original_file"] != manual["original_file"]
    assert repeated["activity_id"] == manual_activity.id and repeated["activity_created_by_ingestion"] is False
    imap.messages[b"18"] = _message(sender=mail_owner.email, attachments=[(filename, content)])
    assert review_mailbox_now(adapter).processed == 1
    assert runtime.history.find_provider_message("ovh", "456:18")["activity_created_by_ingestion"] is False
    # Both directions of cross-channel reuse retain the receiving source identity.
    imap.messages[b"19"] = _message(sender=runtime.sailor.email, attachments=[(filename, content)])
    assert review_mailbox_now(adapter).processed == 1
    assert runtime.history.find_provider_message("ovh", "456:19")["activity_id"] == manual_activity.id
    cross_manual = upload(runtime, filename, content, mail_owner.id)
    assert cross_manual["activity_id"] == mail_activity.id and cross_manual["owner_sailor_id"] == mail_owner.id
    assert len(runtime.activities.all()) == 2 and len(runtime.sessions.all()) == 1
    assert len(runtime.history.records()) == 6 and len(runtime.sent) == 1
    assert OVHMailboxCursorStore().load() == OVHMailboxCursor(456, 19)
    assert review_mailbox_now(adapter).discovered_candidates == 0

    consent = SailorConsentService(runtime.sailors, ConsentEventRepository())
    consent.revoke_consent(runtime.sailor.id, "integration_check")
    code, reprocessed, _ = http("POST", f"/api/admin/ingestions/{manual['id']}/reprocess")
    assert code == 200 and reprocessed["status"] == "processed"
    assert reprocessed["activity_id"] == manual_activity.id
    assert reprocessed["owner_sailor_id"] == runtime.sailor.id
    assert runtime.sailors.get_by_id(runtime.sailor.id).consent_status == ConsentStatus.PENDING
    assert ConsentRequestRepository().all() == [] and len(runtime.sent) == 1
    assert _get(f"{base}/activities/{manual_activity.id}/track").status_code == 404
    assert [item["id"] for item in _get(base).json["activities"]] == [mail_activity.id]
    # Email Reprocess retains its different automatic request and welcome behavior.
    consent.revoke_consent(mail_owner.id, "integration_check")
    code, reprocessed, _ = http("POST", f"/api/admin/ingestions/{email['id']}/reprocess")
    assert code == 200 and reprocessed["status"] == "processed"
    assert runtime.sailors.get_by_id(mail_owner.id).consent_status == ConsentStatus.PENDING
    requests = ConsentRequestRepository().all()
    assert len(requests) == 1 and requests[0].sailor_id == mail_owner.id
    assert len(runtime.sent) == 2 and _get(base).status_code == 404
    consent.confirm_consent(mail_owner.id, "admin_confirmed_integration")
    assert len(runtime.sent) == 3  # Welcome, without a new Session-result attempt.
    assert _get(base).status_code == 200
    assert len(runtime.activities.all()) == 2 and len(runtime.history.records()) == 6
