from datetime import datetime, timezone
from typing import Callable

from app.admin_api_models import (
    AdminConsentEventResponse,
    AdminSailorDetailResponse,
    AdminSailorResponse,
    AdminSailorSessionResponse,
    AdminSessionResponse,
    AdminSessionSailor,
    CapabilityState,
    ConsentOperationalGroup,
)
from app.models import ConsentStatus, Sailor, Session, StoredActivity
from app.repositories.activities import ActivityRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.sailor_sessions import sailor_sessions
from app.services.shared_activity_visibility import (
    SharedActivityVisibilityError,
    shareable_sailor,
)


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
    ) -> None:
        self.sailors = sailors
        self.consent_events = consent_events
        self.sessions = sessions
        self.activities = activities
        self.clock = clock or (lambda: datetime.now(timezone.utc))

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
        )
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
            sessions=self._sailor_sessions(sailor.id),
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
        )

    def _validate_consent_event_sailors(self, sailor_ids: set[str]) -> None:
        if any(
            event.sailor_id not in sailor_ids
            for event in self.consent_events.all()
        ):
            raise AdminDataIntegrityError(
                "Consent event references unknown Sailor"
            )

    def list_sessions(self) -> list[AdminSessionResponse]:
        activities = {activity.id: activity for activity in self.activities.all()}
        sailors = {sailor.id: sailor for sailor in self.sailors.all()}
        responses = [
            self._session_response(session, activities, sailors)
            for session in self.sessions.all()
        ]
        return sorted(
            responses,
            key=lambda session: (session.created_at, session.id),
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
        visible_count = 0
        session_activities = []
        represented_sailors: dict[str, Sailor] = {}
        for activity_id in session.activity_ids:
            activity = activities.get(activity_id)
            if activity is None:
                raise AdminDataIntegrityError("Session references unknown Activity")
            try:
                if shareable_sailor(activity, sailors) is not None:
                    visible_count += 1
                sailor = sailors.get(activity.sailor_id)
                if sailor is None:
                    raise AdminDataIntegrityError("Activity references unknown Sailor")
                session_activities.append(activity)
                represented_sailors[sailor.id] = sailor
            except SharedActivityVisibilityError as error:
                raise AdminDataIntegrityError("Activity references unknown Sailor") from error
        state = self._capability_state(session)
        active_token = session.capability_token if state == "active" else None
        starts = [activity.start_time for activity in session_activities]
        ends = [activity.end_time for activity in session_activities]
        active_sailors = sorted(
            (sailor for sailor in represented_sailors.values() if sailor.consent_status == ConsentStatus.ACTIVE),
            key=lambda sailor: ((sailor.name or sailor.email).casefold(), sailor.id),
        )
        return AdminSessionResponse(
            id=session.id,
            created_at=session.created_at,
            expires_at=session.expires_at,
            total_activity_count=len(session.activity_ids),
            visible_activity_count=visible_count,
            capability_state=state,
            capability_token=active_token,
            capability_path=f"/s/{active_token}" if active_token is not None else None,
            sailing_start=min(starts) if starts else None,
            sailing_end=max(ends) if ends else None,
            active_sailors=[AdminSessionSailor(id=sailor.id, label=sailor.name or sailor.email) for sailor in active_sailors],
            consent_active_count=sum(s.consent_status == ConsentStatus.ACTIVE for s in represented_sailors.values()),
            consent_pending_count=sum(s.consent_status == ConsentStatus.PENDING for s in represented_sailors.values()),
            consent_revoked_count=sum(s.consent_status == ConsentStatus.REVOKED for s in represented_sailors.values()),
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
