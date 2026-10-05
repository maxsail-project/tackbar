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

---

## Mahon release family — v0.6.x

The Mahon family progressed through seven focused releases while preserving the
same core Sailor → Activity → Session and collaborative debrief baseline.

### v0.6.0 Mahon — Pilot Operations

**Status:** Delivered / production validated

Goal: publish the smallest coherent operational build needed for the Mahon pilot, consolidating the complete v0.6 work developed after v0.5.1 without expanding the product surface unnecessarily.

Delivered scope:

- Personal TackBar / My Sessions with stable personal capability access for ACTIVE Sailors;
- personal Session participation history derived through the Sailor's Activities;
- Admin personal-capability management;
- Admin ingestion administrative disposition (`active` / `discarded`);
- semantic `Discard` / `Restore`;
- filtering by technical status and administrative disposition;
- deterministic Admin Session ordering by real sailing time, newest sailing first;
- TackBar visual-brand consolidation using TackBar Web as the canonical visual reference;
- MPL-2.0 transition for TackBar-owned source code;
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

Explicitly outside v0.6.0:

- OVHcloud / generalized multi-provider email ingestion;
- broad Session-maintenance redesign;
- GPX/VKX/FIT;
- canonical logical track fingerprinting;
- automatic wind-oriented map mode;
- advanced analytics.

References: [requirements](docs/v0.6-personal-tackbar-pilot-operations-requirements.md) and [decisions](docs/v0.6-decisions.md).

### v0.6.1 Mahon — OVH Mailbox Ingestion

**Status:** Delivered / production validated

Replaced Gmail as the operational production mailbox with OVHcloud Zimbra at
`share@tackbar.eu`, preserving the provider-independent ingestion pipeline and
existing product semantics.

Reference: [requirements](docs/v0.6.1-ovh-mailbox-ingestion-requirements.md).

### v0.6.2 Mahon — Viewer & Admin Usability

**Status:** Delivered / focused automated validation passed

Added Individual Analysis and visual-only temporal zoom in the Session Viewer,
and clarified Admin Ingestion and Session operational context without changing
domain or access semantics.

### v0.6.3 Mahon — Usability & Maintenance

**Status:** Delivered / focused automated validation passed

Stabilized temporal chart interaction on touch, stylus and mouse, refined Admin
and Viewer microcopy/navigation and updated deployment workflow maintenance.

### v0.6.4 Mahon — Sailor Activation Welcome Email

**Status:** Release-ready / production validation pending

Implemented the bilingual activation welcome email, OVH SMTP delivery boundary,
safe delivery state and explicit Admin resend while keeping consent
authoritative when delivery fails.

Reference: [requirements](docs/v0.6.4-sailor-activation-welcome-email-requirements.md).

### v0.6.5 Mahon — Simplified Pilot Onboarding & Web Consent

**Status:** Implemented / production validation pending

Completes track-first pilot onboarding with persisted Consent Requests,
explicit bilingual web consent, one automatic request-email attempt per pending
cycle and Admin resend/reissue plus manual-confirmation recovery. Production
deployment and the real OVH SMTP end-to-end consent flow remain pending.

Reference: [requirements](docs/v0.6.5-simplified-pilot-onboarding-requirements.md).

### v0.6.6 Mahon — Attachment-driven Email Ingestion

**Status:** Implemented / focused backend validation passed; production validation pending

Delivered a small operational hotfix so Gmail and OVH determine track-email
eligibility from exactly one supported `.csv` or `.csv.gz` attachment rather
than from the human-written Subject. Multi-format ingestion remains assigned to
v0.7.0 Californian.

Any additional v0.6.x work remains unassigned unless explicitly promoted.
Pending work is tracked in `docs/product-backlog.md` rather than inferred from
historical release documents.

---

## Planned milestone — v0.7.0 Californian — Multi-Format Track Ingestion

Extend the existing ingestion flow to additional file formats while preserving one canonical TackBar normalized track representation.

Implementation and validation order: **GPX → VKX → FIT**.

- preserve existing Vakaros CSV/CSV.GZ support;
- keep provider and source-format ingestion boundaries independent;
- converge all formats on the same canonical normalized track;
- derive SOG/COG deterministically when required by source data;
- introduce deterministic, Sailor-scoped logical duplicate resolution after normalization, with the fingerprint contract finalized using representative multi-format data before persistence.

Deferred v0.6 operational work is not automatically moved into v0.7.0.

Across the **v0.7.x Californian** family, small corrective, technical-debt and
operational-maintenance increments may also be delivered when justified by
pilot/production evidence or concrete implementation needs. This maintenance
track is intentionally open and evidence-driven; it does not expand the core
v0.7.0 product scope or authorize unrelated refactors or product features.

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
| v0.6.0 | Mahon — Pilot Operations | Delivered / production validated |
| v0.6.1 | Mahon — OVH Mailbox Ingestion | Delivered / production validated |
| v0.6.2 | Mahon — Viewer & Admin Usability | Delivered / focused validation passed |
| v0.6.3 | Mahon — Usability & Maintenance | Delivered / focused validation passed |
| v0.6.4 | Mahon — Sailor Activation Welcome Email | Release-ready / production validation pending |
| v0.6.5 | Mahon — Simplified Pilot Onboarding & Web Consent | Implemented / production validation pending |
| v0.6.6 | Mahon — Attachment-driven Email Ingestion | Implemented / focused validation passed; production validation pending |
| v0.7.0 | Californian — Multi-Format Track Ingestion | Planned |

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

---

## Familia de releases Mahon — v0.6.x

La familia Mahon avanzó mediante siete releases focalizadas, preservando la misma
baseline Sailor → Activity → Session y de debriefing colaborativo.

### v0.6.0 Mahon — Pilot Operations

**Estado:** Entregado / validado en producción

Objetivo: publicar la build operativa mínima y coherente para el piloto de Mahon, incluyendo todo el trabajo v0.6 desarrollado después de v0.5.1.

Alcance entregado:

- Personal TackBar / My Sessions;
- capability personal estable para Sailors ACTIVE;
- gestión Admin de capability personal;
- disposición administrativa de ingesta `active` / `discarded`;
- `Discard` / `Restore` semánticos;
- filtros por estado técnico y disposición;
- orden determinista de Admin Sessions por hora real de navegación, más reciente primero;
- consolidación visual de marca TackBar;
- transición MPL-2.0;
- mapa Positron más neutro en el Session Viewer;
- control estándar MapLibre de navegación/brújula y rotación manual;
- hardening y validación de release.

Fuera de v0.6.0:

- OVHcloud / ingesta multi-proveedor generalizada;
- rediseño amplio de mantenimiento de Sessions;
- GPX/VKX/FIT;
- fingerprint lógico/canónico;
- orientación automática del mapa por viento;
- analytics avanzados.

### v0.6.1 Mahon — OVH Mailbox Ingestion

**Estado:** Entregado / validado en producción

Sustituyó Gmail como buzón operativo de producción por OVHcloud Zimbra en
`share@tackbar.eu`, preservando el pipeline de ingesta independiente del
proveedor y las semánticas existentes del producto.

### v0.6.2 Mahon — Viewer & Admin Usability

**Estado:** Entregado / validación automatizada focalizada superada

Añadió Individual Analysis y zoom temporal exclusivamente visual al Session
Viewer, y aclaró el contexto operativo de Admin Ingestion y Session sin cambiar
semánticas de dominio o acceso.

### v0.6.3 Mahon — Usability & Maintenance

**Estado:** Entregado / validación automatizada focalizada superada

Estabilizó la interacción temporal de charts con toque, lápiz y ratón, refinó
microcopy/navegación de Admin y Viewer y actualizó el mantenimiento del workflow
de despliegue.

### v0.6.4 Mahon — Sailor Activation Welcome Email

**Estado:** Lista para release / validación de producción pendiente

Implementó el correo bilingüe de bienvenida tras activación, el límite de
entrega SMTP OVH, estado seguro de entrega y reenvío Admin explícito,
manteniendo el consentimiento aunque falle la entrega.

### v0.6.5 Mahon — Simplified Pilot Onboarding & Web Consent

**Estado:** Implementado / validación de producción pendiente

Completa el onboarding track-first del piloto con Consent Requests persistidas,
consentimiento web bilingüe explícito, un intento automático de correo por ciclo
pendiente y recuperación mediante reenvío/reemisión Admin más confirmación
manual. El despliegue y el flujo end-to-end real mediante SMTP OVH siguen
pendientes.

### v0.6.6 Mahon — Ingesta de email basada en adjuntos

**Estado:** Implementado / validación backend focalizada superada; validación de producción pendiente

Entrega un pequeño hotfix operativo para que Gmail y OVH determinen la
elegibilidad del email con track mediante exactamente un adjunto `.csv` o
`.csv.gz` soportado, y no mediante el Subject escrito por la persona. La ingesta
multi-formato permanece asignada a v0.7.0 Californian.

Cualquier trabajo adicional v0.6.x permanece sin asignar salvo promoción
explícita. El trabajo pendiente se mantiene en `docs/product-backlog.md` y no se
infiere de documentos históricos de release.

---

## Hito previsto — v0.7.0 Californian — Multi-Format Track Ingestion

Ampliar la ingesta a otros formatos manteniendo un único track normalizado canónico.

Orden: **GPX → VKX → FIT**.

v0.7.0 también definirá la identidad lógica/fingerprint tras normalización. El trabajo operativo diferido de v0.6 no se mueve automáticamente a v0.7.

A lo largo de la familia **v0.7.x Californian** también podrán incorporarse
incrementos pequeños de mantenimiento correctivo, deuda técnica y mantenimiento
operacional cuando estén justificados por evidencia del piloto/producción o por
necesidades concretas detectadas durante la implementación. Esta línea se
mantiene deliberadamente abierta y guiada por evidencia; no amplía por sí sola
el alcance funcional de v0.7.0 ni autoriza refactors o funcionalidades no
relacionadas.

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
| v0.6.0 | Mahon — Pilot Operations | Entregado / validado en producción |
| v0.6.1 | Mahon — OVH Mailbox Ingestion | Entregado / validado en producción |
| v0.6.2 | Mahon — Viewer & Admin Usability | Entregado / validación focalizada superada |
| v0.6.3 | Mahon — Usability & Maintenance | Entregado / validación focalizada superada |
| v0.6.4 | Mahon — Sailor Activation Welcome Email | Lista para release / validación de producción pendiente |
| v0.6.5 | Mahon — Simplified Pilot Onboarding & Web Consent | Implementado / validación de producción pendiente |
| v0.6.6 | Mahon — Ingesta de email basada en adjuntos | Implementado / validación focalizada superada; validación de producción pendiente |
| v0.7.0 | Californian — Multi-Format Track Ingestion | Previsto |
