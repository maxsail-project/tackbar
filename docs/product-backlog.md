# TackBar Product Backlog

**Purpose:** Canonical inventory of unfinished TackBar work.

This document contains pending work only.

Delivered items are removed from this backlog. Historical delivery information belongs in the implementation, tests, release requirements, `CHANGELOG.md` and GitHub Releases where applicable.

Being listed here does not imply commitment to a specific release unless a release is explicitly assigned.

---

## Maintenance rules

`docs/product-backlog.md` is maintained as part of explicit documentation work.

Agents MUST NOT modify this backlog opportunistically during unrelated implementation tasks.

The backlog MAY be updated when the current task explicitly requests documentation maintenance, backlog reconciliation, release review, or a final sanity check that includes documentation changes.

During an authorized backlog reconciliation:

- remove items that are now delivered;
- add concrete future work discovered during implementation;
- merge duplicates;
- remove obsolete items;
- update items whose context or scope changed;
- preserve references to source requirements when useful;
- do not invent priorities, release assignments or product commitments that have not been decided.

During implementation tasks that do not authorize documentation changes, agents SHOULD report newly discovered backlog candidates in the completion summary instead of modifying this file.

If it is unclear whether something belongs in the backlog, report it for review rather than adding it automatically.

---

# Product & collaborative debrief

## Personal TackBar / My Activities

**Status:** Near-term  
**Release:** v0.6.0

Provide a stable read-only personal space for an ACTIVE Sailor containing their Activity history.

Direction:

- personal capability URL without Sailor login;
- list personal Activities;
- link to the associated shared Session while available;
- show expired/unavailable Session state when appropriate;
- personal Activity history remains available independently from shared Session lifetime.

---

## Visual brand consolidation

**Status:** Near-term  
**Release:** v0.6.0

Establish a coherent TackBar visual identity across the application and public website.

Direction:

- official TackBar logo system;
- explicit core color palette;
- consistent brand use in new Personal TackBar UI and existing public-facing surfaces;
- preserve the current mobile-first product usability.

---

## QR Session sharing

**Status:** Future  
**Release:** Unassigned

Allow a Session capability URL to be shared using a QR code.

The QR MUST represent the same capability URL used by normal shared Session access. It must not introduce a separate authorization mechanism.

---

## Saved Analysis Segments

**Status:** Future  
**Release:** Unassigned  
**Origin:** `docs/session-viewer-requirements.md` — Saved Segment concept

Allow an ephemeral Analysis Window to be persisted as a named segment.

Potential uses include races, legs, exercises or manually selected relevant intervals.

Detailed semantics should be defined when promoted into a release.

---

# Consent, privacy & access

## Web consent flow

**Status:** Future  
**Release:** Unassigned

Replace or complement the human-operated PoC consent workflow with a dedicated web flow such as:

`/consent/<token>`

Expected direction:

- high-entropy token;
- explicit acceptance action;
- agreement version;
- token expiry;
- idempotent processing;
- structured consent event history.

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

Topics to resolve include:

- physical deletion;
- anonymization;
- derived/aggregated data;
- operational retention;
- restore/backups;
- participant data-right requests.

This is separate from immediate ACTIVE-only shared visibility enforcement and from administrative ingestion discard/restore.

---

# Ingestion & email operations

## Admin ingestion classification and filtering

**Status:** Near-term  
**Release:** v0.6.0

Add an administrative disposition separate from technical ingestion status (`processed` / `failed`).

Direction:

- `active` / `discarded`;
- semantic **Discard** and **Restore** actions;
- discarded records remain retained and known to deduplication;
- filtering by technical status and administrative disposition.

Discarding does not physically delete or roll back Activities, Sessions, originals, consent or capabilities.

---

## Multi-provider email ingestion

**Status:** Near-term  
**Release:** v0.6.0

Keep Gmail supported and add the TackBar mailbox hosted at OVHcloud.

Both providers must remain adapters over the same provider-independent ingestion pipeline.

The concrete OVHcloud mailbox access mechanism should be selected after validating the actual mailbox service.

---

## Canonical track fingerprint

**Status:** Planned  
**Release:** v0.7.0

Define logical duplicate detection after TackBar track normalization as part of
the multi-format ingestion work, while retaining the existing raw attachment
SHA-256 for exact-file deduplication.

The fingerprint/hash contract must be designed together with the canonical
multi-format track representation rather than frozen around the current
single-format baseline.

Direction:

- supported GPX/VKX/FIT inputs converge on one canonical normalized track model;
- define the minimum canonical fields used for logical duplicate identity;
- SOG and COG are expected to be part of the minimum navigation baseline;
- v0.7 must define how SOG and COG are obtained during normalization when a
  source format does not provide them directly;
- HEEL and TRIM remain optional when the source does not provide them;
- do not invent missing sensor values;
- do not derive HDG from COG;
- freeze deterministic serialization/versioning only after the v0.7
  normalization contract is understood and regression-tested;
- preserve Sailor-scoped duplicate identity.

---

## Automatic mailbox polling

**Status:** Future  
**Release:** Unassigned

Run mailbox ingestion automatically without administrator interaction.

The current pilot baseline remains manual Admin-triggered mailbox review.

When implemented, consider:

- multiple providers;
- configurable polling interval;
- pagination / candidate discovery;
- execution locking;
- retry policy;
- operational observability.

---

## Automatic outbound email

**Status:** Future  
**Release:** Unassigned

Automate selected outgoing TackBar emails.

Potential initial cases:

- consent/invitation request;
- processed Activity / Session link;
- Personal TackBar access link.

Exact provider scopes, threading and sending mechanism must be decided before implementation.

---

## Additional email providers

**Status:** Future  
**Release:** Unassigned

Evaluate additional provider adapters after the Gmail + OVHcloud baseline when real operation justifies them.

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
**Origin:** existing ingestion discussions

Evaluate additional containers around supported formats, including:

- VKX.GZ;
- ZIP;
- ZIP containing one or more supported sailing files.

Archive safety, deterministic extraction and interaction with deduplication must be defined when promoted.

---

## Garmin Connect integration

**Status:** Future  
**Release:** Unassigned

Evaluate official Garmin Connect / Activity API integration.

Target direction:

`Garmin → cloud integration → TackBar normalized track → Activity → existing Session flow`

Garmin-specific acquisition must not redefine downstream Activity, Session or Viewer semantics.

---

## Other activity sources

**Status:** Future  
**Release:** Unassigned

Potential sources include:

- direct Vakaros integration;
- Intervals.icu;
- Strava;
- other sailing devices/platforms.

Add concrete entries when one becomes an actual product candidate.

---

# Session operations

## Session maintenance usability

**Status:** Near-term  
**Release:** v0.6.0

Improve routine Admin maintenance of existing Session lifetime and capability operations without changing Session semantics.

Direction:

- clearer active/expired operational status;
- preserve renew, capability copy, regeneration and revocation;
- preserve existing Session matching and shared-access rules.

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

Provide meaningful gained/lost comparison between boats over a selected period.

Detailed sailing semantics must be defined before implementation.

---

## Automatic relevant debrief moments

**Status:** Future  
**Release:** Unassigned

Detect moments that may deserve attention during post-sailing debrief.

This must evolve from validated sailing-domain rules rather than speculative feature depth.

---

# Platform & operations

## Production packaging

**Status:** Future  
**Release:** Unassigned

Prepare a simple deployable runtime.

Likely areas:

- Docker;
- Docker Compose;
- reverse proxy;
- persistent volume/data directory;
- runtime secrets.

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

Define and validate backup/restore for:

- metadata JSON;
- normalized tracks;
- original attachments;
- consent history;
- ingestion history.

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

Introduce automated build/test/deployment workflows when deployment maturity justifies them.

Keep Git/release control consistent with repository safety rules.

---

# Technical evolution

## Persistence robustness

**Status:** Future / evidence-driven  
**Release:** Unassigned

Review persistence when demonstrated operational needs appear.

Possible triggers include:

- concurrent writers;
- lost updates;
- interrupted JSON writes;
- need for atomic multi-entity operations;
- materially complex queries;
- unacceptable measured persistence latency.

Do not migrate to a database solely because the number of Activities grows.

---

## Database migration

**Status:** Conditional  
**Release:** Unassigned

Evaluate SQLite or another persistence model only when current JSON/filesystem storage demonstrates requirements that justify database behavior.

This is not currently a committed migration.

---

# Project governance & licensing

## MPL 2.0 transition

**Status:** Near-term  
**Release:** v0.6.0

Transition TackBar's own public source code from MIT to MPL-2.0.

The transition covers the TackBar application and public website, preserves applicable third-party notices and does not rewrite historical MIT releases.

---

# Commercial / product evolution

## Session lifetime and plans

**Status:** Future  
**Release:** Unassigned

The current shared Session lifetime is a PoC rule.

Future product models may differentiate availability/history duration between plans, clubs or other usage models.

No pricing or plan structure is currently defined.

---

# Backlog review

When explicitly authorized, this backlog should be reconciled during final release/increment sanity checks.

A reconciliation should answer:

1. Which backlog items were delivered and must be removed?
2. Did the implementation create concrete new future work?
3. Are any entries duplicated or obsolete?
4. Did any item acquire enough definition to move into release requirements?
5. Are references to originating requirements still useful and correct?
