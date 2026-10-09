# Release Preparation Workflow

This document defines the reusable TackBar workflow for preparing a release for
approval and publication handoff.

It applies after the intended release functionality has been implemented. Release preparation is a review, documentation, validation and publication-preparation activity. It is not a feature-development phase.

## 1. Inputs

A release preparation task must provide:

- the release version;
- the release name;
- the GitHub release-preparation issue that defines the release-specific scope.

The issue defines **what release is being prepared**. This workflow defines **how release preparation is performed**.

## 2. Source of truth

Before making release-preparation changes:

1. Read `AGENTS.md`.
2. Read `docs/ai-development-guidelines.md`.
3. Read the release-specific requirements and decisions.
4. Read other relevant governing documentation referenced by `AGENTS.md`.
5. Inspect the delivered implementation and relevant tests.
6. Inspect the release-preparation issue.

Documentation must describe behavior that is actually delivered. Do not promote planned, deferred or open work merely because it is related to the release theme.

## 3. Establish delivered release scope

Determine the release contents from repository evidence:

- implemented code;
- regression tests;
- relevant commit history when useful;
- closed implementation decisions;
- the release-preparation issue.

Confirm that delivered behavior is consistent with the governing requirements and decisions.

If implementation and documentation conflict, report the conflict before rewriting requirements to match the implementation. Do not use release preparation to retroactively justify an unintended implementation.

Do not add new product functionality during this phase.

## 4. Reconcile documentation

Review only the documentation affected by the release.

As applicable:

### Requirements

Update release requirements so they accurately describe committed and delivered behavior.

Replace wording that still describes delivered work as provisional, planned or pending when the relevant decision and implementation are now closed.

Preserve explicit non-goals and future scope.

### Decisions

Record implementation/product decisions that are now closed and are important for preserving release semantics.

Do not add speculative rationale or decisions that were never made.

### Product backlog

`docs/product-backlog.md` contains pending work only.

- remove work that is now delivered;
- preserve unfinished work;
- do not promote or assign pending work to a release without an explicit decision;
- merge or clarify entries only when release work made them demonstrably obsolete or duplicated.

### Roadmap

Update `ROADMAP.md` only as needed to reflect the release milestone and its actual delivery status.

Keep the roadmap high-level. Do not duplicate detailed requirements or changelog content.

### Changelog

Add the release entry to `CHANGELOG.md` following the repository's existing structure and language conventions.

The entry must:

- describe notable delivered behavior;
- distinguish added/changed/fixed behavior when useful;
- describe preserved semantics when important;
- report validation that was actually executed;
- state production validation as pending when it has not occurred;
- avoid claiming future or unimplemented work.

## 5. Validate the release

Use a risk-based release-validation gate appropriate to the delivered changes.

At minimum:

- run the relevant backend/frontend tests for the release scope;
- run frontend typecheck/build when the release contains frontend changes;
- run backend compile/static checks when relevant;
- run `git diff --check`;
- review the final documentation and code state for contradictions.

For a substantial release that crosses backend and frontend behavior, broader regression may be appropriate as the final release gate even if individual increments previously used focused tests.

Do not hide failing checks. Record unresolved failures or limitations explicitly.

## 6. Independent review

After release-preparation changes are complete, the result should be reviewed independently before human release approval.

The independent reviewer should verify that:

- documentation matches delivered implementation;
- the changelog does not overclaim;
- delivered work was removed from the backlog and pending work was preserved;
- no new scope was introduced during release preparation;
- validation is proportionate to release risk;
- no release-blocking inconsistency remains.

The reviewer should report findings before making corrective changes unless explicitly asked to fix them.

## 7. Prepare publication metadata

Prepare, but do not publish:

- release version;
- release name;
- proposed immutable Git tag;
- concise GitHub Release notes;
- known limitations or pending production validation;
- a short release/deployment checklist when useful.

Release notes should summarize the delivered product outcome rather than reproduce the complete changelog.

## 8. Human approval gate

Release preparation is complete when the release scope, version, name,
reconciled documentation, `CHANGELOG.md` entry, required validation and
publication metadata are ready for human approval.

The final report must include:

1. release scope confirmed;
2. files changed;
3. documentation reconciled;
4. tests/checks executed and results;
5. known limitations or pending validation;
6. proposed release name and tag;
7. proposed GitHub Release notes;
8. unresolved decisions or blockers, if any.

After approval, publication may be handed off by explicitly invoking the
[Release Publisher](../../agents/release-publisher.md) for the prepared version.
For example, `Publish v0.7.1` constitutes authorization for the narrow
publication operations defined by that agent.

## 9. Actions outside release preparation

Release preparation must not:

- stage files;
- commit;
- push;
- create, move or publish Git tags;
- create or publish a GitHub Release;
- deploy to production;
- alter production runtime data or configuration;
- close unrelated issues;
- implement new functionality to make the release appear complete.

These restrictions apply to the release-preparation actor. An explicitly
invoked Release Publisher may create and push the approved tag and create the
corresponding GitHub Release only according to
`agents/release-publisher.md`.

Release publication does not authorize production deployment. Deployment
remains a separate responsibility and follows the repository's Git and
production-runbook rules under separate authority.
