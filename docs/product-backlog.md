# TackBar Product Backlog

**Purpose:** Canonical inventory of unfinished TackBar work.

This document contains pending work only.

Delivered items are removed from this backlog. Historical delivery information belongs in implementation, tests, requirements, `CHANGELOG.md` and GitHub Releases where applicable.

Being listed here does not imply commitment to a specific release unless a release is explicitly assigned.

---

## Maintenance rules

`docs/product-backlog.md` is maintained only during explicitly authorized documentation work.

During reconciliation:

- remove delivered items;
- add concrete future work discovered during implementation when appropriate;
- merge duplicates;
- remove obsolete items;
- update items whose context/scope changed;
- preserve useful requirement references;
- do not invent priorities or release commitments.

If assignment is unresolved, keep the item unassigned or use the explicitly agreed release-family label.

---

# Product & collaborative debrief

## Individual personal Activity history/access

**Status:** Future  
**Release:** Unassigned

Consider My Activities and personal single-Activity viewing if future pilot evidence justifies them. Any access independent from shared Session lifetime requires a separate product/access decision.

---

## QR Session sharing

**Status:** Future  
**Release:** Unassigned

Allow a Session capability URL to be shared using a QR code.

The QR MUST represent the existing capability URL and MUST NOT introduce a separate authorization mechanism.

---

## Saved Analysis Segments

**Status:** Future  
**Release:** Unassigned  
**Origin:** `docs/session-viewer-requirements.md`

Allow an ephemeral Analysis Window to be persisted as a named segment.

Potential uses include races, legs, exercises or manually selected relevant intervals. Detailed semantics must be defined when promoted.

---

# Consent, privacy & access

## Web consent flow

**Status:** Future  
**Release:** Unassigned

Replace or complement the human-operated PoC consent workflow with a dedicated web flow such as `/consent/<token>`.

Expected direction includes high-entropy token, explicit acceptance, agreement version, token expiry, idempotent processing and structured consent-event history.

---

## Automatic consent reply processing

**Status:** Future  
**Release:** Unassigned

Allow TackBar to detect deterministic consent replies received by email and record the corresponding consent transition automatically.

Do not rely on free-form AI/NLP interpretation of arbitrary consent text unless explicitly decided later.

---

## Data deletion / anonymization workflow

**Status:** Future  
**Release:** Unassigned

Define operational handling of personal data after withdrawal or applicable retention periods.

Topics include physical deletion, anonymization, derived data, retention, backups/restore and participant data-right requests.

This remains separate from ACTIVE-only shared visibility and from administrative ingestion Discard/Restore.

---

# Ingestion & email operations

## OVHcloud mailbox ingestion

**Status:** Planned  
**Release:** v0.6.1

Replace Gmail as the operational production mailbox with `share@tackbar.eu`, hosted on OVHcloud Zimbra and accessed through IMAP over TLS.

The adapter must feed the existing provider-independent `InboundEmail` and downstream ingestion pipeline without changing Sailor, Activity, Session, consent, deduplication, Admin or Viewer semantics.

Production v0.6.1 uses OVHcloud as the configured mailbox provider; simultaneous Gmail + OVHcloud production acquisition is not required. The Gmail adapter may remain available for compatibility or rollback.

The validated mailbox access profile is `imap.mail.ovh.net:993` using non-interactive runtime-configured credentials. Remote unread/seen flags are not TackBar processing state.

Detailed scope and acceptance criteria: `docs/v0.6.1-ovh-mailbox-ingestion-requirements.md` and `docs/v0.6.1-decisions.md`.

---

## Canonical track fingerprint

**Status:** Planned  
**Release:** v0.7.0

Define logical duplicate detection after TackBar track normalization as part of multi-format ingestion, while retaining existing raw attachment SHA-256 for exact-file deduplication.

Direction:

- GPX/VKX/FIT inputs converge on one canonical normalized track model;
- define minimum canonical fields for logical identity;
- SOG and COG are expected in the minimum navigation baseline;
- define deterministic derivation when a source does not provide SOG/COG directly;
- HEEL and TRIM remain optional;
- do not invent missing sensor values;
- do not derive HDG from COG;
- freeze deterministic serialization/versioning only after representative multi-format validation;
- preserve Sailor-scoped duplicate identity.

---

## Automatic mailbox polling

**Status:** Future  
**Release:** Unassigned

Run mailbox ingestion automatically without administrator interaction.

The current pilot baseline remains manual Admin-triggered mailbox review.

Future design should consider provider adapters, polling interval, pagination, locking, retry policy and observability.

---

## Automatic outbound email

**Status:** Future  
**Release:** Unassigned

Automate selected outgoing TackBar emails, potentially including consent/invitation requests, processed Activity/Session links and Personal TackBar links.

Exact provider scopes, threading and sending mechanism must be decided before implementation.

---

## Additional email providers

**Status:** Future  
**Release:** Unassigned

Evaluate additional provider adapters after the Gmail/OVH baseline when real operation justifies them.

Provider-specific acquisition must preserve the common ingestion boundary.

---

# Activity sources & formats

## GPX ingestion

**Status:** Planned  
**Release:** v0.7.0

Add GPX as the first new file format in the multi-format ingestion release.

GPX must converge on the same provider-independent TackBar Activity and normalized track model.

---

## VKX ingestion

**Status:** Planned  
**Release:** v0.7.0

Add VKX after GPX has been integrated and validated.

VKX must converge on the same canonical TackBar track model without automatically expanding analytics scope.

---

## FIT ingestion

**Status:** Planned  
**Release:** v0.7.0

Add FIT after VKX has been integrated and validated.

FIT file support remains separate from future Garmin Connect integration.

---

## Additional containers

**Status:** Future  
**Release:** Unassigned

Evaluate additional containers around supported formats, including VKX.GZ, ZIP and ZIP containing one or more supported sailing files.

Archive safety, deterministic extraction and deduplication interaction must be defined when promoted.

---

## Garmin Connect integration

**Status:** Future  
**Release:** Unassigned

Evaluate official Garmin Connect / Activity API integration.

Target direction:

```text
Garmin → cloud integration → TackBar normalized track → Activity → existing Session flow
```

Garmin-specific acquisition must not redefine downstream Activity, Session or Viewer semantics.

---

## Other activity sources

**Status:** Future  
**Release:** Unassigned

Potential sources include direct Vakaros integration, Intervals.icu, Strava and other sailing devices/platforms.

Add concrete entries when one becomes an actual product candidate.

---

# Session operations

## Session maintenance usability

**Status:** Future  
**Release:** Future 0.6.x

Improve routine Admin presentation/filtering around existing Session lifetime and capability operations without changing Session semantics.

Direction:

- clearer active/expired operational status;
- preserve renew, capability copy, regeneration and revocation;
- preserve existing Session matching and shared-access rules.

The deterministic newest-sailing-first Admin Session ordering delivered for Mahon is not pending work and is therefore not part of this backlog item.

Broader usability work is outside `v0.6.0 Mahon — Pilot Operations`, is not assigned to v0.6.1, and is not automatically assigned to v0.7.0. A concrete v0.6.x version will be chosen only if/when this work is promoted.

---

# Sailing analytics

## Start analysis

**Status:** Future  
**Release:** Unassigned

Introduce sailing-start analysis when product validation justifies it.

---

## Sailing leg detection

**Status:** Future  
**Release:** Unassigned

Identify relevant sailing legs or intervals without redefining Activity as a race or leg.

---

## Tactical event identification

**Status:** Future  
**Release:** Unassigned

Identify meaningful tactical events suitable for collaborative debriefing.

---

## Distance gained / lost

**Status:** Future  
**Release:** Unassigned

Provide meaningful gained/lost comparison between boats over a selected period. Detailed sailing semantics must be defined before implementation.

---

## Automatic relevant debrief moments

**Status:** Future  
**Release:** Unassigned

Detect moments that may deserve attention during post-sailing debrief, evolving from validated sailing-domain rules rather than speculative feature depth.

---

# Platform & operations

## Production packaging

**Status:** Future  
**Release:** Unassigned

Prepare a simple deployable runtime, potentially including Docker, Docker Compose, reverse proxy, persistent volume/data directory and runtime secrets.

Do not introduce infrastructure complexity beyond demonstrated PoC needs.

---

## Domain and HTTPS

**Status:** Future  
**Release:** Unassigned

Configure or maintain public domain and HTTPS for the deployed TackBar pilot as operational needs require.

---

## Backup and restore

**Status:** Future  
**Release:** Unassigned

Define and validate backup/restore for metadata JSON, normalized tracks, original attachments, consent history and ingestion history.

A backup solution is not complete until restore has been tested.

---

## Monitoring

**Status:** Future  
**Release:** Unassigned

Add lightweight availability and health monitoring appropriate for the PoC.

---

## CI/CD

**Status:** Future  
**Release:** Unassigned

Introduce automated build/test/deployment workflows when deployment maturity justifies them, while keeping Git/release control consistent with repository safety rules.

---

# Technical evolution

## Persistence robustness

**Status:** Future / evidence-driven  
**Release:** Unassigned

Review persistence when demonstrated operational needs appear, including concurrent writers, lost updates, interrupted JSON writes, atomic multi-entity operations, complex queries or unacceptable measured latency.

Do not migrate to a database solely because the number of Activities grows.

---

## Database migration

**Status:** Conditional  
**Release:** Unassigned

Evaluate SQLite or another persistence model only when current JSON/filesystem storage demonstrates requirements that justify database behavior.

This is not currently a committed migration.

---

# Commercial / product evolution

## Session lifetime and plans

**Status:** Future  
**Release:** Unassigned

The current shared Session lifetime is a PoC rule.

Future product models may differentiate availability/history duration between plans, clubs or other usage models. No pricing or plan structure is currently defined.

---

# Backlog review

When explicitly authorized, this backlog should be reconciled during final release/increment sanity checks.

A reconciliation should answer:

1. Which backlog items were delivered and must be removed?
2. Did implementation create concrete new future work?
3. Are entries duplicated or obsolete?
4. Did any item acquire enough definition to move into release requirements?
5. Are references to originating requirements still useful and correct?
