import asyncio
import json
from threading import Event, Thread
from dataclasses import replace
from pathlib import Path
from uuid import UUID

import pytest

from app.main import app
from app.models import ConsentStatus, InboundEmail
from app.repositories.activities import ActivityRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.personal_api_models import PersonalBoatPatch, PersonalDefaultBoatPatch
from app.runtime_paths import DATA_DIR_ENVIRONMENT_VARIABLE
from app.services.personal_context import PersonalContextService
from app.services.personal_capabilities import PersonalCapabilityService
from app.repositories.boats import BoatRepository
from app.services.ingestion_history import IngestionHistory
from app.services.ingestion_processing import process_provider_email


SAILOR = "30000000-0000-4000-8000-000000000001"
OTHER = "30000000-0000-4000-8000-000000000002"
OWN_BOAT = "40000000-0000-4000-8000-000000000001"
OTHER_BOAT = "40000000-0000-4000-8000-000000000002"
LEGACY_BOAT = "40000000-0000-4000-8000-000000000003"
ACTIVITY = "10000000-0000-4000-8000-000000000001"
OTHER_ACTIVITY = "10000000-0000-4000-8000-000000000002"
TOKEN = "personal-context-test-token-00000000000000001"
OTHER_TOKEN = "personal-context-other-token-0000000000000001"
SHARED_TOKEN = "personal-context-shared-token-0000000000000001"


def _write(path: Path, records: object) -> None:
    path.write_text(json.dumps(records) + "\n", encoding="utf-8")


def _root(monkeypatch: pytest.MonkeyPatch, temporary_directory: Path) -> Path:
    root = temporary_directory
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(root))
    _write(root / "sailors.json", [
        {"id": SAILOR, "email": "one@example.com", "name": "One", "default_boat_id": LEGACY_BOAT,
         "consent_status": "ACTIVE", "personal_capability_token": TOKEN},
        {"id": OTHER, "email": "two@example.com", "name": "Two", "default_boat_id": None,
         "consent_status": "ACTIVE", "personal_capability_token": OTHER_TOKEN},
    ])
    _write(root / "boats.json", [
        {"id": OWN_BOAT, "name": "Owned", "sailing_class": None, "sail_number": None, "sailor_id": SAILOR},
        {"id": OTHER_BOAT, "name": "Private", "sailing_class": None, "sail_number": None, "sailor_id": OTHER},
        {"id": LEGACY_BOAT, "name": "Historical", "sailing_class": None, "sail_number": None},
    ])
    def activity(activity_id: str, sailor_id: str, boat_id: str | None) -> dict:
        return {"id": activity_id, "sailor_id": sailor_id, "boat_id": boat_id,
                "source": "vakaros", "device_name": "original", "original_filename": "track.csv.gz",
                "start_time": "2026-08-01T10:00:00+00:00", "end_time": "2026-08-01T11:00:00+00:00",
                "start_lat": 0.0, "start_lon": 0.0, "end_lat": 0.1, "end_lon": 0.1,
                "center_lat": 0.05, "center_lon": 0.05, "min_lat": 0.0, "max_lat": 0.1,
                "min_lon": 0.0, "max_lon": 0.1, "sample_count": 2,
                "attachment_sha256": "a" * 64, "track_file": "tracks/file.csv.gz"}
    _write(root / "activities.json", [activity(ACTIVITY, SAILOR, LEGACY_BOAT),
                                      activity(OTHER_ACTIVITY, OTHER, OTHER_BOAT)])
    _write(root / "sessions.json", [{"id": "20000000-0000-4000-8000-000000000001",
                                     "activity_ids": [ACTIVITY, OTHER_ACTIVITY],
                                     "created_at": "2026-08-01T00:00:00+00:00",
                                     "expires_at": "2099-01-01T00:00:00+00:00",
                                     "capability_token": SHARED_TOKEN}])
    return root


def _request(method: str, path: str, body: object | None = None) -> tuple[int, object, dict[str, str]]:
    messages = []
    payload = json.dumps(body).encode() if body is not None else b""
    async def run():
        received = False
        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": payload, "more_body": False}
            return {"type": "http.disconnect"}
        async def send(message):
            messages.append(message)
        headers = [(b"content-type", b"application/json")] if body is not None else []
        await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                   "method": method, "scheme": "http", "path": path, "raw_path": path.encode(),
                   "query_string": b"", "headers": headers, "client": ("test", 1),
                   "server": ("test", 80), "root_path": ""}, receive, send)
    asyncio.run(run())
    start = next(item for item in messages if item["type"] == "http.response.start")
    data = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
    return start["status"], json.loads(data), {key.decode().lower(): value.decode() for key, value in start["headers"]}


def test_personal_context_reads_and_partial_writes(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    base = f"/api/me/{TOKEN}"
    status, activities, headers = _request("GET", base + "/activities")
    assert status == 200 and headers["cache-control"] == "no-store"
    assert len(activities) == 1 and activities[0]["boat"]["name"] == "Historical"
    assert activities[0]["device_label"] is None
    assert _request("GET", base + "/boats")[1] == [{"id": OWN_BOAT, "name": "Owned", "sailing_class": None, "sail_number": None}]
    assert _request("GET", base + "/default-boat")[1]["default_boat_id"] == LEGACY_BOAT
    before = json.loads((root / "activities.json").read_text())[0]
    status, changed, _ = _request("PATCH", base + f"/activities/{ACTIVITY}", {"device_label": "Watch"})
    assert status == 200 and changed["device_label"] == "Watch" and changed["boat_id"] == LEGACY_BOAT
    assert _request("PATCH", base + f"/activities/{ACTIVITY}", {"boat_id": OWN_BOAT})[1]["device_label"] == "Watch"
    assert _request("PATCH", base + f"/activities/{ACTIVITY}", {"device_label": None})[1]["device_label"] is None
    after = json.loads((root / "activities.json").read_text())[0]
    assert {key: value for key, value in after.items() if key not in ("boat_id", "device_label")} == {
        key: value for key, value in before.items() if key not in ("boat_id", "device_label")}
    assert _request("PATCH", base + "/default-boat", {"default_boat_id": OWN_BOAT})[1]["default_boat_id"] == OWN_BOAT
    assert _request("PATCH", base + "/default-boat", {})[1]["default_boat_id"] == OWN_BOAT
    assert _request("PATCH", base + "/default-boat", {"default_boat_id": None})[1]["default_boat_id"] is None
    assert ActivityRepository(root / "activities.json").get_by_id(ACTIVITY).boat_id == OWN_BOAT


def test_denials_and_immutable_fields(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    base = f"/api/me/{TOKEN}"
    for boat_id in (OTHER_BOAT, LEGACY_BOAT, "40000000-0000-4000-8000-000000000099"):
        for path, body in ((base + f"/activities/{ACTIVITY}", {"boat_id": boat_id}),
                           (base + "/default-boat", {"default_boat_id": boat_id})):
            status, _, headers = _request("PATCH", path, body)
            assert status == 404 and headers["cache-control"] == "no-store"
    assert _request("PATCH", base + f"/activities/{OTHER_ACTIVITY}", {"device_label": "No"})[0] == 404
    assert _request("PATCH", base + "/activities/missing", {"device_label": "No"})[0] == 404
    for field in ("device_name", "source", "original_filename", "sailor_id", "attachment_sha256"):
        status, _, headers = _request("PATCH", base + f"/activities/{ACTIVITY}", {field: "changed"})
        assert status == 422 and headers["cache-control"] == "no-store"
    records = json.loads((root / "activities.json").read_text())
    records[0]["boat_id"] = OTHER_BOAT
    _write(root / "activities.json", records)
    context = _request("GET", base + "/activities")[1][0]
    assert context["boat_id"] == OTHER_BOAT and context["boat"] is None
    records[0]["boat_id"] = "40000000-0000-4000-8000-000000000099"
    _write(root / "activities.json", records)
    context = _request("GET", base + "/activities")[1][0]
    assert context["boat_id"] == records[0]["boat_id"] and context["boat"] is None


def test_capability_and_consent_gates(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    for bad in ("invalid", SHARED_TOKEN, SAILOR, OTHER_TOKEN):
        assert _request("GET", f"/api/me/{bad}/activities")[0] == (200 if bad == OTHER_TOKEN else 404)
        assert _request("PATCH", f"/api/me/{bad}/default-boat", {"default_boat_id": OWN_BOAT})[0] == 404
    capabilities = PersonalCapabilityService(SailorRepository(root / "sailors.json"), SessionRepository(root / "sessions.json"),
                                             token_generator=lambda: "rotated-personal-context-token-0000000001")
    capabilities.regenerate_capability(SAILOR)
    assert _request("GET", f"/api/me/{TOKEN}/boats")[0] == 404
    capabilities.revoke_capability(SAILOR)
    assert _request("GET", "/api/me/rotated-personal-context-token-0000000001/default-boat")[0] == 404
    sailor_repo = SailorRepository(root / "sailors.json")
    sailor = sailor_repo.get_by_id(SAILOR)
    sailor_repo.replace(replace(sailor, consent_status=ConsentStatus.PENDING, personal_capability_revoked=False))
    assert _request("GET", "/api/me/rotated-personal-context-token-0000000001/activities")[0] == 404
    sailor = sailor_repo.get_by_id(SAILOR)
    sailor_repo.replace(replace(sailor, consent_status=ConsentStatus.REVOKED))
    assert _request("PATCH", "/api/me/rotated-personal-context-token-0000000001/default-boat", {"default_boat_id": None})[0] == 404


def test_shared_session_reflects_context_without_exposing_inactive_activity(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    base = f"/api/me/{TOKEN}"
    assert _request("PATCH", base + f"/activities/{ACTIVITY}",
                    {"boat_id": OWN_BOAT, "device_label": "My watch"})[0] == 200
    status, session, _ = _request("GET", f"/api/shared/sessions/{SHARED_TOKEN}")
    assert status == 200
    own = next(item for item in session["activities"] if item["id"] == ACTIVITY)
    assert own["boat"]["name"] == "Owned" and own["device_label"] == "My watch"
    sailors = SailorRepository(root / "sailors.json")
    sailors.replace(replace(sailors.get_by_id(OTHER), consent_status=ConsentStatus.PENDING))
    session = _request("GET", f"/api/shared/sessions/{SHARED_TOKEN}")[1]
    assert [item["id"] for item in session["activities"]] == [ACTIVITY]


@pytest.mark.parametrize("action", ["rotate", "revoke"])
def test_default_write_and_capability_change_preserve_both_changes(monkeypatch, temporary_directory, action):
    root = _root(monkeypatch, temporary_directory)
    sailors = SailorRepository(root / "sailors.json")
    service = PersonalContextService(sailors, BoatRepository(root / "boats.json"),
                                     ActivityRepository(root / "activities.json"))
    rotation = PersonalCapabilityService(sailors, SessionRepository(root / "sessions.json"),
                                         token_generator=lambda: "rotated-concurrent-personal-token-000000001")
    entered = Event()
    release = Event()
    original_replace = sailors.replace
    def paused_replace(sailor):
        if sailor.default_boat_id == OWN_BOAT:
            entered.set()
            assert release.wait(5)
        return original_replace(sailor)
    sailors.replace = paused_replace
    results = []
    writer = Thread(target=lambda: results.append(service.update_default_boat(
        TOKEN, PersonalDefaultBoatPatch(default_boat_id=OWN_BOAT))))
    writer.start()
    assert entered.wait(5)
    change = rotation.regenerate_capability if action == "rotate" else rotation.revoke_capability
    rotator = Thread(target=lambda: results.append(change(SAILOR)))
    rotator.start()
    assert rotator.is_alive()
    release.set()
    writer.join(5)
    rotator.join(5)
    assert not writer.is_alive() and not rotator.is_alive()
    current = SailorRepository(root / "sailors.json").get_by_id(SAILOR)
    assert current.default_boat_id == OWN_BOAT
    if action == "rotate":
        assert current.personal_capability_token == "rotated-concurrent-personal-token-000000001"
    else:
        assert current.personal_capability_token == TOKEN and current.personal_capability_revoked
    assert _request("PATCH", f"/api/me/{TOKEN}/default-boat", {"default_boat_id": None})[0] == 404


def test_default_write_serializes_with_ingestion(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    sailors = SailorRepository(root / "sailors.json")
    boats = BoatRepository(root / "boats.json")
    activities = ActivityRepository(root / "activities.json")
    service = PersonalContextService(sailors, boats, activities)
    entered, release = Event(), Event()
    original_replace = sailors.replace
    def paused_replace(sailor):
        if sailor.default_boat_id == OWN_BOAT:
            entered.set()
            assert release.wait(5)
        return original_replace(sailor)
    sailors.replace = paused_replace
    writer = Thread(target=lambda: service.update_default_boat(
        TOKEN, PersonalDefaultBoatPatch(default_boat_id=OWN_BOAT)))
    writer.start()
    assert entered.wait(5)
    result = []
    fixture = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
    email = InboundEmail("one@example.com", "new track", fixture.name,
                         fixture.read_bytes(), provider_message_id="personal-default-race")
    ingester = Thread(target=lambda: result.append(process_provider_email(
        "ovh", email, SailorRepository(root / "sailors.json"), boats,
        activities, SessionRepository(root / "sessions.json"),
        IngestionHistory(root / "ingestion_history.json"))))
    ingester.start()
    assert ingester.is_alive()
    release.set()
    writer.join(5)
    ingester.join(20)
    assert not writer.is_alive() and not ingester.is_alive()
    assert result[0].activity.boat_id == OWN_BOAT
    assert ActivityRepository(root / "activities.json").get_by_id(ACTIVITY).boat_id == LEGACY_BOAT


def test_personal_boat_create_and_partial_edit(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    base = f"/api/me/{TOKEN}"
    activities_before = (root / "activities.json").read_bytes()
    default_before = SailorRepository(root / "sailors.json").get_by_id(SAILOR).default_boat_id

    status, created, headers = _request("POST", base + "/boats", {"name": "New Boat"})
    assert status == 201 and headers["cache-control"] == "no-store"
    assert str(UUID(created["id"])) == created["id"]
    assert created == {"id": created["id"], "name": "New Boat", "sailing_class": None, "sail_number": None}
    stored = BoatRepository(root / "boats.json").get_by_id(created["id"])
    assert stored.sailor_id == SAILOR

    status, edited, _ = _request("PATCH", base + f"/boats/{created['id']}", {"sail_number": "GBR 1"})
    assert status == 200 and (edited["name"], edited["sail_number"]) == ("New Boat", "GBR 1")
    status, edited, _ = _request("PATCH", base + f"/boats/{created['id']}", {"name": None})
    assert status == 200 and edited["name"] is None and edited["sail_number"] == "GBR 1"
    before = (root / "boats.json").read_bytes()
    status, _, _ = _request("PATCH", base + f"/boats/{created['id']}", {"sail_number": None})
    assert status == 422 and (root / "boats.json").read_bytes() == before
    assert _request("PATCH", base + f"/boats/{created['id']}", {})[1] == edited
    assert (root / "activities.json").read_bytes() == activities_before
    assert SailorRepository(root / "sailors.json").get_by_id(SAILOR).default_boat_id == default_before


def test_personal_boat_rejects_unapproved_fields_and_scoped_edits(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    base = f"/api/me/{TOKEN}"
    before = (root / "boats.json").read_bytes()
    for field in ("id", "sailor_id", "device_label", "boat_id"):
        assert _request("POST", base + "/boats", {"name": "New", field: "changed"})[0] == 422
        assert _request("PATCH", base + f"/boats/{OWN_BOAT}", {field: "changed"})[0] == 422
    for body in ({}, {"name": " "}, {"name": None, "sailing_class": "", "sail_number": None}):
        assert _request("POST", base + "/boats", body)[0] == 422
    denied = []
    for boat_id in (OTHER_BOAT, LEGACY_BOAT, "40000000-0000-4000-8000-000000000099"):
        status, body, headers = _request("PATCH", base + f"/boats/{boat_id}", {"name": "Claimed"})
        assert status == 404 and headers["cache-control"] == "no-store"
        denied.append(body)
    assert denied[0] == denied[1] == denied[2]
    assert (root / "boats.json").read_bytes() == before


def test_class_names_canonicalize_and_typo_requires_explicit_choice(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    boats_path = root / "boats.json"
    boats = json.loads(boats_path.read_text())
    boats[0]["sailing_class"] = "49er"
    boats[1]["sailing_class"] = "Snipe"
    boats[2]["sailing_class"] = "ILCA 7"
    _write(boats_path, boats)
    base = f"/api/me/{TOKEN}"
    status, names, _ = _request("GET", base + "/boat-classes")
    assert status == 200 and names == ["49er", "ILCA 7", "Snipe"]
    assert all(isinstance(name, str) for name in names)
    assert "Private" not in json.dumps(names) and OTHER not in json.dumps(names)
    assert _request("GET", base + "/boats")[1][0]["sailing_class"] == "49er"
    for submitted, canonical in ((" sNiPe ", "Snipe"), (" ilca  7 ", "ILCA 7"), (" 49ER ", "49er")):
        status, created, _ = _request("POST", base + "/boats", {"sailing_class": submitted})
        assert status == 201 and created["sailing_class"] == canonical
    before = boats_path.read_bytes()
    status, prompted, _ = _request("POST", base + "/boats", {"sailing_class": "Sinpe"})
    assert status == 409 and prompted["detail"] == {
        "code": "class_confirmation_required", "submitted_class": "Sinpe", "suggested_class": "Snipe"}
    assert boats_path.read_bytes() == before
    status, prompted, _ = _request("PATCH", base + f"/boats/{OWN_BOAT}", {"sailing_class": "Sinpe"})
    assert status == 409 and prompted["detail"]["suggested_class"] == "Snipe"
    assert boats_path.read_bytes() == before
    status, edited, _ = _request("PATCH", base + f"/boats/{OWN_BOAT}", {"sailing_class": "Snipe"})
    assert status == 200 and edited["sailing_class"] == "Snipe"
    assert _request("PATCH", base + f"/boats/{OWN_BOAT}", {"name": "After"})[1]["sailing_class"] == "Snipe"
    assert _request("PATCH", base + f"/boats/{OWN_BOAT}", {"sailing_class": None})[1]["sailing_class"] is None
    status, corrected, _ = _request("POST", base + "/boats", {"sailing_class": "Snipe"})
    assert status == 201 and corrected["sailing_class"] == "Snipe"
    status, retained, _ = _request("POST", base + "/boats", {
        "sailing_class": "Sinpe", "confirm_new_class": True})
    assert status == 201 and retained["sailing_class"] == "Sinpe"
    status, new, _ = _request("POST", base + "/boats", {"sailing_class": "Waszp"})
    assert status == 201 and new["sailing_class"] == "Waszp"
    names = _request("GET", f"/api/me/{OTHER_TOKEN}/boat-classes")[1]
    assert "Sinpe" in names and "Waszp" in names
    assert _request("POST", f"/api/me/{OTHER_TOKEN}/boats", {"sailing_class": " waszp "})[1]["sailing_class"] == "Waszp"
    assert all("id" not in name and "sailor" not in name for name in names)


def test_boat_edit_updates_activity_and_session_presentation(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    base = f"/api/me/{TOKEN}"
    assert _request("PATCH", base + f"/activities/{ACTIVITY}", {"boat_id": OWN_BOAT})[0] == 200
    activities_before = (root / "activities.json").read_bytes()
    sessions_before = (root / "sessions.json").read_bytes()
    sailors_before = (root / "sailors.json").read_bytes()
    other_before = BoatRepository(root / "boats.json").get_by_id(OTHER_BOAT)

    status, edited, _ = _request("PATCH", base + f"/boats/{OWN_BOAT}", {
        "name": "Renamed", "sailing_class": "ILCA 7"})
    assert status == 200 and edited["name"] == "Renamed"
    assert _request("GET", base + "/activities")[1][0]["boat"]["name"] == "Renamed"
    shared = _request("GET", f"/api/shared/sessions/{SHARED_TOKEN}")[1]
    own = next(item for item in shared["activities"] if item["id"] == ACTIVITY)
    assert own["boat"]["name"] == "Renamed" and own["boat"]["sailing_class"] == "ILCA 7"
    assert (root / "activities.json").read_bytes() == activities_before
    assert (root / "sessions.json").read_bytes() == sessions_before
    assert (root / "sailors.json").read_bytes() == sailors_before
    assert BoatRepository(root / "boats.json").get_by_id(OTHER_BOAT) == other_before


def test_personal_boat_routes_recheck_current_capability(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    def denied(token: str):
        base = f"/api/me/{token}"
        for method, path, body in (
            ("GET", "/boat-classes", None),
            ("POST", "/boats", {"name": "No"}),
            ("PATCH", f"/boats/{OWN_BOAT}", {"name": "No"}),
        ):
            status, _, headers = _request(method, base + path, body)
            assert status == 404 and headers["cache-control"] == "no-store"
    denied("invalid")
    denied(SHARED_TOKEN)
    denied(SAILOR)
    assert _request("PATCH", f"/api/me/{OTHER_TOKEN}/boats/{OWN_BOAT}", {"name": "No"})[0] == 404
    capabilities = PersonalCapabilityService(
        SailorRepository(root / "sailors.json"), SessionRepository(root / "sessions.json"),
        token_generator=lambda: "rotated-boat-management-token-0000000000001",
    )
    capabilities.regenerate_capability(SAILOR)
    denied(TOKEN)
    capabilities.revoke_capability(SAILOR)
    denied("rotated-boat-management-token-0000000000001")
    sailors = SailorRepository(root / "sailors.json")
    current = sailors.get_by_id(SAILOR)
    for status in (ConsentStatus.PENDING, ConsentStatus.REVOKED):
        sailors.replace(replace(current, consent_status=status, personal_capability_revoked=False))
        denied("rotated-boat-management-token-0000000000001")


def test_concurrent_partial_boat_edits_preserve_both_changes(monkeypatch, temporary_directory):
    root = _root(monkeypatch, temporary_directory)
    first_boats = BoatRepository(root / "boats.json")
    first = PersonalContextService(SailorRepository(root / "sailors.json"), first_boats,
                                   ActivityRepository(root / "activities.json"))
    second = PersonalContextService(SailorRepository(root / "sailors.json"),
                                    BoatRepository(root / "boats.json"), ActivityRepository(root / "activities.json"))
    entered, release = Event(), Event()
    original_save = first_boats._save
    def paused_save(boats):
        entered.set()
        assert release.wait(5)
        original_save(boats)
    first_boats._save = paused_save
    results = []
    writer_one = Thread(target=lambda: results.append(first.update_boat(
        TOKEN, OWN_BOAT, PersonalBoatPatch(name="First"))))
    writer_one.start()
    assert entered.wait(5)
    writer_two = Thread(target=lambda: results.append(second.update_boat(
        TOKEN, OWN_BOAT, PersonalBoatPatch(sail_number="77"))))
    writer_two.start()
    assert writer_two.is_alive()
    release.set()
    writer_one.join(5)
    writer_two.join(5)
    assert not writer_one.is_alive() and not writer_two.is_alive()
    stored = BoatRepository(root / "boats.json").get_by_id(OWN_BOAT)
    assert (stored.name, stored.sail_number, stored.sailor_id) == ("First", "77", SAILOR)
