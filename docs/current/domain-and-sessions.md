# Domain and Sessions

This specification owns accepted Sailor, Boat, Activity and Session semantics, including membership, matching and lifetime. [The index](index.md) defines the documentation route.

The statements under **Current contract** describe the established product behavior. **Provenance and review** identifies source evidence and preserves the superseded historical matching threshold.

## Current contract

### Sailor and Boat

- A **Sailor** is the person-level TackBar identity. A Sailor has a stable internal ID; normalized email is the external identity used to resolve that Sailor during email ingestion, not the internal ID. A Sailor may have an optional display name, multiple Activities and participation in multiple Sessions. An `ACTIVE` Sailor may set, edit or clear only their own name through current personal access; submitted names are trimmed and blank input clears the name. Subsequent authorized identity reads use the current name when present and fall back to email when absent, without rewriting Activities or Sessions.
- A **Boat** is a separate sailing context with a stable ID. Its name, sailing class and sail number are recorded when known; at least one of these fields is required. Newly registered Sailor-owned Boats carry an explicit Sailor ID. One Sailor may own a catalogue of several Boats, and a Boat may be referenced by several Activities. This catalogue relationship does not assert physical vessel ownership. Different Sailors may independently record the same physical boat.
- The Sailor's current personal capability may create Boats in that Sailor's catalogue and edit only their owned Boats' name, sailing class and sail number. Boat ID and catalogue ownership are fixed. An edit changes the Boat context shown for its referring Activities on subsequent reads without rewriting those Activities.
- Known sailing-Class names are derived from persisted Boat class values across Sailors, including legacy Boats; only the names are shared. Exact case and whitespace variants reuse the first persisted canonical spelling without rewriting historical Boats. An unknown class name is allowed. For a conservative likely typo, the backend suggests a known spelling and requires an explicit choice to submit that spelling or confirm retention of the new spelling before saving. Accepted new names join the known set.
- Older Boat records without a Sailor ID remain unowned. Historical Activity references and configured default Boat IDs remain valid; neither implies or grants Boat ownership. Sailor-scoped Boat catalogue reads and updates exclude unowned Boats and other Sailors' Boats. Ownership cannot be transferred through a Boat metadata update. Internal Admin and ingestion reads may still resolve historical Boat references; shared Session Boat metadata follows [Access and Consent](access-and-consent.md).
- A Sailor may have an optional default Boat for automatic Activity creation. An Activity's Boat reference describes that Activity's sailing context and remains attached to it when the Sailor's default changes. TackBar does not infer Boat identity from a filename, email subject, device name or source-specific metadata.
- An `ACTIVE` Sailor may explicitly set or clear the default through personal access using a Boat in that Sailor's catalogue. Existing historical defaults remain readable until changed; a changed default applies only when a later Activity is first created and never rewrites prior Activities.

### Activity

- An **Activity** represents one track received by TackBar. It has a stable Activity ID, requires one Sailor and may reference one Boat when known.
- A VKX Activity may retain ordered Race Timer Events and user-set Line Position observations as optional Activity-owned source evidence. Repeated events and endpoint updates remain separate records; absent collections are empty. These observations do not define an official race start, one final start line, a race boundary or Session-owned events. Their parsing, validation and persistence belong in [Ingestion and Data](ingestion-and-data.md).
- An Activity may also carry an optional editable descriptive `device_label`, separate from its original parsed `device_name`. Its Sailor may change or clear its Boat reference and descriptive label through authorized personal context access. This does not change the Activity's Sailor, source, original filename, track, hash or Session membership. A new Boat assignment must belong to that Sailor; historical references to ownerless or other Boats remain until explicitly changed.
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
| Activity-owned VKX source observations | Approved [#151](https://github.com/maxsail-project/tackbar/issues/151), increment #151.1 | `backend/app/models.py`, `backend/app/repositories/activities.py`; `backend/tests/test_vakaros_vkx.py`, `test_activity_repository.py` |
| Sailor-owned Boats, optional default, Activity context and Sailor display name | Approved [#155](https://github.com/maxsail-project/tackbar/issues/155), #155.1–#155.3 and #155.8 | `backend/app/models.py`, `backend/app/repositories/boats.py`, `backend/app/services/personal_context.py`; `backend/tests/test_boat_repository.py`, `test_personal_context_api.py` |
| Session meaning and membership | [Session Viewer requirements](../session-viewer-requirements.md), §2 DM-01/02 and its delivered v0.4 override; [v0.7 analytics requirements](../v0.7-collaborative-debrief-analytics-requirements.md), V7-BASE-01 | `backend/app/repositories/sessions.py`; `backend/app/services/session_matcher.py`; `backend/tests/test_session_matcher.py` |
| Matching and later arrivals | [Session Viewer requirements](../session-viewer-requirements.md), §2 DM-01; [v0.5 pilot requirements](../v0.5-real-sailing-pilot-requirements.md), §7 V5-SES-04; [v0.5 decisions](../v0.5-decisions.md), §§1 and 12 (historical 60-minute rule); [#120 confirmed baseline](https://github.com/maxsail-project/tackbar/issues/120) (current 240 minutes, 3 NM and deterministic selection); [v0.6 requirements](../v0.6-personal-tackbar-pilot-operations-requirements.md), §6 V6-SES-01 | `backend/app/services/session_matcher.py`; `backend/tests/test_session_matcher.py` 240-minute and 3-NM boundary cases |
| Lifetime, renewal and retention | [v0.5 pilot requirements](../v0.5-real-sailing-pilot-requirements.md), §§7–8 V5-SES/RET; [v0.5 decisions](../v0.5-decisions.md), §§12–13; [v0.6 requirements](../v0.6-personal-tackbar-pilot-operations-requirements.md), §3 V6-PER-06/07 | `backend/app/repositories/sessions.py`; `backend/app/services/session_lifetime.py`; `backend/tests/test_session_lifetime.py`, `test_session_api.py` |
| Domain boundaries | [v0.4 collaborative debrief requirements](../v0.4-collaborative-debrief-requirements.md), §4 V4-DM-04; [v0.7 analytics requirements](../v0.7-collaborative-debrief-analytics-requirements.md), §9 V7-CTX-04 | `backend/app/models.py`; `backend/app/services/session_enrichment.py`; `backend/tests/test_session_enrichment.py` |

**Superseded matching history:** [v0.5 decisions](../v0.5-decisions.md) §1 recorded a 60-minute limit for that chapter. [#120](https://github.com/maxsail-project/tackbar/issues/120) explicitly confirms 240 minutes as the approved current behavior, supported by `backend/app/services/session_matcher.py` and boundary tests. #120 remains open for future review of the matching criteria; it approves no change to the current 240-minute, 3-NM, deterministic baseline and does not block this consolidation.
