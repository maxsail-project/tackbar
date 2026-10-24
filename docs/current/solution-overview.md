# TackBar — Solution Overview

**Status:** Informational map of the accepted current solution; not a separate functional contract.

This diagram provides a navigational overview of TackBar's main functional
responsibilities and their relationships. It is intentionally schematic:
arrows indicate relevant relationships or data/control flows, not individual
API calls, exact runtime execution order, deployment topology, or a complete
software-component inventory.

The eight domain specifications linked below remain authoritative for their
respective behavior. An approved change to a domain must be reflected in its
own current specification; this overview is updated only when that change
materially affects the map.

## Functional map

```mermaid
flowchart TB
  subgraph ACQUISITION["Track acquisition and ingestion"]
    direction LR
    OVH["OVH mailbox / IMAP"]
    UPLOAD["Protected Admin upload"]
    PIPE["Acquire, parse and normalize"]
    OVH --> PIPE
    UPLOAD --> PIPE
  end

  subgraph CORE["TackBar domain and backend services"]
    direction LR
    SAILOR["Sailor"]
    BOAT["Boat (optional)"]
    ACT["Activity / normalized track"]
    MATCH["Session matching"]
    SES["Session"]
    ANALYTICS["Maneuver analytics / artifacts"]
    CONTEXT["Session context enrichment"]
    ACCESS["Consent and purpose-specific capabilities"]
    FEEDBACK["Internal per-mail feedback and welcome delivery"]
    API["FastAPI: authorized read / Admin APIs"]
    STORE[("Private persistence: JSON metadata, CSV.GZ tracks, originals, artifacts")]

    SAILOR -->|"owns"| ACT
    BOAT -.->|"optional sailing context"| ACT
    ACT --> MATCH --> SES
    ACT --> ANALYTICS
    SES --> CONTEXT
    ACT --> STORE
    SES --> STORE
    ANALYTICS --> STORE
    ACCESS -->|"enforces shared visibility"| API
    ACCESS -->|"checks current eligibility"| FEEDBACK
    PIPE -.->|"staged receipts and results"| FEEDBACK
    SES --> API
    ANALYTICS --> API
    CONTEXT --> API
    API --> STORE
  end

  subgraph WEB["React / TypeScript web experience"]
    direction LR
    CONSENT["Web consent"]
    PERSONAL["Personal TackBar / My Sessions"]
    VIEWER["Session Viewer: map, UTC window, compare, replay"]
    ADMIN["Protected Admin"]
  end

  PIPE --> ACT
  PIPE --> STORE
  CONSENT --> ACCESS
  PERSONAL --> API
  VIEWER --> API
  ADMIN --> API
  ADMIN --> UPLOAD
  PERSONAL -.->|"opens only a usable shared Session link"| VIEWER

  FEEDBACK --> SMTP["OVH SMTP"]

  GEO["Geoapify"] -.-> CONTEXT
  METEO["Open-Meteo"] -.-> CONTEXT
```

## Reading the map

- **Track processing and sharing are separate:** consent does not block
  technical ingestion or Session matching. The backend enforces current
  `ACTIVE`-only visibility in shared Session responses.
- **Sailor, Boat, Activity and Session are distinct domain concepts.**
  An Activity belongs to one Sailor, may reference a Boat, and is associated
  with at most one Session.
- **Personal TackBar is a participation history, not a bypass into a Session.**
  Opening a Session still requires a currently usable shared capability.
  Original Session, Personal, consent-request and temporary-QR credentials
  serve different purposes.
- **The Viewer uses one ephemeral shared GPS/UTC Analysis Window,**
  analytically compares at most two selected Activities, and supports replay.
  It does not persist the selected analysis window as a domain entity.
- **Maneuver analytics are evidence-based.** Candidate events are not
  automatic tack/gybe classifications.
- **Session context is optional and descriptive.** Historical/modelled
  weather and marine values are not onboard measurements and do not enter
  sailing analytics.
- **Providers and storage are backend concerns.** The frontend consumes
  APIs, not private files; acquisition and context providers remain replaceable.
- **Per-mail feedback is an internal staged flow.** It is not connected to the
  current scheduled or Admin OVH mailbox-review trigger.

## Authoritative specifications

| Area in the map | Governing current specification |
| --- | --- |
| Sailor, Boat, Activity, Session and matching | [Domain and Sessions](domain-and-sessions.md) |
| Acquisition, parsing, normalization and persistence | [Ingestion and Data](ingestion-and-data.md) |
| Consent, visibility and capabilities | [Access and Consent](access-and-consent.md) |
| Shared Viewer, selection, UTC analysis and replay | [Session Viewer](session-viewer.md) |
| Maneuver detection, measures and artifacts | [Analytics](analytics.md) |
| Personal history and opening Sessions | [Personal TackBar](personal-tackbar.md) |
| Protected operations and manual upload | [Admin](admin.md) |
| Geography and historical weather/marine context | [Session Context](session-context.md) |

## Maintenance

Keep this page **descriptive, compact and non-normative**. When a scoped,
approved change alters the main modules or their relationships:

1. Update the authoritative affected specification as required by the
   approved Issue or task and repository governance.
2. Adjust the Mermaid source here in the **same authorized documentation
   scope**, without introducing new product guarantees.
3. Review that the diagram remains consistent with the corresponding
   implementation evidence and avoids depicting deferred integrations
   as delivered.

A Miro or other whiteboard representation is a collaborative copy, not the
source of truth for this Markdown/Mermaid diagram.
