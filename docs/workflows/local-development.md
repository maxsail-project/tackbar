# TackBar Local Development Workflow

## Purpose

This workflow defines the repeatable procedure for preparing, starting, validating and stopping a local TackBar development environment.

It is intended to be usable:

- manually by a developer;
- from a short Codex prompt;
- later as the source of truth for a Local Development Skill / Agent.

This document describes **how to run TackBar locally**. It does not define product behavior, production deployment, release validation or production operations.

---

## 1. Sources of truth

Before changing this workflow or troubleshooting behavior that depends on product semantics, review:

- `AGENTS.md`
- `docs/ai-development-guidelines.md`
- the relevant requirements/decisions for the feature being exercised
- the current local-start scripts under `scripts/`

For production deployment or production runtime behavior, use:

- `docs/production-runbook.md`

Do not reuse production instructions as local-development instructions unless explicitly required.

---

## 2. Supported local workflow

The current supported local workflow is Windows + PowerShell.

Use the repository-provided scripts as the preferred startup path:

```text
scripts/start-local-backend.ps1
scripts/start-local-frontend.ps1
```

A local workflow agent SHOULD prefer these scripts over reconstructing equivalent commands manually.

If a script fails, inspect the script and report the concrete precondition or runtime error. Do not silently bypass a repository safety check.

---

## 3. Local runtime data

`TACKBAR_DATA_DIR` selects the runtime persistence root used by the backend.

For normal local pilot/development operation:

- it MUST be configured;
- it MUST resolve outside the TackBar repository;
- private pilot data, originals, tracks and runtime metadata MUST remain outside the public repository.

Example:

```powershell
$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"
```

The backend startup script creates the configured data directory if it does not already exist.

Do not copy private runtime data into `backend/test-data` or another repository path.

---

## 4. Local Admin configuration

Admin operation requires a local `TACKBAR_ADMIN_KEY`.

Example:

```powershell
$env:TACKBAR_ADMIN_KEY = "change-me-local-only"
```

The value is a local secret.

Do not:

- commit it;
- write it into repository documentation;
- print it in completion reports;
- include it in URLs;
- persist it merely to simplify local startup.

A Local Development Agent may verify that the variable is configured, but SHOULD report only whether it is present, never its value.

---

## 5. Pre-flight

Before starting services, verify the minimum environment:

```text
repository available
TACKBAR_DATA_DIR configured
runtime data root outside repository
TACKBAR_ADMIN_KEY configured
Python available
Node.js/npm available
```

Do not install or upgrade dependencies automatically unless the user explicitly asks for environment setup and the repository dependency state has been inspected first.

### Existing pre-flight script

The repository currently contains:

```text
scripts/check-local-pilot.ps1
```

It may be useful diagnostically, but it currently contains Gmail-specific checks inherited from an older local-pilot workflow.

Until that script is reconciled with the current production/local mailbox direction, a Local Development Skill or Agent MUST NOT treat its Gmail checks as authoritative prerequisites for simply starting TackBar locally.

The authoritative startup preconditions are the current startup scripts and applicable repository documentation.

---

## 6. Start backend

From the repository root, with the required environment variables already configured:

```powershell
.\scripts\start-local-backend.ps1
```

The script validates:

- `TACKBAR_DATA_DIR`;
- that the data directory is outside the repository;
- `TACKBAR_ADMIN_KEY`;
- Python availability;
- backend application presence.

Expected local backend:

```text
http://127.0.0.1:8000
```

Expected health endpoint:

```text
http://127.0.0.1:8000/health
```

The backend is ready only when the health endpoint responds successfully.

A Local Development Agent SHOULD wait for and verify health before reporting the backend as ready.

---

## 7. Start frontend

In a second process/terminal:

```powershell
.\scripts\start-local-frontend.ps1
```

The script validates Node.js/npm and starts the current Vite development server.

Expected local Admin entry point:

```text
http://localhost:5173/admin
```

The exact dev-server port remains owned by the current Vite configuration. If Vite selects another port because the default is unavailable, report the actual URL instead of assuming `5173`.

A Local Development Agent SHOULD verify that the frontend is reachable before reporting the local environment as ready.

---

## 8. Minimum readiness validation

A successful local startup requires, at minimum:

1. backend process running;
2. `/health` responding successfully;
3. frontend process running;
4. frontend reachable;
5. no startup error requiring operator action.

When relevant to the requested development task, add a focused smoke check for the affected area.

Examples:

- Admin page loads;
- a shared Session capability opens;
- Session Viewer renders;
- a specific changed endpoint responds.

Do not turn every local startup into a full regression run.

---

## 9. Optional test and build checks

Tests are not required merely to start the local application.

When the user asks to validate changes, select checks according to the impact of the work and `AGENTS.md`.

Current standard commands are:

Backend:

```powershell
cd backend
python -m pytest tests
```

Frontend:

```powershell
cd frontend
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Use focused tests during implementation when appropriate. Treat broader/full regression as a separate validation gate when required by change risk.

---

## 10. Mailbox and external-service behavior

Starting TackBar locally and validating the basic application MUST NOT require contacting an external mailbox or sending outbound email unless the user explicitly asks to exercise that integration.

A Local Development Agent MUST NOT:

- trigger mailbox review automatically;
- send consent/welcome email automatically;
- initiate production-like external side effects;
- modify remote mailbox state merely as part of startup.

External integration testing is a separate explicit action.

---

## 11. Stop local TackBar

Stop the frontend and backend development processes using the normal process interrupt for their terminals, typically:

```text
Ctrl + C
```

A future Local Development Agent that starts persistent processes SHOULD track which processes it started and stop only those processes when asked.

It MUST NOT terminate unrelated Python, Node.js or browser processes.

---

## 12. Safety boundaries

A local-development workflow MUST preserve these boundaries:

- private runtime data stays outside the repository;
- secrets are never echoed or committed;
- local startup does not alter production;
- local startup does not perform Git staging, commits, pushes, tags or releases;
- local startup does not deploy;
- external mailbox/email actions require explicit intent;
- do not invent missing environment values;
- do not bypass repository safety checks silently;
- do not change product semantics merely to make local startup easier.

If a required value is missing, stop and report what the operator must provide.

---

## 13. Agent/Skill execution contract

A future Local Development Skill / Agent should implement this workflow in the following order:

```text
inspect repository state
        ↓
read this workflow
        ↓
check local prerequisites
        ↓
configure/use operator-provided runtime context
        ↓
start backend
        ↓
verify /health
        ↓
start frontend
        ↓
verify frontend
        ↓
perform requested focused smoke check
        ↓
report READY or BLOCKED
```

### READY report

When successful, report only useful operational information:

```text
Status: READY
Backend: <actual local URL>
Frontend: <actual local URL>
Data: private/test context without exposing paths unnecessarily
Checks: health + requested smoke check
Warnings: any non-blocking issue
```

### BLOCKED report

If startup cannot complete:

```text
Status: BLOCKED
Failed step: <step>
Cause: <concrete error>
Operator action: <smallest required action>
```

Do not claim the application is running if readiness checks did not pass.

---

## 14. Out of scope

This workflow does not cover:

- production deployment;
- release preparation;
- GitHub Release publication;
- production rollback;
- production data migration/reset;
- full product regression by default;
- mailbox polling/automation;
- dependency upgrades;
- changing environment architecture;
- application feature implementation.

Use the appropriate workflow or repository documentation for those tasks.

---

## 15. Minimal manual invocation

For the normal current local workflow:

Terminal 1:

```powershell
$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"
$env:TACKBAR_ADMIN_KEY = "change-me-local-only"
.\scripts\start-local-backend.ps1
```

Verify:

```text
http://127.0.0.1:8000/health
```

Terminal 2:

```powershell
.\scripts\start-local-frontend.ps1
```

Open:

```text
http://localhost:5173/admin
```

The scripts and current repository documentation remain authoritative if these concrete commands evolve.
