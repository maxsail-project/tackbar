# TackBar production runbook

Operational source of truth for the current simple single-VPS TackBar PoC.

## Production layout

- URL: `https://app.tackbar.eu`
- Checkout: `/opt/tackbar` at an immutable release tag (detached HEAD)
- Backend: `/opt/tackbar/backend`, service `tackbar.service`
- Virtualenv: `/opt/tackbar/.venv`
- Backend endpoint: `127.0.0.1:8000`
- Environment: `/etc/tackbar/tackbar.env`
- Frontend build: `/opt/tackbar/frontend/dist`
- Frontend served by Caddy: `/var/www/tackbar`

Caddy routes `/api/*` to the backend and serves the SPA from `/var/www/tackbar`.
Gmail OAuth token and persistent application data remain outside normal
repository content. Never place secrets in Git or this file.

## Standard release upgrade

From `/opt/tackbar`, check state, fetch tags, checkout `<TARGET_TAG>`, and
verify detached HEAD and a clean tree with `git status` and
`git describe --tags --always`. Compare dependency manifests before installing
anything. Do not run `npm ci` or reinstall backend dependencies automatically
on every release. The validated v0.5.0 → v0.5.1 upgrade had no manifest changes,
so no dependency reinstall was required.

Run:

```bash
cd /opt/tackbar
git status
git describe --tags --always
git fetch --tags origin
git checkout <TARGET_TAG>
git describe --tags --always
git status
cd /opt/tackbar/frontend
npm run build
sudo rsync -a --delete /opt/tackbar/frontend/dist/ /var/www/tackbar/
sudo systemctl restart tackbar.service
sudo systemctl status tackbar.service --no-pager
curl -fsS http://127.0.0.1:8000/health
```

Expected health response: `{"status":"ok","service":"tackbar"}`.
`npm run build` creates `/opt/tackbar/frontend/dist`; it does not publish the
files Caddy serves from `/var/www/tackbar`.

## Smoke test

Open `https://app.tackbar.eu/admin` and confirm Admin loads. During the v0.5.1
upgrade, checks covered Sailors (Activities, Sessions, Last sailing), Sessions
(sailing interval, Sailors, consent) and Ingestions (Track interval, Samples).
These are historical checks, not permanent future requirements.

## What normally must not change

Unless explicitly required, do not modify DNS, Caddy, the systemd service
definition, Gmail OAuth configuration/token, Admin key, persistent runtime
data, firewall rules or SSH configuration.

## Rollback

Checkout `<PREVIOUS_TAG>` in `/opt/tackbar`, run the same frontend build and
publication commands above, restart `tackbar.service`, and check the health
endpoint. Application rollback and data rollback are separate concerns. Do not
invent a persistent-data restore procedure; use a separately validated backup
and restore procedure.

## Operational cautions

- Run production from release tags, never a moving branch.
- Never move or republish a published tag.
- Require a clean tree before changing release.
- Keep secrets out of Git.
- Frontend build and publication are separate steps.
- Do not redesign deployment infrastructure during a routine upgrade.

## Validated baseline

Last validated: **v0.5.1 — 2026-09-08**. This procedure was validated during
the production upgrade from v0.5.0 to v0.5.1.
