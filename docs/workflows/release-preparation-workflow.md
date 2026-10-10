# Release Preparation Workflow

This document defines the reusable TackBar workflow for preparing a release for
approval and publication handoff.

It applies after the intended release functionality has been implemented. Release preparation is a review, documentation, validation and publication-preparation activity. It is not a feature-development phase.

## 1. Inputs

A release preparation task must provide:

- the release version;
- the release name or already-decided family naming sufficient to validate it;
- the previous published release/tag as the comparison boundary.

A release-preparation issue may be supplied. If none exists, an explicitly
invoked Release Preparer may create it from repository evidence. The issue is
an audit/work-tracking artifact; it must not invent product scope. This workflow
defines **how release preparation is performed**.

## 2. Source of truth

Before making release-preparation changes:

1. Read `AGENTS.md`.
2. Read `docs/ai-development-guidelines.md`.
3. Read the release-specific requirements and decisions.
4. Read other relevant governing documentation referenced by `AGENTS.md`.
5. Inspect the delivered implementation and relevant tests.
6. Inspect the release-preparation issue when supplied, or locate/create it as
   defined by the Release Preparer procedure.

Documentation must describe behavior that is actually delivered. Do not promote planned, deferred or open work merely because it is related to the release theme.

## 3. Establish delivered release scope

Determine the release contents from repository evidence:

- the previous published release boundary;
- current `main`;
- commits between that boundary and current `main`;
- implemented code;
- regression tests;
- closed GitHub issues whose delivered work is contained in that range;
- closed implementation decisions;
- the release-preparation issue when available.

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

### Pending-work Issues

Open GitHub Issues are the canonical inventory of pending work. Each Issue is a
backlog item, while the GitHub Project provides presentation and physical
ordering without a duplicate priority mechanism.

- reconcile Issue state and release traceability against delivered repository
  evidence, including code, tests, requirements and decisions;
- confirm that Issues listed as delivered are closed and actually contained in
  the release;
- preserve open Issues as pending/proposed work and do not present them as
  delivered;
- report stale, duplicated or inconsistent Issue state; do not change unrelated
  Issues or promote pending work without explicit authority and a product
  decision;
- do not treat Project ordering as release scope or governing product semantics.

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

From this governance change forward, every newly prepared release entry must
contain a flat `### Issues` section in each self-contained language block. Use:

```markdown
### Issues

- #<issue number> — <canonical GitHub issue title>
```

List only closed issues whose delivered work is actually contained in the
release. Do not add categories, priorities or release-target metadata, list
related open/pending issues, or rewrite historical entries solely to backfill
issue references.

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

After release-preparation changes are complete, the result must be reviewed by
a reviewer logically separate from the preparer. The reviewer may be human or
AI, including ChatGPT, a separate review agent or independently delegated
sub-agent.

The independent reviewer should verify that:

- documentation matches delivered implementation;
- the changelog does not overclaim;
- every listed issue is closed and actually contained in the release;
- materially included closed issues are not omitted from traceability;
- open or pending issues are not presented as delivered;
- Issue state and traceability agree with delivered repository evidence, while
  pending work remains represented by open Issues;
- no new scope was introduced during release preparation;
- validation is proportionate to release risk;
- the preparation commit contains only intended release-preparation changes;
- no release-blocking inconsistency remains.

The reviewer reports `PASS` or `BLOCKED`. The Release Preparer must not review
or approve its own work and must not infer `PASS` from successful preparation.

The review result may be supplied directly through the active Release Preparer
conversation or may already exist as a repository record.

An independent `PASS` supplied through the Release Preparer conversation must
identify at minimum:

- the release version;
- the reviewed `main` commit SHA;
- an explicit `PASS` result.

For example:

```text
Independent review PASS for v0.7.2 at
97634a27eaa471a1753fdb4aa691290a329dfd19
```

The Release Preparer may receive and process that external decision, but must
not perform the independent review itself, infer approval or invent missing
review evidence.

Before accepting the `PASS`, the Release Preparer must verify that current
remote `main` exactly matches the reviewed SHA and that the review applies to
the release currently being prepared.

If remote `main` has changed since the reviewed commit, the previous `PASS`
does not transfer to the new candidate. The release remains `BLOCKED` until the
current candidate receives a new independent review.

When a valid external `PASS` is supplied, the Release Preparer records the
review result, release version and reviewed SHA in the release-preparation
GitHub issue, closes that issue and reports `READY_FOR_PUBLICATION`.

The preparation issue is the durable audit record. The independent reviewer
does not need to manually enter the review result into GitHub when the result
has been explicitly supplied to the Release Preparer and recorded there by the
Preparer.

If review reports `BLOCKED`, report the findings before making corrective
changes unless explicitly asked to fix them. The release-preparation issue must
remain open.

## 7. Prepare publication metadata

Prepare, but do not publish:

- release version;
- release name;
- proposed immutable Git tag;
- concise GitHub Release notes;
- known limitations or pending production validation;
- a short release/deployment checklist when useful.

Release notes should summarize the delivered product outcome rather than reproduce the complete changelog.

## 8. Independent review gate

The preparation candidate reaches `READY_FOR_REVIEW` when the release scope,
version, name, reconciled documentation, `CHANGELOG.md` entry, required
validation and publication metadata are committed to `main`.

At `READY_FOR_REVIEW`, the Release Preparer must stop and wait for an explicit
independent review result. Successful preparation must never be treated as
approval.

The `READY_FOR_REVIEW` report must include:

1. release scope confirmed;
2. files changed;
3. documentation reconciled;
4. tests/checks executed and results;
5. known limitations or pending validation;
6. proposed release name and tag;
7. proposed GitHub Release notes;
8. preparation issue;
9. prepared remote `main` SHA;
10. unresolved decisions or blockers, if any.

An explicitly invoked Release Preparer may stage only exact intended
preparation files, create the preparation commit and push it to `main` under
that agent's narrow authority. Normal coding agents do not gain this Git
authority from the workflow.

The preparation gate passes only after an independent reviewer explicitly
reports `PASS` for the release version and reviewed `main` SHA.

After receiving that external `PASS`, the Release Preparer must verify that
current remote `main` still exactly matches the reviewed SHA. If it does not,
the release is `BLOCKED` pending a new independent review.

After successful verification, the Release Preparer:

1. records the independent `PASS`, release version and reviewed SHA in the
   release-preparation issue;
2. closes that issue;
3. verifies its closed state;
4. reports `READY_FOR_PUBLICATION`.

Publication is never invoked automatically. After `READY_FOR_PUBLICATION`, the
release may be handed off by explicitly invoking the
[Release Publisher](../../agents/release-publisher.md) for the prepared
version. For example, `Publish v0.7.2` constitutes authorization only for the
narrow publication operations defined by that agent.