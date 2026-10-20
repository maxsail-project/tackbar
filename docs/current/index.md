# Living Documentation — current specifications

**Status: ACTIVE from the Issue #119 Gate C cutover.** This index routes agents to the authoritative current functional specifications. [AGENTS.md](../../AGENTS.md) supplies operating safeguards and precedence; the [AI Development Guidelines](../ai-development-guidelines.md) supply stable engineering principles. Select only the domains affected by the task, including any cross-domain contract it changes.

Living Documentation describes TackBar's accepted current behavior by product domain. Each contract has one authoritative home, with links from other domains where needed. The eight specifications are:

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

- **Current specifications** state the accepted present functional product contract. An explicitly approved Issue may change an affected contract only through its scoped implementation and specification update. Qualified unresolved findings are not new guarantees.
- **Versioned requirements and decisions** remain at their existing paths as traceable records of delivered scope, prior rules and rationale. Their historical statements are not silently rewritten to describe later behavior.
- **Durable decisions or ADRs**, when warranted, preserve why a consequential choice was made. They should link to the current rule rather than duplicate its full functional contract.
- **GitHub Issues** describe pending proposals or an explicitly approved increment. An open Issue alone does not establish current behavior; a completed Issue supplies accepted-delivery evidence within its stated scope.
- **Code and tests** show implemented behavior and regression coverage. They help reconcile a specification but do not independently approve an undocumented product change.
- [CHANGELOG.md](../../CHANGELOG.md) records delivered releases; it is not a substitute for a current functional specification. Operational runbooks and release workflows retain their separate procedural roles.

The source references in each domain specification connect its rules to preserved historical documents and implementation evidence. Unresolved discrepancies remain visible for human review rather than becoming invented requirements.
