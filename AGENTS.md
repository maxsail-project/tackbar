# TackBar AI Agent Instructions

TackBar is an early-stage open-source proof of concept for collaborative post-sailing debriefing.

This file is the mandatory entry point for AI coding agents working in this repository. Keep changes small, explicit, reviewable, and aligned with the current PoC.

## Before making changes

Always:

1. Inspect the existing implementation before changing it.
2. Read `docs/ai-development-guidelines.md` completely.
3. Read the relevant feature requirements for the task.
4. Follow existing repository conventions, tests, and data models.
5. Preserve the current PoC scope.
6. Prefer the smallest coherent change that satisfies the task.

For work related to Sessions, Activities, tracks, comparison, metrics, replay, or the frontend Session Viewer, also read:

`docs/session-viewer-requirements.md`

For work that depends on the delivered v0.4 Sailor/Boat model, Session Viewer API, frontend/backend integration, or collaborative debriefing baseline, also read:

`docs/v0.4-collaborative-debrief-requirements.md`

For v0.5 Real Sailing Pilot work related to consent, pilot access, admin operations, Gmail ingestion operation, shared Session visibility, capability URLs, Session expiration, retention behavior, or pilot administration, also read:

`docs/v0.5-real-sailing-pilot-requirements.md`

For any v0.5 task involving product behavior, privacy, consent, access, retention, Gmail operation, admin workflows, hosting constraints, or deferred scope, also read:

`docs/v0.5-decisions.md`

Treat these documents as repository constraints, not optional background.

If instructions conflict, stop and report the conflict before implementing.

## Instruction hierarchy

Interpret repository instructions in this order:

1. `AGENTS.md`
2. `docs/ai-development-guidelines.md`
3. relevant feature requirements
4. explicit task prompt
5. existing implementation and tests

An explicit task may select or narrow work within the applicable requirements, but it does not override higher-priority repository instructions. If the requested outcome requires changing those requirements, report the conflict and request an explicit documentation change before implementing it.

Do not silently invent an interpretation when instructions conflict.

Historical requirement documents may contain deferred or future ideas. Those references do not automatically make an item part of the current release scope. Current release requirements govern implementation scope.

## Current PoC focus

The delivered v0.4 product flow is:

`track sharing → ingestion → Sailor → Activity + optional Boat → Session → mobile Session Viewer → one/two-boat comparison → shared GPS time window → replay → basic visual metrics`

The v0.5 Real Sailing Pilot extends that baseline with controlled real-user operation:

`invite / consent → Sailor → email track → admin-triggered ingestion → Activity → existing Session matching → ACTIVE-only shared visibility → capability URL → collaborative debrief`

Important current constraints:

- An Activity is one track received by TackBar and may be complete or partial.
- Sailor is the person-level runtime identity and Boat is a separate sailing context.
- An Activity requires a Sailor and may reference a Boat.
- A Sailor may have multiple Activities in the same Session.
- Do not automatically merge or split Activities.
- Existing Session matching remains the v0.4 baseline unless explicitly changed by a future requirement.
- Compare at most two Activities in the current PoC.
- Compared Activities use the same GPS/UTC Analysis Window.
- Compared Activities use the same selected analytical/chart metric: SOG, COG, HEEL or TRIM.
- Replay uses one shared GPS clock (`playbackTime`) for both Activities.
- Replay speeds are x1, x2, x5, and x10.
- Replay is a temporal control only. The map independently presents fixed instantaneous GPS time, SOG, COG and HEEL telemetry; TRIM is not map telemetry.
- Consent controls shared visibility, not technical Activity ingestion or Session matching.
- Shared Session responses must enforce ACTIVE-only visibility in the backend.
- v0.5 Session access uses a capability URL and does not require Sailor login.
- Human-operated admin workflows are acceptable for the v0.5 PoC where explicitly allowed by the v0.5 requirements.

Do not implement future roadmap or backlog items unless explicitly requested.

## Development approach

- Prefer simple, explicit implementations.
- Avoid premature abstraction and speculative scalability work.
- Avoid unrelated refactors.
- Preserve provider-independent domain boundaries.
- Keep ingestion, parsing, normalization, persistence, domain services, APIs, and frontend responsibilities separated.
- Keep external providers such as Gmail, Vakaros, and future Garmin integrations as adapters.
- Reuse validated sailing-domain knowledge from MaxSail when useful, but do not inherit MaxSail's Streamlit architecture or reproduce MaxSail Analytics by default.
- Do not invent domain concepts, fields, or semantics.
- Preserve already validated v0.4 behavior unless the current requirement explicitly changes it.

## Technology direction

Keep the backend focused on Python + FastAPI.

Keep the current frontend PoC focused on:

- React;
- TypeScript;
- Vite;
- React Router;
- MapLibre;
- Recharts;
- native `fetch`;
- local React state;
- simple responsive CSS.

Prefer open-source and zero-cost solutions for the PoC. External free services must remain replaceable.

Do not introduce additional frameworks, state-management libraries, paid SaaS, proprietary billing-dependent map APIs, cloud infrastructure, authentication platforms, databases, queues, or distributed infrastructure unless explicitly required.

The frontend must consume backend APIs. It must not read backend JSON persistence or CSV.GZ track files directly.

## Sailing-domain safety

COG and HDG are circular angles.

Any angular calculation must respect the 0°/360° boundary.

Examples:

- `359°` vs `001°` = `2°`
- `355°` vs `005°` = `10°`

Do not use a simple arithmetic mean for circular headings.

Dominant COG calculations must handle bins crossing 0°/360° correctly.

Add focused regression tests when angular behavior is implemented or changed.

Do not invent missing sensor values.

Do not derive HDG from COG unless explicitly required.

## Testing and validation

Use real sailing files as fixtures when possible.

Add or update focused tests when changing domain behavior, including parsing, normalization, persistence, deduplication, Session matching, consent visibility, capability access, expiration, time filtering, angular calculations, replay utilities, or API contracts.

Run the relevant checks after implementation.

For backend changes, run the relevant backend tests.

For frontend changes, run the relevant:

- type check;
- tests, when present;
- production build.

Report failures clearly. Do not hide or bypass them.

## Documentation policy

Documentation changes must always be explicit.

Do not modify unless the task explicitly requests it:

- `README.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- release notes
- version numbers
- files under `docs/`
- other project documentation

Do not automatically update documentation after implementing a feature.

Implementation and documentation are separate tasks.

When completing implementation work, summarize relevant changes in the task result so they can be reviewed and documented later if appropriate.

### Documentation responsibilities

Use documents for distinct purposes:

- `ROADMAP.md`: high-level product milestones and release direction.
- `docs/*-requirements.md`: requirements and acceptance criteria for a specific delivered/current product chapter.
- `docs/*-decisions.md`: closed product/architecture decision rationale when preserving that rationale is useful.
- `docs/product-backlog.md`: canonical inventory of future work that is valid but not committed to the current release.
- `CHANGELOG.md`: delivered release changes.

Historical requirements may retain deferred ideas for context, but `docs/product-backlog.md` is the canonical place to track future work across releases.

Do not autonomously move, add, prioritize, or assign future work to a release merely because it appears in an older requirements document. If a task discovers a future item that should be tracked, report it and update the backlog only when documentation changes are explicitly requested.

## Backlog maintenance

`docs/product-backlog.md` is the canonical inventory of unfinished future work.

It must contain pending work only. Delivered items should be removed rather
than retained as historical records; delivered history belongs in code,
tests, requirements, CHANGELOG and release notes where applicable.

Agents MAY update the backlog only when documentation changes are explicitly requested and one of the following applies:

- an explicitly requested implementation introduces a clear future follow-up;
- an implementation completes an existing backlog item;
- a documentation/release sanity-check task includes backlog reconciliation.

When explicitly requested, backlog maintenance should normally happen during
the final review or sanity check of an increment, not opportunistically during
unrelated coding work.

When reconciling the backlog, agents should:

- remove items that are now delivered;
- add concrete future work discovered during implementation;
- merge duplicates;
- update items whose context or scope changed;
- preserve links to source requirements when useful;
- avoid inventing priority, release assignment or product commitments that
  have not been decided.

If it is unclear whether something is a valid backlog item, report it instead
of adding it automatically.

## Git and release safety

Do not commit or push unless explicitly requested.

Do not create tags, releases, or version bumps unless explicitly requested.

The human developer controls staging, commits, pushes, tags, and releases.

Never stage broad repository changes with `git add .`, `git add -A`, or equivalent broad staging. Use exact intended paths when staging is explicitly authorized.

## Scope discipline

If a task appears to require a material change outside its stated scope:

1. stop before making the unrelated change;
2. explain why it appears necessary;
3. wait for explicit approval.

Do not modify MaxSail Analytics unless explicitly requested.

## Completion report

At the end of an implementation task, report:

1. what changed;
2. files created;
3. files modified;
4. dependencies added or removed;
5. tests/checks executed;
6. results;
7. assumptions made;
8. unresolved issues or decisions.

Do not commit or push unless explicitly requested.
