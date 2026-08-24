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

---

## Current milestone — v0.5.0 Real Sailing Pilot

Goal: validate TackBar with a small controlled group of real sailors using the complete ingestion → Session → shared debrief workflow while introducing the minimum consent, access and administration required for a real pilot.

Current release direction:

- PENDING / ACTIVE / REVOKED Sailor consent state;
- backend-enforced ACTIVE-only shared visibility;
- human-operated consent confirmation for the PoC;
- Gmail remains the pilot track-sharing provider;
- mailbox ingestion triggered manually from protected Admin;
- ingestion records sufficient for diagnosis and idempotent reprocessing;
- minimal protected `/admin` operations;
- Session capability URLs distinct from internal Session IDs;
- Session capability regeneration/revocation;
- fixed PoC Session expiration at 60 days;
- preservation of the delivered v0.4 Viewer and Session-matching semantics.

v0.5.0 does not require automatic Gmail polling, automatic consent-reply interpretation, automatic outbound email, Sailor login, QR sharing, Personal TackBar, new advanced sailing analytics, or infrastructure redesign.

Detailed requirements: `docs/v0.5-real-sailing-pilot-requirements.md`.

Closed decision rationale: `docs/v0.5-decisions.md`.

---

## After v0.5.0

Future work is intentionally not assigned to a release until product validation justifies it.

The canonical future-work inventory is:

`docs/product-backlog.md`

That backlog includes product, ingestion, analytics, privacy/retention, operational and deployment work discovered in current and historical requirements.

The roadmap should remain high-level rather than duplicating detailed backlog items.

---

## Releases

Development milestones are published as GitHub Releases.

Current sequence:

- `v0.1.0` — Email Track Ingestion PoC
- `v0.2.0` — Automatic Session Detection
- `v0.3.0` — Multi-Track Viewer
- `v0.4.0` — Collaborative Sailing Debrief PoC
- `v0.5.0` — Real Sailing Pilot

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

---

## Hito actual — v0.5.0 Piloto con regatistas reales

Objetivo: validar TackBar con un pequeño grupo controlado de regatistas reales usando el flujo completo ingesta → Session → debriefing compartido e incorporando el mínimo consentimiento, acceso y administración necesario para un piloto real.

Dirección de la release:

- estado de consentimiento PENDING / ACTIVE / REVOKED;
- visibilidad compartida ACTIVE-only aplicada en backend;
- confirmación humana del consentimiento para la PoC;
- Gmail continúa como proveedor de intercambio de tracks del piloto;
- ingesta del buzón lanzada manualmente desde Admin protegido;
- registros de ingesta suficientes para diagnóstico y reproceso idempotente;
- operaciones mínimas en `/admin`;
- capability URLs de Session separadas del Session ID interno;
- regeneración/revocación de capability URL;
- expiración fija de Session a 60 días para la PoC;
- preservación de las semánticas entregadas de Viewer y Session matching de v0.4.

v0.5.0 no requiere polling automático de Gmail, interpretación automática de respuestas de consentimiento, email saliente automático, login de Sailor, QR, Personal TackBar, nueva analítica avanzada ni rediseño de infraestructura.

Requisitos detallados: `docs/v0.5-real-sailing-pilot-requirements.md`.

Razonamiento de decisiones cerradas: `docs/v0.5-decisions.md`.

---

## Después de v0.5.0

El trabajo futuro no se asigna a una release hasta que la validación del producto lo justifique.

El inventario canónico de trabajo futuro es:

`docs/product-backlog.md`

Ese backlog reúne trabajo de producto, ingesta, analítica, privacidad/retención, operación y despliegue identificado tanto en requisitos actuales como históricos.

El roadmap debe mantenerse a alto nivel y evitar duplicar el detalle del backlog.

---

## Releases

Los hitos principales se publican como GitHub Releases.

Secuencia actual:

- `v0.1.0` — PoC de ingesta de tracks por email
- `v0.2.0` — Detección automática de Sessions
- `v0.3.0` — Visor multi-track
- `v0.4.0` — PoC de debriefing colaborativo
- `v0.5.0` — Piloto con regatistas reales

El alcance de futuras releases se definirá a partir de necesidades de producto validadas y del backlog canónico.
