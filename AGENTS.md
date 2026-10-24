# TackBar AI Agent Instructions

TackBar is an early-stage open-source proof of concept for collaborative post-sailing
debriefing. This file is the mandatory entry point for AI coding agents. Keep changes
small, explicit and reviewable.

## Instruction hierarchy and reading route

Interpret repository instructions in this order:

1. `AGENTS.md` — agent operating rules and safeguards.
2. `docs/ai-development-guidelines.md` — stable engineering principles.
3. Relevant authoritative functional specifications under `docs/current/`, selected
   through `docs/current/index.md`.
4. The explicit, approved Issue or task delta.
5. Implementation and tests — evidence of actual behavior.

Read only the current domains affected by the task, including any cross-domain contract it
changes. Inspect code and focused tests before editing. Read specialist guidance when
relevant: `docs/admin-ux-ui-guidelines.md` for Admin interaction, and
`docs/production-runbook.md` for deployment, rollback or server operations. Preserve their
procedural roles; a specialist guide does not silently override a current functional
contract.

Versioned requirements and decisions remain preserved provenance. Read them for a specific
historical question, supersession, rationale or discrepancy, not as mandatory input to
ordinary feature work. A historical deferred idea or open Issue does not become current
scope by appearing in a source file. If instructions or material product interpretations
conflict, stop before implementation and report the conflict.

## Product and engineering boundaries

- Preserve the validated PoC: track sharing and ingestion, Sailor and optional Boat
  context, Activity and Session collaboration, mobile Viewer, at most two analytically
  compared Activities, a shared GPS/UTC Analysis Window, replay and bounded visual
  analytics. The affected current specifications own detailed guarantees.
- An Activity is one possibly partial received track, requires a Sailor, and may reference
  a Boat. A Sailor may have multiple Activities in one Session. Do not automatically merge
  or split Activities, infer Boat identity from source metadata, or invent domain
  semantics.
- Consent gates sharing, not technical ingestion or Session matching. Shared Session
  responses must enforce current `ACTIVE`-only Activity visibility in the backend.
  Purpose-specific bearer capabilities are not interchangeable with internal IDs or one
  another; personal access does not bypass shared Session authorization. Do not rely on
  frontend hiding for privacy.
- Preserve Session matching, lifetime, retention, consent, capability, ingestion,
  persistence, API and Viewer contracts unless an explicitly approved Issue changes them.
  Do not promote pending work or code-only behavior into a product guarantee. Maneuver
  events remain neutral, not automatic tack/gybe labels.
- Keep providers as replaceable adapters. Separate acquisition, parsing, normalization,
  persistence, domain services, APIs and frontend. The frontend consumes backend APIs,
  never backend JSON or track files directly. Do not invent sensor values or derive HDG
  from COG.
- COG and HDG are circular: respect the 0°/360° boundary in differences, grouping, means
  and dominant directions. Never use an arithmetic heading mean. Add focused regression
  coverage when angular behavior changes.
- Keep the Python/FastAPI backend and the existing React/TypeScript/Vite/React
  Router/MapLibre/native-SVG frontend direction. Prefer native `fetch`, local state,
  responsive CSS and replaceable open-source or zero-cost services. Do not add paid
  services, databases, queues, authentication platforms, distributed infrastructure or new
  frameworks without an explicit requirement.
- Reuse validated sailing knowledge from MaxSail when useful, but not its Streamlit
  architecture or advanced Analytics by default. Do not modify MaxSail Analytics unless
  requested.

## Issues, scope and decisions

Open Issues are pending work, not governing product decisions. GitHub Project ordering is
presentation, not scope or priority. An Issue Form does not approve implementation. An
Issue closed as `completed` represents accepted delivered work; release preparation
verifies candidate inclusion without a second functional approval.

A promoted Issue defines only its explicit, approved delta over the documented and
delivered baseline. It may intentionally change an earlier contract when that change is
clear. Unchanged contracts remain in force; promotion does not pull in adjacent backlog.
Every promoted Issue must classify documentation impact. Before implementation, reconcile
the Issue, affected current specifications, code and tests. If domain, privacy, consent,
persistence, capability, ingestion, frontend behavior or the intended override is
materially ambiguous, stop and seek a product decision. Do not choose semantics because
they are simpler, invent missing rules or expand scope to hide ambiguity.

Create, prioritize, assign, close or otherwise change Issues only when explicitly
authorized. Authorized reconciliation normally belongs to a final increment review or an
expressly requested documentation/release check. Keep pending work open, preserve
completed-work traceability, and do not infer deployment from implementation. A material
change outside task scope requires explicit approval before making it.

## Testing and reporting

Use real sailing files as fixtures where practical. Add or update focused regression tests
for changed domain behavior, including parsing, normalization, persistence, deduplication,
matching, consent visibility, capabilities, expiration, time filtering, angles, replay and
APIs. Run relevant backend tests for backend changes. For frontend changes, run relevant
type check, tests when present and production build. Use risk-proportionate checks for
documentation-only or visual-only work. Report failures clearly.

At handoff, report what changed, files created or modified, dependency changes, checks and
results, assumptions, and unresolved decisions.

## Documentation policy

Documentation edits require explicit task or Issue authority. Do not change `README.md`,
`ROADMAP.md`, `CHANGELOG.md`, release notes, version numbers or other documentation merely
because implementation occurred. `docs/current/` is the authoritative home for current
functional product behavior; versioned requirements and decisions preserve historical
scope and rationale. `ROADMAP.md` gives direction, open Issues hold pending work,
code/tests show implementation and `CHANGELOG.md` records delivered releases.

When a GitHub Issue explicitly debates and approves changing a functional contract or
documented product behavior, its Codex implementation increment **MUST update together**
the necessary product code, directly relevant regression tests and the affected
authoritative `docs/current/` specification. Limit the documentation edit to the approved
Issue. Preserve unrelated specifications, historical requirements/decisions and published
changelogs. Purely visual or internal work without changed documented behavior does not
automatically require a specification edit. Create or update a durable ADR only when its
rationale is justified and the edit is authorized. This rule applies prospectively from
this cutover; do not reopen earlier completed Issues solely to satisfy it retroactively.

The informational solution overview at `docs/current/solution-overview.md` must be kept consistent with the authoritative current specifications.

When an explicitly approved Issue changes the functional modules, major flows, or relationships represented in the diagram, update the overview in the same authorized implementation increment.

The overview is non-normative and must not introduce or override product contracts. Changes that do not materially affect the diagram do not require an overview update.

## Git, release and production safety

Normal development staging, commits, merges and pushes are human-controlled unless
expressly authorized. On ordinary tasks, coding agents must not stage, commit, push, tag
or release. Never stage broadly with `git add .`, `git add -A` or equivalent; use exact
intended paths when staging is authorized.

An explicitly invoked Release Preparer for one concrete, already-decided release has only
the narrow preparation authority in `agents/release-preparer.md` and
`docs/workflows/release-preparation-workflow.md`, including their evidence-based
release-relevant documentation review, exact-path preparation commit and push. That
invocation does not need separate per-file approval. It cannot implement product code,
choose release identity, publish, deploy or approve itself. An explicitly invoked Release
Publisher follows `agents/release-publisher.md` for that prepared release's tag and GitHub
Release; publication does not authorize deployment.

The immutable tag and GitHub Release establish publication. Successful execution of the
production deployment workflow establishes its technical deployment path, not every manual
functional confirmation. Keep static documentation free of mutable deployment status;
GitHub Actions must not commit or push documentation. Later production confirmations are
operations, not release gates; defects follow the normal Bug Issue and hot-fix/release
path. Do not add a Release Finalizer, mandatory post-release Issue or documentation gate.
Preserve published history and use durable release facts, not transient “deployment
pending” language. v0.7.x tags use semantic version only; the established Californian
release name remains in force, and no v0.8 family name has been decided.
