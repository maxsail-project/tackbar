# Domain and Sessions

This specification owns accepted Sailor, Boat, Activity and Session semantics, including membership, matching and lifetime. [The index](index.md) defines the documentation route.

The statements under **Current contract** describe the established product behavior. **Provenance and review** identifies source evidence and preserves the superseded historical matching threshold.

## Current contract

### Sailor and Boat

- A **Sailor** is the person-level TackBar identity. A Sailor has a stable internal ID; normalized email is the external identity used to resolve that Sailor during email ingestion, not the internal ID. A Sailor may have a name when known, multiple Activities and participation in multiple Sessions.
- A **Boat** is a separate sailing context with a stable ID. Its name, sailing class and sail number are recorded when known. A Sailor may sail different Boats over time.
- A Sailor may have an optional default Boat for automatic Activity creation. An Activity's Boat reference describes that Activity's sailing context and remains attached to it when the Sailor's default changes. TackBar does not infer Boat identity from a filename, email subject, device name or source-specific metadata.

### Activity

- An **Activity** represents one track received by TackBar. It has a stable Activity ID, requires one Sailor and may reference one Boat when known.
- A track may cover a complete or partial outing, day, race or training block. TackBar does not equate an Activity with any one of those concepts and does not automatically merge or split Activities.
- The same Sailor may have multiple Activities on one day or in one Session, including Activities with overlapping or separate time ranges.

### Session membership and matching

- A **Session** is a collaborative context with a stable ID and one or more member Activities. It may include Activities from different Sailors or several Activities from the same Sailor. A Session is not inherently one race, training block or sailing day.
- A persisted Activity belongs to at most one Session. Matching an already assigned Activity again retains its existing membership rather than adding it twice.
- TackBar matches a new, persisted Activity against compatible Sessions using the Activity's sailing-time and geographic context. The approved current temporal limit is a gap of at most **240 minutes between sailing intervals**; the geographic proximity limit is **3 NM**. It adds the Activity to a selected compatible Session or creates a Session containing that Activity when no compatible Session exists. Selection among compatible Sessions is deterministic. Email receipt and processing times do not define sailing compatibility.
- Session membership is technical domain state. Consent and shared-access state govern what can be shown to others; they do not determine whether an Activity can be ingested or matched. Detailed visibility and authorization rules belong in [Access and Consent](access-and-consent.md).

### Creation, expiry and renewal

- A new Session records `created_at` and `expires_at` in UTC. Its initial expiry is 60 days after creation.
- Reaching `expires_at` closes shared Session access. It does not remove the Session or its Activities, tracks or preserved originals. An expired Session may still receive a later compatible Activity through the same matching rules. That addition does not renew the Session or make shared access usable again.
- Admin may explicitly renew a Session before or after expiry. Renewal replaces `expires_at` with the current UTC time plus 30 days by default, or plus an explicitly chosen positive whole number of days up to 365. It does not add days to the prior expiry.
- Renewal preserves the Session ID, `created_at`, membership and existing capability state. It does not create, rotate or restore a capability. No Activity match, Sailor consent change, capability action or Session read implicitly renews the Session. The conditions under which a capability permits access belong in [Access and Consent](access-and-consent.md).
- Session expiry and data deletion are separate. Retained Activities may continue to support TackBar's service and participation history. Personal history may identify a Session as unavailable without granting access to it; presentation belongs in [Personal TackBar](personal-tackbar.md).

### Domain boundaries

- `Participant` is legacy migration terminology, not a current runtime entity. Sailor and Boat remain separate; no `SessionParticipant` entity is implied.
- An Analysis Window is a temporary Viewer selection, not a new Activity, Session or persisted segment. Its detailed behavior belongs in [Session Viewer](session-viewer.md).
- Session-owned geographic and historical-conditions context is optional descriptive context. It does not change Activity identity, membership, matching or lifetime. Its acquisition and availability belong in [Session Context](session-context.md); presentation belongs in the Viewer, Personal TackBar and Admin specifications.
- Provider acquisition, exact-file deduplication, normalized tracks and storage mechanisms belong in [Ingestion and Data](ingestion-and-data.md). External provider identity does not define Sailor, Activity or Session meaning.

## Provenance and review

| Contract area | Preserved source sections | Implementation and test evidence |
| --- | --- | --- |
| Sailor, Boat and Activity | [v0.4 collaborative debrief requirements](../v0.4-collaborative-debrief-requirements.md), §4 V4-DM-00–04; [AI Development Guidelines](../ai-development-guidelines.md), §3 | `backend/app/models.py`; `backend/app/repositories/sailors.py`, `boats.py`, `activities.py`; `backend/tests/test_sailor_boat_migration.py` |
| Session meaning and membership | [Session Viewer requirements](../session-viewer-requirements.md), §2 DM-01/02 and its delivered v0.4 override; [v0.7 analytics requirements](../v0.7-collaborative-debrief-analytics-requirements.md), V7-BASE-01 | `backend/app/repositories/sessions.py`; `backend/app/services/session_matcher.py`; `backend/tests/test_session_matcher.py` |
| Matching and later arrivals | [Session Viewer requirements](../session-viewer-requirements.md), §2 DM-01; [v0.5 pilot requirements](../v0.5-real-sailing-pilot-requirements.md), §7 V5-SES-04; [v0.5 decisions](../v0.5-decisions.md), §§1 and 12 (historical 60-minute rule); [#120 confirmed baseline](https://github.com/maxsail-project/tackbar/issues/120) (current 240 minutes, 3 NM and deterministic selection); [v0.6 requirements](../v0.6-personal-tackbar-pilot-operations-requirements.md), §6 V6-SES-01 | `backend/app/services/session_matcher.py`; `backend/tests/test_session_matcher.py` 240-minute and 3-NM boundary cases |
| Lifetime, renewal and retention | [v0.5 pilot requirements](../v0.5-real-sailing-pilot-requirements.md), §§7–8 V5-SES/RET; [v0.5 decisions](../v0.5-decisions.md), §§12–13; [v0.6 requirements](../v0.6-personal-tackbar-pilot-operations-requirements.md), §3 V6-PER-06/07 | `backend/app/repositories/sessions.py`; `backend/app/services/session_lifetime.py`; `backend/tests/test_session_lifetime.py`, `test_session_api.py` |
| Domain boundaries | [v0.4 collaborative debrief requirements](../v0.4-collaborative-debrief-requirements.md), §4 V4-DM-04; [v0.7 analytics requirements](../v0.7-collaborative-debrief-analytics-requirements.md), §9 V7-CTX-04 | `backend/app/models.py`; `backend/app/services/session_enrichment.py`; `backend/tests/test_session_enrichment.py` |

**Superseded matching history:** [v0.5 decisions](../v0.5-decisions.md) §1 recorded a 60-minute limit for that chapter. [#120](https://github.com/maxsail-project/tackbar/issues/120) explicitly confirms 240 minutes as the approved current behavior, supported by `backend/app/services/session_matcher.py` and boundary tests. #120 remains open for future review of the matching criteria; it approves no change to the current 240-minute, 3-NM, deterministic baseline and does not block this consolidation.
