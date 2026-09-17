from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import pytest

from app.models import ConsentStatus
from app.repositories.sailors import SailorRepository
from app.services.welcome_email_delivery import (
    WELCOME_EMAIL_DELIVERY_FAILURE,
    WelcomeEmailDeliveryError,
)
from app.services.welcome_email_resend import (
    WelcomeEmailResendEligibilityError,
    WelcomeEmailResendService,
)


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
TOKEN = "r" * 32
SENT_AT = datetime(2031, 6, 18, 12, 0, tzinfo=timezone.utc)


def _sailor(
    status: ConsentStatus = ConsentStatus.ACTIVE,
    token: str | None = TOKEN,
    revoked: bool = False,
    sent_at: str | None = None,
    error: str | None = None,
) -> dict[str, object]:
    return {
        "id": SAILOR_ID,
        "email": "sailor-a@example.com",
        "name": "Sailor A",
        "default_boat_id": None,
        "consent_status": status.value,
        "personal_capability_token": token,
        "personal_capability_revoked": revoked,
        "welcome_email_sent_at": sent_at,
        "welcome_email_last_error": error,
    }


def _service(
    temporary_json_file: Callable[[str, object], Path],
    sailor: dict[str, object],
    sender: Callable[[str, str], None],
    clock: Callable[[], datetime] = lambda: SENT_AT,
) -> tuple[WelcomeEmailResendService, SailorRepository]:
    repository = SailorRepository(temporary_json_file("sailors", [sailor]))
    return WelcomeEmailResendService(repository, sender, clock), repository


def test_resend_uses_persisted_recipient_current_capability_and_records_success(
    temporary_json_file,
):
    delivered: list[tuple[str, str]] = []
    service, repository = _service(
        temporary_json_file,
        _sailor(sent_at="2031-06-17T12:00:00+00:00", error="previous failure"),
        lambda recipient, path: delivered.append((recipient, path)),
    )

    resent = service.resend(SAILOR_ID)

    assert delivered == [("sailor-a@example.com", f"/me/{TOKEN}")]
    assert resent.consent_status == ConsentStatus.ACTIVE
    assert resent.personal_capability_token == TOKEN
    assert resent.personal_capability_revoked is False
    assert resent.welcome_email_sent_at == SENT_AT
    assert resent.welcome_email_last_error is None
    assert repository.get_by_id(SAILOR_ID) == resent


def test_controlled_resend_failure_preserves_access_and_records_safe_state(
    temporary_json_file,
):
    service, repository = _service(
        temporary_json_file,
        _sailor(sent_at="2031-06-17T12:00:00+00:00"),
        lambda *_: (_ for _ in ()).throw(
            WelcomeEmailDeliveryError("provider secret and delivery-token-secret")
        ),
    )

    resent = service.resend(SAILOR_ID)

    assert resent.consent_status == ConsentStatus.ACTIVE
    assert resent.personal_capability_token == TOKEN
    assert resent.personal_capability_revoked is False
    assert resent.welcome_email_sent_at is not None
    assert resent.welcome_email_sent_at.isoformat() == "2031-06-17T12:00:00+00:00"
    assert resent.welcome_email_last_error == WELCOME_EMAIL_DELIVERY_FAILURE
    assert "secret" not in resent.welcome_email_last_error
    assert repository.get_by_id(SAILOR_ID) == resent


@pytest.mark.parametrize(
    "sailor",
    [
        _sailor(status=ConsentStatus.PENDING),
        _sailor(status=ConsentStatus.REVOKED),
        _sailor(token=None),
        _sailor(revoked=True),
    ],
)
def test_resend_rejects_ineligible_sailors_without_attempting_delivery(
    temporary_json_file,
    sailor,
):
    delivered: list[tuple[str, str]] = []
    service, repository = _service(
        temporary_json_file,
        sailor,
        lambda recipient, path: delivered.append((recipient, path)),
    )
    before = repository.get_by_id(SAILOR_ID)

    with pytest.raises(WelcomeEmailResendEligibilityError):
        service.resend(SAILOR_ID)

    assert delivered == []
    assert repository.get_by_id(SAILOR_ID) == before


def test_unknown_sailor_does_not_attempt_delivery(temporary_json_file):
    delivered: list[tuple[str, str]] = []
    service, _ = _service(
        temporary_json_file,
        _sailor(),
        lambda recipient, path: delivered.append((recipient, path)),
    )

    with pytest.raises(ValueError, match="Sailor not found"):
        service.resend("unknown")

    assert delivered == []


def test_unexpected_resend_sender_error_surfaces(temporary_json_file):
    service, _ = _service(
        temporary_json_file,
        _sailor(),
        lambda *_: (_ for _ in ()).throw(RuntimeError("internal error")),
    )

    with pytest.raises(RuntimeError, match="internal error"):
        service.resend(SAILOR_ID)
