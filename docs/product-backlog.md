# TackBar Product Backlog

**Purpose:** Canonical inventory of unfinished TackBar work.

This document contains pending work only.

Delivered items are removed from this backlog. Historical delivery information belongs in the implementation, tests, release requirements, `CHANGELOG.md` and GitHub Releases where applicable.

Being listed here does not imply commitment to a specific release.

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
**Release:** Unassigned

Provide a stable personal space for an ACTIVE Sailor containing their Activity history.

Expected direction:

- stable personal access URL;
- list personal Activities;
- new Activities appear automatically;
- Activity may link to its associated shared Session while that Session is active;
- when the associated Session has expired, show `Session expired`;
- personal Activity history does not expire merely because the shared Session reaches its 60-day lifetime.

Exact personal-access security/capability semantics remain to be decided.

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

This is separate from immediate ACTIVE-only shared visibility enforcement.

---

# Ingestion & email operations

## Automatic Gmail polling

**Status:** Future  
**Release:** Unassigned

Run mailbox ingestion automatically without administrator interaction.

Current v0.5 baseline remains manual Admin-triggered mailbox review.

When implemented, consider:

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
- processed Activity / Session link.

Exact Gmail scopes, threading and sending mechanism must be decided before
implementation.

---

## Email provider evolution

**Status:** Future  
**Release:** Unassigned

Evaluate alternatives to the Gmail-specific PoC adapter while preserving the
provider-independent ingestion boundary.

Possible future directions include another provider API or IMAP-based adapters.

---

# Activity sources & formats

## Vakaros additional formats

**Status:** Future  
**Release:** Unassigned  
**Origin:** existing roadmap / ingestion discussions

Evaluate additional Vakaros representations and containers:

- VKX;
- VKX.GZ;
- ZIP;
- ZIP containing one or more supported sailing files.

Questions to resolve include:

- multiple valid files inside one ZIP;
- richer VKX-specific information;
- canonical normalized fields;
- logical deduplication across equivalent formats.

---

## GPX ingestion

**Status:** Future  
**Release:** Unassigned

Add GPX as an additional file-based source.

GPX must converge on the same provider-independent TackBar Activity and
normalized track model.

---

## Garmin Connect integration

**Status:** Future  
**Release:** Unassigned

Evaluate official Garmin Connect / Activity API integration.

Target direction:

`Garmin → cloud integration → TackBar Activity → existing Session flow`

Garmin-specific acquisition must not redefine downstream Activity, Session or
Viewer semantics.

---

## Other activity sources

**Status:** Future  
**Release:** Unassigned

Potential sources include:

- FIT;
- direct Vakaros integration;
- Intervals.icu;
- Strava;
- other sailing devices/platforms.

Add concrete entries when one becomes an actual product candidate.

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

Identify relevant sailing legs or intervals without redefining Activity as a
race or leg.

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

This must evolve from validated sailing-domain rules rather than speculative
feature depth.

---

# Platform & operations

## EU VPS deployment

**Status:** Near-term infrastructure  
**Release:** Unassigned

Deploy TackBar runtime and private pilot data on an EU-hosted VPS.

Runtime personal data, tracks, originals, metadata, relevant logs and backups
should remain within the selected EU hosting perimeter, subject to explicitly
accepted PoC exceptions.

---

## Production packaging

**Status:** Future  
**Release:** Unassigned

Prepare a simple deployable runtime.

Likely areas:

- Docker;
- Docker Compose;
- reverse proxy;
- HTTPS;
- persistent volume/data directory;
- runtime secrets.

Do not introduce infrastructure complexity beyond demonstrated PoC needs.

---

## Domain and HTTPS

**Status:** Future  
**Release:** Unassigned

Configure public domain and HTTPS for the deployed TackBar pilot.

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

Introduce automated build/test/deployment workflows when deployment maturity
justifies them.

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

Evaluate SQLite or another persistence model only when current JSON/filesystem
storage demonstrates requirements that justify database behavior.

This is not currently a committed migration.

---

# Commercial / product evolution

## Session lifetime and plans

**Status:** Future  
**Release:** Unassigned

The current shared Session lifetime is a PoC rule.

Future product models may differentiate availability/history duration between
plans, clubs or other usage models.

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