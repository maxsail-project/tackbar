# TackBar AI Development Guidelines

TackBar is an early-stage open-source proof of concept for collaborative post-sailing debriefing.

Before making changes:

1. Read `README.md`.
2. Read `ROADMAP.md`.
3. Preserve the current PoC scope.
4. Prefer small, incremental changes.
5. Avoid introducing unnecessary frameworks or infrastructure.
6. Keep ingestion, parsing, domain logic and persistence separated.
7. Do not couple business logic to a specific email provider.
8. Every activity parser must return the same normalized internal `Activity` model.
9. Use real fixtures for parser tests when possible.
10. Add or update tests when changing parsing or matching logic.
11. Document relevant architectural decisions.
12. Do not modify MaxSail Analytics unless explicitly requested.
13. Reuse validated sailing-domain knowledge from MaxSail Analytics when appropriate, without inheriting its Streamlit architecture.
14. Keep the backend focused on Python + FastAPI.
15. Keep the frontend focused on React + TypeScript.
16. Keep the PoC intentionally simple.

## Current PoC priority

The current development priority is:

`Email → attachment → Vakaros CSV.GZ → Activity`

The first success criterion is:

> TackBar receives an email attachment, identifies the sender, parses a Vakaros CSV.GZ file and creates a valid normalized Activity.

Do not implement future roadmap items unless explicitly requested.
