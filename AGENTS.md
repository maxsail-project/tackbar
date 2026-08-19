# TackBar AI Development Guidelines

TackBar is an early-stage open-source proof of concept for collaborative post-sailing debriefing.

Before making changes:

1. Read `README.md`.
2. Read `ROADMAP.md`.
3. Read `AGENTS.md`.
4. Preserve the current PoC scope.
5. Prefer small, incremental changes.
6. Avoid introducing unnecessary frameworks or infrastructure.
7. Keep ingestion, parsing, domain logic and persistence separated.
8. Do not couple business logic to a specific email provider.
9. Every activity parser must return the same normalized internal `Activity` model.
10. Use real fixtures for parser tests when possible.
11. Add or update tests when changing parsing, persistence or matching logic.
12. Explain relevant architectural decisions in the task result when appropriate.
13. Do not modify MaxSail Analytics unless explicitly requested.
14. Reuse validated sailing-domain knowledge from MaxSail Analytics when appropriate, without inheriting its Streamlit architecture.
15. Keep the backend focused on Python + FastAPI.
16. Keep the frontend focused on React + TypeScript.
17. Keep the PoC intentionally simple.
18. Do not commit or push unless explicitly requested.

## Documentation policy

Documentation changes must always be explicit.

Do not modify any of the following unless the task explicitly requests it:

- `CHANGELOG.md`
- `README.md`
- `ROADMAP.md`
- release notes
- version numbers
- other project documentation

Do not automatically update documentation after implementing a feature.

Implementation and documentation updates are separate tasks.

When completing an implementation task, summarize relevant changes in the response so they can be reviewed and later incorporated into the documentation if appropriate.

## Current PoC priority

The current development priority is:

`Activity → Automatic Session Detection → Session`

The current success criterion is:

> TackBar automatically groups compatible sailing Activities into the same Session using sailing time and geographical proximity.

Session matching must remain independent from the ingestion provider.

The current matching approach is intentionally simple:

- temporal compatibility based on Activity and Session time intervals;
- geographical compatibility based on Activity and Session geographical centers;
- initial configurable thresholds;
- deterministic matching;
- idempotent Session assignment.

Activity spatial summaries may include:

- geographical center;
- bounding box.

Bounding boxes are currently informational and must not become a mandatory matching condition unless explicitly requested.

Do not implement future roadmap items unless explicitly requested.
