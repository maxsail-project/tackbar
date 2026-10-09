# TackBar Roadmap

TackBar evolves incrementally by validating each product step with real sailing activities before adding more complexity.

The roadmap is intentionally high-level. Detailed release requirements are
maintained separately; open GitHub Issues and the GitHub Project present pending
work.

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
- fixed map GPS/SOG/COG/HEEL/TRIM telemetry;
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
than from the human-written Subject. Multi-format ingestion is Future / Unassigned.

Any additional v0.6.x work remains unassigned unless explicitly promoted.
Pending work is tracked in open GitHub Issues rather than inferred from
historical release documents.

---

## v0.7.0 Californian — Collaborative Debrief Analytics

**Status:** Delivered / automated release validation passed; production validation pending

Delivered useful post-sailing maneuver analytics from telemetry already
available in Vakaros-derived canonical TackBar Activities. Neutral detected
events are persisted with version/hash invalidation, exposed through the
existing capability boundary and presented on the Analysis Window timeline and
in a compact, sortable Maneuvers table. Selecting a marker or row moves shared
`playbackTime` to the event center, highlights the row and focuses the relevant
Activity on the visible map area without changing the Analysis Window.

The delivered metrics are event time/duration, circular HDG change,
entry/minimum/exit SOG, recovery time and constant-entry-reference Loss in
metres and equivalent seconds. Values remain unavailable when inputs are
insufficient. A maneuver is not automatically a tack/gybe, and existing
Activity/Session, Analysis Window, map/replay, charts and Summary semantics are
preserved.

The Analysis Window compact summaries also expose existing Dominant COG as
explicit directional context. Table/timeline and map refinements preserve the
mobile collaborative-debrief flow.

GPX/VKX/FIT ingestion, cross-format normalization and canonical logical
fingerprint/deduplication are **Future / Unassigned**, with no v0.8.x or other
release commitment. Long-term source-format independence remains a direction;
Garmin Connect remains separate future work. Advanced analytics remain bounded
by the explicit non-goals in the requirements.

Small focused corrective, technical-debt and operational maintenance may remain
within v0.7.x when evidence justifies it, preserving backward compatibility
unless explicitly changed. This does not authorize unrelated feature expansion.

References: [requirements](docs/v0.7-collaborative-debrief-analytics-requirements.md) and [decisions](docs/v0.7-decisions.md).

## v0.7.1 Californian — Analysis Window Maneuver Metrics

**Status:** Release-ready / automated release validation passed; production validation pending

Makes explicit maneuver selection more useful on narrow screens by showing
Loss in metres, equivalent Loss time and Recovery time beneath the compact
Primary or Comparison summary that owns the event. Dominant COG remains visible
there without the redundant text label. Existing maneuver calculations,
Activity/Session, Analysis Window, replay, Summary and map telemetry semantics
remain unchanged.

---

## Backlog relationship

Open GitHub Issues are the canonical inventory of pending work. Each Issue is a
backlog item; the GitHub Project provides its presentation and physical ordering.

An open Issue is a proposal, not governing product semantics. Only scope
explicitly committed in release requirements/decisions belongs to a concrete
release. Other work remains Unassigned or Future 0.6.x as explicitly decided.

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
| v0.7.0 | Californian — Collaborative Debrief Analytics | Delivered / automated validation passed; production validation pending |
| v0.7.1 | Californian — Analysis Window Maneuver Metrics | Release-ready / automated validation passed; production validation pending |

---

# Versión en español

TackBar evoluciona de forma incremental, validando cada etapa del producto con actividades reales de navegación antes de incorporar más complejidad.

El roadmap se mantiene deliberadamente a alto nivel. Los requisitos detallados
se mantienen por separado; los Issues abiertos de GitHub y el GitHub Project
presentan el trabajo pendiente.

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
multi-formato queda Future / Unassigned.

Cualquier trabajo adicional v0.6.x permanece sin asignar salvo promoción
explícita. El trabajo pendiente se mantiene en Issues abiertos de GitHub y no se
infiere de documentos históricos de release.

---

## v0.7.0 Californian — Collaborative Debrief Analytics

**Estado:** Entregado / validación automatizada superada; validación de producción pendiente

Entrega analítica útil de maniobras a partir de la telemetría ya disponible en
Activities canónicas derivadas de Vakaros. Los eventos neutrales se persisten
con invalidación por versión/hash, se exponen mediante el límite de capability
existente y aparecen en la timeline de Analysis Window y en una tabla compacta
y ordenable de Maneuvers. Seleccionar un marcador o fila mueve el
`playbackTime` compartido al centro del evento, destaca la fila y enfoca la
Activity relevante en el área visible del mapa sin cambiar la Analysis Window.

Las métricas entregadas son hora/duración, cambio circular de HDG, SOG de
entrada/mínima/salida, tiempo de recuperación y Loss con referencia constante
a la SOG de entrada en metros y segundos equivalentes. Los valores permanecen
no disponibles cuando los datos son insuficientes. Una maniobra no equivale
automáticamente a virada/trasluchada y se preservan las semánticas de
Activity/Session, Analysis Window, mapa/replay, gráficos y Summary.

Los resúmenes compactos de Analysis Window también muestran el Dominant COG
existente como contexto direccional explícito. Los refinamientos de tabla,
timeline y mapa preservan el flujo mobile-first de debriefing colaborativo.

GPX/VKX/FIT, normalización entre formatos y fingerprint/deduplicación lógica
quedan **Future / Unassigned**, sin asignación a v0.8.x ni a otra release.
Se conserva la dirección futura de independencia de formatos; Garmin Connect
sigue siendo trabajo futuro separado. Los no objetivos explícitos limitan la
analítica avanzada.

Se mantiene el mantenimiento pequeño y focalizado con evidencia concreta y
compatibilidad preservada salvo cambio explícito, sin expansión no relacionada.

Referencias: [requisitos](docs/v0.7-collaborative-debrief-analytics-requirements.md) y [decisiones](docs/v0.7-decisions.md).

## v0.7.1 Californian — Métricas de maniobra en Analysis Window

**Estado:** Lista para release / validación automatizada superada; validación de producción pendiente

Hace más útil la selección explícita de maniobras en pantallas estrechas al
mostrar Loss en metros, Loss equivalente en segundos y tiempo de recuperación
bajo el resumen compacto Primary o Comparison propietario del evento. Dominant
COG permanece visible sin la etiqueta de texto redundante. Las semánticas
existentes de cálculo de maniobras, Activity/Session, Analysis Window, replay,
Summary y telemetría del mapa permanecen sin cambios.

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
| v0.7.0 | Californian — Collaborative Debrief Analytics | Entregado / validación automatizada superada; validación de producción pendiente |
| v0.7.1 | Californian — Analysis Window Maneuver Metrics | Lista para release / validación automatizada superada; validación de producción pendiente |
