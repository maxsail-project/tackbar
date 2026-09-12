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

Admin-triggered **Review mailbox now** remains the ingestion trigger. Automatic mailbox polling is not part of the current production baseline.

Remote IMAP `Seen`/`Unread` flags are not TackBar processing state; TackBar ingestion history owns processing/idempotency state.

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
3. open `https://app.tackbar.eu/admin`;
4. run **Review mailbox now**;
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
