# TackBar v0.3 — Session Viewer Requirements

**Status:** Delivered v0.3.x Session Viewer baseline

**Revision:** 3 — Delivered semantics and v0.4 handoff

**Scope:** PoC / mobile-first collaborative sailing debrief

**Primary use case:** 5–10 sailors sharing tracks after sailing and comparing one or two boats quickly from a phone.

This document governs the delivered v0.3.x Session Viewer semantics. Current
v0.4 evolution is governed by
`docs/v0.4-collaborative-debrief-requirements.md`.

v0.4 preserves the validated functional semantics in this document unless it
explicitly overrides them. In particular, a v0.4 requirement may supersede a
historical architectural ownership decision while retaining the existing
Analysis Window, comparison, replay and circular-angle behavior.

---

## Delivered v0.4 override and delta

The following delivered v0.4 behavior supersedes current-facing v0.3 wording
without rewriting the historical v0.3.x baseline below:

- The persisted and API domain uses `Sailor`, separate `Boat`, and `Activity`.
  `Participant` is no longer an active runtime entity; it remains only in
  legacy migration and historical terminology.
- The selectable time-series metrics are SOG, COG, HEEL and TRIM. The v0.3.x
  HEEL/TRIM deferral remains a historical v0.3 statement only.
- The map presents shared GPS time and fixed instantaneous SOG, COG and HEEL
  telemetry. Historical selected-metric map wording no longer governs v0.4,
  and TRIM is not map telemetry.
- Replay is temporal-only: play/pause, scrubber, current `playbackTime`, and
  x1/x2/x5/x10 speed. It does not duplicate the selected chart metric.
- The delivered Summary rows are Distance, Avg SOG, Max SOG, Dominant COG,
  Avg HEEL +, Avg HEEL −, Avg TRIM + and Avg TRIM −.
- The frontend consumes persisted Sessions and canonical Activity tracks
  through the read-only FastAPI API; it has no runtime Session/track fixture
  fallback or direct storage access.

All Activities selected for comparison still share one absolute GPS/UTC
Analysis Window, one selected chart metric and one `playbackTime`. Existing
circular COG semantics remain unchanged.

---

## 1. Product need

After sailing, each sailor shares one or more tracks with TackBar. TackBar ingests them as Activities and groups compatible Activities into a Session.

A shared track may represent:

- a complete sailing outing;
- a complete day on the water;
- a race;
- a training block;
- a partial segment exported from the source device/application.

TackBar must not assume that one Activity corresponds to one race, one training session, or one full day.

Once ashore, sailors must be able to open a Session on a mobile device and answer simple debrief questions quickly:

- Where did each boat sail?
- Which boat travelled more or less distance in a selected period?
- Which boat was faster in that period?
- Were they sailing approximately the same COG?
- How did HEEL or TRIM differ?
- What was happening at a specific GPS time?

TackBar is **not** intended to reproduce MaxSail Analytics. The v0.3 viewer prioritizes fast visual comparison over advanced analytics.

---

## 2. Core domain model for the viewer

The v0.3 Session Viewer uses the following conceptual hierarchy:

```text
SESSION
   ├── ACTIVITY A
   ├── ACTIVITY B
   ├── ACTIVITY C
   └── ...

Select 1 Activity
        +
optional second Activity
        ↓
SHARED ANALYSIS WINDOW
        ↓
MAP + SUMMARY TABLE + METRIC CHART + REPLAY
```

### DM-01 — Session

A Session is the collaborative context that groups Activities considered compatible by TackBar.

A Session:

- has a stable technical identifier;
- contains one or more Activities;
- may contain Activities from different Participants;
- may contain multiple Activities from the same Participant;
- is not assumed to represent one race;
- is not assumed to represent one training block;
- is not assumed to represent exactly one day.

Session detection/matching remains based on the existing TackBar Session logic. The Session Viewer does not redefine matching behavior.

### DM-02 — Activity

An Activity represents **one track received by TackBar**.

An Activity may be:

- a complete sailing outing;
- a full-day export;
- a race-only export;
- a training-only export;
- any partial segment exported by the source application.

Therefore:

```text
Activity != day
Activity != race
Activity != training segment
```

An Activity may happen to correspond to any of those, but TackBar must not infer that semantic meaning from the Activity itself.

A Participant may have multiple Activities:

- on the same day;
- in the same Session;
- with overlapping or non-overlapping time ranges.

For v0.3, TackBar must **not automatically merge or split Activities**.

### DM-03 — Analysis Window

An Analysis Window is an ephemeral temporal selection used to inspect part of one or two selected Activities.

It is defined by:

- `window_start`
- `window_end`

using normalized GPS/UTC time.

The Analysis Window:

- does not modify the Activity;
- does not modify the normalized track;
- does not create a new Activity;
- does not create a new CSV.GZ;
- is not persisted in v0.3;
- drives all viewer calculations and visualizations.

This allows a full-day Activity to be used without preprocessing. The user can exclude, for example:

- departure from port;
- transit to the race area;
- waiting time;
- time between races;
- return to port.

No automatic semantic segmentation is required in v0.3.

### DM-04 — Future Saved Segment

A future version may allow an Analysis Window to be saved as a named segment.

Conceptually:

```text
Analysis Window
      ↓ Save
Saved Segment
```

A Saved Segment may eventually contain:

- start time;
- end time;
- name;
- optional type;
- optional notes;
- references to its Session/Activity context.

This concept is inspired by the already validated `TRAMOS` idea from MaxSail metadata, but **Saved Segments are explicitly out of scope for v0.3**.

---

## 3. Session and Activity selection

### FR-01 — Recent Sessions

The initial PoC navigation should present recent Sessions.

A Session entry should expose enough derived context to identify it quickly, for example:

- date/time;
- provisional place/area label when available;
- number of Activities;
- number of Participants when useful.

A Session is opened using its stable Session identifier.

### FR-02 — Primary Activity

A Session Viewer always has one primary Activity selected.

If the Session contains only one Activity, it may be selected automatically.

If several Activities are available, the user selects one.

The UI must identify Activities using human-readable context such as:

- participant name;
- boat name;
- sail number;
- Activity start/end time.

This is especially important when one Participant has several Activities in the same Session.

Example:

```text
Maxi · Zafar
  11:10–11:45

Maxi · Zafar
  12:05–12:37

Juan · ESP-...
  11:08–11:47
```

The selectable technical identity is always `activity_id`.

### FR-03 — Optional comparison Activity

The user may select one additional Activity from the same Session.

For the v0.3 PoC:

- minimum: 1 selected Activity;
- maximum: 2 selected Activities.

More than two simultaneous tracks are outside scope.

The comparison Activity must remain independently identifiable by `activity_id`, even if it belongs to the same Participant as the primary Activity.

### FR-04 — No Activity-detail navigation layer

Selecting an Activity must not open a separate Activity-detail product flow.

The Session Viewer remains the working screen.

The intended model is:

```text
Sessions
   ↓
Session Viewer
   ↓
Primary Activity
   +
Optional comparison Activity
```

Changing Activity updates the same viewer.

### FR-05 — Optional local preference convenience

For the PoC, the frontend may remember a preferred Participant on the local device to reduce repeated selection.

This is a convenience only:

- it is not authentication;
- it must not change domain identity;
- Activity remains the selected unit;
- if several Activities exist for the preferred Participant, the user must still be able to choose the intended Activity.

This behavior may be deferred during the first frontend increment.

---

## 4. Shared GPS time window

### FR-06 — Shared window

All selected Activities use one common absolute temporal window:

- `window_start`
- `window_end`

The canonical time basis is normalized track `utc`.

The same window drives:

- visible track segments on the map;
- comparison-table metrics;
- metric chart;
- replay/cursor availability.

Changing the window must update all of them consistently.

The replay cursor's `playbackTime` is constrained by the Analysis Window, but changing `playbackTime` alone must not change `window_start` or `window_end`.

### FR-07 — Default window with one Activity

With one selected Activity, the initial available window is the Activity time range:

```text
activity.start_time → activity.end_time
```

### FR-08 — Default comparable window with two Activities

With two selected Activities, the initial comparable window is their temporal intersection:

```text
start = max(A.start_time, B.start_time)
end   = min(A.end_time, B.end_time)
```

This avoids presenting metrics as directly comparable when the two Activities do not cover the same interval.

If the Activities have no temporal overlap, the UI must not silently create a comparison window. It should indicate that the selected Activities do not overlap in GPS time.

### FR-09 — User-adjustable window

The user can reduce the common window to focus on the period of interest.

Typical use cases include isolating:

- one race;
- one leg;
- a training exercise;
- the period between two maneuvers;
- any manually identified relevant interval.

The viewer performs virtual filtering only. It does not cut or persist a new track.

### FR-10 — Window validity

Require:

```text
window_start < window_end
```

With two Activities, the selected comparison window must remain inside their valid common overlap for v0.3.

---

## 5. Replay

### FR-11 — Shared replay cursor

The viewer has one common GPS-time cursor inside the selected window.

At a given cursor time, TackBar shows the corresponding position and selected metric value for each selected Activity.

For the PoC:

- nearest available sample lookup is sufficient;
- exact temporal interpolation is not required.

Automatic play/pause replay may be added after basic cursor interaction works and is not required for the first frontend increment.

---

## 6. Selected metric

### Metric selection

The Session Viewer metric model includes:

- SOG
- COG
- HEEL
- TRIM

For the current v0.3.x Session Viewer, the time-series/replay metric selector
MUST enable:

- SOG
- COG

HEEL and TRIM remain part of the metric model and summary metrics, but their
time-series charts and replay metric presentation are deferred.

Disabled/deferred metrics MUST NOT appear as if they were currently supported
for chart/replay selection.

Future releases MAY enable HEEL and TRIM without changing the shared temporal
model.

### FR-12 — One selected metric

The user selects one metric at a time.

Delivered v0.3.x selectable time-series/replay metrics:

- `sog`
- `cog`

HEEL and TRIM remain supported in the summary metric model but are not enabled
for time-series/replay selection in the delivered v0.3.x Viewer. They are
planned as later basic Viewer work when source values are available.

`hdg` remains available in normalized data and may be added later if useful, but is not required in the first Session Viewer increment.

The same selected metric applies to both boats.

TackBar must not compare different metrics against each other.

Examples:

```text
SOG vs SOG
COG vs COG
```

Not:

```text
SOG vs HEEL
```

---

## 7. Main viewer components

### FR-13 — Map

The map is the primary visual context.

It must show:

- the selected portion of the primary Activity;
- the selected portion of the comparison Activity when present;
- a distinguishable visual identity for each boat;
- the current replay position for each boat when the replay cursor is active.

The currently selected metric must also be visible in the map context.

Minimum PoC behavior:

- show the selected metric value for each boat at the replay cursor.

Possible later enhancement:

- color the track using the selected metric value.

Metric-based track coloring is not mandatory for the first implementation.

### FR-14 — Comparison table

The viewer must show a compact comparison table for the current Analysis Window.

Initial rows:

- Distance
- Average SOG
- Dominant COG
- Average HEEL
- Average TRIM

Columns:

- primary Activity/boat;
- comparison Activity/boat when selected.

Missing values must be displayed as unavailable (`—`) rather than invented or derived from unrelated data.

### FR-15 — Metric chart

The viewer must show one time-series chart for the currently selected metric.

With one Activity selected:

- one series.

With two Activities selected:

- the same metric for both Activities on the same GPS-time axis.

The chart uses the same Analysis Window as the map and comparison table.

### FR-16 — Metric selector

The delivered selector presents the complete basic metric model while clearly
distinguishing enabled and deferred choices:

```text
SOG | COG | HEEL (deferred) | TRIM (deferred)
```

SOG and COG are enabled in v0.3.x. Changing the enabled metric updates:

- the time-series chart;
- the selected metric value in the map/replay context.

The comparison table remains visible and summarizes all supported metrics for the current window.

---

## 8. Metric definitions

All metrics are calculated only from samples inside the current shared GPS-time Analysis Window.

### MR-01 — Distance

Source field:

- normalized `dist`, stored in metres between consecutive samples.

Window behavior:

- the first included sample contributes `0` distance because its persisted `dist` may refer to a point before `window_start`;
- subsequent included samples contribute their persisted `dist`.

Display unit:

- nautical miles (`nm`).

No interpolation at exact window boundaries is required for the PoC.

### MR-02 — Average SOG

Display unit:

- knots (`kt`).

The result must represent average speed over the selected time window without becoming dependent on device sampling frequency.

Preferred PoC definition:

- distance travelled divided by elapsed time for the selected interval when enough valid points are available.

Do not introduce MaxSail `SOGS` smoothing into the Session Viewer.

### MR-03 — Dominant COG

Display unit:

- degrees (`°`).

Dominant COG represents the most repeated sailing direction in the selected time window.

Initial approach:

- use circular COG bins of approximately 10°;
- choose the most frequent circular bin;
- display its representative/central angle.

COG is circular data.

A bin around north must wrap correctly across 0°/360°.

Conceptual example:

```text
355° ... 005°
```

may belong to one north-oriented bin.

### MR-04 — Angular difference

Any comparison, threshold, grouping or future calculation involving COG/HDG differences must use circular angular distance.

For angles `a` and `b`, absolute angular difference must be equivalent to:

```text
min(abs(a - b), 360 - abs(a - b))
```

Examples:

- `359°` vs `001°` → `2°`
- `355°` vs `005°` → `10°`
- `090°` vs `100°` → `10°`
- `000°` vs `180°` → `180°`

If signed angular difference is needed later, normalize it to `[-180°, +180°]`.

### MR-05 — No arithmetic mean for COG

Do not use a simple arithmetic mean for COG.

Example:

```text
359° and 001°
```

Arithmetic mean:

```text
180°
```

This is incorrect for sailing direction.

Circular interpretation is approximately:

```text
000°
```

This is a specific lesson carried forward from MaxSail Analytics and must be protected by automated tests.

### MR-06 — Average HEEL

Display unit:

- degrees (`°`).

Use available normalized `heel` values inside the selected window.

Because sources may have different sample frequencies, calculations should avoid unnecessary dependence on sample count. A time-weighted mean is preferred when practical.

If no HEEL data exists:

- return unavailable/null;
- do not derive HEEL from other fields.

### MR-07 — Average TRIM

Display unit:

- degrees (`°`).

Use available normalized `trim` values inside the selected window.

A time-weighted mean is preferred when practical.

If no TRIM data exists:

- return unavailable/null;
- do not derive TRIM from other fields.

---

## 9. Time rules

### TR-01 — Canonical time

Normalized track `utc` is the canonical comparison axis.

Do not use:

- email receive time;
- ingestion processing time;
- file modification time.

### TR-02 — Common absolute time

The same absolute `window_start` and `window_end` apply to both selected Activities.

### TR-03 — Partial source exports

An Activity may cover only part of the Session.

This is valid and must not be treated as incomplete or erroneous merely because another Activity covers a wider interval.

### TR-04 — No invented data

The backend/frontend must never invent:

- positions;
- sensor values;
- time samples.

If required data is unavailable, return/display unavailable values.

---

## 10. Data-source behavior

The Session Viewer consumes normalized TackBar tracks only.

It must not depend on:

- Gmail;
- Vakaros source-file structure;
- archived originals;
- provider-specific APIs.

Current canonical track columns relevant to the viewer:

- `activity_id`
- `utc`
- `lat`
- `lon`
- `cog`
- `sog`
- `dist`
- `hdg`
- `heel`
- `trim`

The viewer/backend must tolerate null values in source-dependent sensor fields.

---

## 11. Session and participant context

For each Activity, the viewer should resolve available context such as:

- participant name;
- boat name;
- sailing class;
- sail number;
- Activity start time;
- Activity end time.

These values are resolved through the existing domain model and must not be duplicated into normalized track files.

For Participants whose metadata is null, use the participant identifier/email as a fallback in the PoC UI rather than inventing names.

When a Participant has multiple Activities in one Session, start/end time is part of the UI identity needed to distinguish them.

---

## 12. PoC navigation flow

Target flow:

1. Sailor returns from sailing.
2. Sailor shares one or more Vakaros exports, full or partial.
3. TackBar ingests each received track as an independent Activity.
4. Activities are assigned to a Session using existing matching logic.
5. User opens TackBar on a phone.
6. User opens a recent Session.
7. User selects a primary Activity.
8. Map shows that Activity.
9. User optionally selects one second Activity.
10. TackBar establishes the common GPS-time overlap.
11. User adjusts the shared Analysis Window.
12. Map and comparison table update to that window.
13. User selects one currently enabled metric (`SOG` or `COG`).
14. Chart shows that same metric for one or two Activities.
15. User moves the common replay cursor to inspect both boats at the same GPS time.

The same flow works whether an Activity is:

- already a partial race/training export; or
- a complete day containing port transit, waiting periods and several races.

---

## 13. API and architecture constraints

These requirements are intentionally implementation-neutral, but the following boundaries must be preserved.

### AR-01

Frontend must not read `activities.json`, `sessions.json` or CSV.GZ files directly.

### AR-02

Frontend must consume a backend API.

This boundary was not delivered in v0.3.x: the Viewer was validated with
public frontend fixtures and the read API was deferred. It was delivered in
v0.4 under the current v0.4 requirements.

### AR-03

Backend is responsible for:

- resolving Session → Activities → Participants;
- loading normalized tracks;
- applying the requested shared time window;
- calculating comparison-table metrics;
- returning chart/map sample data.

**v0.4 ownership note:** this was the original v0.3 architectural direction,
not the ownership used by the delivered fixture-based Viewer. For current v0.4
work, `docs/v0.4-collaborative-debrief-requirements.md` supersedes the
calculation/filtering portion of AR-03: the backend owns persistence, domain
resolution and canonical normalized-track loading, while the frontend retains
its tested ephemeral Analysis Window, filtering, summary, replay and
presentation calculations. The same logic must not be duplicated in both
layers.

### AR-04

Storage implementation must remain hidden behind backend code so JSON/filesystem can later be replaced without redesigning the frontend contract.

### AR-05

Viewer endpoints were intended to be read-only for the v0.3 PoC. They were not
delivered in v0.3.x; v0.4 delivered them while preserving the read-only
constraint.

### AR-06

The backend must treat `activity_id` as the selected track identity.

Participant identity alone is insufficient because one Participant may have multiple Activities in the same Session.

---

## 14. Mobile-first requirements

### UX-01

Primary target: a mobile phone used immediately after sailing.

### UX-02

The map is the main visual element.

### UX-03

Avoid dense analytical dashboards.

The user should reach a useful one- or two-boat view with a small number of taps.

### UX-04

The comparison table must remain compact enough for phone width.

### UX-05

Missing sensor values must not break the viewer.

### UX-06

When one Participant has multiple Activities, the UI must make them distinguishable without exposing UUIDs as the primary label.

---

## 15. Explicitly out of scope for v0.3

- more than two simultaneous Activities;
- automatic Activity merging;
- automatic Activity splitting;
- automatic race detection;
- automatic training-segment detection;
- automatic removal of port/transit/waiting periods;
- GPX/track cutting;
- persisted Saved Segments;
- `TRAMOS`/metadata editing;
- TWA;
- VMG;
- SOGS/smoothing;
- maneuver detection;
- COG rose;
- histograms;
- performance rankings;
- advanced MaxSail Analytics metrics;
- automatic wind estimation;
- manual Session editing;
- authentication/authorization redesign;
- database migration;
- local-time/timezone conversion;
- exact interpolation at time-window boundaries;
- advanced map coloring unless needed after the basic viewer works.

---

## 16. Delivered refinements and future concepts preserved

This section records both later concepts that the design should not block and
interaction refinements that became part of the delivered v0.3.x baseline.
Each item states its own status.

### FC-01 — Saved Segment

Persist a selected Analysis Window without duplicating or cutting the underlying Activity track.

### FC-02 — Segment metadata

A Saved Segment may later gain:

- name;
- type;
- notes.

### FC-03 — Rich Session metadata

Future versions may reuse ideas already explored in MaxSail metadata, such as:

- wind conditions;
- marks;
- notes;
- race/training context.

These are domain ideas only. TackBar must not inherit MaxSail implementation or file structure.

### FC-04 — Smarter segmentation

Future versions may help identify or discard:

- port departure;
- transit to course;
- waiting periods;
- time between races;
- return to port.

No such automatic behavior is required now.

### FC-05 — Delivered v0.4 Sailor/Boat domain evolution

The v0.3.x implementation used `Participant` as a transitional concept and
stored person and boat/default metadata together. TackBar did not assume:

```text
Participant == Boat
email == Boat
```

v0.4 completed that evolution. `Sailor` now has a stable internal identity,
`Boat` is separate, and each Activity requires a Sailor and may reference a
Boat. `Participant` remains only as legacy migration/history terminology. The
delivered details are governed by
`docs/v0.4-collaborative-debrief-requirements.md`.

### FC-06 — Session Timeline and Replay interaction

The Session Viewer MUST separate:

1. Analysis Window selection
2. Replay playback control

The Analysis Window MUST use one shared dual-handle control representing:

- windowStart
- windowEnd

This control defines the temporal subset used by:

- map geometry
- summary metrics
- charts
- comparison

Replay MUST use a separate single-handle control located directly below the map.

This replay control represents `playbackTime` and MUST operate only within the
currently selected Analysis Window.

Invariants:

- availableRange.start <= windowStart < windowEnd <= availableRange.end
- windowStart <= playbackTime <= windowEnd

Changing the Analysis Window MUST:

- pause replay;
- preserve playbackTime if still inside the new interval;
- otherwise clamp playbackTime to the nearest boundary.

Changing playbackTime MUST NOT modify the Analysis Window.

### FC-07 — Future Analysis Window responsiveness

For long Activities, adjusting the Analysis Window should feel responsive without changing its absolute GPS/UTC semantics.

While the user is actively dragging a boundary, the viewer should avoid unnecessarily applying expensive map and chart recomputation on every pointer event. A simple future approach may:

- display exact start/end values while interaction is in progress;
- commit the final Analysis Window when the interaction completes; or
- use a small debounce or throttle if immediate intermediate updates are useful.

After the window is committed, the map, replay, metric chart and future summary metrics must remain synchronized to that same Analysis Window.

This direction does not require or mandate downsampling, Web Workers, caching infrastructure or other premature performance mechanisms.

### FC-08 — Future Dominant COG refinement

The current governing behavior remains circular bins of approximately 10°, selecting the most frequent bin, with no SOG threshold. This behavior is accepted for TackBar v0.3, does not block it, and remains in force until a future decision is made.

As a non-priority backlog refinement, evaluate with several real Activities and Analysis Windows:

- whether samples with zero or very low SOG should be excluded because COG while stationary or nearly stationary may be sensor noise or may not represent the direction actually sailed; no SOG threshold is defined yet;
- whether the circular bin width should remain approximately 10° or be reduced to approximately 5°, comparing directional resolution, stability of the dominant result, sensitivity to GPS/COG noise, and behavior across the evaluated Activities and Analysis Windows.

Any future bin width must preserve mandatory circular semantics around the 0°/360° boundary. Any change must be validated empirically with real sailing data before changing the current requirement.

This item is not currently prioritized and does not prescribe implementation architecture or ownership between the frontend and backend.

---

## 17. Acceptance criteria

### AC-01

A recent Session can be opened from the mobile PoC.

### AC-02

A Session with one Activity can display that Activity on the map.

### AC-03

If a Participant has multiple Activities in the Session, they can be distinguished and selected independently.

### AC-04

A second Activity from the same Session can be selected and both tracks displayed simultaneously.

### AC-05

With two Activities, the default comparison interval is their GPS-time intersection.

### AC-06

Changing the shared Analysis Window updates both visible tracks.

### AC-07

The comparison table shows Distance, Average SOG, Dominant COG, Average HEEL and Average TRIM for the same selected window.

### AC-08

Changing the selected metric changes the chart for both boats to that same metric.

### AC-09

The replay cursor represents one common GPS time and exposes the selected metric for both boats at that time when data is available.

### AC-10

COG handling passes circular-boundary tests including `359°` vs `001°`.

### AC-11

Dominant COG around north is calculated without artificial separation at 0°/360°.

### AC-12

Activities without HEEL or TRIM remain usable and display unavailable values for those metrics.

### AC-13

A full-day Activity can be narrowed interactively using the Analysis Window without modifying or generating a new track.

### AC-14

A partial Vakaros export is accepted as a normal Activity and is not treated as semantically different from a full export.

### AC-15

The viewer operates from normalized TackBar tracks and existing domain metadata only; it does not require Gmail or original source files.

---

## 18. Historical v0.3 implementation sequence

This was the recommended sequence recorded during v0.3 planning. It was not
completed in this exact order: the Viewer was delivered with frontend fixtures
while the read API was deferred. The sequence is retained as historical
baseline context and does not govern v0.4 implementation order.

1. Define/read the Session Viewer backend read contract.
2. Expose Session list and Session detail with Activity/Participant context.
3. Add normalized-track retrieval and shared time-window filtering.
4. Add basic comparison metrics and circular-angle utilities/tests.
5. Verify the API against real current Session data.
6. Start the mobile-first frontend PoC.
7. Implement recent Sessions screen.
8. Implement Session Viewer with primary Activity selection.
9. Add optional second Activity selection.
10. Add map with one/two track rendering.
11. Add shared temporal-window control.
12. Add compact comparison table.
13. Add metric selector and one shared metric chart.
14. Add shared replay cursor.
15. Validate the complete bar-side workflow with real sailors before adding advanced analytics.

---

## 19. Guiding product rule

The Session Viewer should preserve this mental model:

> **Session organizes what was shared. Activity represents what was received. Analysis Window defines what the sailors are discussing right now.**

The v0.3 PoC should remain deliberately simple while keeping this separation clean enough for later features such as Saved Segments, richer metadata and more mature collaborative debrief workflows.

---

## Data Privacy and future v0.5 Real Sailing Pilot access

### Public repository and private runtime data

**DP-01 — Public repository data**

The TackBar source repository is public.

The public repository MUST contain only:

- source code;
- documentation;
- tests;
- synthetic, fictional or sanitized demo fixtures.

Real participant data MUST NOT be committed to the public repository.

Real participant data includes, at minimum:

- names;
- email addresses;
- boat names;
- sail numbers;
- provider message identifiers;
- original attachment metadata when identifiable;
- real Activity tracks;
- real GPS positions;
- real sailing timestamps.

---

**DP-02 — Demo fixtures**

Public test and frontend fixtures MUST use fictional participant identities and
sanitized or synthetic sailing data.

Demo fixtures MAY preserve realistic sailing characteristics such as:

- track shape;
- sampling frequency;
- SOG behaviour;
- COG behaviour;
- heading;
- heel;
- trim;
- comparison and replay characteristics.

They MUST NOT expose identifiable participant or navigation data.

---

**DP-03 — Private runtime storage**

Real TackBar runtime data MUST be stored outside the source repository.

The backend MUST obtain the private runtime storage location through
configuration rather than assuming that runtime data belongs to the repository.

For the PoC, a configurable local directory such as `TACKBAR_DATA_DIR`
is sufficient.

The persistence implementation MAY initially remain JSON/file based.

Migration to SQLite or another database is a separate architectural decision.

---

**DP-04 — Repository independence**

The source repository MUST be capable of being cloned, tested and demonstrated
without access to private TackBar runtime data.

Public demo fixtures MUST provide the data required for automated tests and
frontend demonstration.

---

### Future v0.5 Real Sailing Pilot requirements

PA-01 through PA-07 are preserved as governing requirements for the v0.5 Real
Sailing Pilot / pilot-access chapter. They are not v0.4 requirements or v0.4
exit criteria. Their historical `Participant` access terminology must be
reconciled with the delivered Sailor runtime model in the focused v0.5 design;
it does not reinstate Participant as a v0.4 runtime entity.

v0.4 does not require public registration, authentication, an authorization
platform, invite-management UI or privacy-acceptance workflow. Private runtime
data must still remain outside Git and use `TACKBAR_DATA_DIR`.

**PA-01 — Invite-only pilot**

The initial TackBar pilot is closed and invitation-only.

Participants MUST be explicitly registered before TackBar processes their
sailing Activities.

There is no public self-registration requirement for the initial pilot.

---

**PA-02 — Participant states**

A Participant MUST have an explicit registration state.

Initial states:

- `invited`
- `active`
- `revoked`

Only `active` Participants are authorized for Activity ingestion.

---

**PA-03 — Email identity**

For the initial pilot, the normalized participant email is the external
identity used by email ingestion.

Normalization:

`strip().lower()`

An incoming sender email MUST match an `active` Participant before its
attachment is processed.

---

**PA-04 — Unknown or inactive sender**

When an email is received from a sender that is not an active Participant:

- the sailing attachment MUST NOT be parsed;
- no Activity MUST be created;
- no Session MUST be created;
- the attachment MUST NOT be persisted as participant runtime data.

A minimal technical rejection/audit event MAY be recorded when needed.

---

### Invitation and acceptance

**PA-05 — Invitation**

A participant enters the pilot through an invitation initiated by TackBar
administration.

The initial PoC MAY implement invitation/activation manually without requiring
a complete user-management UI.

---

**PA-06 — Explicit acceptance**

Before becoming `active`, an invited Participant MUST explicitly accept the
current pilot privacy/data-use notice.

The system MUST be able to associate the acceptance with:

- Participant;
- notice/version accepted;
- acceptance timestamp.

Minimum conceptual data:

- `privacy_notice_version`
- `accepted_at`

---

**PA-07 — Activation**

The participant lifecycle is:

`invited → explicit acceptance → active`

Only after activation may TackBar process Activities associated with that
participant email.

A revoked Participant MUST no longer be allowed to ingest new Activities.

---

### Pilot data boundary

**DP-05 — Private pilot data**

Real pilot information is private TackBar runtime data.

This includes:

`Participant → Activity → Track → Session`

and provider ingestion metadata associated with those entities.

Such information MUST remain in private runtime storage and outside the public
Git repository.

---

**DP-06 — Storage evolution**

Private persistence is intentionally implementation-independent.

PoC:

`JSON + files`

Possible next step:

`SQLite + files`

This is a conditional possibility, not a planned default. The v0.4 persistence
policy requires measured database behavior needs before migration; JSON/files
remain the governing PoC strategy.

Later deployments MAY use another private database/object storage solution.

Encryption at rest, cloud persistence and advanced identity management are
future deployment/security decisions and are not required merely to remove
runtime data from Git.
