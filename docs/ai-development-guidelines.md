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

Keep Sailor, Boat, Activity and Session as distinct concepts; do not infer new domain relationships from a provider, filename, visual control or legacy terminology. Treat an Analysis Window as Viewer interaction state, not a persisted Activity or Session. The current product contract and provenance are in [Domain and Sessions](current/domain-and-sessions.md); Viewer selection is in [Session Viewer](current/session-viewer.md).

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
delivered and does not by itself authorize advanced analytics. The focused
current analytics contract is in [Analytics](current/analytics.md).

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

- OVH mailbox acquisition;
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
- depend on mailbox-provider or source-provider structures;
- duplicate backend domain rules unnecessarily.

The frontend should consume a stable API contract.

Storage implementation must remain hidden from the frontend.

The backend owns persistence access, domain resolution and canonical track
loading. The frontend may own ephemeral Viewer interaction and presentation
state such as Activity selection, Analysis Window, filtered samples,
`playbackTime`, replay, map/chart presentation and calculations derived from
the normalized samples it receives.

Do not duplicate the same interaction or metric calculation in both layers.
Moving existing tested presentation logic between frontend and backend requires an explicit, demonstrated product, correctness or performance reason.

This allows later migration from JSON/filesystem storage to other persistence mechanisms without redesigning the UI.

Rendering optimizations such as visual sampling or downsampling must remain
presentation-only. Analytical calculations over an Analysis Window must use
the complete valid normalized sample set for that window unless a future
requirement explicitly defines a different analytical method.

---

## 7. Current frontend PoC technology direction

For the current PoC, prefer:

- React;
- TypeScript;
- Vite;
- React Router;
- MapLibre for the interactive map;
- a replaceable zero-cost/no-key map style/service for development;
- native SVG for the current Session Viewer signal, distribution and
  Individual Analysis charts;
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

The map gives spatial context; replay controls shared GPS time. Keep map telemetry independent from the selected analytical chart view. Use one virtual `playbackTime` for selected Activities, and do not make device sampling frequency determine replay speed. Presentation interpolation may smooth movement but must not create or persist telemetry. [Session Viewer](current/session-viewer.md) owns detailed map, replay-speed and interaction contracts.

---

## 9. Time principles

Use normalized GPS/UTC time for sailing comparison and analysis. Email receive time, ingestion time, local file timestamps and processing timestamps are not substitutes for sailing time. A comparison must not invent overlap where the selected Activities have none. The exact Analysis Window contract belongs in [Session Viewer](current/session-viewer.md).

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

All supported formats normalize into the same provider-independent operational track representation. The current canonical columns, in order, are:

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
quat_w
quat_x
quat_y
quat_z
```

The first ten columns are the earlier schema; the four `quat_*` columns were added by [completed Issue #33](https://github.com/maxsail-project/tackbar/issues/33) to preserve available orientation quaternions. Historical ten-column tracks remain readable with absent quaternion values represented as null. `utc`, `lat` and `lon` are required sample inputs; optional telemetry remains unavailable when absent. `dist` is the normalized distance increment. Do not invent missing sensor values, derive HDG from COG or add canonical columns without an explicit approved requirement. [Ingestion and Data](current/ingestion-and-data.md) owns detailed normalization and persistence behavior.

---

## 12. Metrics scope

Keep analysis bounded to the collaborative debrief. Calculations must use the complete valid canonical sample population for their defined time range; visual sampling or smoothing is presentation-only. Respect circular COG/HDG geometry, missing telemetry and provisional evidence-driven maneuver semantics. Do not import advanced MaxSail Analytics, tactical conclusions, ranking, coaching or automatic tack/gybe labels without an explicitly approved contract. Detailed Summary, VS, chart and interaction rules belong in [Session Viewer](current/session-viewer.md); backend maneuver detection, metrics and artifacts belong in [Analytics](current/analytics.md).

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

Provider adapters translate source data into TackBar's normalized/domain representation. Session matching, Viewer behavior, metrics and analytics must not depend on the source provider. Support for a possible future format or integration is not established by mentioning it here; require an explicitly approved Issue and focused evidence. [Ingestion and Data](current/ingestion-and-data.md) owns the current supported formats and provider boundary.

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

Documentation edits must be intentional and within explicit task or Issue authority. `AGENTS.md` gives agent operating rules; this guide gives stable engineering principles. [The domain index](current/index.md) routes to the authoritative current functional specifications. Versioned requirements and decisions retain historical scope and rationale; they are read for a specific provenance or discrepancy question. `ROADMAP.md` gives direction, GitHub Issues hold pending work, `CHANGELOG.md` records delivered releases, and code/tests provide implementation evidence. Do not edit README, ROADMAP, CHANGELOG, release notes or version numbers without applicable authorization.

When a GitHub Issue explicitly debates and approves a functional-contract or documented-behavior change, the Codex implementation increment **MUST update together** necessary code, directly relevant regression tests and the affected authoritative `docs/current/` specification. Limit the edit to the approved Issue; preserve unrelated current specifications, historical requirements and decisions, and published changelogs. Purely visual or internal work without changed documented behavior does not automatically require a specification edit. Create or update a durable ADR only when justified and authorized. This rule applies prospectively from the Gate C cutover, not retroactively to earlier completed Issues. The explicitly invoked Release Preparer retains its narrow, evidence-based release-documentation authority under its role and workflow.

---

## 19. AI-assisted development workflow

Keep increments reviewable by the human developer: reconcile the affected current specifications and explicitly approved Issue, inspect code/tests, implement the smallest change, run relevant checks, inspect the diff, then hand off for human-controlled staging, commit and push. Include the affected current specification in the same increment when §18 applies. Coding agents must not perform Git operations unless expressly authorized under `AGENTS.md` or an applicable release role. Prompts should state scope, non-goals, validation, documentation authorization and Git restrictions.

---

## 20. Instruction hierarchy for coding agents

`AGENTS.md` → this guide → the affected authoritative current specifications selected through [the domain index](current/index.md) → explicit approved Issue/task delta → code/tests as evidence. Read historical requirements and decisions when they materially explain provenance, supersession, rationale or a discrepancy; they do not compete with `docs/current/` as the current functional baseline. A clear, approved Issue delta may evolve an affected contract through the co-update in §18. Stop and report an unresolved product decision or material conflict rather than silently choosing an interpretation.

---

## 21. Guiding principle

The current TackBar development strategy is:

> Build the smallest coherent version that validates the real post-sailing workflow, preserve clean domain and API boundaries, learn from real sailors, and add complexity only when the product demonstrates that it is necessary.
