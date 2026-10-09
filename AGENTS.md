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

For v0.5.1 Pilot Fix & Usability work related to Admin operational context,
pilot fixes, Session/Sailor usability, or other explicitly defined v0.5.1
increments, also read:

`docs/v0.5.1-pilot-fix-and-usability-requirements.md`

If instructions conflict, stop and report the conflict before implementing.

For v0.6 Personal TackBar & Pilot Operations work related to personal Sailor access, Admin operational maintenance, multi-provider email ingestion, visual brand consolidation, licensing, or other explicitly defined v0.6 increments, also read:

`docs/v0.6-personal-tackbar-pilot-operations-requirements.md`

For any v0.6 task involving product behavior, personal access, pilot operations, ingestion boundaries, branding, licensing, or deferred scope, also read:

`docs/v0.6-decisions.md`

For v0.6.1 OVH Mailbox Ingestion work, including OVHcloud/Zimbra IMAP acquisition, mailbox-provider selection, provider-message identity, Gmail replacement, production cutover or pilot-data reset, also read both:

- `docs/v0.6.1-ovh-mailbox-ingestion-requirements.md`
- `docs/v0.6.1-decisions.md`

The v0.6.1 documents explicitly promote the OVH mailbox work that v0.6.0 historical documents had deferred. For v0.6.1 implementation, treat the v0.6.1 requirements/decisions as the current release scope while preserving all unchanged v0.6.0 semantics.

For v0.6.4 work involving consent activation, outbound SMTP, welcome-email
delivery state, Personal TackBar delivery or Admin resend, also read both:

- `docs/v0.6.4-sailor-activation-welcome-email-requirements.md`
- `docs/v0.6.4-decisions.md`

For v0.6.5 work involving track-first onboarding, automatic consent-request
email, consent capability/token, `/consent/<token>`, web consent acceptance,
consent-request resend/reissue or v0.6.5 consent lifecycle behavior, also read
both:

- `docs/v0.6.5-simplified-pilot-onboarding-requirements.md`
- `docs/v0.6.5-decisions.md`

For v0.7.x Californian work involving Vakaros-based collaborative debrief
analytics, maneuver/event detection, analytical summaries, event-to-replay
navigation, or maintenance increments within the release family, also read both:

- `docs/v0.7-collaborative-debrief-analytics-requirements.md`
- `docs/v0.7-decisions.md`

The v0.7.x metric set is provisional and evidence-driven; detected maneuvers
are not automatically tacks/gybes. Multi-format ingestion and canonical logical
deduplication remain Future / Unassigned, not governing v0.7.x scope.

The v0.7.x maintenance allowance is evidence-driven and does not authorize
unrelated feature expansion or speculative refactoring.

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
- Replay is a temporal control only. The map independently presents fixed instantaneous GPS time, SOG, COG, HEEL and TRIM telemetry.
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
- GitHub Issues: canonical inventory of pending work; each open Issue is one
  backlog item describing proposed or pending work.
- GitHub Project: backlog presentation and physical ordering. Project order does
  not create product semantics or require a duplicate priority field.
- `docs/*-requirements.md`: requirements and acceptance criteria for a specific delivered/current product chapter.
- `docs/*-decisions.md`: closed product/architecture decision rationale when preserving that rationale is useful.
- `CHANGELOG.md`: delivered release changes.
- code and tests: implemented behavior.

An open GitHub Issue is pending/proposed work. It does not automatically become
a governing product decision, release commitment or implementation instruction,
and it does not override current requirements or decisions. An Issue MAY
intentionally propose behavior that conflicts with governing documentation.
Before implementation instructions are generated for such an Issue, agents must
surface the conflict and have it explicitly resolved through the applicable
requirements/decision change. Current requirements and decisions remain
authoritative for product behavior, under the instruction hierarchy above,
until that deliberate change is made.

Do not autonomously create, prioritize, assign, close or otherwise change Issues
merely because future work appears in an older requirements document or is
discovered during implementation. Report the candidate future work, and create
or update a GitHub Issue only when that issue-tracking change is explicitly
authorized.

## Issue backlog governance

Open GitHub Issues are the canonical inventory of unfinished future work. The
GitHub Issue is the backlog item; the GitHub Project supplies physical ordering
and presentation without a parallel priority mechanism.

Open Issues represent pending/proposed work only. Delivered history belongs in
code, tests, governing requirements/decisions, closed Issues, `CHANGELOG.md` and
GitHub Releases where applicable.

Agents MAY create or update backlog Issues only when issue changes are explicitly
authorized and one of the following applies:

- an explicitly requested implementation introduces a clear future follow-up;
- an implementation completes or changes the context of an existing Issue;
- a documentation/release sanity-check task includes Issue reconciliation.

When explicitly requested, Issue reconciliation should normally happen during
the final review or sanity check of an increment, not opportunistically during
unrelated coding work.

When reconciling pending and delivered work, agents should:

- compare Issue state and traceability with delivered repository evidence;
- keep pending/proposed work open and represent delivered work through closed
  Issues plus code/tests and release records as applicable;
- identify duplicates or obsolete Issues without changing them unless explicitly
  authorized;
- preserve links to governing requirements and decisions when useful;
- avoid inventing priority, release assignment or product commitments, and do
  not duplicate the GitHub Project's physical ordering.

If it is unclear whether something is a valid Issue, report it instead of
creating or changing one automatically.

## Git and release safety

For production deployment, release upgrade, rollback, or server operational
work, read:

`docs/production-runbook.md`

Normal development staging, implementation commits, merges and pushes remain
human-controlled unless explicitly requested. Coding agents must not commit or
push unless explicitly authorized for those development operations.

Release preparation is a narrow exception. An explicitly invoked Release
Preparer may prepare one concrete, already-decided release and must follow the
complete role and procedure in `agents/release-preparer.md`. An invocation such
as `Prepare v0.7.1 Californian — Analysis Window Maneuver Metrics` constitutes
authorization for the preparation operations defined there, including creating
the preparation issue when needed, updating release documentation and
`CHANGELOG.md`, staging exact intended preparation files, and committing and
pushing that preparation to `main`.

The Release Preparer has no authority to implement or fix product code, choose
the version or release-family identity, publish Git tags or GitHub Releases,
deploy production, or perform unrelated Git operations. It must not approve its
own preparation.

Release publication is a narrow exception. An explicitly invoked Release
Publisher may publish an already-decided and already-prepared release, and must
follow the complete role and procedure in `agents/release-publisher.md`.
Invoking it for a concrete version, for example `Publish v0.7.1`, constitutes
authorization for the publication operations defined there; no additional
confirmation is required for those operations.

The Release Publisher has no authority over normal implementation Git
operations beyond its explicitly defined release actions. Release publication
does not authorize production deployment, which remains a separate
responsibility.

Never stage broad repository changes with `git add .`, `git add -A`, or equivalent broad staging. Use exact intended paths when staging is explicitly authorized.

Git tags contain only the semantic version. For the current v0.7.x release
family, where `x` is the concrete patch number:

- tag: `v0.7.x`;
- GitHub Release name: `TackBar v0.7.x Californian — <short release description>`.

`v0.7.1`, `v0.7.2` and later v0.7.x patch releases remain part of the
Californian family. No v0.8.x family name has been decided and none may be
inferred or invented.

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
