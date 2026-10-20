# Living Documentation — proposed index

**Status: transitional Phase B draft, pending human Gate B acceptance.** These documents are being reviewed under [Issue #119](https://github.com/maxsail-project/tackbar/issues/119). They are not yet TackBar's authoritative documentation hierarchy. Until Phase C is approved and activated, [AGENTS.md](../../AGENTS.md), the [AI Development Guidelines](../ai-development-guidelines.md), and the applicable existing requirements and decisions retain their current precedence.

Living Documentation is intended to describe TackBar's accepted current behavior by product domain. Each contract should have one authoritative home, with links from other domains where needed. The eight domain drafts are:

| Domain specification | Responsibility |
| --- | --- |
| [Domain and Sessions](domain-and-sessions.md) | Sailor, Boat, Activity and Session meaning; membership, matching and lifetime |
| [Ingestion and Data](ingestion-and-data.md) | Email acquisition, formats, normalization, exact-file deduplication, processing and persistence |
| [Access and Consent](access-and-consent.md) | Consent, shared visibility, purpose-specific capabilities and temporary access |
| [Session Viewer](session-viewer.md) | Activity selection, Analysis Window, map, charts and replay |
| [Analytics](analytics.md) | Maneuver detection, analytical measures and artifacts |
| [Personal TackBar](personal-tackbar.md) | Personal Session history, search, presentation and opening |
| [Admin](admin.md) | Operational navigation, inspection, maintenance and administrative presentation |
| [Session Context](session-context.md) | Session-owned geographic and historical weather/marine acquisition, persistence and availability |

## Evidence and document roles

- **Current specifications**, once the hierarchy is activated, will state the accepted present product contract. During this transition, a drafted specification is a review artifact and does not override existing instructions or requirements.
- **Versioned requirements and decisions** remain at their existing paths as traceable records of delivered scope, prior rules and rationale. Their historical statements are not silently rewritten to describe later behavior.
- **Durable decisions or ADRs**, when warranted, preserve why a consequential choice was made. They should link to the current rule rather than duplicate its full functional contract.
- **GitHub Issues** describe pending proposals or an explicitly approved increment. An open Issue alone does not establish current behavior; a completed Issue supplies accepted-delivery evidence within its stated scope.
- **Code and tests** show implemented behavior and regression coverage. They help reconcile a specification but do not independently approve an undocumented product change.
- [CHANGELOG.md](../../CHANGELOG.md) records delivered releases; it is not a substitute for a current functional specification. Operational runbooks and release workflows retain their separate procedural roles.

The source references in each current-domain draft connect its rules to preserved historical documents and implementation evidence. Unresolved discrepancies must remain visible for human review rather than being converted into new requirements.
