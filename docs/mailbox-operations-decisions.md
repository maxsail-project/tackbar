# TackBar current mailbox operations decisions

**Status:** Active operational decisions

**Date:** 10 October 2026

**Scope:** current single-VPS inbound mailbox acquisition and review

This document records the current mailbox operating model. It does not rewrite
the historical v0.6.1 release decisions.

## Automatic review is the normal trigger

Production uses the configured OVHcloud mailbox and reviews it automatically.
A repository-owned systemd timer activates one dedicated oneshot service. Each
service invocation calls the existing `review_mailbox_now()` application
service exactly once; it does not call TackBar through HTTP and does not contain
an internal retry loop.

The first activation occurs approximately two minutes after the timer starts.
After a review finishes, the next activation occurs approximately two minutes
later. A transient failure exits non-zero and is retried by the next scheduled
activation.

Admin **Review mailbox now** remains available and unchanged as the manual
operational fallback.

## Mailbox acquisition and processing state

OVH acquisition remains incremental through the persisted mailbox
`UIDVALIDITY` and UID cursor. Unsupported and malformed messages remain
examined outcomes and may advance that cursor. Provider-message identity,
ingestion history, raw-file deduplication and the common downstream ingestion
pipeline remain unchanged.

Remote mailbox Seen/Unread flags are not TackBar processing state.

## Failure observability across oneshot processes

Mailbox-review diagnostics use standard Python application logging and the
systemd journal. Successful empty cycles remain low-noise. Repeated identical
cycle failures are suppressed, reminded at most hourly, and followed by one
recovery log after at least one repeated failure was suppressed.

Because each oneshot starts a new process, the minimum state needed for those
diagnostics is stored atomically in
`TACKBAR_DATA_DIR/mailbox_review_observability.json`. The file contains only:

- a format version;
- controlled provider, failure-stage, exception-class and safe-reason tokens;
- the last emitted wall-clock timestamp;
- suppressed-cycle counters.

It contains no sender, subject, filename, message content, credential, token,
private path or ingestion/domain record. It is observability-only: ingestion
and cursor decisions must never depend on it. Missing, malformed or unreadable
state fails open and does not block a mailbox-review cycle.

## Deployment boundary

The systemd units are versioned under `deploy/systemd/` and run the deployed
release from `/opt/tackbar` with `/opt/tackbar/.venv` and
`/etc/tackbar/tackbar.env`. Installation, `daemon-reload`, enablement and
rollback remain explicit operator steps documented in the production runbook.

`scripts/deploy-production.sh` does not install, enable or disable these units.
No queue, additional application worker, distributed lock, IMAP IDLE,
monitoring service or alerting system is introduced.
