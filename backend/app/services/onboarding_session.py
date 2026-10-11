from app.models import ConsentStatus
from app.repositories.activities import ActivityRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.consent_requests import ConsentRequestService
from app.services.session_capabilities import SessionCapabilityService


def onboarding_session_path(
    sailor_id: str,
    sailors: SailorRepository,
    events: ConsentEventRepository | None = None,
    capabilities: SessionCapabilityService | None = None,
) -> str | None:
    """Read the bound consent-cycle context; never infer or restore access."""
    sessions = SessionRepository(sailors.path.with_name("sessions.json"))
    requests = ConsentRequestService(
        ConsentRequestRepository(sailors.path.with_name("consent_requests.json")),
        sailors,
        events or ConsentEventRepository(sailors.path.with_name("consent_events.json")),
        sessions,
    )
    request = requests.find_current_for_sailor(sailor_id)
    if request is None or request.onboarding_activity_id is None:
        return None
    capabilities = capabilities or SessionCapabilityService(
        sessions, ActivityRepository(sailors.path.with_name("activities.json")), sailors
    )
    sailor = sailors.get_by_id(sailor_id)
    activity = capabilities.activities.get_by_id(request.onboarding_activity_id)
    session = capabilities.sessions.get_by_id(request.onboarding_session_id)
    if (
        sailor is None
        or sailor.consent_status != ConsentStatus.ACTIVE
        or activity is None
        or activity.sailor_id != sailor_id
        or session is None
        or activity.id not in session.activity_ids
        or session.capability_token is None
        or capabilities.resolve(session.capability_token) is None
    ):
        return None
    return f"/s/{session.capability_token}"
