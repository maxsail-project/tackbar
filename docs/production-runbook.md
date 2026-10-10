# TackBar production runbook

Operational source of truth for the current simple single-VPS TackBar PoC.

## Production layout

- URL: `https://app.tackbar.eu`
- Checkout: `/opt/tackbar` at an immutable release tag (detached HEAD)
- Backend: `/opt/tackbar/backend`, service `tackbar.service`
- Virtualenv: `/opt/tackbar/.venv`
- Backend endpoint: `127.0.0.1:8000`
- Environment: `/etc/tackbar/tackbar.env`
- Persistent data: `/var/lib/tackbar/data`
- Frontend build: `/opt/tackbar/frontend/dist`
- Frontend served by Caddy: `/var/www/tackbar`

Caddy routes `/api/*` to the backend and serves the SPA from `/var/www/tackbar`.

The current production mailbox provider is OVHcloud Zimbra. Track sharing uses `share@tackbar.eu` and the backend connects over IMAP/TLS to `imap.mail.ovh.net:993`.

Mailbox credentials and persistent application data remain outside normal repository content. Never place secrets in Git or this file.

The Gmail adapter remains available in the codebase for compatibility/rollback, but Gmail OAuth is not part of the current production ingestion path. If Gmail OAuth is intentionally re-enabled in a future rollback or diagnostic operation, follow `docs/gmail-token-renewal.md`.

## Mailbox runtime configuration

The production environment file is `/etc/tackbar/tackbar.env`.

Current mailbox-related settings are:

```text
TACKBAR_MAILBOX_PROVIDER=ovh
TACKBAR_OVH_IMAP_HOST=imap.mail.ovh.net
TACKBAR_OVH_IMAP_PORT=993
TACKBAR_OVH_IMAP_USERNAME=share@tackbar.eu
TACKBAR_OVH_IMAP_PASSWORD=<secret>
```

`TACKBAR_OVH_IMAP_PASSWORD` is an operational secret and MUST NOT be committed or pasted into documentation/logs.

Automatic review through `tackbar-mailbox-review.timer` is the normal ingestion
trigger. Admin **Review mailbox now** remains available as the manual fallback.

Remote IMAP `Seen`/`Unread` flags are not TackBar processing state; TackBar ingestion history owns processing/idempotency state.

## Automatic mailbox review

The repository versions the production units under `deploy/systemd/`. Unit
installation and enablement are deliberate operator actions; the production
deployment script does not manage them.

The supplied service runs as the `tackbar` system user and group. Before first
installation, confirm that this is also the account with access to the deployed
backend, virtualenv and `TACKBAR_DATA_DIR`:

```bash
id tackbar
sudo -u tackbar test -x /opt/tackbar/.venv/bin/python
sudo -u tackbar test -r /opt/tackbar/backend/app/mailbox_review_once.py
sudo -u tackbar test -w /var/lib/tackbar/data
```

From the deployed release checkout, install the versioned units and reload
systemd:

```bash
cd /opt/tackbar
sudo install -o root -g root -m 0644 \
  deploy/systemd/tackbar-mailbox-review.service \
  /etc/systemd/system/tackbar-mailbox-review.service
sudo install -o root -g root -m 0644 \
  deploy/systemd/tackbar-mailbox-review.timer \
  /etc/systemd/system/tackbar-mailbox-review.timer
sudo systemctl daemon-reload
```

Enable and start the timer:

```bash
sudo systemctl enable --now tackbar-mailbox-review.timer
```

The first review occurs approximately two minutes after the timer starts. Each
later activation occurs approximately two minutes after the previous oneshot
service execution finishes. A failed review exits non-zero and the timer makes
the next normal activation the retry; there is no immediate retry loop.

Inspect timer and service state without exposing the environment file:

```bash
sudo systemctl status tackbar-mailbox-review.timer --no-pager
sudo systemctl list-timers tackbar-mailbox-review.timer --all --no-pager
sudo systemctl status tackbar-mailbox-review.service --no-pager
```

The oneshot service is normally inactive after a successful run. A failed run
may remain visible as failed until the next activation. Inspect its journal:

```bash
sudo journalctl -u tackbar-mailbox-review.service -n 100 --no-pager
sudo journalctl -u tackbar-mailbox-review.service --since "1 hour ago"
```

Mailbox-review application logs deliberately exclude message content and
private identities. Repeated identical cycle failures are suppressed across
oneshot executions using the observability-only
`mailbox_review_observability.json` file under `TACKBAR_DATA_DIR`. Missing,
malformed or unreadable observability state does not block mailbox review.

To stop automatic polling for rollback while retaining Admin review as the
fallback:

```bash
sudo systemctl disable --now tackbar-mailbox-review.timer
sudo systemctl stop tackbar-mailbox-review.service
sudo systemctl reset-failed tackbar-mailbox-review.service
```

After installing a release that changes either versioned unit, repeat the two
`install` commands and `daemon-reload`, then restart the timer explicitly.

## v0.6.4 outbound SMTP runtime configuration

The v0.6.4 welcome email uses an independent authenticated OVH SMTP
configuration. Add these values to `/etc/tackbar/tackbar.env` for the release
environment:

```text
TACKBAR_OVH_SMTP_HOST=smtp.mail.ovh.net
TACKBAR_OVH_SMTP_PORT=465
TACKBAR_OVH_SMTP_USERNAME=share@tackbar.eu
TACKBAR_OVH_SMTP_PASSWORD=<secret>
TACKBAR_OVH_SMTP_FROM=share@tackbar.eu
TACKBAR_PUBLIC_BASE_URL=https://app.tackbar.eu
```

Keep `TACKBAR_OVH_SMTP_PASSWORD` outside Git and out of logs. SMTP settings are
independent from the IMAP settings above; do not replace or reuse the IMAP
variable names in the application environment. Restart `tackbar.service` after
changing the environment and verify the local health endpoint before performing
the pending welcome-email validation.

IMAP remains the inbound track-acquisition contract. SMTP is the separate
outbound welcome-email delivery contract; adding SMTP does not remove or replace
IMAP. The two credentials must remain separately configured even if their
operational password values happen to be equal. SMTP uses authenticated
SSL/TLS on port 465, and Personal TackBar links use the configured public origin
`https://app.tackbar.eu` through `TACKBAR_PUBLIC_BASE_URL`.

`TACKBAR_OVH_IMAP_PASSWORD` and `TACKBAR_OVH_SMTP_PASSWORD` are operational
secrets. Never paste either password into documentation, logs or screenshots;
only the `<secret>` placeholder belongs in repository documentation. This
section documents the required configuration but does not claim that production
has already been updated. Follow [`docs/v0.6.4-manual-validation.md`](v0.6.4-manual-validation.md)
for the separate post-deployment validation.

## Standard release upgrade

From `/opt/tackbar`, check state, fetch tags, checkout `<TARGET_TAG>`, and verify detached HEAD and a clean tree with `git status` and `git describe --tags --always`.

Compare dependency manifests before installing anything. Do not run `npm ci` or reinstall backend dependencies automatically on every release.

Run:

```bash
cd /opt/tackbar
git status
git describe --tags --always
git fetch --tags origin
git checkout <TARGET_TAG>
git describe --tags --always
git status
```

If the frontend changed in the target release:

```bash
cd /opt/tackbar/frontend
npm run build
sudo rsync -a --delete /opt/tackbar/frontend/dist/ /var/www/tackbar/
```

Then restart and validate the backend:

```bash
sudo systemctl restart tackbar.service
sudo systemctl status tackbar.service --no-pager
sleep 2
curl -fsS http://127.0.0.1:8000/health
```

Expected health response: `{"status":"ok","service":"tackbar"}`.

`npm run build` creates `/opt/tackbar/frontend/dist`; it does not publish the files Caddy serves from `/var/www/tackbar`.

## Mailbox smoke test

After a release that changes mailbox acquisition/configuration:

1. confirm the service environment uses the intended provider without exposing secrets;
2. send or retain one supported Vakaros `.csv`/`.csv.gz` message in the operational mailbox from the intended Sailor email identity;
3. wait for the automatic timer activation, or open
   `https://app.tackbar.eu/admin` and use **Review mailbox now** as the manual
   fallback;
4. inspect the mailbox-review service status and journal;
5. confirm the Ingestion, Sailor, Activity and Session result;
6. confirm the Session Viewer remains usable;
7. repeat mailbox review and verify the same provider message is not duplicated.

For v0.6.1, the production path was validated as:

```text
real email
→ share@tackbar.eu
→ OVHcloud Zimbra / IMAPS
→ OVH adapter
→ InboundEmail
→ existing ingestion
→ Sailor → Activity → Session
→ existing Viewer
```

See `docs/v0.6.1-manual-validation.md`.

## Persistent-data reset

Persistent runtime data is normally preserved across upgrades.

The v0.6.1 cutover explicitly approved and used a one-time clean reset of the small pilot dataset. That release-specific decision does not define a general data-deletion product workflow and must not be treated as a routine upgrade step.

If a future explicitly approved reset is required, stop `tackbar.service` first and operate only on the reviewed contents of `TACKBAR_DATA_DIR`. Do not use broad deletion commands without inspecting the resolved data root and its contents.

Do not delete application source, `/etc/tackbar`, systemd configuration, Caddy configuration, TLS/domain configuration or unrelated server data as part of a runtime-data reset.

## Smoke test

Open `https://app.tackbar.eu/admin` and confirm Admin loads. Check the areas directly affected by the release and preserve the established Sailor/Activity/Session/consent/capability semantics unless the release explicitly changes them.

## What normally must not change

Unless explicitly required by the release, do not modify DNS, Caddy, the systemd service definition, Admin key, persistent runtime data, firewall rules or SSH configuration.

Mailbox credentials/configuration may change only when explicitly required by the release and must remain outside the repository.

## Rollback

Checkout `<PREVIOUS_TAG>` in `/opt/tackbar`, perform any frontend build/publication required by that version, restart `tackbar.service`, and check the health endpoint.

If the target release does not contain the automatic mailbox-review entry
point, disable and stop `tackbar-mailbox-review.timer` before switching the
checkout. Admin mailbox review remains the fallback where supported by that
release.

Application rollback and data rollback are separate concerns. Do not invent a persistent-data restore procedure; use a separately validated backup and restore procedure.

A rollback to a Gmail-based production release also requires restoring the corresponding Gmail runtime configuration/token state; checking out old code alone is not sufficient to restore mailbox acquisition.

## Operational cautions

- Run production from release tags, never a moving branch.
- Never move or republish a published tag.
- Require a clean tree before changing release.
- Keep secrets out of Git.
- Frontend build and publication are separate steps.
- Do not reinstall dependencies unless manifests or release requirements justify it.
- Do not redesign deployment infrastructure during a routine upgrade.
- Treat mailbox provider configuration and application runtime data as separate from repository checkout state.

## Validated baseline

Last validated: **v0.6.1 — OVH Mailbox Ingestion — 2026-09-13**.

Production validation confirmed OVH IMAP acquisition through `share@tackbar.eu`, the existing provider-independent ingestion path, backend health after restart and the clean pilot-data cutover. See `docs/v0.6.1-manual-validation.md`.
