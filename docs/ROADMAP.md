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

Goal: validate TackBar with real sailors using the complete ingestion → Session → shared debrief workflow with the minimum consent, access and administration needed for a controlled pilot.

Delivered direction:

- PENDING / ACTIVE / REVOKED Sailor consent;
- backend-enforced ACTIVE-only shared visibility;
- human-operated consent confirmation;
- protected Admin operation;
- Gmail pilot ingestion;
- persistent ingestion history and idempotent reprocessing;
- Session capability URLs;
- Session expiration and renewal;
- validated real-pilot workflow while preserving Viewer and Session-matching semantics.

Detailed requirements: `docs/v0.5-real-sailing-pilot-requirements.md`.

Closed decision rationale: `docs/v0.5-decisions.md`.

---

## Current milestone — v0.6.0 Personal TackBar & Pilot Operations

Goal: make TackBar easier for sailors to return to and easier to operate as a real pilot, while consolidating the product identity.

Current release direction:

- read-only Personal TackBar / My Activities through a personal capability URL;
- simpler Admin maintenance for ingestions and Sessions;
- Gmail + OVHcloud mailbox support behind the same ingestion boundary;
- official TackBar visual brand with logo and core color palette;
- transition of TackBar's own public source code to MPL-2.0;
- preservation of current consent, Session matching and Session Viewer semantics.

Detailed requirements: `docs/v0.6-personal-tackbar-pilot-operations-requirements.md`.

Closed decision rationale: `docs/v0.6-decisions.md`.

---

## Planned milestone — v0.7.0 Multi-Format Track Ingestion

Goal: make TackBar independent from the source file format while preserving one canonical Activity → Session → Viewer flow.

Planned direction:

- GPX support first;
- VKX support second;
- FIT support third;
- all supported formats normalize to the canonical TackBar track representation;
- define canonical post-normalization track fingerprinting/logical deduplication
  together with the multi-format normalization contract;
- acquisition provider and file format remain separate concerns;
- existing Session and Viewer semantics remain unchanged.

Detailed requirements: `docs/v0.7-multi-format-track-ingestion-requirements.md`.

Closed decision rationale: `docs/v0.7-decisions.md`.

---

## After v0.7.0

Future work remains unassigned until product validation justifies promotion into a release.

The canonical future-work inventory is:

`docs/product-backlog.md`

The roadmap remains intentionally high-level and should not duplicate detailed release requirements or backlog entries.

---

## Releases

Development milestones are published as GitHub Releases.

Current sequence:

- `v0.1.0` — Email Track Ingestion PoC
- `v0.2.0` — Automatic Session Detection
- `v0.3.0` — Multi-Track Viewer
- `v0.4.0` — Collaborative Sailing Debrief PoC
- `v0.5.0` — Real Sailing Pilot
- `v0.6.0` — Personal TackBar & Pilot Operations
- `v0.7.0` — Multi-Format Track Ingestion

Future release scope will be defined from validated product needs and the canonical backlog.

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

### v0.5.0 — Piloto con regatistas reales

Objetivo: validar TackBar con regatistas reales usando el flujo completo ingesta → Session → debriefing compartido e incorporando el mínimo consentimiento, acceso y administración necesario para un piloto controlado.

Dirección entregada:

- consentimiento Sailor PENDING / ACTIVE / REVOKED;
- visibilidad compartida ACTIVE-only aplicada en backend;
- confirmación humana del consentimiento;
- operación Admin protegida;
- ingesta piloto mediante Gmail;
- historial persistente de ingesta y reproceso idempotente;
- capability URLs de Session;
- expiración y renovación de Session;
- validación del flujo real manteniendo las semánticas existentes de Viewer y Session matching.

Requisitos detallados: `docs/v0.5-real-sailing-pilot-requirements.md`.

Razonamiento de decisiones cerradas: `docs/v0.5-decisions.md`.

---

## Hito actual — v0.6.0 Personal TackBar & Pilot Operations

Objetivo: facilitar que el regatista vuelva a TackBar y que el piloto real sea más sencillo de operar, consolidando al mismo tiempo la identidad del producto.

Dirección de la release:

- Personal TackBar / My Activities read-only mediante capability URL personal;
- mantenimiento Admin más simple para ingestas y Sessions;
- soporte de buzones Gmail + OVHcloud detrás de la misma frontera de ingesta;
- identidad visual oficial de TackBar con logo y paleta principal;
- transición del código público propio de TackBar a MPL-2.0;
- preservación de las semánticas actuales de consentimiento, Session matching y Session Viewer.

Requisitos detallados: `docs/v0.6-personal-tackbar-pilot-operations-requirements.md`.

Razonamiento de decisiones cerradas: `docs/v0.6-decisions.md`.

---

## Hito planificado — v0.7.0 Multi-Format Track Ingestion

Objetivo: hacer TackBar independiente del formato de fichero de origen manteniendo un único flujo canónico Activity → Session → Viewer.

Dirección planificada:

- soporte GPX primero;
- soporte VKX después;
- soporte FIT en tercer lugar;
- todos los formatos soportados se normalizan a la representación canónica TackBar;
- definición del fingerprint canónico/deduplicación lógica post-normalización
  junto con el contrato de normalización multi-formato;
- proveedor de adquisición y formato de fichero permanecen como responsabilidades separadas;
- las semánticas existentes de Session y Viewer no cambian.

Requisitos detallados: `docs/v0.7-multi-format-track-ingestion-requirements.md`.

Razonamiento de decisiones cerradas: `docs/v0.7-decisions.md`.

---

## Después de v0.7.0

El trabajo futuro permanece sin asignar hasta que la validación del producto justifique su promoción a una release.

El inventario canónico de trabajo futuro es:

`docs/product-backlog.md`

El roadmap debe mantenerse deliberadamente a alto nivel y no duplicar requisitos detallados ni entradas del backlog.

---

## Releases

Los hitos principales se publican como GitHub Releases.

Secuencia actual:

- `v0.1.0` — PoC de ingesta de tracks por email
- `v0.2.0` — Detección automática de Sessions
- `v0.3.0` — Visor multi-track
- `v0.4.0` — PoC de debriefing colaborativo
- `v0.5.0` — Piloto con regatistas reales
- `v0.6.0` — Personal TackBar & Pilot Operations
- `v0.7.0` — Multi-Format Track Ingestion

El alcance de releases posteriores se definirá a partir de necesidades de producto validadas y del backlog canónico.
