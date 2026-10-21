# Session Context

This specification owns accepted Session geographic and historical-conditions context. [The index](index.md) defines the documentation route.

## Current contract

### Session-owned geographic context

- Geographic context is optional descriptive data owned by the Session. The Activity that created the Session supplies its persisted start latitude and longitude for a Geoapify reverse lookup through a replaceable provider boundary. Location does not affect Activity identity, Session membership or matching.
- The normal reverse lookup uses the first result without a city-type filter. It normalizes available `city`, `state`, `country` and `country_code` into `location_label`, `location_region`, `location_country` and `location_country_code` respectively. A city is not required: any non-empty supported field makes the result usable, while a result with none of those fields supplies no geographic context. `location_label` retains its city-only meaning.
- A successful lookup persists only those normalized fields plus `location_provider`, UTC `location_resolved_at` and `location_source_activity_id`. Precise addresses, coordinates beyond the existing Activity source context, new geographic fields, full provider responses and provider credentials are not Session data.
- A missing provider configuration, failed lookup or unsuitable result leaves the Session usable without geographic context. Normal Session reads use persisted data and make no geocoding request.

### Historical weather and marine context

- Optional Session-owned conditions are **historical/modelled descriptive context**. They are neither onboard measurements nor substitutes for missing Activity sensors, and do not feed maneuver detection, metrics, classification, replay or other sailing analytics.
- A persisted series can contain hourly air temperature (°C), 10 m wind speed and gusts (kn), 10 m wind direction (degrees), cloud cover (%), wave height (m), wave direction (degrees) and wave period (s). Missing values remain unavailable. Atmospheric and marine sources may succeed independently; a partial series is valid.
- The requested coverage is the current Session sailing interval, from the earliest member Activity start through the latest member Activity end, expanded by three hours at both ends. TackBar persists that exact requested interval, the requested coordinate, available hourly samples, and separate weather and marine provenance: provider, route/dataset, retrieval time and returned grid coordinate. Coverage metadata is the *requested* interval; it does not promise an observation at every hour or that both sources returned data.
- The requested coordinate is the derived Session center, with the creator Activity's start coordinate as an exceptional fallback when that center cannot be derived. It is distinct from the coordinate used for the geographic lookup and from each provider's returned grid coordinate.
- Open-Meteo supplies the current modelled series through a replaceable historical-conditions provider boundary. Recent atmospheric requests use Forecast; older requests outside the 92-day archived-forecast window use Historical Weather. Recent marine requests use best-match routing; older requests use ERA5-Ocean. Requests use GMT and sea-cell selection, with one request per source for the complete interval. TackBar retains only returned hourly values within the requested interval and does not fabricate denser samples.
- Provider failure, missing data or partial availability does not block the Session or its Viewer. Normal reads use persisted conditions and do not request weather or marine data.

### Enrichment lifecycle and maintenance

- After authoritative Activity persistence and creation of a **new** Session, TackBar attempts geographic, atmospheric and marine enrichment as best-effort secondary work. Failure or unavailability in one source does not prevent the others and cannot roll back ingestion or Session creation.
- Matching a later Activity into an existing Session does not call context providers, check persisted coverage, mark context stale or automatically refresh it. Persisted context can therefore predate the Session's later expanded membership.
- Admin **Enrich Session** is an explicit, one-Session-at-a-time maintenance action. It attempts geography only when the Session has no usable persisted geographic field and does not overwrite city-, country-, region- or country-code-only context. It requests conditions for the complete *current* Session interval plus three hours at each end; a successful result replaces the prior conditions series atomically. Failure or no usable result preserves the previous series. This action supports older Sessions, missing conditions context and Sessions whose membership later expanded.
- Context enrichment does not create a bulk job, automatic refresh path, manual location override or location force refresh. [Domain and Sessions](domain-and-sessions.md) owns matching, membership and lifetime; [Ingestion and Data](ingestion-and-data.md) owns authoritative Activity processing and persistence boundaries.

### Read and presentation boundary

- Permitted original and temporary shared Session reads expose the same persisted Session location and normalized hourly conditions. They expose minimal source identity for the series, not credentials or the Admin diagnostic payload. [Access and Consent](access-and-consent.md) owns which Session and Activities a caller may see; context adds no access path.
- Compact Session identity follows **City > Country > nothing**: a non-empty city is the sole location label; otherwise a non-empty country is the sole label; otherwise the existing date or date/time fallback remains. Region is never a compact display fallback. Admin applies the same rule to Session identity and search while keeping fuller persisted geographic and conditions provenance in Session details. Activity selectors retain Activity-specific identity. Detailed layouts belong in [Session Viewer](session-viewer.md), [Personal TackBar](personal-tackbar.md) and [Admin](admin.md).
- The Viewer and Personal TackBar read persisted Session conditions; their compact cues select observations for different temporal midpoints. Display, selection and the unresolved Viewer gust discrepancy belong in [Session Viewer](session-viewer.md#maneuver-interaction-and-session-context) and [Personal TackBar](personal-tackbar.md#session-recognition-and-search). Normal reads do not call context providers.

## Provenance and review

| Contract | Preserved sources and Issue evidence | Implementation and focused evidence |
| --- | --- | --- |
| Session geography, optional persistence and city-less supported context | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §9 V7-CTX-01; [v0.7 decisions](../v0.7-decisions.md) §12; [completed #106](https://github.com/maxsail-project/tackbar/issues/106); approved [#118](https://github.com/maxsail-project/tackbar/issues/118) implementation delta | `backend/app/session_context_providers/geocoding.py`; `backend/app/models.py`; `backend/app/repositories/sessions.py`; `backend/app/services/session_enrichment.py`; `backend/tests/test_session_enrichment.py` |
| Modelled fields, coverage, center and source routing | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §9 V7-CTX-02; [v0.7 decisions](../v0.7-decisions.md) §12; [completed #107](https://github.com/maxsail-project/tackbar/issues/107) | `backend/app/session_context_providers/historical_conditions.py`; `backend/app/services/session_enrichment.py`; `backend/tests/test_session_enrichment.py` |
| Automatic and Admin enrichment, later Activity boundary | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §9 V7-CTX-01–04; [v0.7 decisions](../v0.7-decisions.md) §12; [completed #106](https://github.com/maxsail-project/tackbar/issues/106), [#107](https://github.com/maxsail-project/tackbar/issues/107) | `backend/app/services/ingestion_processing.py`, `session_enrichment.py`; `backend/app/admin_routes.py`; `backend/tests/test_session_enrichment.py`, `test_admin_api.py` |
| Shared context projection and Viewer cue | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §9 V7-CTX-05; [v0.7 decisions](../v0.7-decisions.md) §12; [completed #107](https://github.com/maxsail-project/tackbar/issues/107) | `backend/app/services/shared_session_reader.py`; `backend/tests/test_session_api.py`; `frontend/src/utils/historicalConditions.ts` and its tests; `frontend/src/pages/SessionViewerPage.tsx` |
| Personal identity and compact weather cue | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §9 V7-CTX-05; [completed #108](https://github.com/maxsail-project/tackbar/issues/108), [#115](https://github.com/maxsail-project/tackbar/issues/115) | `backend/app/services/personal_reader.py`; `backend/tests/test_admin_api.py` Personal cases; `frontend/src/pages/PersonalTackBarPage.tsx` and its tests |
| City > Country > nothing compact presentation | Approved [#118](https://github.com/maxsail-project/tackbar/issues/118) implementation delta, superseding the preserved historical city-only rule for current behavior | `frontend/src/utils/sessionPresentation.ts`; `frontend/src/pages/SessionViewerPage.test.tsx`, `PersonalTackBarPage.test.tsx`, `AdminPage.test.tsx`; `backend/app/services/shared_session_reader.py`, `personal_reader.py` |

### Unresolved transition findings

1. **Low — requested coverage versus available samples.** The stored bounds describe the exact interval requested, while providers may return only some hours or one of the two source types. No complete-hourly-coverage guarantee is supported.

Session context does not change Session matching, consent, capability, Activity telemetry, analytics or Viewer replay rules.
