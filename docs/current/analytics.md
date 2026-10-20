# Analytics — transitional current-product draft

**Status: Phase B5 review draft.** This document consolidates accepted current analytical semantics without activating the Living Documentation hierarchy. Until Phase C is approved and activated, the precedence in the [Living Documentation index](index.md) remains in force. The metric set is provisional and changes only through an explicitly approved increment.

## Current contract

### Canonical evidence and calculation ownership

- Maneuver analysis operates on an Activity's complete canonical normalized track, with GPS/UTC time and available SOG, COG, HDG, HEEL and TRIM. Missing or non-finite telemetry is unavailable; it is not reconstructed from weather context, another sensor or visual samples. HDG is distinct from COG and is never inferred from it. Circular headings and differences respect the 0°/360° boundary. HEEL/TRIM signs have no inferred port/starboard or bow-up/bow-down meaning.
- The backend owns maneuver detection, maneuver metrics and persisted maneuver artifacts. The frontend consumes the authorized analytical API and does not calculate maneuver events or read artifact files. Existing Viewer Summary, VS distributions and chart presentation are frontend calculations over the received canonical samples; their user-facing behavior belongs in [Session Viewer](session-viewer.md).
- Any visual reduction, smoothing or aggregation for map and chart rendering is presentation-only. It does not reduce the valid canonical sample population used for analytical calculations. [Ingestion and Data](ingestion-and-data.md) owns canonical Activity data and source normalization; [Session Context](session-context.md) owns modelled weather and marine context, which is not an analytical input.

### Neutral maneuver detection and event boundaries

- The delivered detector requires canonical HDG. It splits continuous evidence at gaps longer than 1.5 seconds, uses circular-safe local heading smoothing and turn rate, and requires at least 20 valid HDG samples in an eligible continuous segment. It seeds a candidate at an absolute turn rate of at least 4°/s and follows directional rotation at 0.5°/s. An accepted event lasts 3–30 seconds and must satisfy the current heading-change, directional-coherence, sample-integrity and available supporting COG/HEEL/SOG checks. These values describe the accepted provisional detector, not a general sailing standard or a promise that every physical maneuver is found.
- Missing or insufficient HDG yields **unavailable** maneuver analytics; it does not trigger a COG-only detector or invented events. An available result can contain zero accepted events. Optional context can support or reject a candidate under the delivered detector but cannot replace its required heading signal. TRIM is diagnostic context in the current detector, not a published maneuver metric.
- Each accepted event has start and end GPS/UTC timestamps delimiting its directional core. Its center is the cumulative-rotation midpoint and is the sole event navigation time; it need not equal the temporal midpoint. Events annotate the existing Activity. They do not create Activities, Sessions, races, legs or Saved Segments.
- The event remains a **neutral maneuver candidate** or significant sailing-direction change. TackBar does not label it a tack or gybe without separately validated and approved classification. The detector provides evidence for a debrief, not proof of tactical meaning, success or failure.

### Delivered maneuver measures

- A maneuver result reports start, center and end time, duration, circular HDG change, entry/minimum/exit SOG, recovery time, Loss distance and equivalent Loss time when their inputs support them. Missing metric inputs yield `null` in the API and an unavailable value in the Viewer. This set remains evidence-driven and provisional; a new or revised measure requires an explicit approved contract and focused validation.
- **Entry SOG** is the median of valid, finite, non-negative canonical SOG from 25 to 8 seconds before event start, inclusive. **Minimum SOG** is the minimum valid SOG within the event. **Exit SOG** is the median from 25 to 45 seconds after event end. Recovery requires comparable entry and exit regimes: their difference cannot exceed the greater of 0.75 kt and 15% of entry SOG. **Recovery time** ends at the first valid sample from event end through 60 seconds afterward with SOG at least 95% of exit SOG.
- **Loss distance** integrates the positive deficit below the *constant entry SOG* from event start through the recovery sample, using piecewise-linear canonical SOG and actual sample intervals, with 1 kt = 0.514444 m/s. Speed above entry contributes zero, not a negative loss or gain. **Equivalent Loss time** is that distance divided by entry SOG in m/s. Loss time requires positive entry SOG, a comparable exit regime, recovery and at least two valid SOG samples in the Loss interval; otherwise it remains unavailable. Loss is a debrief speed-deficit measure, not tactical gained/lost, VMG, opponent-relative performance or a maneuver score.

### Artifact and API validity

- The backend persists one private `.maneuvers.json` artifact per Activity with Activity ID, canonical-track SHA-256, algorithm version, availability status and detected events. The delivered maneuver algorithm version is `6`. An artifact is generated lazily on an authorized read and regenerated if missing, malformed, from another version or tied to a different canonical-track hash. Strict validation prevents a stale or partial artifact from being served as current. A current **unavailable** artifact is a valid result for insufficient required telemetry.
- Original and temporary Session access use capability-scoped, read-only maneuver endpoints for visible member Activities. A caller cannot obtain another Activity's analytics by knowing its ID. [Access and Consent](access-and-consent.md) owns token validity, lifetime and ACTIVE-only authorization; [Session Viewer](session-viewer.md) owns event filtering, selection and presentation.

### Analytical boundary

- The current contract does not include automatic tack/gybe classification, reduced-evidence HIGH/LOW detection, start or leg analysis, tactical gained/lost, VMG, wind reconstruction, performance ranking, scoring, coaching or AI advice. Open research [#112](https://github.com/maxsail-project/tackbar/issues/112) and [#113](https://github.com/maxsail-project/tackbar/issues/113) do not alter the delivered HDG-required detector.

## Provenance and review

| Contract | Accepted source | Code and focused evidence |
| --- | --- | --- |
| Canonical telemetry, neutral semantics and provisional scope | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §§2–4 V7-EVT/MET/BASE/DATA; [v0.7 decisions](../v0.7-decisions.md) §§2–5; [AI Development Guidelines](../ai-development-guidelines.md) §§6, 10, 12 | `backend/app/analytics/maneuver_detector.py`, `circular_angles.py`; `backend/tests/test_maneuver_detector.py` |
| Event detection and boundaries | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §2 V7-EVT-01/02; [v0.7 decisions](../v0.7-decisions.md) §3 | `backend/app/analytics/maneuver_detector.py`; `backend/tests/test_maneuver_detector.py` |
| Maneuver measures and Loss | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §3 V7-MET-01–03; [v0.7 decisions](../v0.7-decisions.md) §4 | `backend/app/analytics/maneuver_metrics.py`; `backend/tests/test_maneuver_metrics.py` |
| Artifact currency and read-only API | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md) §3 V7-MET-04; [v0.7 decisions](../v0.7-decisions.md) §3 | `backend/app/services/maneuver_analytics.py`, `shared_session_reader.py`; `backend/app/storage/maneuver_analytics_storage.py`; `backend/tests/test_maneuver_analytics.py`, `test_session_api.py`, `test_temporary_session_shares.py` |

The detector's other numeric thresholds remain provisional implementation parameters; this draft does not promote them into independent product guarantees. Historical v0.4 statements that maneuver detection was deferred describe that earlier release, not the current product.
