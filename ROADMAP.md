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

Goal: connect persisted TackBar Sessions and Activities to the mobile-first Session Viewer for real collaborative debriefing around a phone or tablet.

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

Delivered and validated end-to-end with real sailing data, Gmail messages and
runtime persistence.

Delivered direction:

- Sailor consent lifecycle and backend-enforced ACTIVE-only shared visibility;
- protected Admin pilot operation and manually triggered Gmail ingestion;
- ingestion history and idempotent reprocessing;
- Session capability URLs, expiration and renewal;
- controlled real-sailing pilot validation with the existing Session Viewer.

References: [requirements](docs/v0.5-real-sailing-pilot-requirements.md) and
[CHANGELOG](CHANGELOG.md).

### v0.5.1 — Pilot Fix & Usability

Delivered: clearer Admin Session operational context, Sailor participation/history
visibility and ingestion track context, preserving the validated v0.5.0 product flow.

Reference: [requirements](docs/v0.5.1-pilot-fix-and-usability-requirements.md).

---

## Current milestone — v0.6.0 Personal TackBar & Pilot Operations

The next incremental productization step after the validated real-sailing pilot.
This is current release direction, not a declaration that all v0.6 functionality
has been delivered.

- Personal TackBar / My Activities with stable personal capability access for
  ACTIVE Sailors;
- personal Activity history independent from shared Session expiration;
- Admin ingestion `Discard` / `Restore` and practical Session maintenance;
- Gmail and the TackBar OVHcloud mailbox behind one provider-independent
  ingestion boundary;
- incremental application brand consolidation using TackBar Web as the current
  visual reference: logo/wordmark and coherent identity, without a full frontend redesign;
- prospective MPL-2.0 transition, preserving third-party notices and historical
  MIT versions. The root license transition is already applied.

Personal access follows:

`My Activities → own Activity remains accessible while Sailor == ACTIVE and the personal capability is valid`

A shared Session is an additional collaborative view only while its shared
capability is usable. Shared Session expiration does not remove personal
Activity access. This direction does not define a second, unrelated Viewer product.

References: [requirements](docs/v0.6-personal-tackbar-pilot-operations-requirements.md)
and [decisions](docs/v0.6-decisions.md).

---

## Planned milestone — v0.7.0 Multi-Format Track Ingestion

Extend the existing ingestion flow to additional file formats while preserving
one canonical TackBar normalized track representation.

Implementation and validation order: **GPX → VKX → FIT**.

- preserve existing Vakaros CSV/CSV.GZ support;
- keep provider and source-format ingestion boundaries independent;
- converge all formats on the same canonical normalized track;
- derive SOG/COG deterministically when required by source data;
- introduce deterministic, Sailor-scoped logical duplicate resolution after
  normalization, with the fingerprint contract finalized using representative
  multi-format data before persistence.

References: [requirements](docs/v0.7-multi-format-track-ingestion-requirements.md)
and [decisions](docs/v0.7-decisions.md).

---

## Backlog relationship

[docs/product-backlog.md](docs/product-backlog.md) remains the canonical inventory
of unfinished future work. Only scope already committed in the corresponding
release requirements and decisions belongs to v0.6 or v0.7. Other backlog items
remain unassigned unless explicitly promoted; this roadmap does not duplicate
their detailed scope.

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
| v0.6.0 | Personal TackBar & Pilot Operations | Current |
| v0.7.0 | Multi-Format Track Ingestion | Planned |

---

# Versión en español

TackBar evoluciona de forma incremental, validando cada etapa del producto con actividades reales de navegación antes de incorporar más complejidad.

El roadmap se mantiene deliberadamente a alto nivel. Los requisitos detallados de cada release y el backlog futuro se mantienen en documentos separados.

## Hipótesis principal del producto

`varios regatistas → comparten tracks → detección automática de Session → debriefing colaborativo`

---

## Hitos entregados

### v0.1.0 — PoC de ingesta de tracks por email

Objetivo: demostrar que TackBar puede recibir y procesar tracks de navegación enviados por correo electrónico.

Dirección entregada:

- ingesta de adjuntos por email;
- soporte Vakaros CSV/CSV.GZ;
- identidad mediante email remitente;
- parsing y normalización;
- persistencia de originales y tracks;
- procesamiento posterior independiente del proveedor.

### v0.2.0 — Detección automática de Sessions

Objetivo: asociar automáticamente Activities compatibles con la misma Session.

Dirección entregada:

- compatibilidad temporal;
- proximidad geográfica;
- creación automática de Session;
- asociación automática Activity-to-Session.

El comportamiento actual de Session matching es una baseline establecida y no se redefine por trabajos posteriores de Viewer o control de acceso salvo requisito explícito.

### v0.3.x — Visor multi-track

Objetivo: visualizar y comparar una o dos Activities de la misma Session.

Baseline entregada:

- Activity principal y Activity de comparación opcional;
- Analysis Window GPS/UTC compartida;
- Replay sincronizado;
- métricas resumen básicas;
- base del Viewer SOG/COG;
- experiencia responsive mobile-first.

Semántica detallada: `docs/session-viewer-requirements.md`.

### v0.4.0 — PoC de debriefing colaborativo de vela

Objetivo: conectar Sessions y Activities persistidas por TackBar con el Session Viewer mobile-first para realizar debriefing colaborativo real alrededor de un móvil o tablet.

Baseline entregada:

- identidad Sailor separada del contexto Boat;
- Activity persistida con contexto Boat opcional;
- APIs FastAPI de lectura de Session/track;
- frontend conectado a datos persistidos del backend;
- comparación de una/dos Activities;
- Analysis Window y Replay compartidos;
- telemetría fija GPS/SOG/COG/HEEL en el mapa;
- Summary refinado;
- gráficos SOG/COG/HEEL/TRIM;
- validación enfocada en móvil/tablet.

Requisitos detallados: `docs/v0.4-collaborative-debrief-requirements.md`.

### v0.5.0 — Real Sailing Pilot

Entregado y validado de extremo a extremo con datos reales de navegación,
mensajes Gmail y persistencia runtime.

Dirección entregada:

- ciclo de consentimiento de Sailor y visibilidad compartida ACTIVE-only aplicada en backend;
- operación del piloto desde Admin protegido e ingesta Gmail lanzada manualmente;
- historial de ingesta y reproceso idempotente;
- capability URLs de Session, expiración y renovación;
- validación del piloto controlado con navegaciones reales y el Session Viewer existente.

Referencias: [requisitos](docs/v0.5-real-sailing-pilot-requirements.md) y
[CHANGELOG](CHANGELOG.md).

### v0.5.1 — Pilot Fix & Usability

Entregado: contexto operativo más claro de Sessions en Admin, visibilidad de
participación/historial de Sailors y contexto de tracks en ingestas, preservando
el flujo de producto validado de v0.5.0.

Referencia: [requisitos](docs/v0.5.1-pilot-fix-and-usability-requirements.md).

---

## Hito actual — v0.6.0 Personal TackBar & Pilot Operations

El siguiente paso incremental de consolidación del producto tras el piloto real
validado. Es la dirección actual de la release, no una declaración de que toda
la funcionalidad v0.6 esté entregada.

- Personal TackBar / My Activities con acceso mediante capability personal estable
  para Sailors ACTIVE;
- historial personal de Activities independiente de la expiración de la Session compartida;
- `Discard` / `Restore` de ingestas en Admin y mantenimiento práctico de Sessions;
- Gmail y el buzón TackBar en OVHcloud detrás de una ingesta independiente del proveedor;
- consolidación incremental de la marca de la aplicación usando TackBar Web como
  referencia visual actual: logo/wordmark e identidad coherente, sin rediseño completo del frontend;
- transición prospectiva a MPL-2.0, preservando avisos de terceros y versiones
  históricas MIT. La transición de la licencia raíz ya está aplicada.

El acceso personal sigue este criterio:

`My Activities → la Activity propia sigue accesible mientras Sailor == ACTIVE y la capability personal sea válida`

La Session compartida es una vista colaborativa adicional sólo mientras su
capability compartida sea utilizable. La expiración de la Session compartida no
elimina el acceso personal a la Activity. Esta dirección no define un segundo
producto Viewer independiente.

Referencias: [requisitos](docs/v0.6-personal-tackbar-pilot-operations-requirements.md)
y [decisiones](docs/v0.6-decisions.md).

---

## Hito previsto — v0.7.0 Multi-Format Track Ingestion

Ampliar el flujo de ingesta existente a otros formatos de archivo conservando
una única representación canónica de track normalizado de TackBar.

Orden de implementación y validación: **GPX → VKX → FIT**.

- conservar el soporte existente de Vakaros CSV/CSV.GZ;
- mantener independientes los límites de ingesta por proveedor y formato de origen;
- hacer converger todos los formatos en el mismo track normalizado canónico;
- derivar SOG/COG de forma determinista cuando los datos de origen lo requieran;
- incorporar resolución determinista de duplicados lógicos por Sailor tras la
  normalización, cerrando el contrato de fingerprint con datos representativos
  de varios formatos antes de persistirlo.

Referencias: [requisitos](docs/v0.7-multi-format-track-ingestion-requirements.md)
y [decisiones](docs/v0.7-decisions.md).

---

## Relación con el backlog

[docs/product-backlog.md](docs/product-backlog.md) sigue siendo el inventario
canónico del trabajo futuro pendiente. Sólo el alcance ya comprometido en los
requisitos y decisiones de cada release pertenece a v0.6 o v0.7. Los demás
puntos del backlog siguen sin asignación salvo promoción explícita; este
roadmap no duplica su alcance detallado.

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
| v0.6.0 | Personal TackBar & Pilot Operations | Actual |
| v0.7.0 | Multi-Format Track Ingestion | Previsto |
