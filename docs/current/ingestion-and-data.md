# Ingestion and Data — transitional current-product draft

**Status: Phase B2 review draft.** This document consolidates accepted current behavior; it does not activate a new documentation hierarchy. Until Phase C is approved and activated, the precedence described in the [Living Documentation index](index.md) remains in force.

The **Current contract** below states product and operational guarantees. The **Provenance and review** section identifies supporting evidence and gaps; it does not add requirements.

## Current contract

### Email acquisition and identity

- Email is the supported track-sharing channel. Production acquires inbound mail from the configured OVHcloud mailbox over IMAP/TLS. Automatic scheduled review is the normal trigger; Admin **Review mailbox now** remains a manual fallback. Both use the same downstream ingestion service.
- The outer email sender is the email identity used to resolve the Sailor. A forward sent by another person uses that forwarder's outer address; TackBar does not recover an original sender from forwarded headers. The subject is informational and does not determine Sailor, Boat, Activity or Session identity.
- Each candidate has a provider identity and stable provider-message ID. For OVH, that ID includes the mailbox `UIDVALIDITY` and message UID. The pair `provider + provider_message_id` identifies an ingestion record; it is distinct from the sender, attachment, Activity and Session identities.
- A message with exactly one supported track attachment can enter the track pipeline. A message with multiple supported attachments is rejected as ambiguous; an unsupported or malformed message does not silently create an Activity. The supported attachment formats are `.csv`, `.csv.gz`, `.vkx` and `.vkx.gz`.
- Historical Gmail ingestion records remain readable and can be explicitly reprocessed from their preserved originals. Gmail acquisition and OAuth are no longer part of the current runtime mailbox path.

### Normalized Activity data

- Supported Vakaros CSV and VKX attachments are parsed, then normalized into a common provider-independent track model. A valid track supplies UTC time, latitude and longitude; unavailable optional telemetry remains absent rather than being invented.
- The current normalized track schema contains `activity_id`, `utc`, `lat`, `lon`, `cog`, `sog`, `dist`, `hdg`, `heel`, `trim`, `quat_w`, `quat_x`, `quat_y` and `quat_z`. The four quaternion fields preserve available VKX orientation data. Historical normalized tracks without those fields remain readable, with absent quaternion values treated as null.
- VKX-derived HDG, HEEL and TRIM require unambiguous evidence that the device was fixed to the body frame. When that condition is not met, those derived values remain absent. HDG is not inferred from COG. This does not imply support for GPX, FIT or a logical cross-format track identity.

### Processing, deduplication and persistence

- The common pipeline records the ingestion attempt, preserves the received original, parses and normalizes the track, resolves or creates the Sailor, creates or reuses an Activity, persists its normalized track and associates it with a Session through the existing matching service. An Activity requires a Sailor; consent state does not prevent technical ingestion or matching. [Domain and Sessions](domain-and-sessions.md) owns Activity and Session meaning and matching rules.
- Re-reviewing an already processed `provider + provider_message_id` does not process that message into another Activity. A different provider message may contain the same attachment: within one Sailor, the SHA-256 of the **received attachment bytes** identifies an existing Activity for reuse. This is an exact-file boundary. Different bytes, including differently encoded or compressed copies of the same samples, are not declared the same Activity by logical track comparison.
- Activity reuse does not imply that the later ingestion failed or was discarded. Ingestion history distinguishes an Activity newly created by that ingestion, one reused from earlier processing, and legacy/unknown provenance. Session membership and matching are separate from both message and file deduplication.
- TackBar retains JSON ingestion/domain metadata, the received original file and the normalized Activity track under private backend-managed storage. The normalized track is persisted as compressed CSV; historical normalized tracks remain readable. The frontend accesses data through backend APIs, not the storage files. Session expiry does not itself delete Activities or originals; see [Domain and Sessions](domain-and-sessions.md).

### Processing state, mailbox cursor and failure boundaries

- An ingestion has a technical `processed` or `failed` status, an attempt count, a last-attempt timestamp and a controlled last error. Its separate administrative disposition is `active` or `discarded`. Discard and restore change administrative disposition without undoing processing, deduplication, Activity/Session links or preserved originals. Restore does not automatically reprocess. Physical deletion requires a separately defined policy and workflow; it is not an ingestion-maintenance action.
- Known failed provider messages are not automatically retried by ordinary mailbox review. Admin may explicitly reprocess an ingestion when its original attachment is available; an absent original is recorded as a controlled failure. Reprocessing remains subject to exact-file Activity idempotency. A failed attempt may have left partial domain side effects, so the status alone must not be read as proof that no Activity or Session exists.
- OVH acquisition uses a persisted `UIDVALIDITY`/UID cursor to resume review. Unsupported, malformed and downstream-failed messages can count as examined and advance that cursor. A provider fetch failure preserves only the safely examined prefix; a changed `UIDVALIDITY` fails review rather than silently reusing the prior UID cursor. Mailbox `Seen`/`Unread` flags are not TackBar processing, retry or disposition state.
- Provider connection or authentication failures surface as mailbox-review failures without changing ingestion records for unfetched messages. Failure reporting must not disclose credentials or private track content. A failure while processing one candidate does not prevent review of later candidates when acquisition can continue.
- Geographic or historical context enrichment for a new Session and eager analytical artifact generation are best-effort follow-up work: their failure does not turn an otherwise completed track ingestion into a failed one. Their product semantics belong in [Session Context](session-context.md) and [Analytics](analytics.md).

### Onboarding and delivery state at the ingestion boundary

- A first supported track can create or resolve a Sailor and proceed through Activity creation and Session matching while that Sailor is `PENDING`. A successful qualifying track can initiate the consent-request workflow. Consent authorization, message eligibility and shared visibility belong in [Access and Consent](access-and-consent.md).
- For Session-result email, ingestion history records whether a newly created Activity is a delivery candidate and persists an attempt before outbound sending. A controlled send failure is recorded as a failed attempt; ordinary reprocessing or Activity reuse does not create a duplicate delivery attempt. Recipient eligibility and consent rules belong in [Access and Consent](access-and-consent.md).

### Ownership boundaries

- [Domain and Sessions](domain-and-sessions.md) owns Sailor, Boat, Activity and Session definitions, matching and lifetime. This document owns acquisition, normalization, exact-file deduplication, ingestion state and data persistence.
- [Access and Consent](access-and-consent.md) owns consent, capabilities and ACTIVE-only authorization. [Admin](admin.md) owns Admin interactions. The [production runbook](../production-runbook.md) owns credentials, service commands, deployment and operational recovery instructions.

## Provenance and review

| Contract area | Preserved source or accepted delta | Implementation and focused test evidence |
| --- | --- | --- |
| Email and OVH identity | [v0.5 pilot requirements](../v0.5-real-sailing-pilot-requirements.md), §4 V5-ING-01/05; [v0.6.1 OVH requirements](../v0.6.1-ovh-mailbox-ingestion-requirements.md), §§2–4 V6.1-ING/REV; [v0.6.1 decisions](../v0.6.1-decisions.md), §§2–4; [v0.7 decisions](../v0.7-decisions.md), §11; [completed #9](https://github.com/maxsail-project/tackbar/issues/9) | `backend/app/email_providers/ovh.py`, `backend/app/services/mailbox_review.py`; `backend/tests/test_mailbox_review.py` |
| Automatic review and cursor | [Mailbox operations decisions](../mailbox-operations-decisions.md), §§Automatic review is the normal trigger, Mailbox acquisition and processing state; [completed #7](https://github.com/maxsail-project/tackbar/issues/7), [#8](https://github.com/maxsail-project/tackbar/issues/8) and [#4](https://github.com/maxsail-project/tackbar/issues/4) | `backend/app/services/mailbox_review.py`, `backend/app/services/ovh_mailbox_cursor.py`; `backend/tests/test_mailbox_review.py`, `test_ovh_mailbox_cursor.py` |
| Formats and normalized data | [v0.7 requirements](../v0.7-collaborative-debrief-analytics-requirements.md), §4 V7-DATA-01 and §7 historical deferral; [completed #33](https://github.com/maxsail-project/tackbar/issues/33) explicitly delivers VKX/quaternion support | `backend/app/parsers/vakaros.py`, `backend/app/normalization/track_normalizer.py`, `backend/app/storage/track_storage.py`; `backend/tests/test_vakaros_vkx.py`, `test_track_normalizer.py`, `test_track_storage.py` |
| Deduplication and preservation | [v0.4 collaborative debrief requirements](../v0.4-collaborative-debrief-requirements.md), §8 V4-PS-01–03; [v0.5 pilot requirements](../v0.5-real-sailing-pilot-requirements.md), §4 V5-ING-05–08; [v0.6.1 OVH requirements](../v0.6.1-ovh-mailbox-ingestion-requirements.md), §4 V6.1-REV-02/03; [completed #60](https://github.com/maxsail-project/tackbar/issues/60) | `backend/app/repositories/activities.py`, `backend/app/services/ingestion_processing.py`, `backend/app/storage/ingestion_original_storage.py`, `backend/app/services/ingestion_history.py`; `backend/tests/test_ingestion_processing.py` |
| Status, disposition and reprocessing | [v0.5 pilot requirements](../v0.5-real-sailing-pilot-requirements.md), §4 V5-ING-05/06; [v0.6 requirements](../v0.6-personal-tackbar-pilot-operations-requirements.md), §4 V6-ADM-01–06; [completed #60](https://github.com/maxsail-project/tackbar/issues/60) | `backend/app/services/ingestion_history.py`, `backend/app/services/ingestion_processing.py`; `backend/tests/test_ingestion_processing.py` |
| Onboarding and delivery boundary | [v0.6.5 onboarding requirements](../v0.6.5-simplified-pilot-onboarding-requirements.md), §§3–4 V6.5-ONB/REQ; [completed #56](https://github.com/maxsail-project/tackbar/issues/56) | `backend/app/services/ingestion_processing.py`, `backend/app/services/session_result_delivery.py`; `backend/tests/test_ingestion_processing.py`, `test_session_result_notifications.py` |

**Review gap — single writer:** [v0.5 pilot requirements](../v0.5-real-sailing-pilot-requirements.md), §4 V5-ING-08 calls for one persistence-mutating ingestion execution at a time, including an explicit exclusion mechanism if automation is added. The inspected service uses a process-local lock, and the scheduled oneshot avoids overlap with its own invocation. The reviewed evidence does not establish exclusion between a separate Admin process and the scheduled process. This concurrency guarantee needs human review; this draft does not claim cross-process serialization.

**Source alignment:** [AI Development Guidelines](../ai-development-guidelines.md), §11 still describes the earlier ten-column normalized track. [Completed #33](https://github.com/maxsail-project/tackbar/issues/33), the normalizer and focused tests establish the current fourteen-column schema. Reconcile that guideline in a separately authorized governance phase; this draft does not modify it.
