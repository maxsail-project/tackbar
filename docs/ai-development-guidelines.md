# AI Development Guidelines

This document defines the development principles for TackBar.

TackBar is currently a proof of concept. The priority is to validate the complete product workflow with real sailors before optimizing architecture, infrastructure, scalability, or feature depth.

These guidelines apply to backend, frontend, data processing, APIs, integrations, testing, and AI-assisted development.

---

## 1. Development philosophy

TackBar should evolve incrementally from validated use cases.

Prefer:

- simple solutions;
- explicit and readable code;
- small, well-understood dependencies;
- testable components;
- clear domain boundaries;
- incremental evolution;
- reversible technical decisions;
- implementations that can be validated with real sailing data;
- solutions appropriate for the current PoC scale.

Avoid:

- premature abstraction;
- speculative scalability work;
- framework-driven architecture without a demonstrated need;
- adding infrastructure before the product workflow requires it;
- introducing domain concepts that have not yet been validated;
- copying MaxSail architecture into TackBar.

The objective is not to design the final architecture in advance.

The objective is to preserve clean boundaries so that the implementation can evolve later without unnecessary rewrites.

---

## 2. Current product-validation focus

The initial TackBar PoC validated ingestion and Activity processing.

The current focus is validating the complete post-sailing collaborative workflow:

```text
sailing
→ track sharing
→ ingestion
→ Activity
→ Session
→ mobile Session Viewer
→ one/two-boat comparison
→ shared GPS time window
→ replay
→ basic visual metrics
→ collaborative debrief
```

The current priority is therefore not only ingestion.

Frontend and backend work should now be evaluated according to whether it helps validate this complete workflow.

The Session Viewer should remain intentionally simple.

TackBar is not intended to reproduce MaxSail Analytics.

---

## 3. Product model

The current core domain model is:

```text
Participant
    ↓
Activity
    ↓
Session
```

The current `Participant` representation is transitional and may contain both
person and default boat metadata. Domain evolution should preserve a clear
separation between the person-level Sailor identity and the Boat used for a
specific Activity. Email may remain an external ingestion identity without
becoming the permanent identity of every future domain concept.

For the Session Viewer:

```text
Session
    ↓
select one primary Activity
    ↓
optionally select one comparison Activity
    ↓
shared Analysis Window
    ↓
Map + comparison table + metric chart + replay
```

### Activity

An Activity represents one track received by TackBar.

An Activity may represent:

- a complete sailing outing;
- a complete sailing day;
- a race;
- a training block;
- a partial track exported by the source device/application.

Therefore:

```text
Activity != day
Activity != race
Activity != training segment
```

A Participant may have multiple Activities:

- on the same day;
- in the same Session;
- with overlapping or non-overlapping time ranges.

Do not automatically merge or split Activities unless a future requirement explicitly introduces that behavior.

### Session

A Session is the collaborative context that groups compatible Activities.

A Session is not assumed to represent:

- exactly one race;
- exactly one training block;
- exactly one Activity per Participant.

### Analysis Window

An Analysis Window is an ephemeral shared GPS/UTC time range used by the Session Viewer.

It does not:

- modify the Activity;
- cut the source track;
- create another Activity;
- generate a new normalized track;
- persist as domain data in the current PoC.

A future Saved Segment may persist a selected Analysis Window, but this is not part of the current implementation scope.

---

## 4. Reuse lessons, not architecture

TackBar may reuse validated domain knowledge and lessons from MaxSail projects.

Examples include:

- temporal track selection;
- circular-angle handling;
- dominant COG concepts;
- segment metadata ideas;
- GPS-derived calculations;
- sailing-specific terminology.

However:

- do not copy MaxSail Streamlit architecture;
- do not reproduce MaxSail Analytics feature depth;
- do not assume MaxSail data structures are TackBar requirements;
- do not introduce MaxSail-specific derived metrics unless explicitly required.

TackBar should rethink each concept according to its own collaborative, mobile-first product workflow.

Reusable TackBar sailing-analysis logic should evolve as an independent Python
analytics/domain layer or library when demonstrated needs require it. This
direction does not imply that a mature standalone analytics library is already
delivered and does not expand the current release into advanced analytics.

---

## 5. Architecture principles

Keep responsibilities clearly separated.

The backend responsibility boundary includes:

- email/provider ingestion;
- attachment extraction;
- source parsing;
- domain normalization;
- Activity persistence;
- Session matching;
- track storage;
- domain services;
- read API layer.

External providers must remain adapters.

Examples:

- Gmail;
- future Garmin integration;
- future Vakaros integrations;
- other input channels.

Provider-specific behavior must not define the TackBar domain model.

The normalized TackBar track is the operational provider-independent representation used by the application.

---

## 6. Frontend architecture principles

The frontend is a mobile-first Session Viewer.

Prefer:

- React components with clear responsibilities;
- local state while the state model remains small;
- backend APIs as the boundary to domain/storage data;
- simple responsive CSS;
- small, replaceable libraries;
- browser-native capabilities where practical.

The frontend must not:

- read backend JSON persistence directly;
- read CSV.GZ track files directly;
- depend on filesystem layout;
- depend on Gmail or source-provider structures;
- duplicate backend domain rules unnecessarily.

The frontend should consume a stable API contract.

Storage implementation must remain hidden from the frontend.

The backend owns persistence access, domain resolution and canonical track
loading. The frontend may own ephemeral Viewer interaction and presentation
state such as Activity selection, Analysis Window, filtered samples,
`playbackTime`, replay, map/chart presentation and calculations derived from
the normalized samples it receives.

Do not duplicate the same interaction or metric calculation in both layers.
Moving existing tested presentation logic between frontend and backend
requires an explicit, demonstrated product, correctness or performance reason.

This allows later migration from JSON/filesystem storage to other persistence mechanisms without redesigning the UI.

---

## 7. Current frontend PoC technology direction

For the current PoC, prefer:

- React;
- TypeScript;
- Vite;
- React Router;
- MapLibre for the interactive map;
- a replaceable zero-cost/no-key map style/service for development;
- Recharts for simple metric charts;
- native `fetch`;
- local React state;
- plain responsive CSS.

Avoid introducing additional frontend frameworks unless a concrete problem requires them.

Do not introduce yet:

- Next.js;
- Redux;
- Zustand;
- MobX;
- TanStack Query;
- Axios;
- Tailwind;
- Bootstrap;
- Material UI;
- Chakra;
- large design systems;
- complex client-side caching architecture.

These choices are PoC defaults, not permanent architectural commitments.

---

## 8. Map and replay principles

The map is the primary visual element of the Session Viewer.

Replay is a core PoC requirement.

The replay model must use one virtual GPS clock:

```text
playbackTime
```

Playback speeds must support:

- x1;
- x2;
- x5;
- x10.

Semantics:

- x1 = 1 GPS second per real second;
- x2 = 2 GPS seconds per real second;
- x5 = 5 GPS seconds per real second;
- x10 = 10 GPS seconds per real second.

When two Activities are compared:

- both boats use the same `playbackTime`;
- do not create one independent clock per Activity;
- device sampling frequency must not determine replay speed.

Visual interpolation between surrounding samples is acceptable for smooth map animation.

Interpolation used for rendering must not create or persist new track data.

---

## 9. Time principles

Normalized GPS/UTC time is the canonical temporal reference for the Session Viewer.

Do not use:

- email receive time;
- ingestion time;
- local file timestamps;
- processing timestamps

for track comparison.

For one Activity:

```text
available window = Activity start → Activity end
```

For two Activities:

```text
available comparison start = max(Activity A start, Activity B start)
available comparison end   = min(Activity A end, Activity B end)
```

The initial two-boat comparison window should be their GPS-time intersection.

If there is no overlap, do not invent a comparable time interval.

---

## 10. Sailing angle rules

COG and HDG are circular angles.

Any code involving angular difference, grouping, comparison, averaging, thresholds, or dominant direction must respect circular geometry.

For absolute angular difference:

```text
angular_diff = min(abs(a - b), 360 - abs(a - b))
```

Examples:

```text
359° vs 001° → 2°
355° vs 005° → 10°
090° vs 100° → 10°
000° vs 180° → 180°
```

Never treat:

```text
359° and 001°
```

as directions separated by 358°.

Never use a simple arithmetic mean for circular headings.

For example:

```text
mean(359°, 001°) = 180°
```

is incorrect.

Dominant COG calculations must also handle bins that cross 0°/360° correctly.

This is a validated lesson from previous MaxSail work and should be protected with automated tests whenever angular utilities are implemented.

---

## 11. Current normalized track model

All supported input formats should eventually produce the same operational normalized track representation.

Current canonical columns are:

```text
activity_id
utc
lat
lon
cog
sog
dist
hdg
heel
trim
```

General rules:

- `activity_id` identifies the Activity;
- `utc` is canonical GPS/UTC time;
- `lat` and `lon` are geographic position;
- `cog` and `sog` may come directly from the source;
- `dist` is basic distance between consecutive normalized samples;
- `hdg`, `heel`, and `trim` may be unavailable depending on source.

Do not invent missing sensor values.

Do not derive HDG from COG.

Do not introduce additional canonical fields without an explicit requirement.

---

## 12. Metrics scope

Current Session Viewer comparison is deliberately basic.

Initial summary concepts are:

- Distance;
- Average SOG;
- Dominant COG;
- Average HEEL;
- Average TRIM.

Currently delivered graphical selectable metrics are:

- SOG;
- COG;

HEEL and TRIM remain basic metric candidates for later Viewer work when their
normalized values are available. Missing values must remain unavailable rather
than invented.

The same selected metric is shown for both Activities.

Do not implement advanced MaxSail Analytics features unless explicitly requested.

Examples currently out of scope:

- TWA;
- VMG;
- SOGS smoothing;
- maneuver detection;
- COG roses;
- histograms;
- efficiency metrics;
- rankings;
- automated race analysis.

---

## 13. PoC infrastructure and cost

The PoC should be developable and testable without paid infrastructure whenever reasonably possible.

Prefer:

- open-source libraries;
- zero-cost development services;
- no-key services where suitable;
- local development;
- replaceable external services.

Avoid introducing services that require:

- a paid plan;
- mandatory billing setup;
- proprietary infrastructure lock-in;
- unnecessary cloud resources;
- paid telemetry/analytics.

For mapping:

- prefer MapLibre as the map engine;
- keep map-style/tile-provider configuration isolated;
- a zero-cost/no-key provider may be used for the PoC;
- do not tightly couple TackBar application logic to that provider.

Free external services used in the PoC must be treated as replaceable conveniences, not permanent architectural dependencies.

---

## 14. Scalability philosophy

Do not build infrastructure for hypothetical scale.

Current expected PoC scale is small and collaborative.

Prefer simple persistence and synchronous workflows while they remain adequate.

Consider architectural migration only when demonstrated problems appear, such as:

- concurrent writes;
- multiple application workers;
- transactional integrity requirements;
- complex query requirements;
- storage corruption/locking;
- unacceptable latency;
- substantially larger real usage;
- operational complexity caused by the current persistence model.

Data volume alone is not sufficient reason to introduce complex infrastructure.

The current PoC persistence direction is JSON metadata plus filesystem track
and original files. Track-file volume alone is not a reason to introduce
SQLite.

Measure before migrating. Practical review signals include:

- an individual metadata JSON collection approaching approximately 10–20 MB;
- metadata scans or full-file rewrites becoming a meaningful part of measured
  request latency;
- persistence/query work contributing approximately 100–200 ms of measured
  latency;
- increasingly complex auxiliary indexes added solely to compensate for JSON
  lookup cost.

These values trigger profiling and reconsideration, not automatic migration.
A database becomes justified by demonstrated needs such as multiple concurrent
writers, multiple modifying workers, atomic multi-entity transactions,
referential integrity, materially complex relational queries, lost-update or
locking problems, repeated corruption/interrupted writes, unacceptable
measured latency, or operational complexity maintaining JSON consistency.

---

## 15. Testing

Use real sailing files as fixtures whenever possible.

Tests should prioritize domain behavior and regression protection.

Examples include:

- parser behavior;
- normalized-track structure;
- Activity identity/deduplication;
- Session matching;
- time-window filtering;
- circular-angle calculations;
- replay/time utilities;
- API contracts;
- missing sensor values.

Testing should validate behavior rather than implementation details whenever practical.

When a bug is found in real sailing data, prefer adding a regression test before or with the fix.

---

## 16. Source/provider independence

Initial and future sources may include:

- Vakaros CSV.GZ;
- Vakaros VKX;
- GPX;
- FIT;
- Garmin APIs;
- other future providers.

Provider-specific parsers should translate source data into TackBar's normalized/domain representation.

Session matching, viewer logic, metrics, and analytics should not need to know where the Activity originated.

---

## 17. Scope control

Do not introduce yet unless explicitly required:

- complex authentication;
- advanced authorization/permissions;
- Kubernetes;
- message brokers;
- microservices;
- AI product features;
- premature cloud architecture;
- database migration;
- Redis;
- distributed queues;
- multiple deployment services;
- advanced offline/PWA behavior;
- automatic race detection;
- automatic Activity splitting;
- automatic Activity merging;
- complex segment management.

When a simpler implementation satisfies the current requirement, prefer it.

---

## 18. Documentation discipline

Documentation changes must be intentional.

Different documents have different responsibilities:

### `AGENTS.md`

Operational instructions for AI coding agents.

Examples:

- files that must be read;
- repository safety rules;
- commit/push restrictions;
- documentation-change policy;
- mandatory development workflow.

### `docs/ai-development-guidelines.md`

Stable engineering and product-development principles.

This document explains **how TackBar should be developed**.

### Feature requirement documents

Feature-specific requirements explain **what the product should do**.

For example:

```text
docs/session-viewer-requirements.md
```

### `README.md`

Explains what TackBar is and how to understand/use the project.

### `ROADMAP.md`

Describes future planned product evolution.

### `CHANGELOG.md`

Records delivered release-level capabilities.

Do not update README, ROADMAP, CHANGELOG, release notes, or version numbers unless the task explicitly requires those documentation changes.

Implementation and release documentation are separate tasks.

---

## 19. AI-assisted development workflow

AI-generated code must remain reviewable by the human developer.

Prefer small implementation increments.

Typical workflow:

```text
requirements / decision
→ focused Codex prompt
→ inspect diff
→ run tests/build
→ manually validate
→ stage
→ commit
→ push
```

Coding agents must not commit or push unless explicitly instructed.

Prompts should clearly define:

- goal;
- scope;
- relevant requirements;
- explicit non-goals;
- tests/validation expected;
- documentation policy;
- Git restrictions.

Coding agents should inspect the existing implementation before introducing new abstractions.

---

## 20. Instruction hierarchy for coding agents

Repository AI work should follow this hierarchy:

1. `AGENTS.md`
2. `docs/ai-development-guidelines.md`
3. relevant feature requirements
4. explicit task prompt
5. existing implementation/tests

`AGENTS.md` should act as the mandatory entry point and tell agents which additional documents must be read.

The detailed engineering principles should not all be duplicated in every prompt.

The detailed feature requirements should not all be duplicated in `AGENTS.md`.

Prompts should reference the relevant repository documents and then describe only the task-specific goal and constraints.

If instructions conflict, the coding agent should stop and report the conflict instead of silently choosing an interpretation.

---

## 21. Guiding principle

The current TackBar development strategy is:

> Build the smallest coherent version that validates the real post-sailing workflow, preserve clean domain and API boundaries, learn from real sailors, and add complexity only when the product demonstrates that it is necessary.
