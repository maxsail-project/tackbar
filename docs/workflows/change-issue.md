# Start or resume a TackBar Issue

Use this procedure as an analysis and review assistant for an existing Issue, a partially delivered Issue, a small group of related Issues, or a proposed new Issue. Start with evidence and a recommendation. Invoking this workflow grants no authority to implement, change Issues, use Git, publish, or deploy. The shared method is in the [collaboration playbook](../playbook.md); [AGENTS.md](../../AGENTS.md) governs authority and safeguards.

## 1. Reconstruct the actual baseline

Read the current Issue and relevant comments, including decisions, authorizations, reconciliations, and acceptance. Check the current branch, HEAD, working tree, delivered commits, affected implementation and tests, and CI on the relevant SHA where available. Follow the [repository reading route](../../AGENTS.md#instruction-hierarchy-and-reading-route) through the [current specification index](../current/index.md); use historical sources only for a specific provenance or discrepancy question. Separate delivered work from pending scope, and implementation from reported validation, independent verification, human acceptance, Issue closure, release, and deployment. Preserve a verifiable increment sequence rather than reconstructing it from scratch.

For related Issues, identify real dependencies while keeping each Issue's scope, decisions, and acceptance distinct. Record evidence that could not be inspected and any access or permission limits. Verify session capabilities before relying on them.

## 2. Identify the next decision or increment

Summarize the confirmed baseline, genuinely pending work, closed decisions, open decisions, material conflicts or risks, and the next coherent step. Mark reported, assumed, or proposed claims where they could be mistaken for verified facts. Number material open decisions (D1, D2, …), recommend an option, and explain its trade-offs. Do not reopen approved decisions without new evidence or turn an adjacent backlog item into scope. Stop before implementation instructions if a governing source conflicts or a material product decision is missing.

## 3. Prepare in proportion to risk

Distinguish a small correction, a bounded functional increment, and a change to contracts, integrations, permissions, or architecture. Estimate Low, Medium, or High impact using the [Issue form](../../.github/ISSUE_TEMPLATE/change.yml); the implementation prompt fixes the increment's impact. Use scenarios, state tables, inputs and outputs, or observable behavior when they clarify acceptance. Apply the [playbook's preparation gate](../playbook.md#shape-an-issue-and-pass-the-preparation-gate) without requiring a formal notation or extra architecture by default.

## 4. Draft or refine an Issue

For a new or revised Issue, use the current [Product / Engineering Increment form](../../.github/ISSUE_TEMPLATE/change.yml), or the relevant specialist procedure. Distinguish problem and evidence, goal, delivered baseline, proposed scope and exclusions, constraints, closed and open decisions, acceptance, impact, validation, and the form's documentation-impact classifications. State early uncertainty explicitly; do not present it as a verified baseline or as ready for implementation. Follow the form and [playbook](../playbook.md#shape-an-issue-and-pass-the-preparation-gate) for title, labels, release subtitle when applicable, and post-creation metadata checks. `Ready for implementation` is a definition state, not authorization. Create or update an Issue only when expressly authorized; if the owner has already asked to create a clear Issue, proceed without an extra draft round.

## 5. Hand off a defined increment

After the specific delta is approved and the preparation gate passes, write a compact, source-referenced development handoff. Cite the Issue and governing sources; state the increment, verified baseline, delta, critical constraints, authorized documentation, proportional checks, and evidence to report. Include `Impact`, `Recommended development model/tool` with model and effort, `Test strategy`, and `Full regression`, plus a suggested English Conventional Commit with `Ref: #N`. The [playbook](../playbook.md#hand-off-a-bounded-increment) explains the handoff; [AGENTS.md](../../AGENTS.md#issue-scoped-continuous-delivery-mode) owns any binding model and effort requirement in continuous mode. Avoid copying the Issue or prescribing unnecessary internal steps.

## 6. Respect responsibilities and evidence

The product owner decides scope, authorizes work, and accepts the result. The development agent implements the approved increment and reports checks; independent review evaluates the diff and evidence. Follow [AGENTS.md](../../AGENTS.md#git-release-and-production-safety) for ordinary Git control and its [Issue-scoped continuous mode](../../AGENTS.md#issue-scoped-continuous-delivery-mode) only when explicitly authorized for that Issue. Specialist release and operations roles retain their existing authority. Keep implementation, testing, acceptance, publication, and deployment distinct. Report checks or access that could not be completed; technical capability alone does not grant permission.

## 7. Begin with an evidence-based diagnosis

At invocation, report the actual state, pending scope, decisions needing resolution, and one recommended next step. Do not automatically prepare an implementation prompt or execute changes. If the increment is already defined and approved, say so and identify the applicable delivery mode and any authorization or evidence still needed. Continue an established sequence without inventing a new debate.

Reusable invocation:

> Use `docs/workflows/change-issue.md` for TackBar Issue `#N` (or this proposed problem: `…`). Start with a read-only diagnosis and recommend the next decision or increment.
