# Personal TackBar

This specification owns accepted Personal TackBar behavior. Its separately marked unresolved privacy question is not a new guarantee. [The index](index.md) defines the documentation route.

## Current contract

### Purpose and access

- Personal TackBar is an `ACTIVE` Sailor's read-only **My Sessions** participation history. Entry uses that Sailor's current personal capability, without a Sailor login. Invalid or unusable access does not disclose the Sailor or history. [Access and Consent](access-and-consent.md) owns the authorization, consent and capability rules.
- A Session appears once when at least one of the Sailor's Activities belongs to it, including when that Sailor has multiple Activities in the Session. Membership is derived through Sailor → Activity → Session. History is normally shown newest first and does not offer an individual Activity history, profile editing, track upload or Session administration. [Domain and Sessions](domain-and-sessions.md) owns Activity and Session relationships.

### Session recognition and search

- The compact, single-column list shows the Sailor's identity and Session count. Each row identifies the Session by its persisted city when non-empty, otherwise its persisted country when non-empty, plus sailing date. City and country are never concatenated, region is not a fallback, and without city or country the date remains the identity. A second line gives the sailing time range and a Sailor count. The list remains useful without geographic or weather context.
- A third, optional line shows persisted historical/modelled wind direction, wind speed and air temperature from the hourly observation nearest the Session interval midpoint. An equal-distance tie uses the earlier observation. The line is omitted when no usable values exist. It does not show gusts, cloud, wave or provider detail. [Session Context](session-context.md) owns acquisition, provenance and availability of these Session-owned values.
- Search filters the displayed Session list by its selected city-or-country display location and sailing date. It does not search region, weather, counts, Activity details, technical IDs or diagnostics. Search and rows remain compact and usable on mobile and tablet; no thumbnail or row expansion is part of the accepted Personal view.

### Opening and unavailable Sessions

- An available row opens the existing collaborative [Session Viewer](session-viewer.md) directly through a currently usable shared Session capability. Personal access does not grant Viewer access on its own. The Viewer still applies shared capability, Session lifetime and `ACTIVE`-only visibility checks. [Access and Consent](access-and-consent.md) owns those checks.
- An expired, revoked or otherwise unavailable Session remains in participation history, visibly unavailable and without a usable opening action. Personal TackBar does not fabricate a shared link, renew a Session or change Activity retention. Explicit Admin renewal may restore access only under the existing Session and capability rules in [Domain and Sessions](domain-and-sessions.md) and [Access and Consent](access-and-consent.md).
- The public header offers About without changing the page route or Session list. Where release metadata is available, the exact deployed tag and release family appear beneath the public logo and within About; absent metadata is omitted. [Completed #116](https://github.com/maxsail-project/tackbar/issues/116) records the accepted placement.

## Provenance and review

| Current contract | Preserved source or accepted increment | Implementation and focused evidence |
| --- | --- | --- |
| Personal capability, `ACTIVE` gate, read-only one-row-per-Session history and Viewer boundary | [v0.6 requirements](../v0.6-personal-tackbar-pilot-operations-requirements.md) §3 V6-PER-01–07; [v0.6 decisions](../v0.6-decisions.md) §3.1–3.5 | `backend/app/services/personal_reader.py`, `sailor_sessions.py`, `shared_session_reader.py`; `backend/tests/test_admin_api.py` personal-history, denial and renewal cases |
| City-or-country/date identity with date fallback; compact row, search, optional atmospheric cue and direct opening | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §9 V7-CTX-05; [completed #108](https://github.com/maxsail-project/tackbar/issues/108); [completed #115](https://github.com/maxsail-project/tackbar/issues/115); approved [#118](https://github.com/maxsail-project/tackbar/issues/118) implementation delta | `frontend/src/pages/PersonalTackBarPage.tsx`, `frontend/src/pages/PersonalTackBarPage.test.tsx`; `backend/app/services/personal_reader.py`; `backend/tests/test_admin_api.py` personal-weather cases |
| Unavailable participation history and no shared-access bypass | [v0.6 requirements](../v0.6-personal-tackbar-pilot-operations-requirements.md) §3 V6-PER-05–07; [v0.6 decisions](../v0.6-decisions.md) §3.3–3.5 | `backend/app/services/personal_reader.py`; `backend/tests/test_admin_api.py` unavailable and renewal cases; `frontend/src/pages/PersonalTackBarPage.test.tsx` |
| Public About and release identity | [Completed #116](https://github.com/maxsail-project/tackbar/issues/116), including its later accepted placement clarification | `frontend/src/components/AboutControl.tsx`, `frontend/src/pages/PersonalTackBarPage.tsx`; their focused tests |

### Unresolved contract

**High — personal history aggregate visibility.** `backend/app/services/sailor_sessions.py` derives a row's sailing interval and Sailor count from all member Activities, including those owned by non-`ACTIVE` Sailors; `backend/tests/test_admin_api.py` exercises this, while shared Viewer details filter those Activities. [V6-PER-04](../v0.6-personal-tackbar-pilot-operations-requirements.md) permits derived recognition context and [V5-CNS-03](../v0.5-real-sailing-pilot-requirements.md) requires `ACTIVE`-only shared Activity visibility, but neither settles whether personal aggregate interval/count may reveal non-`ACTIVE` participation. The rule needs a human decision; the current contract above does not prescribe the membership basis for those displayed aggregates.

Open [#117](https://github.com/maxsail-project/tackbar/issues/117) is research on a possible minimap, not an accepted thumbnail requirement. Open [#120](https://github.com/maxsail-project/tackbar/issues/120) and [#121](https://github.com/maxsail-project/tackbar/issues/121) do not change Personal TackBar behavior.
