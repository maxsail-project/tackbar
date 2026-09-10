import json
import re
from dataclasses import replace
from pathlib import Path

import pytest

from app.models import ConsentStatus
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.personal_capabilities import PersonalCapabilityService
from app.services.sailor_consent import SailorConsentService


@pytest.fixture
def personal(temporary_directory: Path):
    sailors = SailorRepository(temporary_directory / "sailors.json")
    sessions = SessionRepository(temporary_directory / "sessions.json")
    sailor, _ = sailors.find_or_create_by_email("sailor@example.test")
    service = PersonalCapabilityService(sailors, sessions)
    consent = SailorConsentService(
        sailors, ConsentEventRepository(temporary_directory / "consent_events.json"),
        personal_capabilities=service,
    )
    return sailors, sessions, sailor, service, consent


def test_initial_confirmation_creates_strong_stable_capability(personal):
    sailors, _, sailor, service, consent = personal
    active = consent.confirm_consent(sailor.id, "test")
    token = active.personal_capability_token
    # token_urlsafe(32): 32 cryptographically random bytes, 256 bits.
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", token)
    assert token != sailor.id and sailor.email not in token
    assert sailors.get_by_id(sailor.id).personal_capability_token == token
    assert service.ensure_for_sailor(sailor.id).personal_capability_token == token
    assert service.resolve(token).id == sailor.id


def test_consent_cycle_preserves_token_and_gates_each_state(personal):
    sailors, _, sailor, service, consent = personal
    token = consent.confirm_consent(sailor.id, "test").personal_capability_token
    consent.revoke_consent(sailor.id, "test")
    assert service.resolve(token) is None
    assert sailors.get_by_id(sailor.id).personal_capability_token == token
    consent.start_new_consent_cycle(sailor.id, "test")
    assert service.resolve(token) is None
    assert sailors.get_by_id(sailor.id).personal_capability_token == token
    assert consent.confirm_consent(sailor.id, "test").personal_capability_token == token
    assert service.resolve(token).id == sailor.id


def test_pending_existing_token_is_preserved_on_confirmation(personal):
    _, _, sailor, service, consent = personal
    token = service.ensure_for_sailor(sailor.id).personal_capability_token
    assert service.resolve(token) is None
    assert consent.confirm_consent(sailor.id, "test").personal_capability_token == token


def test_explicit_revocation_survives_consent_cycle_until_regenerated(personal):
    sailors, _, sailor, service, consent = personal
    original = consent.confirm_consent(sailor.id, "test")
    token = original.personal_capability_token
    revoked = service.revoke_capability(sailor.id)
    assert replace(revoked, personal_capability_revoked=False) == original
    assert service.resolve(token) is None
    assert service.ensure_for_sailor(sailor.id).personal_capability_revoked
    consent.revoke_consent(sailor.id, "test")
    consent.start_new_consent_cycle(sailor.id, "test")
    active = consent.confirm_consent(sailor.id, "test")
    assert active.consent_status == ConsentStatus.ACTIVE
    assert active.personal_capability_token == token
    assert active.personal_capability_revoked
    assert service.resolve(token) is None
    regenerated = service.regenerate_capability(sailor.id)
    assert regenerated.personal_capability_token != token
    assert service.resolve(token) is None
    assert service.resolve(regenerated.personal_capability_token).id == sailor.id
    assert sailors.get_by_id(sailor.id).consent_status == ConsentStatus.ACTIVE


def test_regeneration_changes_only_personal_capability(personal):
    sailors, sessions, sailor, service, consent = personal
    active = consent.confirm_consent(sailor.id, "test")
    session = sessions.create("activity-1")
    sessions.replace(replace(session, capability_token="shared-token-" + "s" * 32))
    before = sessions.path.read_bytes()
    updated = service.regenerate_capability(sailor.id)
    assert replace(updated, personal_capability_token=active.personal_capability_token) == active
    assert service.resolve(active.personal_capability_token) is None
    service.revoke_capability(sailor.id)
    assert sessions.path.read_bytes() == before
    assert sailors.get_by_id(sailor.id).consent_status == ConsentStatus.ACTIVE


def test_uniqueness_retries_personal_session_and_previous_tokens(personal):
    sailors, sessions, sailor, service, _ = personal
    previous = service.ensure_for_sailor(sailor.id).personal_capability_token
    other, _ = sailors.find_or_create_by_email("other@example.test")
    other_token = service.ensure_for_sailor(other.id).personal_capability_token
    shared_token = "s" * 43
    sessions.replace(replace(sessions.create("activity"), capability_token=shared_token))
    tokens = iter([previous, other_token, shared_token, sailor.id, "n" * 43])
    generator = PersonalCapabilityService(sailors, sessions, token_generator=lambda: next(tokens))
    assert generator.regenerate_capability(sailor.id).personal_capability_token == "n" * 43


def test_failed_generation_does_not_replace_existing_token(personal):
    sailors, sessions, sailor, service, _ = personal
    previous = service.ensure_for_sailor(sailor.id)
    for token in ["short", "unsafe/" + "x" * 43, previous.personal_capability_token]:
        generator = PersonalCapabilityService(sailors, sessions, token_generator=lambda: token)
        with pytest.raises(ValueError):
            generator.regenerate_capability(sailor.id)
        assert sailors.get_by_id(sailor.id) == previous


def test_legacy_sailors_load_without_writes_and_duplicate_tokens_are_rejected(personal):
    sailors, _, sailor, _, _ = personal
    records = json.loads(sailors.path.read_text(encoding="utf-8"))
    for record in records:
        record.pop("personal_capability_token")
        record.pop("personal_capability_revoked")
    sailors.path.write_text(json.dumps(records), encoding="utf-8")
    before = sailors.path.read_bytes()
    legacy = sailors.get_by_id(sailor.id)
    assert legacy.personal_capability_token is None
    assert not legacy.personal_capability_revoked
    assert sailors.path.read_bytes() == before
    other, _ = sailors.find_or_create_by_email("other@example.test")
    sailors.replace(replace(legacy, personal_capability_token="x" * 43))
    with pytest.raises(ValueError, match="Duplicate personal"):
        sailors.replace(replace(other, personal_capability_token="x" * 43))


def test_revocation_before_generation_does_not_get_undone_by_confirmation(personal):
    _, _, sailor, service, consent = personal
    service.revoke_capability(sailor.id)
    confirmed = consent.confirm_consent(sailor.id, "test")
    assert confirmed.personal_capability_token is None
    assert confirmed.personal_capability_revoked
    assert service.resolve("") is None
