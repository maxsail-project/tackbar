# TackBar Roadmap

TackBar evolves incrementally by validating each product step with real sailing activities before adding more complexity.

The roadmap is intentionally high-level. Detailed release requirements and future backlog are maintained separately.

## Core product hypothesis

`multiple sailors → share tracks → automatic Session detection → collaborative debriefing`

---

## Delivered milestones

### v0.1.0 — Email Track Ingestion PoC

Goal: prove that TackBar can receive and process sailing tracks sent by email.

Delivered direction:

- email attachment ingestion;
- Vakaros CSV/CSV.GZ support;
- sender-email identity;
- parsing and normalization;
- original/track persistence;
- provider-independent downstream processing.

### v0.2.0 — Automatic Session Detection

Goal: automatically associate compatible sailing Activities with the same Session.

Delivered direction:

- temporal compatibility;
- geographic proximity;
- automatic Session creation;
- automatic Activity-to-Session association.

Current Session-matching behavior is an established baseline and is not redefined by later Viewer or pilot-access work unless explicitly required.

### v0.3.x — Multi-Track Viewer

Goal: visualize and compare one or two Activities from the same Session.

Delivered baseline:

- primary Activity and optional comparison Activity;
- shared GPS/UTC Analysis Window;
- synchronized replay;
- basic summary metrics;
- SOG/COG Viewer foundation;
- mobile-first responsive experience.

Detailed semantics: `docs/session-viewer-requirements.md`.

### v0.4.0 — Collaborative Sailing Debrief PoC

Goal: connect persisted TackBar Sessions and Activities to the mobile-first Session Viewer for real collaborative debriefing.

Delivered baseline:

- Sailor identity separated from Boat context;
- persisted Activity + optional Boat context;
- read-only FastAPI Session/track APIs;
- frontend connected to persisted backend data;
- one/two-Activity comparison;
- shared Analysis Window and Replay;
- fixed map GPS/SOG/COG/HEEL telemetry;
- refined Summary;
- SOG/COG/HEEL/TRIM charts;
- focused mobile/tablet validation.

Detailed requirements: `docs/v0.4-collaborative-debrief-requirements.md`.

### v0.5.0 — Real Sailing Pilot

Delivered and validated end-to-end with real sailing data, Gmail messages and runtime persistence.

Delivered direction:

- Sailor consent lifecycle and backend-enforced ACTIVE-only shared visibility;
- protected Admin pilot operation and manually triggered Gmail ingestion;
- ingestion history and idempotent reprocessing;
- Session capability URLs, expiration and renewal;
- controlled real-sailing pilot validation with the existing Session Viewer.

References: [requirements](docs/v0.5-real-sailing-pilot-requirements.md) and [CHANGELOG](CHANGELOG.md).

### v0.5.1 — Pilot Fix & Usability

Delivered: clearer Admin Session operational context, Sailor participation/history visibility and ingestion track context, preserving the validated v0.5.0 product flow.

Reference: [requirements](docs/v0.5.1-pilot-fix-and-usability-requirements.md).

### v0.6.0 — Personal TackBar baseline

Delivered productization baseline before the Mahon operational release.

Delivered direction:

- Personal TackBar / My Sessions with stable personal capability access for ACTIVE Sailors;
- personal Session participation history derived through the Sailor's Activities;
- Admin personal-capability management;
- TackBar visual-brand consolidation using TackBar Web as the canonical visual reference;
- MPL-2.0 transition for TackBar-owned source code;
- preservation of validated v0.5.x domain, consent, capability, persistence and Viewer semantics.

References: [requirements](docs/v0.6-personal-tackbar-pilot-operations-requirements.md) and [decisions](docs/v0.6-decisions.md).

---

## Current milestone — v0.6.1 Mahon — Pilot Operations

Goal: publish the smallest coherent operational build needed for the Mahon pilot without expanding the product surface unnecessarily.

Current release direction:

- Admin ingestion administrative disposition (`active` / `discarded`);
- semantic `Discard` / `Restore`;
- filtering by technical status and administrative disposition;
- deterministic Admin Session ordering by real sailing time, newest sailing first;
- quieter OpenFreeMap Positron basemap in the Session Viewer;
- standard MapLibre navigation/compass control for manual map rotation/reset;
- focused hardening and release validation.

The Mahon release preserves:

- Gmail as the current mailbox provider;
- current Session matching;
- consent and ACTIVE-only shared visibility;
- Session capability/lifetime semantics;
- Personal TackBar semantics;
- current Activity/Session persistence;
- existing Viewer analytics/replay semantics;
- existing functional track colors.

Explicitly outside v0.6.1:

- OVHcloud / generalized multi-provider email ingestion;
- broad Session-maintenance redesign;
- GPX/VKX/FIT;
- canonical logical track fingerprinting;
- automatic wind-oriented map mode;
- advanced analytics.

References: [requirements](docs/v0.6-personal-tackbar-pilot-operations-requirements.md) and [decisions](docs/v0.6-decisions.md).

---

## Future 0.6.x

Valid follow-up work in the v0.6 family that has not been assigned to a concrete release remains labelled **Future 0.6.x**.

Current examples:

- multi-provider email ingestion / OVHcloud adapter;
- broader Session-maintenance usability.

After v0.6.1 is published, patch numbers such as v0.6.2 and v0.6.3 remain available for hot-fixes and corrective releases. They are not pre-reserved for feature work.

A concrete version is assigned to Future 0.6.x work only when that scope is explicitly promoted.

---

## Planned milestone — v0.7.0 Multi-Format Track Ingestion

Extend the existing ingestion flow to additional file formats while preserving one canonical TackBar normalized track representation.

Implementation and validation order: **GPX → VKX → FIT**.

- preserve existing Vakaros CSV/CSV.GZ support;
- keep provider and source-format ingestion boundaries independent;
- converge all formats on the same canonical normalized track;
- derive SOG/COG deterministically when required by source data;
- introduce deterministic, Sailor-scoped logical duplicate resolution after normalization, with the fingerprint contract finalized using representative multi-format data before persistence.

Deferred v0.6 operational work is not automatically moved into v0.7.0.

References: [requirements](docs/v0.7-multi-format-track-ingestion-requirements.md) and [decisions](docs/v0.7-decisions.md).

---

## Backlog relationship

[docs/product-backlog.md](docs/product-backlog.md) remains the canonical inventory of unfinished future work.

Only scope explicitly committed in release requirements/decisions belongs to a concrete release. Other work remains Unassigned or Future 0.6.x as explicitly decided.

---

## Release sequence

| Version | Milestone | Status |
| --- | --- | --- |
| v0.1.0 | Email Track Ingestion PoC | Delivered |
| v0.2.0 | Automatic Session Detection | Delivered |
| v0.3.0 | Multi-Track Viewer | Delivered |
| v0.4.0 | Collaborative Sailing Debrief PoC | Delivered |
| v0.5.0 | Real Sailing Pilot | Delivered / validated |
| v0.5.1 | Pilot Fix & Usability | Delivered |
| v0.6.0 | Personal TackBar baseline | Delivered |
| v0.6.1 | Mahon — Pilot Operations | Current |
| Future 0.6.x | Operational follow-up when explicitly promoted | Unassigned |
| v0.7.0 | Multi-Format Track Ingestion | Planned |

---

# Versión en español

TackBar evoluciona de forma incremental, validando cada etapa del producto con actividades reales de navegación antes de incorporar más complejidad.

El roadmap se mantiene deliberadamente a alto nivel. Los requisitos detallados y el backlog futuro se mantienen por separado.

## Hipótesis principal del producto

`varios regatistas → comparten tracks → detección automática de Session → debriefing colaborativo`

---

## Hitos entregados

### v0.1.0 — PoC de ingesta de tracks por email

Entregado: ingesta de adjuntos, Vakaros CSV/CSV.GZ, identidad por email, parsing/normalización, persistencia y procesamiento posterior independiente del proveedor.

### v0.2.0 — Detección automática de Sessions

Entregado: compatibilidad temporal/geográfica, creación automática de Session y asociación Activity-to-Session.

### v0.3.x — Visor multi-track

Entregado: Activity principal y comparación opcional, Analysis Window compartida, replay sincronizado, métricas básicas y experiencia mobile-first.

### v0.4.0 — PoC de debriefing colaborativo

Entregado: Sailor separado de Boat, API persistida, Viewer conectado al backend, comparación de una/dos Activities, Analysis Window, replay y métricas SOG/COG/HEEL/TRIM.

### v0.5.0 — Real Sailing Pilot

Entregado y validado end-to-end con Gmail, consentimiento, Admin, capabilities y Session Viewer real.

### v0.5.1 — Pilot Fix & Usability

Entregado: mejor contexto operativo de Sessions, Sailors e ingestas en Admin, preservando el flujo v0.5.0.

### v0.6.0 — Baseline Personal TackBar

Entregado antes de Mahon:

- Personal TackBar / My Sessions;
- capability personal estable para Sailors ACTIVE;
- gestión Admin de capability personal;
- consolidación visual de marca TackBar;
- transición MPL-2.0;
- preservación de semánticas v0.5.x.

---

## Hito actual — v0.6.1 Mahon — Pilot Operations

Objetivo: publicar la build operativa mínima y coherente para el piloto de Mahon.

Alcance actual:

- disposición administrativa de ingesta `active` / `discarded`;
- `Discard` / `Restore` semánticos;
- filtros por estado técnico y disposición;
- orden determinista de Admin Sessions por hora real de navegación, más reciente primero;
- mapa Positron más neutro en el Session Viewer;
- control estándar MapLibre de navegación/brújula y rotación manual;
- hardening y validación de release.

Fuera de v0.6.1:

- OVHcloud / ingesta multi-proveedor generalizada;
- rediseño amplio de mantenimiento de Sessions;
- GPX/VKX/FIT;
- fingerprint lógico/canónico;
- orientación automática del mapa por viento;
- analytics avanzados.

---

## Future 0.6.x

El trabajo válido de la familia v0.6 que todavía no tiene release concreta se etiqueta **Future 0.6.x**.

Actualmente incluye:

- ingesta multi-proveedor / adapter OVHcloud;
- mejoras amplias de usabilidad de mantenimiento de Sessions.

Después de publicar v0.6.1, números como v0.6.2 y v0.6.3 quedan disponibles para hot-fixes y releases correctivas. No se reservan previamente para features.

---

## Hito previsto — v0.7.0 Multi-Format Track Ingestion

Ampliar la ingesta a otros formatos manteniendo un único track normalizado canónico.

Orden: **GPX → VKX → FIT**.

v0.7.0 también definirá la identidad lógica/fingerprint tras normalización. El trabajo operativo diferido de v0.6 no se mueve automáticamente a v0.7.

---

## Secuencia de releases

| Versión | Hito | Estado |
| --- | --- | --- |
| v0.1.0 | Email Track Ingestion PoC | Entregado |
| v0.2.0 | Automatic Session Detection | Entregado |
| v0.3.0 | Multi-Track Viewer | Entregado |
| v0.4.0 | Collaborative Sailing Debrief PoC | Entregado |
| v0.5.0 | Real Sailing Pilot | Entregado / validado |
| v0.5.1 | Pilot Fix & Usability | Entregado |
| v0.6.0 | Personal TackBar baseline | Entregado |
| v0.6.1 | Mahon — Pilot Operations | Actual |
| Future 0.6.x | Seguimiento operativo cuando se promueva explícitamente | Sin asignar |
| v0.7.0 | Multi-Format Track Ingestion | Previsto |
