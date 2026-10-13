from datetime import datetime, timezone
from typing import Callable

from app.admin_api_models import (
    AdminConsentRequestResponse,
    AdminConsentEventResponse,
    AdminSailorDetailResponse,
    AdminSailorBoatResponse,
    AdminSailorResponse,
    AdminSailorSessionResponse,
    AdminSessionActivityResponse,
    AdminSessionResponse,
    AdminSessionSummaryResponse,
    AdminTemporarySessionShareResponse,
    AdminTemporarySessionShareSummaryResponse,
    CapabilityState,
    ConsentOperationalGroup,
)
from app.models import (
    ConsentRequestState,
    ConsentStatus,
    Sailor,
    Session,
    StoredActivity,
    TemporarySessionShareState,
)
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.consent_requests import ConsentRequestRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.repositories.temporary_session_shares import TemporarySessionShareRepository
from app.services.consent_requests import (
    CONSENT_REQUEST_DELIVERY_FAILURE,
    ConsentRequestService,
)
from app.services.sailor_sessions import sailor_sessions
from app.services.shared_activity_visibility import (
    SharedActivityVisibilityError,
    shareable_sailor,
)
from app.services.session_capabilities import SessionCapabilityService
from app.services.temporary_session_shares import TemporarySessionShareService


class AdminDataIntegrityError(Exception):
    pass


class AdminReader:
    def __init__(
        self,
        sailors: SailorRepository,
        consent_events: ConsentEventRepository,
        sessions: SessionRepository,
        activities: ActivityRepository,
        clock: Callable[[], datetime] | None = None,
        consent_requests: ConsentRequestRepository | None = None,
        temporary_shares: TemporarySessionShareRepository | None = None,
        boats: BoatRepository | None = None,
    ) -> None:
        self.sailors = sailors
        self.consent_events = consent_events
        self.sessions = sessions
        self.activities = activities
        self.boats = boats or BoatRepository(sailors.path.with_name("boats.json"))
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.consent_requests = ConsentRequestService(
            consent_requests or ConsentRequestRepository(
                sailors.path.with_name("consent_requests.json")
            ),
            sailors,
            consent_events,
            sessions,
            clock=self.clock,
        )
        self.temporary_shares = TemporarySessionShareService(
            temporary_shares or TemporarySessionShareRepository(
                sailors.path.with_name("temporary_session_shares.json")
            ),
            SessionCapabilityService(
                sessions,
                activities,
                sailors,
                clock=self.clock,
            ),
            sailors,
            clock=self.clock,
        )

    def list_sailors(self) -> list[AdminSailorResponse]:
        persisted_sailors = self.sailors.all()
        self._validate_consent_event_sailors(
            {sailor.id for sailor in persisted_sailors}
        )
        sailors = [self._sailor_response(sailor) for sailor in persisted_sailors]
        order = {
            "pending_needs_request": 0,
            "pending_awaiting_response": 1,
            "active": 2,
            "revoked": 3,
        }
        return sorted(
            sailors,
            key=lambda sailor: (
                order[sailor.operational_group],
                sailor.email,
                sailor.id,
            ),
        )

    def get_sailor(self, sailor_id: str) -> AdminSailorDetailResponse | None:
        persisted_sailors = self.sailors.all()
        self._validate_consent_event_sailors(
            {sailor.id for sailor in persisted_sailors}
        )
        sailor = next(
            (sailor for sailor in persisted_sailors if sailor.id == sailor_id),
            None,
        )
        if sailor is None:
            return None
        summary = self._sailor_response(sailor)
        events = sorted(
            self.consent_events.for_sailor(sailor_id),
            key=lambda event: (event.timestamp, event.event_type.value),
            reverse=True,
        )
        request_resolution = (
            self.consent_requests.current_resolution_for_sailor(sailor_id)
        )
        request = request_resolution.request
        sessions = self._sailor_sessions(sailor.id)
        boat = (
            self.boats.get_by_id(sailor.default_boat_id)
            if sailor.default_boat_id is not None else None
        )
        request_states = {
            ConsentRequestState.NOT_FOUND: "none",
            ConsentRequestState.VALID: "valid",
            ConsentRequestState.EXPIRED: "expired",
            ConsentRequestState.ACCEPTED: "accepted",
            ConsentRequestState.UNUSABLE: "unusable",
        }
        return AdminSailorDetailResponse(
            **summary.model_dump(),
            consent_events=[
                AdminConsentEventResponse(
                    event_type=event.event_type.value,
                    timestamp=event.timestamp,
                    source=event.source,
                    agreement_version=event.agreement_version,
                )
                for event in events
            ],
            sessions=sessions,
            personal_capability_state=(
                "revoked" if sailor.personal_capability_revoked else
                "never_generated" if sailor.personal_capability_token is None else
                "active" if sailor.consent_status == ConsentStatus.ACTIVE else
                "consent_inactive"
            ),
            personal_capability_path=(
                f"/me/{sailor.personal_capability_token}"
                if sailor.personal_capability_token is not None
                and not sailor.personal_capability_revoked
                and sailor.consent_status == ConsentStatus.ACTIVE else None
            ),
            welcome_email_sent_at=sailor.welcome_email_sent_at,
            welcome_email_last_error=sailor.welcome_email_last_error,
            consent_request=AdminConsentRequestResponse(
                state=request_states[request_resolution.state],
                agreement_version=(
                    request.agreement_version if request is not None else None
                ),
                created_at=request.created_at if request is not None else None,
                expires_at=request.expires_at if request is not None else None,
                automatic_delivery_attempted_at=(
                    request.automatic_delivery_attempted_at
                    if request is not None else None
                ),
                delivery_sent_at=(
                    request.delivery_sent_at if request is not None else None
                ),
                delivery_last_error=(
                    CONSENT_REQUEST_DELIVERY_FAILURE
                    if request is not None
                    and request.delivery_last_error is not None
                    else None
                ),
            ),
            default_boat=(
                AdminSailorBoatResponse(
                    id=boat.id,
                    name=boat.name,
                    sailing_class=boat.sailing_class,
                    sail_number=boat.sail_number,
                )
                if boat is not None else None
            ),
            diagnostic={
                "sailor": {
                    "id": sailor.id,
                    "email": sailor.email,
                    "name": sailor.name,
                    "default_boat_id": sailor.default_boat_id,
                    "consent_status": sailor.consent_status.value,
                    "consent_request_sent_at": sailor.consent_request_sent_at,
                    "consent_granted_at": sailor.consent_granted_at,
                    "consent_revoked_at": sailor.consent_revoked_at,
                    "personal_capability_revoked": sailor.personal_capability_revoked,
                    "welcome_email_sent_at": sailor.welcome_email_sent_at,
                    "welcome_email_last_error": (
                        "Delivery failed"
                        if sailor.welcome_email_last_error is not None else None
                    ),
                },
                "operational_group": summary.operational_group,
                "personal_capability_state": (
                    "revoked" if sailor.personal_capability_revoked else
                    "never_generated" if sailor.personal_capability_token is None else
                    "active" if sailor.consent_status == ConsentStatus.ACTIVE else
                    "consent_inactive"
                ),
                "activity_count": summary.activity_count,
                "session_count": summary.session_count,
                "default_boat": (
                    {
                        "id": boat.id,
                        "name": boat.name,
                        "sailing_class": boat.sailing_class,
                        "sail_number": boat.sail_number,
                    }
                    if boat is not None else None
                ),
                "consent_request": (
                    {
                        "state": request_states[request_resolution.state],
                        "agreement_version": request.agreement_version,
                        "created_at": request.created_at,
                        "expires_at": request.expires_at,
                        "automatic_delivery_attempted_at": request.automatic_delivery_attempted_at,
                        "delivery_sent_at": request.delivery_sent_at,
                        "delivery_last_error": (
                            CONSENT_REQUEST_DELIVERY_FAILURE
                            if request.delivery_last_error is not None else None
                        ),
                    }
                    if request is not None else {"state": "none"}
                ),
                "consent_events": [
                    {
                        "event_type": event.event_type.value,
                        "timestamp": event.timestamp,
                        "source": event.source,
                        "agreement_version": event.agreement_version,
                    }
                    for event in events
                ],
                "sessions": [
                    {
                        "session_id": item.session_id,
                        "sailing_start": item.sailing_start,
                        "sailing_end": item.sailing_end,
                        "sailor_activity_count": item.sailor_activity_count,
                        "expires_at": item.expires_at,
                        "capability_state": item.capability_state,
                    }
                    for item in sessions
                ],
            },
        )

    def _validate_consent_event_sailors(self, sailor_ids: set[str]) -> None:
        if any(
            event.sailor_id not in sailor_ids
            for event in self.consent_events.all()
        ):
            raise AdminDataIntegrityError(
                "Consent event references unknown Sailor"
            )

    def list_sessions(self) -> list[AdminSessionSummaryResponse]:
        activities = {activity.id: activity for activity in self.activities.all()}
        sailors = {sailor.id: sailor for sailor in self.sailors.all()}
        responses = [
            self._session_summary(session, activities, sailors)
            for session in self.sessions.all()
        ]
        return sorted(
            responses,
            key=lambda session: (
                session.sailing_start is not None,
                session.sailing_start or datetime.min.replace(tzinfo=timezone.utc),
                session.id,
            ),
            reverse=True,
        )

    def get_session(self, session_id: str) -> AdminSessionResponse | None:
        session = self.sessions.get_by_id(session_id)
        if session is None:
            return None
        return self._session_response(
            session,
            {activity.id: activity for activity in self.activities.all()},
            {sailor.id: sailor for sailor in self.sailors.all()},
        )

    def _sailor_response(self, sailor: Sailor) -> AdminSailorResponse:
        sessions = self._sailor_sessions(sailor.id)
        return AdminSailorResponse(
            id=sailor.id,
            email=sailor.email,
            name=sailor.name,
            consent_status=sailor.consent_status.value,
            consent_request_sent_at=sailor.consent_request_sent_at,
            consent_granted_at=sailor.consent_granted_at,
            consent_revoked_at=sailor.consent_revoked_at,
            operational_group=_operational_group(sailor),
            activity_count=sum(item.sailor_id == sailor.id for item in self.activities.all()),
            session_count=len(sessions),
            last_sailing_start=(sessions[0].sailing_start if sessions else None),
            last_sailing_end=(sessions[0].sailing_end if sessions else None),
        )

    def _sailor_sessions(self, sailor_id: str) -> list[AdminSailorSessionResponse]:
        activities = {activity.id: activity for activity in self.activities.all()}
        sailors = {sailor.id: sailor for sailor in self.sailors.all()}
        try:
            history = sailor_sessions(sailor_id, self.sessions.all(), activities, sailors)
        except ValueError as error:
            raise AdminDataIntegrityError(str(error)) from error
        summaries = []
        for item in history:
            session = item.session
            state = self._capability_state(session)
            token = session.capability_token if state == "active" else None
            summaries.append(AdminSailorSessionResponse(
                session_id=session.id,
                sailing_start=item.sailing_start,
                sailing_end=item.sailing_end,
                sailor_activity_count=item.sailor_activity_count,
                expires_at=session.expires_at,
                capability_state=state,
                capability_path=f"/s/{token}" if token else None,
            ))
        return summaries

    def _session_response(
        self,
        session: Session,
        activities: dict[str, StoredActivity],
        sailors: dict[str, Sailor],
    ) -> AdminSessionResponse:
        summary = self._session_summary(session, activities, sailors)
        session_activities = [activities[activity_id] for activity_id in session.activity_ids]
        represented_sailors = {
            activity.sailor_id: sailors[activity.sailor_id]
            for activity in session_activities
        }
        state = self._capability_state(session)
        active_token = session.capability_token if state == "active" else None
        temporary_resolutions = self.temporary_shares.inspect_session(session.id)
        temporary_items = []
        for resolution in temporary_resolutions:
            share = resolution.share
            if share is None:
                continue
            temporary_items.append(AdminTemporarySessionShareResponse(
                id=share.id,
                created_at=share.created_at,
                expires_at=share.expires_at,
                state=resolution.state.value,
                path=(
                    f"/q/{share.token}"
                    if resolution.state == TemporarySessionShareState.VALID
                    else None
                ),
            ))
        active_shares = sorted(
            (item for item in temporary_items if item.state == "VALID"),
            key=lambda item: (item.created_at, item.id),
            reverse=True,
        )
        membership = [
            AdminSessionActivityResponse(
                id=activity.id,
                sailor_id=activity.sailor_id,
                sailor_label=(sailors[activity.sailor_id].name or sailors[activity.sailor_id].email),
                shareable=sailors[activity.sailor_id].consent_status == ConsentStatus.ACTIVE,
            )
            for activity in session_activities
        ]
        return AdminSessionResponse(
            **summary.model_dump(),
            created_at=session.created_at,
            capability_state=state,
            capability_path=f"/s/{active_token}" if active_token is not None else None,
            activities=membership,
            temporary_shares=AdminTemporarySessionShareSummaryResponse(
                active_count=sum(item.state == "VALID" for item in temporary_items),
                expired_count=sum(item.state == "EXPIRED" for item in temporary_items),
                unavailable_count=sum(item.state == "UNAVAILABLE" for item in temporary_items),
                active_share=active_shares[0] if active_shares else None,
            ),
            consent_active_count=sum(s.consent_status == ConsentStatus.ACTIVE for s in represented_sailors.values()),
            consent_pending_count=sum(s.consent_status == ConsentStatus.PENDING for s in represented_sailors.values()),
            consent_revoked_count=sum(s.consent_status == ConsentStatus.REVOKED for s in represented_sailors.values()),
            diagnostic={
                "session": {
                    "id": session.id,
                    "created_at": session.created_at.isoformat(),
                    "expires_at": session.expires_at.isoformat(),
                    "activity_ids": list(session.activity_ids),
                    "capability_state": state,
                },
                "membership": [item.model_dump() for item in membership],
                "temporary_shares": [
                    {
                        "id": item.id,
                        "created_at": item.created_at.isoformat(),
                        "expires_at": item.expires_at.isoformat(),
                        "state": item.state,
                    }
                    for item in temporary_items
                ],
            },
        )

    def _session_summary(
        self,
        session: Session,
        activities: dict[str, StoredActivity],
        sailors: dict[str, Sailor],
    ) -> AdminSessionSummaryResponse:
        visible_count = 0
        session_activities = []
        represented_sailor_ids: set[str] = set()
        for activity_id in session.activity_ids:
            activity = activities.get(activity_id)
            if activity is None:
                raise AdminDataIntegrityError("Session references unknown Activity")
            try:
                if shareable_sailor(activity, sailors) is not None:
                    visible_count += 1
            except SharedActivityVisibilityError as error:
                raise AdminDataIntegrityError("Activity references unknown Sailor") from error
            if activity.sailor_id not in sailors:
                raise AdminDataIntegrityError("Activity references unknown Sailor")
            session_activities.append(activity)
            represented_sailor_ids.add(activity.sailor_id)
        starts = [activity.start_time for activity in session_activities]
        ends = [activity.end_time for activity in session_activities]
        return AdminSessionSummaryResponse(
            id=session.id,
            expires_at=session.expires_at,
            total_activity_count=len(session.activity_ids),
            visible_activity_count=visible_count,
            sailing_start=min(starts) if starts else None,
            sailing_end=max(ends) if ends else None,
            sailor_count=len(represented_sailor_ids),
        )

    def _capability_state(self, session: Session) -> CapabilityState:
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("Admin clock must return timezone-aware time")
        if now >= session.expires_at:
            return "expired"
        if session.capability_revoked:
            return "revoked"
        if session.capability_token is not None:
            return "active"
        return "never_generated"


def _operational_group(sailor: Sailor) -> ConsentOperationalGroup:
    if sailor.consent_status == ConsentStatus.ACTIVE:
        return "active"
    if sailor.consent_status == ConsentStatus.REVOKED:
        return "revoked"
    if sailor.consent_request_sent_at is None:
        return "pending_needs_request"
    return "pending_awaiting_response"
