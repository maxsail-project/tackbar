# Release Preparation Workflow

This document defines the reusable TackBar workflow for preparing a release for
publication handoff.

It applies after the intended release functionality has been implemented,
reviewed, validated as required and represented by GitHub Issues closed as
`completed`.

Release preparation is a documentation, traceability, validation and
publication-preparation activity. It is not a feature-development phase and
does not repeat functional acceptance of already completed work.

## 1. Inputs

A release preparation task must provide:

- the release version;
- the release name or already-decided family naming sufficient to resolve it
  unambiguously;
- the previous published release/tag as the comparison boundary;
- current `main` as the preparation target.

Accepted delivered work is represented by relevant GitHub Issues closed as
`completed` whose implementation is actually contained in the release range.

A release-preparation Issue may be supplied. If none exists, an explicitly
invoked Release Preparer may create it from repository evidence.

Invoking the Release Preparer for one concrete release authorizes the mandatory
release-relevant documentation review and all evidence-based documentation
updates defined by this workflow. No additional per-file approval is required.

The release-preparation Issue is an audit and work-tracking artifact. It must
not invent product scope.

This workflow defines how an already-delivered set of changes is prepared for
publication.

## 2. Source of truth

Before making release-preparation changes:

1. Read `AGENTS.md`.
2. Read `agents/release-preparer.md`.
3. Read `docs/ai-development-guidelines.md`.
4. Read the applicable release-specific requirements and decisions.
5. Read other relevant governing documentation referenced by `AGENTS.md`.
6. Inspect current `main`.
7. Inspect the commits between the previous published release boundary and
   current `main`.
8. Inspect the completed GitHub Issues whose delivered implementation is
   contained in that range.
9. Inspect the relevant implementation and tests when needed to verify release
   traceability or documentation accuracy.
10. Inspect the release-preparation Issue when supplied, or locate/create it as
    defined by the Release Preparer procedure.

Documentation must describe behavior that is actually delivered.

Do not promote planned, deferred, open, duplicate or `not_planned` work merely
because it is related to the release theme.

## 3. Accepted delivery boundary

An Issue closed as `completed` represents accepted delivered work under the
repository governance model.

Any required implementation review, automated validation and manual validation
are considered complete before that Issue is closed as `completed`.

Release preparation therefore does not require a second functional approval of
completed Issues.

The release workflow still verifies release integrity.

For each completed Issue included in a release, the Release Preparer must
confirm that:

- its delivered implementation is actually contained in the release candidate;
- its release description is consistent with the delivered behavior;
- it is not interpreted more broadly than its actual delivered scope;
- it has not been superseded by contradictory repository evidence.

If objective evidence shows that a completed Issue is not actually represented
by the release candidate, or that its implementation and documentation are
materially inconsistent, release preparation must stop and report `BLOCKED`.

Do not reopen product acceptance merely because completed work is being
packaged into a release.

## 4. Establish delivered release scope

Determine the release contents from repository evidence:

- the previous published release boundary;
- current `main`;
- commits between that boundary and current `main`;
- implemented code;
- relevant tests and recorded validation evidence;
- GitHub Issues closed as `completed` whose delivered work is contained in that
  range;
- governing requirements and decisions;
- the release-preparation Issue when available.

Open Issues are pending/proposed work and must not be presented as delivered.

Issues closed as `not_planned`, duplicate or another non-delivery reason must
not be presented as delivered release scope.

A completed Issue is eligible for release inclusion only when its delivered
implementation is actually contained in the candidate.

Do not infer release scope solely from Issue titles, labels, Project ordering,
release themes or proximity in time.

If delivered scope cannot be established from repository evidence, report
`BLOCKED`.

Do not guess.

## 5. Mandatory release-relevant documentation consistency review

Before `READY_FOR_PUBLICATION`, review all documentation genuinely affected by
the combined release. This release-wide review is mandatory and is not limited
to files named by individual completed Issues.

Issue-level documentation-impact notes are advisory input. Inspect them, but do
not treat them as either exhaustive or as a restriction on release-relevant
reconciliation.

The review may include `README.md`, `ROADMAP.md`, `CHANGELOG.md`, `AGENTS.md`,
applicable requirements, decisions, workflows and guidelines under `docs/`, and
other repository documentation materially affected by the release. It must not
expand into arbitrary unrelated documentation.

Use only accepted delivered evidence to establish the correct documentation
state:

- completed Issues;
- the implementation actually contained in the release candidate;
- tests and recorded validation;
- closed decisions;
- later governing documentation that explicitly supersedes earlier current
  wording.

Classify every relevant finding and record the classification in the
release-preparation Issue or preparation report:

- `CURRENT`: the documentation already states the accepted current behavior;
- `UPDATE`: current-facing documentation is stale, incomplete or missing, and
  accepted evidence establishes the correction unambiguously;
- `HISTORICAL — PRESERVE`: the documentation accurately records behavior,
  validation or a decision at an earlier point and must remain historical;
- `POST-DEPLOYMENT — DEFER`: the fact can only be established after publication
  or deployment and must not be claimed during preparation;
- `BLOCKED`: reconciliation would require a new product decision, resolution of
  conflicting semantics, retroactive authorization to rewrite history, a
  product-code change or validation evidence that does not exist.

Apply every `UPDATE` as part of preparation without requesting separate
per-file approval. Examples include an obsolete current release in `README.md`,
stale format support or operational defaults, current-facing requirements or
guidelines contradicted by accepted delivered behavior, obsolete architecture
guidance, or a roadmap that still presents delivered evolution as pending.

For `HISTORICAL — PRESERVE`, keep the accurate historical source unchanged and,
when necessary, add or update the appropriate current-facing override. Old
requirements, manual validation records, release decisions and historical
changelog entries do not become false merely because later behavior evolved.

For `POST-DEPLOYMENT — DEFER`, record the deferred fact but do not claim that
the release is deployed, production health has passed, manual production
feature validation has occurred or production is running the new version. This
classification does not by itself block `READY_FOR_PUBLICATION`, and it does
not create a post-deployment finalization phase.

For `BLOCKED`, stop rather than inventing semantics or validation evidence,
making a new product decision, changing product code or rewriting accurate
history. Release preparation may correct documentation only when accepted
evidence clearly establishes which current-facing wording is stale and what
the correction is.

Release preparation must not use documentation changes to justify unintended
implementation.

### Requirements

Update requirements only when necessary so they accurately describe committed
and delivered behavior.

Replace wording that still describes delivered work as provisional, planned or
pending when the relevant behavior and decisions are now closed.

Preserve explicit non-goals and future scope.

Historical requirement documents may remain unchanged when they accurately
represent behavior delivered at that earlier point and the current increment is
already captured through a promoted completed Issue or later governing
documentation.

Do not rewrite historical requirements merely to make them look current.

### Decisions

Record implementation or product decisions only when they are closed,
release-relevant and useful for preserving current semantics.

Do not add speculative rationale or decisions that were never made.

### Pending-work Issues

Open GitHub Issues are the canonical inventory of pending work.

During release preparation:

- verify that Issues presented as delivered are closed as `completed`;
- verify that their implementation is actually contained in the release;
- preserve open Issues as pending/proposed work;
- do not present duplicate, `not_planned` or unrelated Issues as delivered;
- report stale or inconsistent Issue state when it affects release integrity;
- do not change unrelated Issues;
- do not promote pending work;
- do not use GitHub Project ordering as release scope.

The Release Preparer must not close product Issues merely to make them eligible
for the release. Product Issues must already have completed their delivery
lifecycle.

### Roadmap

Update `ROADMAP.md` only when necessary to reflect the actual release milestone
or delivered release-family state.

Keep the roadmap high-level.

Do not duplicate detailed requirements, Issue content or changelog content.

Do not modify the roadmap merely because a patch release is being prepared when
the existing roadmap already represents the release-family direction
accurately.

### Changelog

Add the release entry to `CHANGELOG.md` following the repository's existing
structure and language conventions.

The entry must:

- describe notable delivered behavior;
- distinguish added, changed or fixed behavior when useful;
- describe preserved semantics when important;
- reference only delivered completed Issues;
- report validation evidence accurately;
- distinguish previous implementation validation from checks executed during
  release preparation;
- state production validation as pending when it has not occurred;
- avoid claiming future or unimplemented work.

Every newly prepared release entry must contain a flat `### Issues` section in
each self-contained language block.

Use:

```markdown
### Issues

- [#63](https://github.com/maxsail-project/tackbar/issues/63) — Generate maneuver analytics when Activity processing completes
- [#64](https://github.com/maxsail-project/tackbar/issues/64) — Preserve map bearing when Analysis Window refits the track
```

Use exactly:

```markdown
- [#<issue number>](https://github.com/maxsail-project/tackbar/issues/<issue number>) — <canonical GitHub issue title>
```

Include only Issues that:

- are closed as `completed`; and
- have delivered work actually contained in the release.

Do not include:

- open Issues;
- duplicate Issues;
- Issues closed as `not_planned`;
- merely related Issues;
- deferred or future work.

Do not add categories, priorities or release-target metadata to the Issues
section.

Do not rewrite historical `CHANGELOG.md` entries solely to backfill Issue
references.

## 6. Release-preparation validation

Release-preparation validation is distinct from implementation validation.

Completed Issues already represent accepted delivered work.

The Release Preparer should reuse recorded implementation validation evidence
when describing release confidence and must not repeat functional acceptance
solely because the work is entering a release.

Do not claim that implementation checks were executed during release
preparation when they were not.

Use a risk-based validation scope appropriate to the preparation changes.

At minimum, validate:

- release version and name;
- previous published release boundary;
- completed-Issue traceability;
- consistency between release documentation and delivered implementation;
- completion of the mandatory documentation review and classification of every
  relevant finding;
- completion of every required `UPDATE` and preservation or deferral of the
  other non-blocking classifications;
- absence of pending or unrelated work from delivered release scope;
- `CHANGELOG.md` structure and content;
- bilingual release-entry consistency when applicable;
- final preparation diff;
- repository state;
- `git diff --check`;
- publication metadata;
- absence of premature tag or GitHub Release creation.

Run focused automated checks when release-preparation changes could affect
executable repository behavior.

A documentation-only preparation normally does not require repeating a full
product regression suite when the completed Issues already carry valid
implementation validation evidence.

A previous full regression gate may be cited as prior implementation validation
when supported by repository evidence.

If implementation validation evidence for a completed Issue is missing,
materially inconsistent or contradicted by current repository evidence, report
`BLOCKED`.

Do not invent validation evidence or silently repeat product acceptance.

## 7. Release-preparation Issue

Each prepared release must have one matching release-preparation Issue.

When none exists, the explicitly invoked Release Preparer may create it from
repository evidence.

The preparation Issue must record at minimum:

- release version;
- release name;
- previous published boundary;
- preparation target;
- delivered scope;
- included completed Issues;
- required documentation-review work and where its classifications will be
  recorded;
- validation evidence;
- release-preparation checks;
- explicit non-goals;
- publication metadata or a reference to it.

The release-preparation Issue exists to record the preparation process, not to
approve product functionality already accepted through completed Issues.

When release preparation completes successfully, the Release Preparer must:

1. record the completed preparation result;
2. record the preparation commit SHA;
3. record the verified remote `main` SHA;
4. record the included completed Issues;
5. record the validation actually performed;
6. record the proposed tag and publication metadata;
7. close the release-preparation Issue as `completed`;
8. verify that the Issue is closed.

If preparation is blocked, the Issue remains open unless another explicit
repository rule requires otherwise.

## 8. Prepare publication metadata

Prepare, but do not publish:

- release version;
- release name;
- proposed immutable Git tag;
- GitHub Release body;
- known limitations;
- pending production validation;
- a short deployment or publication checklist when useful.

The newly prepared `CHANGELOG.md` release entry is the authoritative source for
the GitHub Release body.

The GitHub Release body MUST be the complete corresponding bilingual release
entry from `CHANGELOG.md`, preserving:

- the English block;
- the Spanish block;
- the separator between those language blocks;
- all release-section headings;
- Issues;
- Validation / Validación;
- limitations;
- pending production validation;
- wording and Markdown structure.

The terminal `---` used only to separate this release from the next historical
entry in `CHANGELOG.md` is excluded from the GitHub Release body.

The internal `---` separating the English and Spanish blocks is preserved.

Do not generate a separate summary, shortened version or editorialized release
body.

Publication metadata must not introduce product claims beyond the delivered
completed Issues and current repository evidence.

Before preparation is complete, verify that the prepared GitHub Release body
matches the corresponding `CHANGELOG.md` entry exactly except for the terminal
changelog separator.

## 9. Prepare the release candidate

After documentation and metadata are prepared:

1. review the intended release-preparation diff;
2. confirm that only release-preparation files are changed;
3. stage only the exact intended files;
4. never use `git add .`, `git add -A` or equivalent broad staging;
5. create the release-preparation commit using repository conventions;
6. confirm remote `main` has not moved incompatibly;
7. push only the preparation commit to `main` without force;
8. verify that remote `main` contains the exact preparation commit.

Release preparation must remain mechanically separate from product
implementation.

If product-code changes are required to make the release coherent, stop and
report `BLOCKED`.

Do not implement those fixes during release preparation.

## 10. Final release-preparation consistency review

After the preparation commit is present on remote `main`, perform a final
consistency review.

Verify at minimum:

- the requested version is correct;
- the release name follows the established family convention;
- the previous release boundary is correct;
- the preparation commit is the current remote `main`;
- all Issues presented as delivered are closed as `completed`;
- all included completed Issues are actually represented in the candidate;
- materially included completed Issues are not omitted from release
  traceability;
- open, duplicate, `not_planned`, pending or unrelated work is not presented as
  delivered;
- `CHANGELOG.md` accurately describes the delivered release;
- the prepared GitHub Release body is identical to the complete corresponding
  `CHANGELOG.md` release entry, excluding only the terminal separator used
  between changelog releases;
- both English and Spanish release blocks are present in the publication body;
- Issue traceability and Validation / Validación are present in the publication
  body;
- other modified release documentation is consistent;
- the mandatory documentation review covers the combined release;
- every relevant finding has been classified;
- every `UPDATE` is complete;
- accurate historical sources are preserved;
- post-publication and post-deployment facts have not been claimed
  prematurely;
- no `BLOCKED` documentation finding remains;
- validation evidence is represented accurately;
- checks claimed as executed were actually executed;
- no product scope was introduced during release preparation;
- the preparation commit contains only intended preparation changes;
- the proposed tag does not already exist;
- the corresponding GitHub Release does not already exist;
- production deployment has not occurred as part of preparation.

This is a release-package consistency review.

It is not a second functional approval of completed product Issues.

If any objective inconsistency remains, report `BLOCKED`.

## 11. Publication readiness gate

The release reaches `READY_FOR_PUBLICATION` when all of the following are true:

- delivered release scope has been established from repository evidence;
- all included product Issues are closed as `completed`;
- release documentation is reconciled;
- the mandatory release-relevant documentation review is complete;
- every relevant documentation finding is classified, every `UPDATE` is
  complete and no `BLOCKED` finding remains;
- `CHANGELOG.md` is complete;
- completed-Issue traceability is correct;
- publication metadata is prepared;
- the GitHub Release body matches the complete corresponding bilingual
  `CHANGELOG.md` release entry exactly, excluding only the terminal changelog
  separator;
- required release-preparation validation has passed;
- the preparation commit is present on remote `main`;
- the final release-preparation consistency review has passed;
- the release-preparation Issue is closed as `completed`;
- the proposed release tag does not exist;
- the GitHub Release does not exist;
- production deployment has not occurred as part of preparation.

The Release Preparer then reports:

```text
Status: READY_FOR_PUBLICATION
```

There is no additional functional approval gate between successful release
preparation and publication.

Completed product Issues already represent accepted delivered work.

## 12. Publication handoff

Release publication is always a separate explicit operation.

The Release Preparer must not invoke publication automatically.

After `READY_FOR_PUBLICATION`, publication may be handed off by explicitly
invoking the Release Publisher.

For example:

```text
Publish v0.7.4
```

constitutes authorization only for the narrow publication operations defined in
`agents/release-publisher.md`.

The Release Publisher remains responsible for:

- verifying publication preconditions;
- creating the immutable version tag;
- pushing the tag;
- creating the GitHub Release;
- verifying publication.

Release preparation does not authorize production deployment.

## 13. Actions outside release preparation

Release preparation must not:

- implement product functionality;
- change backend or frontend behavior;
- change API contracts;
- change persistence semantics;
- change consent semantics;
- change Session semantics;
- fix implementation defects;
- change unrelated documentation;
- rewrite accurate historical documentation as current;
- claim publication, deployment, production health, production feature
  validation or a new production version before that fact is established;
- use documentation reconciliation to choose product semantics or make a new
  product decision;
- add a post-deployment finalization phase;
- reopen completed product acceptance merely because work is entering a
  release;
- require a second functional PASS for completed Issues;
- create, move or publish Git tags;
- create or publish a GitHub Release;
- deploy to production;
- alter production runtime data or configuration;
- promote open or deferred Issues;
- close product Issues merely to make them release-eligible;
- close unrelated Issues;
- stage unrelated files;
- perform unrelated commits, merges or pushes.

An explicitly invoked Release Preparer may perform only the exact-path staging,
preparation commit and `main` push defined in `agents/release-preparer.md` for
the requested release.

It may close only the matching release-preparation Issue after successful
preparation.

An explicitly invoked Release Publisher may create and push the approved tag
and create the corresponding GitHub Release only according to
`agents/release-publisher.md`.

## 14. Failure handling

Report `BLOCKED` when any required release-preparation condition cannot be
verified or satisfied.

Examples include:

- release version missing or ambiguous;
- release name cannot be resolved from established repository evidence;
- previous published boundary cannot be determined;
- current `main` cannot be resolved;
- delivered release scope cannot be established;
- an Issue presented as delivered is not closed as `completed`;
- a completed Issue presented as delivered is not actually contained in the
  release candidate;
- open, duplicate, `not_planned`, deferred or unrelated work would need to be
  presented as delivered;
- release documentation materially contradicts delivered implementation;
- release-relevant documentation cannot be reconciled without a new product
  decision, resolution of conflicting semantics or a product-code change;
- accepted delivered evidence does not establish a required documentation
  correction unambiguously;
- documentation reconciliation would require nonexistent validation evidence or
  retroactive authorization to rewrite an accurate historical source;
- required implementation validation evidence is missing or materially
  inconsistent;
- product-code changes would be required during release preparation;
- a conflicting release-preparation Issue exists;
- the intended preparation diff contains unrelated changes;
- staging, commit, push or remote verification fails;
- remote `main` moves incompatibly;
- the release-preparation Issue cannot be recorded or closed correctly;
- the requested tag already exists;
- the corresponding GitHub Release already exists;
- another required preparation precondition cannot be verified.

Prefer `BLOCKED` over guessing.

Do not broaden scope, invent product decisions, invent validation evidence,
modify implementation code or publish artifacts to work around a failure.

## 15. Completion report

On successful preparation, report:

```text
Status: READY_FOR_PUBLICATION
Version: <version>
Release: <release name>
Previous boundary: <tag>
Preparation target: <main SHA before preparation>
Preparation issue: CLOSED — <URL>
Preparation commit: <commit SHA>
Remote main: <verified SHA>
Included Issues: <closed/completed Issues>
Documentation review: <classifications, updates and deferred findings>
Validation: <release-preparation checks and results>
Proposed tag: <tag>
Publication metadata: <release-notes/limitations summary>
Next action: Publish <version>
```

On failure, report:

```text
Status: BLOCKED
Failed step: <step>
Cause: <specific reason>
Repository state: <relevant state>
Preparation issue: <URL or not created>
Required action: <smallest required human/project action>
```

Do not report `READY_FOR_PUBLICATION` unless:

- release scope is established;
- all delivered Issues listed for the release are closed as `completed`;
- their implementation is actually contained in the release candidate;
- release documentation is complete and consistent;
- the preparation commit is verified on remote `main`;
- the release-preparation Issue is closed as `completed`;
- the proposed tag has not been published;
- the corresponding GitHub Release has not been published.
