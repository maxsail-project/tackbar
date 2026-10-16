# Changelog

All notable changes to TackBar will be documented in this file.

## v0.7.12 Californian — Signal Analytics & Individual Analysis (Published and technically deployed)

### English

Deepens the collaborative debrief with clearer, lighter signal views, richer
time-weighted HEEL/TRIM evidence and a new per-sailor HEEL × SOG view inside
Individual Analysis.

### Added

* VS now includes a signed HEEL semicircular distribution based on represented
  time, with fixed `[-20°, +20°)` geometry, 2° bins, explicit signed guides and
  aligned Primary/Comparison scaling without assigning sailing meaning to the
  HEEL sign.
* VS now includes a signed TRIM boxplot using represented-time-weighted
  quartiles, median and Tukey whiskers. Primary and Comparison share one signed
  scale, and outlier/statistical detail remains available through accessible
  SVG markup without adding a dense visible statistics block.
* Each selected Activity in Individual Analysis now includes its own native-SVG
  HEEL × SOG represented-time density map below the SOG + COG chart. It uses
  actual UTC intervals and Analysis Window clipping, fixed signed HEEL bins,
  shared SOG geometry and intensity comparison, Activity color identity and an
  explicit low-coverage state without overlaying Primary and Comparison.

### Changed

* The main SOG and COG time-series now use focused native-SVG raw and smoothed
  signal views. SOG uses a centered time-weighted trend; COG uses a circular-safe
  centered time-weighted mean and explicit 0°/360° wrap breaks. Both retain the
  shared Analysis Window and playback cursor while removing chart-local zoom,
  Reset and tooltip interaction.
* HEEL now uses a native-SVG stepped signal built from UTC-aligned 2-second
  represented-time buckets, while TRIM uses a native-SVG signed raw trace with
  presentation-only point reduction. Both preserve gaps, the signed zero
  reference, shared playback time and Comparison-before-Primary rendering.
* Signal charts preserve Primary/Comparison readability through deterministic
  render order and equal visual weight for equivalent roles; Activity identity
  remains color-based. SOG and COG raw/smoothed configuration remains
  centralized, with smoothed traces aligned to opacity `0.6`.
* Summary keeps its eight-row structure but now reports independent positive
  and negative represented-time-weighted medians for HEEL and TRIM. Zero belongs
  to neither sign group, gaps over 1.5 seconds are not bridged, and Summary
  Distance now displays the existing accumulated distance in whole metres.
* Individual Analysis keeps one combined SOG + COG chart per Activity but now
  renders it in native SVG using the accepted SOG and circular-safe COG signal
  semantics. The Analysis Window remains the only temporal selector and each
  Activity/Sailor retains an independent presentation.
* Existing canonical telemetry, map, replay, maneuver analytics, Activity,
  Session, consent, capability, backend/API and persistence semantics remain
  unchanged outside the completed Viewer increments.

### Fixed

* SOG and COG smoothed traces now use the same partial opacity in the main
  comparison charts and Individual Analysis, reducing excess visual weight in
  dense overlap without changing signal calculations, path geometry, stroke
  widths, colors or draw order.

### Issues

- [#73](https://github.com/maxsail-project/tackbar/issues/73) — [#73] Fix Primary rendering hierarchy in metric time-series
- [#88](https://github.com/maxsail-project/tackbar/issues/88) — [#88] PoC native-SVG SOG time-series signal viewer
- [#89](https://github.com/maxsail-project/tackbar/issues/89) — [#89] PoC native-SVG raw + circular-smoothed COG time-series
- [#90](https://github.com/maxsail-project/tackbar/issues/90) — [#90] PoC native-SVG stepped HEEL time-series
- [#91](https://github.com/maxsail-project/tackbar/issues/91) — [#91] Migrate TRIM time-series to native SVG
- [#92](https://github.com/maxsail-project/tackbar/issues/92) — [#92] Add signed HEEL semicircular distribution to VS
- [#93](https://github.com/maxsail-project/tackbar/issues/93) — [#93] Add time-weighted signed TRIM P/C boxplot to VS
- [#94](https://github.com/maxsail-project/tackbar/issues/94) — [#94] Use signed HEEL/TRIM medians and display Distance in metres
- [#95](https://github.com/maxsail-project/tackbar/issues/95) — [#95] Migrate Individual Analysis SOG + COG time-series to native SVG
- [#96](https://github.com/maxsail-project/tackbar/issues/96) — [#96] Add HEEL vs SOG time-weighted density map to Individual Analysis
- [#97](https://github.com/maxsail-project/tackbar/issues/97) — Fix SOG and COG smoothed trace opacity

### Validation

Before release preparation, Issues #73 and #88–#97 recorded implementation
acceptance and manual validation PASS. Their recorded automated validation
covered focused Summary, VS, signal-chart, Individual Analysis, Analysis Window
and Session Viewer regressions, frontend typecheck, frontend production build
and `git diff --check` as applicable. Issue #96 additionally recorded 33 direct
density/Individual Analysis tests, a 112-test focused Viewer regression and an
11-test final density calculation rerun. No dependencies were added or removed.

Release preparation performed release-range and completed-Issue
reconciliation, documentation consistency, bilingual release-entry and
publication-body equivalence review, final diff and whitespace checks, and
repository/remote publication-state verification. The implementation checks
were not rerun during this documentation-only preparation.

At release preparation, production deployment remained pending. The existing
production-build large-chunk advisory was non-blocking, and no tag, GitHub
Release or production deployment was part of release preparation.

### Post-release status

v0.7.12 was published and its release-triggered production deployment completed
successfully. Workflow run `38796545799` resolved and deployed the exact
`v0.7.12` release tag at SHA
`92227bff34e132a214526db5fbf209b6dc3f7410`; the deployment health check passed.
This establishes publication and technical deployment only. A separate manual
functional validation PASS for the v0.7.12 production features is not recorded.

---

## v0.7.12 Californian — Analítica de señales y análisis individual (Publicada y desplegada técnicamente)

### Español

Profundiza el debrief colaborativo con vistas de señal más claras y ligeras,
evidencia temporal más rica de HEEL/TRIM y una nueva vista HEEL × SOG por
navegante dentro de Individual Analysis.

### Añadido

* VS incluye ahora una distribución semicircular de HEEL con signo basada en
  tiempo representado, geometría fija `[-20°, +20°)`, bins de 2°, guías con
  signo explícitas y escala Primary/Comparison alineada sin asignar significado
  náutico al signo de HEEL.
* VS incluye ahora un boxplot de TRIM con signo que usa cuartiles, mediana y
  bigotes de Tukey ponderados por tiempo representado. Primary y Comparison
  comparten una escala con signo, y el detalle estadístico y de outliers sigue
  disponible mediante markup SVG accesible sin añadir un bloque visual denso.
* Cada Activity seleccionada en Individual Analysis incluye ahora su propio
  mapa de densidad HEEL × SOG en SVG nativo debajo del chart SOG + COG. Usa
  intervalos UTC reales y recorte exacto al Analysis Window, bins fijos de HEEL
  con signo, geometría e intensidad SOG compartidas, identidad de color de la
  Activity y un estado explícito de baja cobertura sin superponer Primary y
  Comparison.

### Cambiado

* Las series temporales principales de SOG y COG usan ahora vistas focalizadas
  en SVG nativo con señal raw y suavizada. SOG usa una tendencia centrada
  ponderada por tiempo; COG usa una media centrada, ponderada por tiempo y
  circularmente segura con cortes explícitos en el cruce 0°/360°. Ambas
  conservan el Analysis Window y el cursor de replay compartidos y eliminan el
  zoom local, Reset y la interacción de tooltip del chart.
* HEEL usa ahora una señal escalonada en SVG nativo construida con buckets
  absolutos UTC de 2 segundos ponderados por tiempo, mientras TRIM usa un trazo
  raw con signo en SVG nativo y reducción solo de presentación. Ambos conservan
  gaps, referencia cero con signo, tiempo de replay compartido y renderizado de
  Comparison antes de Primary.
* Los charts de señal preservan la legibilidad Primary/Comparison mediante un
  orden de renderizado determinista y el mismo peso visual para roles
  equivalentes; la identidad de Activity sigue dependiendo del color. La
  configuración raw/suavizada de SOG y COG permanece centralizada, con los
  trazos suavizados alineados a opacidad `0.6`.
* Summary conserva su estructura de ocho filas, pero informa ahora medianas
  positivas y negativas independientes, ponderadas por tiempo representado,
  para HEEL y TRIM. Cero no pertenece a ninguno de los grupos de signo, no se
  salvan gaps superiores a 1.5 segundos y Distance muestra ahora la distancia
  acumulada existente en metros enteros.
* Individual Analysis mantiene un chart combinado SOG + COG por Activity, pero
  ahora lo renderiza en SVG nativo usando las semánticas de señal SOG aceptadas
  y COG circularmente seguras. El Analysis Window sigue siendo el único selector
  temporal y cada Activity/navegante conserva una presentación independiente.
* Las semánticas existentes de telemetría canónica, mapa, replay, analítica de
  maniobras, Activity, Session, consentimiento, capability, backend/API y
  persistencia permanecen sin cambios fuera de los incrementos Viewer
  completados.

### Corregido

* Los trazos suavizados de SOG y COG usan ahora la misma opacidad parcial en los
  charts principales de comparación e Individual Analysis, reduciendo el peso
  visual excesivo en solapes densos sin cambiar cálculos de señal, geometría de
  paths, grosores, colores ni orden de renderizado.

### Issues

- [#73](https://github.com/maxsail-project/tackbar/issues/73) — [#73] Fix Primary rendering hierarchy in metric time-series
- [#88](https://github.com/maxsail-project/tackbar/issues/88) — [#88] PoC native-SVG SOG time-series signal viewer
- [#89](https://github.com/maxsail-project/tackbar/issues/89) — [#89] PoC native-SVG raw + circular-smoothed COG time-series
- [#90](https://github.com/maxsail-project/tackbar/issues/90) — [#90] PoC native-SVG stepped HEEL time-series
- [#91](https://github.com/maxsail-project/tackbar/issues/91) — [#91] Migrate TRIM time-series to native SVG
- [#92](https://github.com/maxsail-project/tackbar/issues/92) — [#92] Add signed HEEL semicircular distribution to VS
- [#93](https://github.com/maxsail-project/tackbar/issues/93) — [#93] Add time-weighted signed TRIM P/C boxplot to VS
- [#94](https://github.com/maxsail-project/tackbar/issues/94) — [#94] Use signed HEEL/TRIM medians and display Distance in metres
- [#95](https://github.com/maxsail-project/tackbar/issues/95) — [#95] Migrate Individual Analysis SOG + COG time-series to native SVG
- [#96](https://github.com/maxsail-project/tackbar/issues/96) — [#96] Add HEEL vs SOG time-weighted density map to Individual Analysis
- [#97](https://github.com/maxsail-project/tackbar/issues/97) — Fix SOG and COG smoothed trace opacity

### Validación

Antes de preparar la release, los Issues #73 y #88–#97 registraron aceptación
de implementación y validación manual PASS. Su validación automatizada
registrada cubrió regresiones focalizadas de Summary, VS, charts de señal,
Individual Analysis, Analysis Window y Session Viewer, typecheck frontend, build
de producción frontend y `git diff --check` según correspondía. El Issue #96
registró además 33 tests directos de densidad/Individual Analysis, una regresión
Viewer focalizada de 112 tests y una ejecución final de 11 tests del cálculo de
densidad. No se añadieron ni eliminaron dependencias.

La preparación de la release comprobó el rango de release y la reconciliación
de Issues completados, la consistencia documental, la entrada bilingüe y la
equivalencia del cuerpo de publicación, el diff final y los espacios en blanco,
y el estado del repositorio, del remoto y de publicación. Los checks de
implementación no se volvieron a ejecutar durante esta preparación solo
documental.

En el momento de preparar la release, el despliegue en producción seguía
pendiente. El aviso existente de chunks grandes en el build de producción era
no bloqueante y la preparación no incluía ningún tag, GitHub Release ni
despliegue a producción.

### Estado posterior a la release

v0.7.12 fue publicada y su despliegue en producción activado por la release
terminó correctamente. La ejecución `38796545799` del workflow resolvió y
desplegó el tag exacto `v0.7.12` en el SHA
`92227bff34e132a214526db5fbf209b6dc3f7410`; el health check del despliegue pasó.
Esto establece únicamente la publicación y el despliegue técnico. No consta un
PASS separado de validación funcional manual de las funcionalidades v0.7.12 en
producción.

---

## v0.7.11 Californian — Admin Operational Clarity (Release-ready — production validation pending)

### English

Improves day-to-day Admin clarity by identifying the deployed release,
correcting quaternion telemetry evidence and separating inbound email timing
from sailing and processing time.

### Added

* Production release builds now inject the exact deployed release tag into the
  frontend, and Admin shows it in the existing header. Local development and
  test builds preserve the previous header without an empty separator when no
  release tag is available.

### Fixed

* Activity technical-track evidence now reports `QUATERNION` as one logical
  available telemetry channel when at least one canonical sample contains all
  four W/X/Y/Z quaternion components. Partial components spread across samples
  do not count as available, and existing channel order and detection remain
  unchanged.

### Changed

* Compact Ingestion summaries now show sender, provider and the inbound email
  receipt timestamp separately from the explicitly labelled Activity sailing
  interval and sample count.
* Expanded Ingestion detail keeps `Email received` with the original message
  provenance under Source, keeps processing-attempt timing under Processing,
  and retains outbound notification timing as a separate opposite-direction
  communication state.
* Existing deployment selection, canonical track schema, normalization,
  persistence, ingestion, retry/reprocess, outbound notification, Activity,
  Session, consent, capability, maneuver, Viewer and backend/API semantics
  remain unchanged outside the completed Admin increments.

### Issues

- [#84](https://github.com/maxsail-project/tackbar/issues/84) — [#84] Admin Activity technical track omits Quaternion availability
- [#85](https://github.com/maxsail-project/tackbar/issues/85) — [#85] Improve Ingestion email timing and inbound/outbound traceability
- [#86](https://github.com/maxsail-project/tackbar/issues/86) — [#86] Show deployed release version in Admin header

### Validation

Before release preparation, Issues #84, #85 and #86 recorded implementation
acceptance and manual validation PASS. Their recorded automated validation
covered 11 focused backend Admin Activity tests, 74 focused Admin frontend
tests, 2 deployment-script tests, frontend typecheck, frontend production
build and `git diff --check` as applicable. No dependencies were added or
removed.

Release preparation performed release-range and completed-Issue
reconciliation, documentation consistency, bilingual release-entry and
publication-body equivalence review, final diff and whitespace checks, and
repository/remote publication-state verification. The implementation checks
were not rerun during this documentation-only preparation.

Production deployment remains pending. The deployed Admin release label and
the clarified operational evidence have not yet been validated in the
production runtime. No tag, GitHub Release or production deployment is part of
release preparation.

---

## v0.7.11 Californian — Claridad operativa de Admin (Lista para release — validación de producción pendiente)

### Español

Mejora la claridad cotidiana de Admin identificando la release desplegada,
corrigiendo la evidencia de telemetría quaternion y separando el momento de
recepción del email de los tiempos de navegación y procesamiento.

### Añadido

* Los builds de releases de producción inyectan ahora en el frontend el tag
  exacto de la release desplegada, y Admin lo muestra en el encabezado
  existente. El desarrollo local y los builds de tests conservan el encabezado
  anterior sin un separador vacío cuando no hay tag de release disponible.

### Corregido

* La evidencia del track técnico de Activity muestra ahora `QUATERNION` como un
  único canal lógico de telemetría disponible cuando al menos una muestra
  canónica contiene los cuatro componentes quaternion W/X/Y/Z. Los componentes
  parciales repartidos entre muestras no cuentan como disponibles, y el orden y
  la detección de los canales existentes permanecen sin cambios.

### Cambiado

* Los resúmenes compactos de Ingestion muestran ahora remitente, proveedor y
  timestamp de recepción del email entrante separados del intervalo de
  navegación de la Activity, etiquetado explícitamente, y del número de muestras.
* El detalle expandido de Ingestion mantiene `Email received` con la procedencia
  del mensaje original en Source, conserva los tiempos de intentos en Processing
  y mantiene los tiempos de notificación saliente como un estado de comunicación
  separado y en dirección opuesta.
* Las semánticas existentes de selección del despliegue, esquema de track
  canónico, normalización, persistencia, ingestión, reintentos/reprocesamiento,
  notificación saliente, Activity, Session, consentimiento, capabilities,
  maniobras, Viewer y backend/API permanecen sin cambios fuera de los
  incrementos Admin completados.

### Issues

- [#84](https://github.com/maxsail-project/tackbar/issues/84) — [#84] Admin Activity technical track omits Quaternion availability
- [#85](https://github.com/maxsail-project/tackbar/issues/85) — [#85] Improve Ingestion email timing and inbound/outbound traceability
- [#86](https://github.com/maxsail-project/tackbar/issues/86) — [#86] Show deployed release version in Admin header

### Validación

Antes de preparar la release, los Issues #84, #85 y #86 registraron aceptación
de implementación y validación manual PASS. Su validación automatizada
registrada cubrió 11 tests backend focalizados de Admin Activity, 74 tests
frontend focalizados de Admin, 2 tests del script de despliegue, typecheck
frontend, build de producción frontend y `git diff --check` según correspondía.
No se añadieron ni eliminaron dependencias.

La preparación de la release comprobó el rango de release y la reconciliación
de Issues completados, la consistencia documental, la entrada bilingüe y la
equivalencia del cuerpo de publicación, el diff final y los espacios en blanco,
y el estado del repositorio, del remoto y de publicación. Los checks de
implementación no se volvieron a ejecutar durante esta preparación solo
documental.

El despliegue en producción sigue pendiente. La etiqueta de release desplegada
en Admin y la evidencia operativa aclarada aún no se han validado en el runtime
de producción. La preparación no incluye ningún tag, GitHub Release ni
despliegue a producción.

---

## v0.7.10 Californian — Admin Operations & Traceability (Release-ready — production validation pending)

### English

Makes TackBar Admin a coherent operational surface for following an inbound
track through Ingestion, Activity, Sailor and Session while preserving the
existing pilot, domain and Viewer semantics.

### Added

* Activities are now a first-class Admin section with compact searchable
  summaries, full-width operational detail, canonical track/source context,
  Sailor, Session and source-Ingestion traceability, read-only diagnostics and
  explicit maneuver-artifact status and recalculation.
* Admin Activity traceability resolves an authoritative source Ingestion when
  available, keeps a single reused or legacy relation navigable, represents
  multiple non-authoritative candidates as ambiguous without guessing, and
  exposes those candidates only as advanced diagnostic evidence.
* All four top-level Admin entity lists provide consistent client-side search
  over their already-loaded human-readable operational context, with exact IDs
  retained as a secondary traceability aid.

### Changed

* Ingestions, Activities, Sailors and Sessions now use one compact
  single-column list and full-width expanded-detail model. Cross-entity
  relations navigate to each entity's owning section with human-readable
  identity and consistent unavailable or ambiguous states.
* Admin presentation now uses a shared interaction grammar that keeps data,
  relations, actions, status and disclosure visually distinct across mobile,
  tablet and desktop, with consistent fact grids, relation rows, section
  hierarchy, maintenance groups and read-only diagnostics.
* Ingestion detail more clearly separates what arrived, processing history,
  outcome, produced Activity and related Sailor/Session context while
  preserving processing, deduplication, disposition and reprocessing behavior.
* Sailor detail now separates current state, consent, Personal TackBar access,
  Activity/Session traceability, communication state and eligible maintenance
  actions without changing consent or authorization semantics.
* Session detail now distinguishes technical membership and current
  shareability, original Session access, temporary QR access, lifetime and
  maintenance. The normal Admin renewal value is 90 days while generic
  lifetime-service behavior remains unchanged.
* Existing Activity identity, Session matching and membership, ingestion
  provenance, consent, ACTIVE-only visibility, capability and temporary-share
  lifecycle, maneuver analytics, Viewer and persistence semantics remain
  unchanged outside the completed Admin increments.

### Issues

- [#77](https://github.com/maxsail-project/tackbar/issues/77) — [#77] Review Admin Ingestion cards for operational readability and traceability
- [#78](https://github.com/maxsail-project/tackbar/issues/78) — [#78] Review Admin Sailor cards for operational readability and traceability
- [#79](https://github.com/maxsail-project/tackbar/issues/79) — [#79] Review Admin Session cards for operational readability and traceability
- [#80](https://github.com/maxsail-project/tackbar/issues/80) — [#80] Introduce Activities as a first-class Admin operational section
- [#81](https://github.com/maxsail-project/tackbar/issues/81) — [#81] Review and consolidate Admin cross-section UX/UI consistency

### Validation

Before release preparation, Issues #77, #79 and #80 recorded implementation
review and manual validation PASS together with focused backend/frontend tests,
frontend typecheck, frontend production build and `git diff --check` as
applicable. Issue #78 was closed as completed for the Sailor increment, and
Issue #81 recorded final manual Admin validation PASS across Ingestions,
Activities, Sailors and Sessions after the consolidated interaction grammar
and its documentation correction were accepted. No dependencies were added or
removed.

Release preparation performed release-range and completed-Issue
reconciliation, documentation consistency, bilingual release-entry and
publication-body equivalence review, final diff and whitespace checks, and
repository/remote publication-state verification. The implementation checks
were not rerun during this documentation-only preparation.

Production deployment and end-to-end validation of the consolidated Admin
workflows with real production pilot data remain pending. No tag, GitHub
Release or production deployment is part of release preparation.

---

## v0.7.10 Californian — Operaciones y trazabilidad de Admin (Lista para release — validación de producción pendiente)

### Español

Convierte TackBar Admin en una superficie operativa coherente para seguir un
track entrante a través de Ingestion, Activity, Sailor y Session, conservando
las semánticas existentes del piloto, del dominio y del Viewer.

### Añadido

* Activities es ahora una sección Admin de primer nivel con resúmenes compactos
  y buscables, detalle operativo a ancho completo, contexto de track canónico y
  origen, trazabilidad hacia Sailor, Session e Ingestion de origen, diagnósticos
  de solo lectura y estado y recálculo explícitos del artefacto de maniobras.
* La trazabilidad Admin de Activity resuelve una Ingestion de origen autoritativa
  cuando está disponible, mantiene navegable una única relación reutilizada o
  legacy, representa múltiples candidatos no autoritativos como ambiguos sin
  adivinar y expone esos candidatos solo como evidencia diagnóstica avanzada.
* Las cuatro listas de entidades Admin de primer nivel ofrecen una búsqueda
  client-side consistente sobre el contexto operativo legible ya cargado, con
  los IDs exactos conservados como ayuda secundaria de trazabilidad.

### Cambiado

* Ingestions, Activities, Sailors y Sessions usan ahora un único modelo de lista
  compacta de una columna y detalle expandido a ancho completo. Las relaciones
  entre entidades navegan a la sección propietaria de cada entidad con identidad
  legible y estados no disponibles o ambiguos consistentes.
* La presentación Admin usa ahora una gramática de interacción compartida que
  mantiene visualmente distintos datos, relaciones, acciones, estados y
  disclosures en móvil, tablet y escritorio, con grids de hechos, filas de
  relación, jerarquía de secciones, grupos de mantenimiento y diagnósticos de
  solo lectura consistentes.
* El detalle de Ingestion separa con más claridad lo recibido, el historial de
  procesamiento, el resultado, la Activity producida y el contexto relacionado
  de Sailor/Session, conservando el procesamiento, la deduplicación, la
  disposición administrativa y el reprocesamiento.
* El detalle de Sailor separa ahora estado actual, consentimiento, acceso a
  Personal TackBar, trazabilidad de Activities/Sessions, comunicación y acciones
  de mantenimiento elegibles sin cambiar las semánticas de consentimiento o
  autorización.
* El detalle de Session distingue ahora membresía técnica y compartibilidad
  actual, acceso original a Session, acceso QR temporal, ciclo de vida y
  mantenimiento. El valor normal de renovación en Admin es de 90 días, mientras
  el comportamiento genérico del servicio de ciclo de vida permanece sin cambios.
* Las semánticas existentes de identidad de Activity, matching y membresía de
  Session, procedencia de Ingestion, consentimiento, visibilidad solo ACTIVE,
  ciclo de vida de capabilities y shares temporales, analítica de maniobras,
  Viewer y persistencia permanecen sin cambios fuera de los incrementos Admin
  completados.

### Issues

- [#77](https://github.com/maxsail-project/tackbar/issues/77) — [#77] Review Admin Ingestion cards for operational readability and traceability
- [#78](https://github.com/maxsail-project/tackbar/issues/78) — [#78] Review Admin Sailor cards for operational readability and traceability
- [#79](https://github.com/maxsail-project/tackbar/issues/79) — [#79] Review Admin Session cards for operational readability and traceability
- [#80](https://github.com/maxsail-project/tackbar/issues/80) — [#80] Introduce Activities as a first-class Admin operational section
- [#81](https://github.com/maxsail-project/tackbar/issues/81) — [#81] Review and consolidate Admin cross-section UX/UI consistency

### Validación

Antes de preparar la release, los Issues #77, #79 y #80 registraron revisión de
implementación y validación manual PASS junto con tests backend/frontend
focalizados, typecheck frontend, build de producción frontend y
`git diff --check` según correspondía. El Issue #78 se cerró como completado
para el incremento de Sailor, y el Issue #81 registró la validación manual Admin
final PASS en Ingestions, Activities, Sailors y Sessions tras aceptar la
gramática de interacción consolidada y su corrección documental. No se
añadieron ni eliminaron dependencias.

La preparación de la release comprobó el rango de release y la reconciliación
de Issues completados, la consistencia documental, la entrada bilingüe y la
equivalencia del cuerpo de publicación, el diff final y los espacios en blanco,
y el estado del repositorio, del remoto y de publicación. Los checks de
implementación no se volvieron a ejecutar durante esta preparación solo
documental.

El despliegue en producción y la validación end-to-end de los flujos Admin
consolidados con datos reales del piloto en producción siguen pendientes. La
preparación no incluye ningún tag, GitHub Release ni despliegue a producción.

---

## v0.7.9 Californian — Versus (VS) Analytics (Release-ready — production validation pending)

### English

Adds an Analysis Window distribution view that makes Primary and Comparison
speed and course patterns directly comparable while preserving the existing
time-series and collaborative Viewer semantics.

### Added

* `VS` is now the first and default Viewer mode, alongside the existing
  `SOG | COG | HEEL | TRIM` time-series views. It remains a presentation mode,
  not a new sailing metric.
* The VS view presents a time-weighted SOG speed histogram and a time-weighted
  circular COG course rose for the shared GPS/UTC Analysis Window. It works
  with Primary alone or with Primary and Comparison using common bins, sectors
  and per-chart percentage scales.
* Metric-specific time coverage is shown for each selected Activity. An
  Activity below the centralized 80% threshold is omitted from that
  distribution with an explicit unavailable message, while an eligible peer
  remains visible.

### Changed

* VS calculations use canonical source timestamps and the complete relevant
  normalized sample population. Represented intervals are clipped to the
  Analysis Window, gaps over the centralized 1.5-second limit are excluded,
  SOG uses aligned 0.5-knot bins, and COG uses north-centered circular 10°
  sectors with correct 0°/360° wrapping.
* Comparison renders before Primary and both use equivalent default visual
  weight, keeping Primary visible where geometries overlap without weakening
  Comparison by default. Visual and analytical tuning values are centralized.
* Existing SOG, COG, HEEL and TRIM time-series plus Summary, map, replay,
  maneuver, Session, persistence, consent and API semantics remain unchanged.

### Issues

- [#72](https://github.com/maxsail-project/tackbar/issues/72) — [#72] Add VS distribution view for Analysis Window comparison

### Validation

Before release preparation, Issue #72 recorded acceptance PASS at `0cedf33`
with 27 focused VS/selector/distribution tests, frontend typecheck, frontend
production build and `git diff --check` passing, plus manual responsive/visual
validation with real Viewer data. The build retained only the existing
non-failing Vite large-chunk advisory. No dependencies were added or removed.

Release preparation performed release-range and completed-Issue
reconciliation, documentation consistency, bilingual release-entry and
publication-body equivalence review, final diff and whitespace checks, and
repository/remote publication-state verification. The implementation checks
were not rerun during this documentation-only preparation.

Production deployment and end-to-end validation of VS with real production
Viewer data remain pending. No tag, GitHub Release or production deployment is
part of release preparation.

---

## v0.7.9 Californian — Analítica Versus (VS) (Lista para release — validación de producción pendiente)

### Español

Añade una vista de distribuciones para la Analysis Window que permite comparar
directamente los patrones de velocidad y rumbo de Primary y Comparison,
conservando las series temporales y las semánticas colaborativas existentes del
Viewer.

### Añadido

* `VS` es ahora la primera vista y la predeterminada del Viewer, junto a las
  series temporales existentes `SOG | COG | HEEL | TRIM`. Sigue siendo un modo
  de presentación, no una nueva métrica de navegación.
* La vista VS presenta un histograma de velocidad SOG ponderado por tiempo y
  una rosa circular de rumbo COG ponderada por tiempo para la Analysis Window
  GPS/UTC compartida. Funciona solo con Primary o con Primary y Comparison,
  usando bins, sectores y escalas porcentuales comunes dentro de cada gráfico.
* Se muestra la cobertura temporal específica de cada métrica para cada
  Activity seleccionada. Una Activity por debajo del umbral centralizado del
  80% se omite de esa distribución con un mensaje explícito de no
  disponibilidad, mientras una compañera elegible permanece visible.

### Cambiado

* Los cálculos de VS usan timestamps canónicos de origen y la población
  completa de muestras normalizadas relevantes. Los intervalos representados
  se recortan a la Analysis Window, se excluyen los huecos superiores al límite
  centralizado de 1,5 segundos, SOG usa bins alineados de 0,5 nudos y COG usa
  sectores circulares de 10° centrados al norte con tratamiento correcto del
  cruce 0°/360°.
* Comparison se renderiza antes que Primary y ambas tienen el mismo peso visual
  predeterminado, manteniendo visible Primary donde se solapan las geometrías
  sin debilitar Comparison por defecto. Los valores de ajuste visual y
  analítico están centralizados.
* Las series temporales existentes de SOG, COG, HEEL y TRIM, así como las
  semánticas de Summary, mapa, replay, maniobras, Session, persistencia,
  consentimiento y API, permanecen sin cambios.

### Issues

- [#72](https://github.com/maxsail-project/tackbar/issues/72) — [#72] Add VS distribution view for Analysis Window comparison

### Validación

Antes de preparar la release, el Issue #72 registró aceptación PASS en
`0cedf33` con 27 tests focalizados de VS/selector/distribuciones, typecheck
frontend, build de producción frontend y `git diff --check` correctos, además
de validación manual responsive/visual con datos reales del Viewer. El build
mantuvo únicamente el aviso no bloqueante existente de Vite sobre el tamaño de
chunks. No se añadieron ni eliminaron dependencias.

La preparación de la release comprobó el rango de release y la reconciliación
de Issues completados, la consistencia documental, la entrada bilingüe y la
equivalencia del cuerpo de publicación, el diff final y los espacios en blanco,
y el estado del repositorio, del remoto y de publicación. Los checks de
implementación no se volvieron a ejecutar durante esta preparación solo
documental.

El despliegue en producción y la validación end-to-end de VS con datos reales
del Viewer de producción siguen pendientes. La preparación no incluye ningún
tag, GitHub Release ni despliegue a producción.

---

## v0.7.8 Californian — Large Track Stability (Release-ready — production validation pending)

### English

Keeps the Session Viewer stable when a complete Activity contains a very large
timestamp population and hardens the existing release-based production
deployment path.

### Fixed

* Temporal chart ranges are now calculated iteratively from finite timestamps,
  avoiding JavaScript call-argument limits that could crash the Viewer on a
  valid large track.
* Exact minimum/maximum results, non-finite filtering and input immutability are
  preserved without downsampling or changing the complete normalized sample
  population, Analysis Window, chart or zoom semantics.

### Changed

* The production deployment script now prepares changed backend and frontend
  dependencies for the target release and restores the previous checkout when
  frontend preparation or build fails before publication.
* Production workflow run names now identify the requested release tag and
  whether the run came from release publication or manual dispatch.

### Issues

- [#69](https://github.com/maxsail-project/tackbar/issues/69) — [#69] Prevent Session Viewer crash on large tracks

### Validation

Before release preparation, Issue #69 recorded acceptance PASS at `4c6ff88`
with 15/15 targeted frontend tests, frontend typecheck, frontend production
build and `git diff --check` passing. Its regression coverage includes 150,000
unsorted timestamps, exact bounds, non-finite filtering, all-invalid input and
input immutability. No dependencies were added or removed.

Release preparation ran the complete frontend regression suite (328/328),
frontend typecheck, frontend production build and the focused deployment-script
tests (2/2); all passed. The production build retained its non-failing chunk-size
warning, and pytest reported a non-failing cache-write warning. Preparation also
performed release-range and completed-Issue reconciliation, documentation
consistency, bilingual release-entry and publication-body equivalence review,
final diff and whitespace checks, and repository/remote publication-state
verification.

Production deployment, validation against the real 128,415-sample Activity and
end-to-end validation of the dependency-aware deployment path remain pending.
No tag, GitHub Release or production deployment is part of release preparation.

---

## v0.7.8 Californian — Estabilidad con tracks grandes (Lista para release — validación de producción pendiente)

### Español

Mantiene estable el Session Viewer cuando una Activity completa contiene una
población de timestamps muy grande y refuerza la ruta existente de despliegue a
producción basada en releases.

### Corregido

* Los rangos temporales de los gráficos se calculan ahora de forma iterativa a
  partir de timestamps finitos, evitando los límites de argumentos de llamada
  de JavaScript que podían bloquear el Viewer con un track grande válido.
* Se conservan los resultados mínimo/máximo exactos, el filtrado de valores no
  finitos y la inmutabilidad de la entrada, sin downsampling ni cambios en la
  población completa de muestras normalizadas, la Analysis Window o las
  semánticas de gráficos y zoom.

### Cambiado

* El script de despliegue a producción prepara ahora las dependencias backend y
  frontend que cambien para la release objetivo y restaura el checkout anterior
  si falla la preparación o el build frontend antes de la publicación.
* Los nombres de las ejecuciones del workflow de producción identifican ahora
  el tag de release solicitado y si la ejecución procede de la publicación de
  una release o de un lanzamiento manual.

### Issues

- [#69](https://github.com/maxsail-project/tackbar/issues/69) — [#69] Prevent Session Viewer crash on large tracks

### Validación

Antes de preparar la release, el Issue #69 registró aceptación PASS en
`4c6ff88` con 15/15 tests frontend focalizados, typecheck frontend, build de
producción frontend y `git diff --check` correctos. Su cobertura de regresión
incluye 150.000 timestamps desordenados, límites exactos, filtrado de valores no
finitos, entrada completamente inválida e inmutabilidad de la entrada. No se
añadieron ni eliminaron dependencias.

La preparación de la release ejecutó la suite completa de regresión frontend
(328/328), el typecheck frontend, el build de producción frontend y los tests
focalizados del script de despliegue (2/2); todos fueron correctos. El build de
producción mantuvo su aviso no bloqueante sobre el tamaño de chunks y pytest
informó de un aviso no bloqueante al escribir la caché. La preparación también
comprobó el rango de release y la reconciliación de Issues completados, la
consistencia documental, la entrada bilingüe y la equivalencia del cuerpo de
publicación, el diff final y los espacios en blanco, y el estado del repositorio,
del remoto y de publicación.

El despliegue en producción, la validación con la Activity real de 128.415
muestras y la validación end-to-end de la ruta de despliegue con gestión de
dependencias siguen pendientes. La preparación no incluye ningún tag, GitHub
Release ni despliegue a producción.

---

## v0.7.7 Californian — Session Sharing & Pilot Cleanup (Release-ready — production validation pending)

### English

Adds bounded in-person Session sharing, makes original Session access expiry
visible, and removes the obsolete Gmail acquisition path from the pilot
runtime.

### Added

* A valid original Session capability can now create or reuse one temporary QR
  share for the same Session. The QR contains only a separate temporary TackBar
  capability and never exposes or redirects to the original Session capability.
* Temporary QR access expires at the earlier of 48 hours after creation or the
  Session expiry captured at creation, persists across backend restart, remains
  bound to the current originating capability and cannot create another share.
* The Session Viewer distinguishes temporary `Shared Session` access, shows its
  authoritative remaining lifetime and hides the Share action from temporary
  access. Existing ACTIVE-only visibility continues to apply.
* Original Session access now shows `Available until` with the authoritative
  backend expiry formatted in the browser's local timezone. Temporary access
  continues to use its separate temporary expiry.

### Changed

* Runtime mailbox acquisition is now OVH-only. `TACKBAR_MAILBOX_PROVIDER`
  remains the stable selection seam with `ovh` as its default and only accepted
  value.
* Historical ingestion records with `provider="gmail"` remain readable and
  reprocessable from preserved originals without Gmail access. Provider-message
  identity, OVH cursor and failure-isolation behavior, Activity and Session
  processing, consent, analytics and Viewer semantics remain unchanged.

### Removed

* The Gmail acquisition adapter, OAuth/token maintenance path, diagnostic
  script and Google client dependencies are no longer part of the runtime.
  Production credential/token cleanup remains an explicit operator action.

### Issues

- [#9](https://github.com/maxsail-project/tackbar/issues/9) — [#9] Remove Gmail mailbox support from the TackBar runtime
- [#25](https://github.com/maxsail-project/tackbar/issues/25) — [#25] QR Session sharing
- [#67](https://github.com/maxsail-project/tackbar/issues/67) — Show original Session access expiry in Viewer

### Validation

Before release preparation, Issue #9 recorded acceptance PASS with 76 focused
OVH/mailbox/ingestion tests, 146 broader related backend regression tests, 222
selected tests in total, successful import of all 73 `app` modules, backend
compile/import and PowerShell preflight checks, and a clean `git diff --check`.
It did not claim live-mailbox validation. Issue #25 recorded acceptance after
code review and manual validation; its accepted implementation includes focused
backend and frontend regression coverage for temporary-share creation, reuse,
lifetime, persistence, invalidation, visibility and presentation. Issue #67
recorded acceptance review and manual validation PASS, plus passing focused
backend/frontend tests, frontend typecheck and production build, Python compile
validation and `git diff --check`.

Release preparation performed release-range and completed-Issue reconciliation,
documentation consistency, bilingual release-entry and publication-body
equivalence review, final diff and whitespace checks, and repository/remote
publication-state verification. The implementation checks were not rerun during
this documentation-only preparation.

Production deployment and end-to-end production validation of the OVH-only
mailbox path, temporary QR Session sharing and original Session expiry
presentation remain pending. No tag, GitHub Release, production secret cleanup
or production deployment is part of release preparation.

---

## v0.7.7 Californian — Compartir Sessions y limpieza del piloto (Lista para release — validación de producción pendiente)

### Español

Añade el acceso compartido presencial y limitado a una Session, hace visible
la caducidad del acceso original a la Session y elimina del runtime del piloto
la ruta obsoleta de adquisición mediante Gmail.

### Añadido

* Una capability original válida de Session puede crear o reutilizar un único
  QR temporal para compartir la misma Session. El QR contiene solo una
  capability temporal e independiente de TackBar y nunca expone ni redirige a
  la capability original de la Session.
* El acceso QR temporal caduca en el momento más temprano entre 48 horas desde
  su creación y la caducidad de la Session capturada al crearlo, persiste tras
  reiniciar el backend, permanece vinculado a la capability de origen vigente
  y no puede crear otro acceso compartido.
* El Session Viewer distingue el acceso temporal `Shared Session`, muestra su
  tiempo restante autoritativo y oculta la acción Share en el acceso temporal.
  La visibilidad existente limitada a Sailors ACTIVE sigue aplicándose.
* El acceso original a la Session muestra ahora `Available until` con la
  caducidad autoritativa del backend formateada en la zona horaria local del
  navegador. El acceso temporal continúa usando su caducidad independiente.

### Cambiado

* La adquisición runtime del buzón es ahora exclusivamente mediante OVH.
  `TACKBAR_MAILBOX_PROVIDER` permanece como punto estable de selección, con
  `ovh` como valor predeterminado y único aceptado.
* Los registros históricos de ingestión con `provider="gmail"` siguen siendo
  legibles y reprocesables desde los originales conservados sin acceso a
  Gmail. La identidad de mensajes del proveedor, el cursor y el aislamiento de
  fallos de OVH, el procesamiento de Activities y Sessions, el consentimiento,
  la analítica y las semánticas del Viewer permanecen sin cambios.

### Eliminado

* El adaptador de adquisición de Gmail, la ruta de mantenimiento OAuth/tokens,
  el script de diagnóstico y las dependencias cliente de Google ya no forman
  parte del runtime. La limpieza de credenciales/tokens de producción sigue
  siendo una acción explícita del operador.

### Issues

- [#9](https://github.com/maxsail-project/tackbar/issues/9) — [#9] Remove Gmail mailbox support from the TackBar runtime
- [#25](https://github.com/maxsail-project/tackbar/issues/25) — [#25] QR Session sharing
- [#67](https://github.com/maxsail-project/tackbar/issues/67) — Show original Session access expiry in Viewer

### Validación

Antes de preparar la release, el Issue #9 registró aceptación PASS con 76 tests
focalizados de OVH/buzón/ingestión, 146 tests de regresión backend relacionados
más amplios, 222 tests seleccionados en total, importación correcta de los 73
módulos de `app`, checks de compilación/importación backend y preflight de
PowerShell correctos, y un `git diff --check` limpio. No declaró validación con
el buzón real. El Issue #25 registró aceptación tras revisión de código y
validación manual; su implementación aceptada incluye cobertura de regresión
backend y frontend focalizada en creación, reutilización, vigencia, persistencia,
invalidación, visibilidad y presentación del acceso temporal. El Issue #67
registró revisión de aceptación y validación manual PASS, además de tests
backend/frontend focalizados, typecheck frontend y build de producción,
validación de compilación Python y `git diff --check` correctos.

La preparación de la release comprobó el rango de release y la reconciliación
de Issues completados, la consistencia documental, la entrada bilingüe y la
equivalencia del cuerpo de publicación, el diff final y los espacios en blanco,
y el estado del repositorio, del remoto y de publicación. Los checks de
implementación no se volvieron a ejecutar durante esta preparación solo
documental.

El despliegue en producción y la validación end-to-end en producción de la ruta
de buzón exclusivamente OVH, el acceso QR temporal a Sessions y la presentación
de la caducidad de la Session original siguen pendientes. La preparación no
incluye ningún tag, GitHub Release, limpieza de secretos de producción ni
despliegue a producción.

---

## v0.7.6 Californian — Analytics & Map Orientation (Release-ready — production validation pending)

### English

Generates maneuver analytics during Activity processing and improves manual
map orientation during collaborative debriefing.

### Added

* Newly ingested Activities now generate their existing maneuver analytics
  artifact after the canonical track and Session processing have completed.
* Explicit Activity reprocessing now regenerates maneuver analytics against
  the rewritten canonical track.
* The Session Viewer map now shows its current geographic bearing in a compact,
  top-center `DIR 000°–359°` indicator that updates during rotation.

### Changed

* Eager maneuver generation reuses the existing algorithm, artifact schema,
  canonical-track SHA-256 invalidation and lazy self-healing path. Unexpected
  derived-analytics failures do not invalidate otherwise successful Activity
  or Session processing.
* Analysis Window-driven track refits now preserve the current MapLibre map
  bearing while continuing to update center and zoom for the visible bounds.
* Native map rotation gestures and controls, boat-marker COG compensation,
  maneuver API and metrics, replay, Analysis Window, Activity and Session
  semantics remain unchanged. The `DIR` value is map-camera orientation only;
  it does not introduce or infer wind, COG or HDG data.

### Issues

- [#63](https://github.com/maxsail-project/tackbar/issues/63) — Generate maneuver analytics when Activity processing completes
- [#64](https://github.com/maxsail-project/tackbar/issues/64) — Preserve map bearing when Analysis Window refits the track
- [#65](https://github.com/maxsail-project/tackbar/issues/65) — Show current map bearing in degrees

### Validation

Before release preparation, Issue #63 recorded human acceptance, technical
review PASS, passing focused backend regression and compile checks, and
confirmed best-effort analytics failure semantics with lazy recovery. Issue
#64 recorded technical review PASS, manual validation PASS with one and two
Activities, and passing focused frontend tests, typecheck, production build
and diff check. Issue #65 recorded technical review and manual validation PASS,
plus passing focused frontend tests, typecheck, production build and diff
check.

Release preparation performed documentation consistency, completed-Issue
traceability, bilingual release-entry and publication-body equivalence review,
final diff and whitespace checks, and repository/remote publication-state
verification. The implementation checks were not rerun during preparation.

Production deployment and end-to-end production validation of eager analytics
generation and map-orientation behavior remain pending. No tag, GitHub Release
or production deployment is part of release preparation.

---

## v0.7.6 Californian — Analítica y orientación del mapa (Lista para release — validación de producción pendiente)

### Español

Genera la analítica de maniobras durante el procesamiento de Activities y
mejora la orientación manual del mapa durante el debriefing colaborativo.

### Añadido

* Las Activities recién ingeridas generan ahora su artefacto existente de
  analítica de maniobras después de completar el track canónico y el
  procesamiento de la Session.
* El reprocesamiento explícito de una Activity regenera ahora la analítica de
  maniobras contra el track canónico reescrito.
* El mapa del Session Viewer muestra ahora su bearing geográfico actual en un
  indicador compacto y centrado arriba, `DIR 000°–359°`, que se actualiza
  durante la rotación.

### Cambiado

* La generación anticipada de maniobras reutiliza el algoritmo, el esquema del
  artefacto, la invalidación por SHA-256 del track canónico y la recuperación
  lazy existentes. Los fallos inesperados de la analítica derivada no invalidan
  el procesamiento correcto de una Activity o Session.
* Los reajustes del track provocados por cambios en la Analysis Window
  conservan ahora el bearing actual del mapa MapLibre mientras continúan
  actualizando el centro y el zoom para los límites visibles.
* Los gestos y controles nativos de rotación, la compensación COG de los
  marcadores de barco, la API y métricas de maniobras, el replay, la Analysis
  Window y las semánticas de Activity y Session permanecen sin cambios. El
  valor `DIR` representa solo la orientación de la cámara del mapa; no
  introduce ni infiere datos de viento, COG o HDG.

### Issues

- [#63](https://github.com/maxsail-project/tackbar/issues/63) — Generate maneuver analytics when Activity processing completes
- [#64](https://github.com/maxsail-project/tackbar/issues/64) — Preserve map bearing when Analysis Window refits the track
- [#65](https://github.com/maxsail-project/tackbar/issues/65) — Show current map bearing in degrees

### Validación

Antes de preparar la release, el Issue #63 registró aceptación humana, revisión
técnica PASS, checks focalizados de regresión backend y compilación correctos,
y confirmó la semántica best-effort de los fallos de analítica con recuperación
lazy. El Issue #64 registró revisión técnica PASS, validación manual PASS con
una y dos Activities, y tests frontend focalizados, typecheck, build de
producción y diff check correctos. El Issue #65 registró revisión técnica y
validación manual PASS, además de tests frontend focalizados, typecheck, build
de producción y diff check correctos.

La preparación de la release comprobó la consistencia documental, la
trazabilidad de Issues completados, la entrada bilingüe y la equivalencia del
cuerpo de publicación, el diff final y los espacios en blanco, y el estado del
repositorio, del remoto y de publicación. Los checks de implementación no se
volvieron a ejecutar durante la preparación.

El despliegue en producción y la validación end-to-end en producción de la
generación anticipada de analítica y del comportamiento de orientación del mapa
siguen pendientes. La preparación no incluye ningún tag, GitHub Release ni
despliegue a producción.

---

## v0.7.5 Californian — Boat Marker Orientation Hotfix (Release-ready — production validation pending)

### English

Keeps Session Viewer boat markers aligned with their geographic COG when the
map is rotated.

### Fixed

* Primary and comparison boat-marker rotation now compensates for the current
  MapLibre map bearing, so each bow continues to point along its geographic COG
  instead of remaining referenced to screen north.
* Bearing compensation uses circular normalization across 0°/360° while
  preserving north-up orientation when the map bearing is 0°.
* Instantaneous COG telemetry remains the actual COG. Replay time and marker
  position, track geometry, map fitting/focus, and existing Activity and
  Session semantics remain unchanged.

### Issues

- [#61](https://github.com/maxsail-project/tackbar/issues/61) — Keep boat markers aligned with COG when the map is rotated

### Validation

Before release preparation, Issue #61 recorded human acceptance after local
manual validation with one and two boats and map rotation. Its accepted
implementation evidence recorded `TrackMap.test.ts` with 30 passing tests,
passing frontend typecheck, passing production build, and a clean
`git diff --check`.

Release preparation performed documentation consistency, completed-Issue
traceability, bilingual release-entry and publication-body equivalence review,
final diff and whitespace checks, and repository/remote publication-state
verification. The implementation checks were not rerun during preparation.

Production deployment and end-to-end production validation of rotated-map
marker orientation remain pending. No tag, GitHub Release or production
deployment is part of release preparation.

---

## v0.7.5 Californian — Hotfix de orientación de marcadores de barco (Lista para release — validación de producción pendiente)

### Español

Mantiene los marcadores de barco del Session Viewer alineados con su COG
geográfico cuando se rota el mapa.

### Corregido

* La rotación de los marcadores de barco Primary y Comparison compensa ahora
  el bearing actual del mapa MapLibre, para que cada proa siga apuntando según
  su COG geográfico en vez de permanecer referenciada al norte de la pantalla.
* La compensación del bearing usa normalización circular en el límite
  0°/360° y conserva la orientación north-up cuando el bearing del mapa es 0°.
* La telemetría COG instantánea sigue mostrando el COG real. El tiempo de
  replay y la posición de los marcadores, la geometría de los tracks, el
  ajuste/foco del mapa y las semánticas existentes de Activity y Session
  permanecen sin cambios.

### Issues

- [#61](https://github.com/maxsail-project/tackbar/issues/61) — Keep boat markers aligned with COG when the map is rotated

### Validación

Antes de preparar la release, el Issue #61 registró aceptación humana después
de la validación manual local con uno y dos barcos y rotación del mapa. Su
evidencia de implementación aceptada registró `TrackMap.test.ts` con 30 tests
correctos, typecheck frontend correcto, build de producción correcto y
`git diff --check` limpio.

La preparación de la release comprobó la consistencia documental, la
trazabilidad de Issues completados, la entrada bilingüe y la equivalencia del
cuerpo de publicación, el diff final y los espacios en blanco, y el estado del
repositorio, del remoto y de publicación. Los checks de implementación no se
volvieron a ejecutar durante la preparación.

El despliegue en producción y la validación end-to-end en producción de la
orientación de los marcadores con el mapa rotado siguen pendientes. La
preparación no incluye ningún tag, GitHub Release ni despliegue a producción.

---

## v0.7.4 Californian — VKX Ingestion and Canonical Quaternion Preservation (Release-ready — production validation pending)

### English

Adds Vakaros VKX as a supported track format while preserving richer
orientation telemetry in TackBar's provider-independent canonical track.

### Added

* Vakaros `.vkx` and gzip-wrapped `.vkx.gz` attachments are accepted through
  the existing OVH and maintained Gmail acquisition paths, then continue
  through the common ingestion, Activity and Session flow.
* The VKX v1.4 parser normalizes timestamp, position, SOG and circular COG and
  preserves the raw orientation quaternion as optional canonical `quat_w`,
  `quat_x`, `quat_y` and `quat_z` fields.
* Vakaros CSV exports may provide the same optional quaternion fields through
  `q_w`, `q_x`, `q_y` and `q_z`; the existing CSV/CSV.GZ form without them
  remains supported.
* When VKX device configuration unambiguously asserts that the device is fixed
  to the body frame, canonical HDG, HEEL and TRIM are derived from the
  normalized true-NED quaternion without using COG as a heading substitute.

### Changed

* Newly persisted canonical tracks use the expanded fourteen-column schema.
  Historical ten-column tracks remain readable without migration and expose
  unavailable quaternion values in memory.
* Vakaros parser dispatch and Activity reprocessing now recognize CSV,
  CSV.GZ, VKX and VKX.GZ while retaining Activity source `vakaros` and current
  raw-file SHA-256 duplicate behavior.
* The public Activity Track API and Session Viewer response shape remain
  unchanged; quaternion fields are not exposed by this increment.

### Issues

- [#33](https://github.com/maxsail-project/tackbar/issues/33) — VKX ingestion and canonical quaternion preservation

### Validation

Before release preparation, Issue #33 recorded accepted focused validation for
VKX parsing/orientation (36 tests), maneuver analytics (17 tests), the focused
parser/persistence/analytics group (134 tests), and the ingestion/provider/API
group (144 tests). It also recorded a clean `git diff --check`, technical and
human acceptance, and successful private real-sailing VKX v1.4 validation
without committing private sailing data.

Release preparation performed documentation consistency, completed-Issue
traceability, bilingual release-entry review, final diff and whitespace
checks. The complete product regression suite was not rerun during preparation.

Cross-format logical deduplication, FIT and GPX ingestion, Garmin Connect,
public quaternion API/Viewer exposure and new quaternion analytics remain out
of scope. Live production email ingestion and end-to-end production validation
of VKX/VKX.GZ remain pending. No tag, GitHub Release or production deployment
is part of release preparation.

---

## v0.7.4 Californian — Ingesta VKX y conservación del cuaternión canónico (Lista para release — validación de producción pendiente)

### Español

Añade Vakaros VKX como formato de track soportado y conserva telemetría de
orientación más rica en el track canónico de TackBar independiente del
proveedor.

### Añadido

* Los adjuntos Vakaros `.vkx` y `.vkx.gz` comprimidos con gzip se aceptan a
  través de las rutas existentes de adquisición OVH y Gmail mantenida, y
  continúan por el flujo común de ingesta, Activity y Session.
* El parser VKX v1.4 normaliza timestamp, posición, SOG y COG circular, y
  conserva el cuaternión de orientación original en los campos canónicos
  opcionales `quat_w`, `quat_x`, `quat_y` y `quat_z`.
* Los exports Vakaros CSV pueden aportar los mismos campos opcionales de
  cuaternión mediante `q_w`, `q_x`, `q_y` y `q_z`; el formato CSV/CSV.GZ
  existente sin ellos continúa soportado.
* Cuando la configuración del dispositivo VKX afirma inequívocamente que está
  fijado al marco del barco, HDG, HEEL y TRIM canónicos se derivan del
  cuaternión true-NED normalizado sin usar COG como sustituto del heading.

### Cambiado

* Los nuevos tracks canónicos persistidos usan el esquema ampliado de catorce
  columnas. Los tracks históricos de diez columnas siguen siendo legibles sin
  migración y exponen valores de cuaternión no disponibles en memoria.
* El dispatch del parser Vakaros y el reproceso de Activities reconocen ahora
  CSV, CSV.GZ, VKX y VKX.GZ, conservando el source `vakaros` de Activity y el
  comportamiento actual de duplicados por SHA-256 del fichero original.
* La API pública de Track de Activity y el formato de respuesta del Session
  Viewer permanecen sin cambios; este incremento no expone los campos de
  cuaternión.

### Issues

- [#33](https://github.com/maxsail-project/tackbar/issues/33) — VKX ingestion and canonical quaternion preservation

### Validación

Antes de preparar la release, el Issue #33 registró validación focalizada
aceptada para parsing/orientación VKX (36 tests), analítica de maniobras (17
tests), el grupo focalizado de parser/persistencia/analítica (134 tests) y el
grupo de ingesta/proveedor/API (144 tests). También registró un
`git diff --check` limpio, aceptación técnica y humana, y validación correcta
con un VKX v1.4 real y privado sin incorporar datos privados de navegación al
repositorio.

La preparación de la release comprobó la consistencia documental, la
trazabilidad de Issues completados, la entrada bilingüe, el diff final y los
espacios en blanco. La suite completa de regresión del producto no se volvió a
ejecutar durante la preparación.

La deduplicación lógica entre formatos, la ingesta FIT y GPX, Garmin Connect,
la exposición pública del cuaternión en API/Viewer y nuevas analíticas de
cuaternión permanecen fuera de alcance. La ingesta real por email y la
validación end-to-end en producción de VKX/VKX.GZ siguen pendientes. La
preparación no incluye ningún tag, GitHub Release ni despliegue a producción.

---

## v0.7.3 Californian — Return to Session (Release-ready — production validation pending)

### English

Closes the post-sailing submission loop by returning the Sailor directly to
the relevant TackBar Session after successful track processing.

### Added

* For deterministic first-track onboarding, the existing Welcome email sent
  after activation now presents the onboarding Session as the primary action
  and Personal TackBar as the secondary persistent navigation path.
* Each newly processed supported Activity from an already-ACTIVE Sailor now
  receives one direct Session-result email when its existing Session and
  Personal TackBar capabilities are usable.
* Durable operational notification state prevents duplicate result emails
  across repeated mailbox review, duplicate input, reprocessing and process
  recovery, without redefining Activity, Session or ingestion identity.

### Changed

* Deterministic onboarding context is preserved through later PENDING tracks,
  web acceptance, manual Admin confirmation and eligible Welcome resend. A
  legacy or manually initiated consent cycle without that context never
  guesses a Session.
* Result notification remains a non-authoritative discovery channel. Delivery
  success or failure does not change Activity processing, Session matching,
  consent, capabilities or Viewer visibility, and Personal TackBar remains the
  persistent fallback path.
* Existing capability routes, ACTIVE-only visibility, consent lifecycle,
  Session matching and OVH mailbox/outbound-mail semantics remain unchanged.

### Issues

- [#56](https://github.com/maxsail-project/tackbar/issues/56) — Send Session link after successful track processing

### Validation

Before release preparation, the validated implementation at
`a38863f8f288a3030775411bbf020d1c053610a2` passed implementation
review, the complete backend regression with 529 tests, manual validation and
`git diff --check`, with a clean working tree. Release preparation reran 69
focused backend tests covering Session-result notifications, Welcome email,
outbound mail and Admin consent-request behavior; all passed.

Live production deployment and end-to-end production validation of the
Session-result and enriched Welcome emails remain pending. No tag, GitHub
Release or production deployment is part of release preparation.

---

## v0.7.3 Californian — Regreso a la Session (Lista para release — validación de producción pendiente)

### Español

Cierra el ciclo posterior al envío de un track devolviendo al Sailor
directamente a la Session relevante de TackBar después de procesarlo
correctamente.

### Añadido

* En el onboarding determinista del primer track, el email de bienvenida
  existente que se envía tras la activación presenta ahora la Session de
  onboarding como acción principal y Personal TackBar como ruta secundaria y
  persistente de navegación.
* Cada nueva Activity soportada y procesada de un Sailor ya ACTIVE recibe ahora
  un único email directo con el resultado de la Session cuando sus capabilities
  existentes de Session y Personal TackBar son utilizables.
* Un estado operativo persistente de notificación evita emails de resultado
  duplicados ante revisiones repetidas del buzón, entradas duplicadas,
  reprocesos y recuperación de procesos, sin redefinir la identidad de
  Activity, Session ni ingesta.

### Cambiado

* El contexto determinista de onboarding se conserva ante tracks PENDING
  posteriores, aceptación web, confirmación manual desde Admin y reenvíos de
  bienvenida elegibles. Un ciclo de consentimiento legacy o iniciado
  manualmente sin ese contexto nunca intenta adivinar una Session.
* La notificación del resultado sigue siendo un canal de descubrimiento no
  autoritativo. Su éxito o fallo no cambia el procesamiento de Activity, el
  Session matching, el consentimiento, las capabilities ni la visibilidad del
  Viewer, y Personal TackBar continúa siendo la ruta persistente alternativa.
* Las rutas de capability existentes, la visibilidad solo para ACTIVE, el ciclo
  de consentimiento, el Session matching y las semánticas del buzón y correo
  saliente OVH permanecen sin cambios.

### Issues

- [#56](https://github.com/maxsail-project/tackbar/issues/56) — Send Session link after successful track processing

### Validación

Antes de preparar la release, la implementación validada en
`a38863f8f288a3030775411bbf020d1c053610a2` superó la revisión de
implementación, la regresión backend completa con 529 tests, la validación
manual y `git diff --check`, con el working tree limpio. Durante la preparación
se repitieron 69 tests backend focalizados sobre notificaciones de resultado de
Session, email de bienvenida, correo saliente y solicitudes de consentimiento
desde Admin; todos pasaron.

El despliegue real en producción y la validación end-to-end en producción de
los emails de resultado de Session y de bienvenida enriquecido permanecen
pendientes. La preparación no incluye ningún tag, GitHub Release ni despliegue
a producción.

---

## v0.7.2 Californian — Pilot Operations & Reliability (Release-ready — production validation pending)

### English

Improves the reliability and day-to-day operation of the existing OVH-backed
pilot while preserving Activity, Session, consent, capability, Viewer and
analytics semantics.

### Added

* Incremental OVH mailbox acquisition backed by a private persisted
  `UIDVALIDITY`/UID cursor. The first review examines the existing mailbox;
  later reviews normally fetch only newer messages, while current
  provider-message and ingestion-history deduplication remain authoritative.
* Privacy-safe mailbox-review diagnostics for supported, unsupported,
  malformed, already-known and failed outcomes, with bounded repeated-failure
  logging and recovery reporting across scheduled processes.
* A repository-owned systemd oneshot/timer that runs one existing mailbox
  review approximately two minutes after each completed cycle. Manual Admin
  review remains available as the operational fallback.
* A read-only runtime-data preflight command that checks ownership,
  readability and writability before an operator relies on the JSON/filesystem
  persistence layer.

### Changed

* Sailor deletion now rejects an incompatible runtime owner or unwritable
  mutation path before applying any deletion, and its CLI documents the
  service-compatible execution model.
* Successfully submitted OVH outbound messages now receive one best-effort
  IMAP append to the manually provisioned `TackBar-Sent` folder. SMTP remains
  the delivery authority, and archive failure does not alter consent, welcome
  email, delivery-state or retry semantics.
* GitHub Issues are now the canonical pending-work inventory, the GitHub
  Project supplies backlog ordering, and the single root roadmap provides a
  compact release-family-level view without committing future scope.

### Issues

- [#2](https://github.com/maxsail-project/tackbar/issues/2) — Preserve outbound OVH emails in a dedicated TackBar mailbox folder
- [#3](https://github.com/maxsail-project/tackbar/issues/3) — Prevent maintenance scripts from changing TackBar runtime ownership
- [#4](https://github.com/maxsail-project/tackbar/issues/4) — Improve mailbox review failure observability
- [#5](https://github.com/maxsail-project/tackbar/issues/5) — Add a runtime-data ownership and writability preflight
- [#7](https://github.com/maxsail-project/tackbar/issues/7) — Use incremental IMAP UID cursor for OVH mailbox review
- [#8](https://github.com/maxsail-project/tackbar/issues/8) — Automatically review the OVH mailbox on a periodic schedule
- [#51](https://github.com/maxsail-project/tackbar/issues/51) — Make GitHub Issues the canonical TackBar backlog
- [#52](https://github.com/maxsail-project/tackbar/issues/52) — Simplify and refresh TackBar roadmap

### Validation

The complete backend suite passed with 484 tests. Backend `compileall` and
`git diff --check` also passed. The release contains no frontend changes, so
frontend tests, typecheck and production build were not rerun.

Production installation and live validation of the systemd timer, incremental
mailbox review, runtime-data preflight and `TackBar-Sent` archival remain
pending. No tag, GitHub Release or production deployment is part of release
preparation.

---

## v0.7.2 Californian — Operaciones y fiabilidad del piloto (Lista para release — validación de producción pendiente)

### Español

Mejora la fiabilidad y la operación cotidiana del piloto existente basado en
OVH, preservando las semánticas de Activity, Session, consentimiento,
capabilities, Viewer y analítica.

### Añadido

* Adquisición incremental del buzón OVH respaldada por un cursor privado y
  persistido de `UIDVALIDITY`/UID. La primera revisión examina el buzón
  existente; las posteriores normalmente obtienen solo mensajes nuevos,
  mientras la deduplicación actual por mensaje de proveedor e historial de
  ingestión sigue siendo autoritativa.
* Diagnósticos de revisión del buzón seguros para la privacidad para resultados
  soportados, no soportados, malformados, ya conocidos y fallidos, con logging
  acotado de fallos repetidos e informe de recuperación entre procesos
  programados.
* Un servicio oneshot y timer de systemd versionados en el repositorio que
  ejecutan una revisión existente del buzón aproximadamente dos minutos después
  de completar cada ciclo. La revisión manual desde Admin sigue disponible como
  alternativa operativa.
* Un comando de preflight de datos runtime, de solo lectura, que comprueba
  propiedad, lectura y escritura antes de que un operador dependa de la
  persistencia JSON/filesystem.

### Cambiado

* La eliminación de Sailor ahora rechaza un propietario runtime incompatible o
  una ruta de mutación no escribible antes de aplicar cualquier eliminación, y
  su CLI documenta el modelo de ejecución compatible con el servicio.
* Los mensajes salientes enviados correctamente por OVH reciben ahora un único
  intento best-effort de IMAP append a la carpeta `TackBar-Sent` provisionada
  manualmente. SMTP sigue siendo la autoridad de entrega, y un fallo de archivo
  no altera el consentimiento, el email de bienvenida, el estado de entrega ni
  las semánticas de reintento.
* GitHub Issues es ahora el inventario canónico de trabajo pendiente, GitHub
  Project proporciona el orden del backlog y el único roadmap raíz ofrece una
  vista compacta por familias de release sin comprometer alcance futuro.

### Issues

- [#2](https://github.com/maxsail-project/tackbar/issues/2) — Preserve outbound OVH emails in a dedicated TackBar mailbox folder
- [#3](https://github.com/maxsail-project/tackbar/issues/3) — Prevent maintenance scripts from changing TackBar runtime ownership
- [#4](https://github.com/maxsail-project/tackbar/issues/4) — Improve mailbox review failure observability
- [#5](https://github.com/maxsail-project/tackbar/issues/5) — Add a runtime-data ownership and writability preflight
- [#7](https://github.com/maxsail-project/tackbar/issues/7) — Use incremental IMAP UID cursor for OVH mailbox review
- [#8](https://github.com/maxsail-project/tackbar/issues/8) — Automatically review the OVH mailbox on a periodic schedule
- [#51](https://github.com/maxsail-project/tackbar/issues/51) — Make GitHub Issues the canonical TackBar backlog
- [#52](https://github.com/maxsail-project/tackbar/issues/52) — Simplify and refresh TackBar roadmap

### Validación

La suite backend completa pasó con 484 tests. También pasaron `compileall` del
backend y `git diff --check`. La release no contiene cambios frontend, por lo
que no se repitieron sus tests, typecheck ni build de producción.

La instalación y validación real en producción del timer de systemd, la
revisión incremental del buzón, el preflight de datos runtime y el archivo en
`TackBar-Sent` permanecen pendientes. La preparación de la release no incluye
ningún tag, GitHub Release ni despliegue a producción.

---

## v0.7.1 Californian — Analysis Window Maneuver Metrics (Release-ready — production validation pending)

### English

Makes the most useful metrics for an explicitly selected maneuver visible in
the compact Analysis Window context while preserving the v0.7.0 analytical,
replay and Activity/Session semantics.

### Changed

* Selecting a Primary or Comparison maneuver now shows its Loss in metres,
  equivalent Loss in seconds and Recovery time directly beneath the compact
  summary for the Activity that owns the event.
* Selected-maneuver detail uses the existing formatting and unavailable-value
  behavior, remains tied to explicit selection, and disappears when selection
  is cleared or no longer belongs to the displayed Analysis Window.
* Compact summaries retain the existing whole-degree Dominant COG value while
  omitting only the visible `COG` label to preserve narrow mobile space.
* Added specialized Release Publisher and Release Preparer governance, with an
  independent review gate and closed-issue traceability for new releases.

### Issues

- [#20](https://github.com/maxsail-project/tackbar/issues/20) — Show selected maneuver metrics in Analysis Window
- [#21](https://github.com/maxsail-project/tackbar/issues/21) — Allow specialized Release Publisher to publish approved GitHub releases
- [#22](https://github.com/maxsail-project/tackbar/issues/22) — Introduce specialized Release Preparer and CHANGELOG issue traceability

### Validation

The complete frontend suite passed with 302 tests across 25 test files,
together with TypeScript typecheck and the production build. The product
increment is frontend-only; backend analytics, API, persistence and domain
behavior are unchanged.

The production build reports the existing advisory for a JavaScript chunk over
500 kB; it does not fail the build. Production deployment and production
Viewer validation remain pending.

---

## v0.7.1 Californian — Métricas de maniobra en Analysis Window (Lista para release — validación de producción pendiente)

### Español

Hace visibles las métricas más útiles de una maniobra seleccionada
explícitamente en el contexto compacto de Analysis Window, preservando las
semánticas analíticas, de replay y de Activity/Session de v0.7.0.

### Cambiado

* Seleccionar una maniobra Primary o Comparison muestra ahora su Loss en
  metros, Loss equivalente en segundos y tiempo de recuperación directamente
  bajo el resumen compacto de la Activity propietaria del evento.
* El detalle de la maniobra seleccionada reutiliza el formato y comportamiento
  de valores no disponibles existentes, permanece ligado a la selección
  explícita y desaparece cuando se borra o deja de pertenecer a la Analysis
  Window mostrada.
* Los resúmenes compactos conservan el Dominant COG existente redondeado a
  grados enteros, omitiendo solo la etiqueta visible `COG` para preservar el
  espacio móvil estrecho.
* Se añadió la gobernanza especializada de Release Publisher y Release
  Preparer, con revisión independiente y trazabilidad a issues cerradas para
  nuevas releases.

### Issues

- [#20](https://github.com/maxsail-project/tackbar/issues/20) — Show selected maneuver metrics in Analysis Window
- [#21](https://github.com/maxsail-project/tackbar/issues/21) — Allow specialized Release Publisher to publish approved GitHub releases
- [#22](https://github.com/maxsail-project/tackbar/issues/22) — Introduce specialized Release Preparer and CHANGELOG issue traceability

### Validación

La suite frontend completa pasó con 302 tests en 25 archivos de tests, junto
con el typecheck de TypeScript y la build de producción. El incremento de
producto es solo frontend; la analítica backend, API, persistencia y
comportamiento de dominio permanecen sin cambios.

La build de producción informa del aviso existente por un chunk JavaScript de
más de 500 kB; no hace fallar la build. El despliegue y la validación del Viewer
en producción permanecen pendientes.

---

## v0.7.0 Californian — Collaborative Debrief Analytics (Release-ready — production validation pending)

### English

Adds neutral, Vakaros-based maneuver analytics to the existing collaborative
Session Viewer without changing Activity, Session, consent or replay semantics.

### Added

* Backend-owned maneuver detection over complete canonical HDG telemetry, with
  circular-angle handling, explicit gap/sample-quality rules and supporting
  COG/HEEL/SOG context where available. Detected events remain neutral
  maneuvers rather than automatic tack/gybe classifications.
* Deterministic maneuver metrics for timestamps, duration, circular HDG change,
  entry/minimum/exit SOG, recovery time and constant-entry-reference Loss in
  metres and equivalent seconds. Missing inputs remain unavailable.
* Strict per-Activity analytical artifacts with canonical-track SHA-256 and
  algorithm-version invalidation, lazy regeneration and a capability-scoped
  API that preserves ACTIVE-only shared visibility.
* Primary/Comparison maneuver markers on the Analysis Window SOG timeline and
  a collapsible, sortable Maneuvers table linked to the shared replay clock.

### Changed

* Selecting a timeline marker or table row now moves shared `playbackTime` to
  the event center, highlights the row and focuses the relevant Activity in the
  visible map area above the fixed telemetry overlay.
* The compact Analysis Window summaries include clearly labelled Dominant COG
  using the existing Summary value and whole-degree rounding.
* The Maneuvers table prioritizes Loss and Recovery, uses compact numeric
  alignment, keeps its header sticky within the table container and preserves
  horizontal scrolling on narrow screens.
* Analysis Window replay controls, marker guides, map telemetry and summary
  hierarchy were refined for the mobile collaborative-debrief flow.

### Validation

The complete backend regression passed with 433 tests, including maneuver
detection, metrics, persistence/version invalidation and shared API behavior.
The complete frontend suite passed with 297 tests, together with TypeScript
typecheck and the production build. Backend `compileall` and `git diff --check`
also passed.

The production build reports the existing advisory for a JavaScript chunk over
500 kB; it does not fail the build. Production deployment, real production
capability access and production Viewer validation remain pending.

---

## v0.7.0 Californian — Analítica para el debriefing colaborativo (Lista para release — validación de producción pendiente)

### Español

Añade analítica neutral de maniobras basada en Vakaros al Session Viewer
colaborativo existente sin cambiar las semánticas de Activity, Session,
consentimiento o replay.

### Añadido

* Detección backend de maniobras sobre la telemetría HDG canónica completa, con
  tratamiento circular de ángulos, reglas explícitas de gaps/calidad de muestras
  y contexto COG/HEEL/SOG cuando está disponible. Los eventos siguen siendo
  maniobras neutrales y no clasificaciones automáticas de virada/trasluchada.
* Métricas deterministas de timestamps, duración, cambio circular de HDG, SOG de
  entrada/mínima/salida, recuperación y Loss con referencia constante a la SOG
  de entrada en metros y segundos equivalentes. Los datos ausentes permanecen
  no disponibles.
* Artefactos analíticos estrictos por Activity con SHA-256 del track canónico,
  invalidación por versión del algoritmo, regeneración lazy y una API limitada
  por capability que conserva la visibilidad compartida solo para ACTIVE.
* Marcadores de maniobra Primary/Comparison en la timeline SOG de Analysis
  Window y una tabla colapsable y ordenable conectada al reloj compartido.

### Cambiado

* Seleccionar un marcador o fila mueve el `playbackTime` compartido al centro
  del evento, destaca la fila y enfoca la Activity relevante en el área visible
  del mapa por encima del overlay fijo de telemetría.
* Los resúmenes compactos de Analysis Window incluyen Dominant COG claramente
  etiquetado, reutilizando el valor y redondeo entero existentes de Summary.
* La tabla de Maneuvers prioriza Loss y Recovery, alinea cifras de forma
  compacta, mantiene el header sticky dentro de su contenedor y conserva el
  scroll horizontal en pantallas estrechas.
* Se refinaron controles de replay, guías de marcadores, telemetría de mapa y
  jerarquía del resumen para el flujo móvil de debriefing colaborativo.

### Validación

La regresión backend completa pasó con 433 tests, incluida la detección de
maniobras, métricas, persistencia/invalidación por versión y comportamiento de
la API compartida. La suite frontend completa pasó con 297 tests, junto con el
typecheck de TypeScript y la build de producción. También pasaron `compileall`
del backend y `git diff --check`.

La build de producción informa del aviso existente por un chunk JavaScript de
más de 500 kB; no hace fallar la build. El despliegue, el acceso real mediante
capability y la validación del Viewer en producción permanecen pendientes.

---

## v0.6.7 Mahon — Viewer Visual Polish

### English

Focused Session Viewer visual refinement for clearer, more stable map replay
telemetry on mobile and tablet without changing Viewer, Activity or Session
semantics.

### Changed

* Replaced the generic boat marker with a custom sailboat silhouette, retaining
  COG rotation, the Primary/Comparison activity colors and a white outline for
  map contrast.
* Reworked the map overlay as a compact, neutral telemetry table with
  de-emphasized GPS/UTC time and color indicators for Primary and Comparison.
* Map COG is displayed as a circularly normalized, rounded whole degree while
  existing chart and Summary formatting remain unchanged.
* Fixed instantaneous map telemetry now presents SOG, COG, HEEL and TRIM from
  the same nearest replay sample. Missing values remain unavailable, and signed
  HEEL/TRIM values retain their sign without added interpretation.
* Stabilized the overlay and telemetry-column dimensions so replay changes in
  digits, signs or missing values do not resize the card or shift the Primary
  and Comparison columns.

### Validation

Focused TrackMap and replay-presentation regression passed with 22 tests.

The complete frontend release gate passed with 196 tests, TypeScript typecheck,
the production build and `git diff --check`.

Local headless-browser validation covered one-Activity and two-Activity
layouts, positive, negative and unavailable HEEL/TRIM values, SOG/COG digit
changes, and the mobile/tablet CSS breakpoints. The validated geometry remained
stable at 138 px for the card, with 28 px metric and 48 px value columns.

Production deployment and production Viewer validation remain pending.

---

## v0.6.7 Mahon — Pulido visual del Viewer

### Español

Refinamiento visual focalizado del Session Viewer para presentar telemetría de
replay en el mapa con mayor claridad y estabilidad en móvil y tablet, sin
cambiar las semánticas de Viewer, Activity o Session.

### Cambiado

* Se sustituyó el marcador genérico por una silueta personalizada de velero,
  conservando la rotación COG, los colores de Activity para Primary/Comparison
  y un contorno blanco para mantener el contraste sobre el mapa.
* Se reorganizó el overlay del mapa como una tabla compacta y neutral de
  telemetría, con la hora GPS/UTC en segundo plano visual e indicadores de color
  para Primary y Comparison.
* El COG del mapa se muestra como grado entero redondeado y normalizado
  circularmente, sin modificar el formato existente de gráficos ni Summary.
* La telemetría instantánea fija del mapa presenta ahora SOG, COG, HEEL y TRIM
  de la misma muestra de replay más cercana. Los valores ausentes permanecen no
  disponibles y HEEL/TRIM conservan su signo sin interpretación añadida.
* Se estabilizaron las dimensiones del recuadro y de las columnas de telemetría
  para que los cambios de dígitos, signos o valores ausentes durante el replay
  no redimensionen la tarjeta ni desplacen las columnas Primary y Comparison.

### Validación

La regresión focalizada de TrackMap y presentación de replay pasó con 22 tests.

El gate frontend completo pasó con 196 tests, typecheck de TypeScript, build de
producción y `git diff --check`.

La validación local con navegador headless cubrió layouts con una y dos
Activities, valores HEEL/TRIM positivos, negativos y ausentes, cambios de
dígitos en SOG/COG y los breakpoints CSS de móvil/tablet. La geometría validada
se mantuvo estable en 138 px para el recuadro, con columnas de métrica de 28 px
y de valores de 48 px.

El despliegue y la validación del Viewer en producción permanecen pendientes.

---

## v0.6.6 Mahon — Attachment-driven Email Ingestion

### English

Small operational hotfix that removes the legacy requirement for the email
Subject to end in `.csv` or `.csv.gz`.

### Fixed

* Track email eligibility is determined by the supported attachment rather than
  by the email Subject.
* Natural human-written Subjects are accepted when the message contains exactly
  one supported `.csv` or `.csv.gz` attachment.
* OVH and Gmail acquisition apply the same attachment-driven eligibility rule.
* Unsupported attachments remain unsupported even when the Subject looks like a
  track filename.
* Existing Activity, Session, ingestion-history, deduplication and consent
  semantics remain unchanged.

### Validation

Focused backend regression for provider acquisition and ingestion passed before
release preparation.

Production validation of a real arbitrary-subject email remains pending until
deployment.

---

## v0.6.6 Mahon — Ingesta de email basada en adjuntos

### Español

Pequeño hotfix operativo que elimina el requisito heredado de que el Subject del
email termine en `.csv` o `.csv.gz`.

### Corregido

* La elegibilidad de un email con track se determina por el adjunto soportado y
  no por el Subject del email.
* Se aceptan Subjects naturales escritos por personas cuando el mensaje contiene
  exactamente un adjunto `.csv` o `.csv.gz` soportado.
* La adquisición mediante OVH y Gmail aplica la misma regla de elegibilidad
  basada en adjuntos.
* Los adjuntos no soportados siguen sin estar soportados aunque el Subject parezca
  el nombre de un archivo de track.
* Las semánticas existentes de Activity, Session, historial de ingesta,
  deduplicación y consentimiento permanecen sin cambios.

### Validación

La regresión backend focalizada de adquisición mediante proveedores e ingesta
pasó antes de preparar la release.

La validación en producción de un email real con Subject arbitrario permanece
pendiente hasta el despliegue.

---

## v0.6.5 Mahon — Simplified Pilot Onboarding & Web Consent (Release-ready — production validation pending)

### English

Implementation complete; production validation pending. v0.6.5 simplifies
pilot onboarding by allowing the first supported track sent to
`share@tackbar.eu` to initiate technical onboarding while keeping consent as a
separate, explicit decision.

### Added

* Track-first pilot onboarding from successfully processed supported tracks.
* Persisted, purpose-specific Consent Requests bound to their agreement version,
  with high-entropy capability URLs that remain valid for exactly 28 days.
* A bilingual consent decision at `/consent/<token>` and bilingual canonical
  participation conditions at `/consent/conditions` in the TackBar app.
* Explicit web activation from `PENDING` to `ACTIVE`, reusing the established
  Sailor consent and activation path.
* One automatic bilingual consent-request email attempt after successful
  supported-track ingestion for an eligible pending consent cycle.
* Consent Request operational status in Admin, including safe delivery state.
* Explicit Admin resend for a valid request and reissue for an expired request.
* The existing controlled manual Admin consent-confirmation fallback for every
  `PENDING` Sailor.

### Operational behavior

* Activities belonging to `PENDING` Sailors may be ingested, persisted and
  matched to Sessions while remaining excluded from shared Session responses.
* Sending a track, opening a consent link or viewing the conditions is not
  consent; an explicit affirmative confirmation is required.
* Repeated submission of an accepted request is idempotent and does not create
  another activation, consent grant or activation side effect.
* Processing another track for an `ACTIVE` Sailor does not send another consent
  request.
* A valid supported track from a `REVOKED` Sailor starts a new `PENDING`
  consent cycle without granting consent.
* Admin resend reuses the current valid request and token without extending its
  lifetime; expired reissue creates a new request and token while preserving
  the previous request as history.
* Consent-request email failure has no automatic retry. Recovery remains an
  explicit Admin action.

### Preserved

* Existing Sailor → Activity → Session semantics and Session matching.
* Backend-enforced `ACTIVE`-only shared Session visibility.
* Personal TackBar and Session capability, expiration and renewal semantics.
* v0.6.4 Mahon activation and welcome-email behavior.
* Controlled manual Admin consent confirmation.
* Current Vakaros CSV/CSV.GZ ingestion.
* `tackbar-web` remains outside the consent lifecycle.

### Failure isolation

* Consent-request SMTP failure does not discard or fail an otherwise successful
  Activity ingestion, activate consent, change Session matching or mutate
  Personal or Session capabilities.
* Welcome-email failure still does not roll back `ACTIVE` consent.
* Failed request delivery remains visible through safe Admin operational state,
  and explicit Admin recovery remains available without exposing the token or
  provider details.

### Fixed

* Interrupted web-consent activation is now fully recoverable. When explicit
  acceptance has already been persisted but Session capability creation,
  Personal TackBar capability creation or another post-activation effect is
  interrupted, TackBar safely completes the remaining activation work without
  creating another consent grant, rotating existing capabilities or duplicating
  a successfully delivered welcome email.
* Public consent recovery no longer reports participation as confirmed while an
  accepted activation remains incomplete. `GET` may complete only the
  idempotent post-activation work of an already persisted explicit acceptance;
  it never performs `PENDING` → `ACTIVE` or creates `CONSENT_GRANTED`.
* Automatic consent-request delivery now respects any successful delivery in
  the current pending consent cycle, including an explicit Admin send, avoiding
  duplicate automatic emails.
* An expired current Consent Request no longer causes later successful track
  ingestion to fail during automatic consent-request orchestration. TackBar
  leaves the request unchanged and recovery remains an explicit Admin reissue
  operation.

### Validation

Focused backend and frontend consent, Admin, ingestion, capability and
visibility checks passed, together with backend compile, frontend typecheck,
frontend production build and `git diff --check`.

Focused regression additionally covered interrupted web-consent activation
recovery, preservation of consent/capability idempotency, Admin-first consent
request delivery, expired Consent Requests and consent-cycle isolation for
automatic delivery eligibility.

Real production deployment, real OVH SMTP consent-request delivery and the
complete v0.6.5 production flow remain pending. Production PASS is not claimed.

---

## v0.6.5 Mahon — Onboarding simplificado del piloto y consentimiento web (Lista para release — validación de producción pendiente)

### Español

Implementación completa; validación de producción pendiente. v0.6.5 simplifica
el onboarding del piloto permitiendo que el primer track soportado enviado a
`share@tackbar.eu` inicie el onboarding técnico, manteniendo el consentimiento
como una decisión explícita y separada.

### Añadido

* Onboarding track-first del piloto a partir de tracks soportados procesados
  correctamente.
* Consent Requests persistidas, específicas para este propósito y vinculadas a
  su versión de acuerdo, con capability URLs de alta entropía válidas durante
  exactamente 28 días.
* Decisión de consentimiento bilingüe en `/consent/<token>` y condiciones
  canónicas bilingües en `/consent/conditions` dentro de la aplicación TackBar.
* Activación web explícita de `PENDING` a `ACTIVE`, reutilizando el flujo
  establecido de consentimiento y activación de Sailor.
* Un intento automático de correo bilingüe de solicitud de consentimiento tras
  la ingesta correcta de un track soportado para un ciclo pendiente elegible.
* Estado operativo de Consent Request en Admin, incluido el estado seguro de
  entrega.
* Reenvío Admin explícito de una solicitud válida y reemisión de una solicitud
  expirada.
* El fallback existente de confirmación manual controlada desde Admin para
  cualquier Sailor `PENDING`.

### Comportamiento operativo

* Las Activities de Sailors `PENDING` pueden ingerirse, persistirse y asociarse
  a Sessions, pero permanecen excluidas de las respuestas de Sessions
  compartidas.
* Enviar un track, abrir un enlace de consentimiento o consultar las condiciones
  no constituye consentimiento; se requiere una confirmación afirmativa
  explícita.
* El envío repetido de una solicitud ya aceptada es idempotente y no crea otra
  activación, concesión de consentimiento ni efecto secundario de activación.
* Procesar otro track de un Sailor `ACTIVE` no envía otra solicitud de
  consentimiento.
* Un track soportado válido de un Sailor `REVOKED` inicia un nuevo ciclo
  `PENDING` sin conceder consentimiento.
* El reenvío Admin reutiliza la solicitud y el token válidos actuales sin
  ampliar su vigencia; la reemisión de una solicitud expirada crea una nueva
  solicitud y token conservando la anterior como historial.
* Un fallo del correo de solicitud de consentimiento no tiene reintento
  automático. La recuperación sigue siendo una acción Admin explícita.

### Preservado

* Las semánticas existentes Sailor → Activity → Session y el Session matching.
* La visibilidad compartida exclusiva para `ACTIVE`, aplicada en backend.
* Las semánticas de Personal TackBar y de capability, expiración y renovación
  de Session.
* El comportamiento de activación y correo de bienvenida de v0.6.4 Mahon.
* La confirmación manual controlada de consentimiento desde Admin.
* La ingesta actual de Vakaros CSV/CSV.GZ.
* `tackbar-web` permanece fuera del ciclo de consentimiento.

### Aislamiento de fallos

* Un fallo SMTP de la solicitud de consentimiento no descarta ni hace fallar
  una ingesta de Activity correcta, no activa el consentimiento, no cambia el
  Session matching y no modifica capabilities Personal o de Session.
* Un fallo del correo de bienvenida sigue sin revertir el consentimiento
  `ACTIVE`.
* El fallo de entrega permanece visible mediante estado operativo seguro en
  Admin, y la recuperación Admin explícita sigue disponible sin exponer el
  token ni detalles del proveedor.

### Corregido

* La activación interrumpida del consentimiento web es ahora completamente
  recuperable. Cuando la aceptación explícita ya quedó persistida pero se
  interrumpe la creación de la capability de Session, la capability de Personal
  TackBar u otro efecto posterior a la activación, TackBar completa de forma
  segura el trabajo restante sin crear una nueva concesión de consentimiento,
  rotar capabilities existentes ni duplicar un correo de bienvenida ya
  entregado correctamente.
* La recuperación pública del consentimiento ya no informa la participación
  como confirmada mientras una activación aceptada siga incompleta. `GET` puede
  completar únicamente el trabajo idempotente posterior a una aceptación
  explícita ya persistida; nunca realiza `PENDING` → `ACTIVE` ni crea
  `CONSENT_GRANTED`.
* El envío automático de solicitudes de consentimiento respeta ahora cualquier
  entrega correcta del ciclo `PENDING` actual, incluido un envío explícito desde
  Admin, evitando correos automáticos duplicados.
* Una Consent Request actual expirada ya no provoca que una ingesta de track
  correctamente procesada falle durante la orquestación automática de la
  solicitud de consentimiento. TackBar conserva la solicitud sin cambios y la
  recuperación sigue siendo una operación explícita de reissue desde Admin.

### Validación

Pasaron las comprobaciones focalizadas backend y frontend de consentimiento,
Admin, ingesta, capabilities y visibilidad, junto con compile del backend,
typecheck frontend, build frontend de producción y `git diff --check`.

La regresión focalizada cubrió además la recuperación de activaciones web de
consentimiento interrumpidas, la preservación de la idempotencia de
consentimiento/capabilities, los envíos Admin previos a la ingesta, las Consent
Requests expiradas y el aislamiento entre ciclos para la elegibilidad del envío
automático.

El despliegue real en producción, la entrega real de la solicitud mediante SMTP
OVH y el flujo completo de producción v0.6.5 siguen pendientes. No se afirma
PASS de producción.

---

## v0.6.4 Mahon — Sailor Activation Welcome Email (Release-ready — production validation pending)

### English

Implementation complete; production validation pending. The single functional
objective is an operational welcome email after successful Admin Sailor consent
confirmation. Focused implementation checks passed during development; real
production SMTP/manual validation remains pending.

### Added

* Automatic welcome email after successful Sailor activation.
* Authenticated OVH SMTP outbound support with runtime configuration.
* Configured public TackBar application origin for Personal links.
* Persisted welcome-email delivery state.
* Admin delivery status and explicit resend.
* The current Personal TackBar link in the bilingual message.

### Refined

* Approved personal welcome-email copy in Maxi's first-person voice.
* Sailor Session-history card hierarchy.
* COG-oriented compact boat/hull replay markers.
* Stable map viewport when only Analysis Window bounds change.

### Preserved

* SMTP failure does not roll back ACTIVE consent.
* Sending does not regenerate the Personal TackBar capability.
* Existing ingestion, Session, Viewer and consent semantics remain unchanged
  except for the explicitly delivered presentation improvements.
* Session matching, shared Session authorization and Viewer analytical semantics
  remain unchanged.

### Included from post-v0.6.3 work

* Sailor detail Session history cards now separate sailing date/time, capability
  state, Activity/expiry metadata and Session access for a clearer mobile-first
  hierarchy, with correct `Activity` / `Activities` wording.

### Validation

Focused implementation checks passed during development. Real production
SMTP/manual validation remains pending; production PASS is not claimed.

---

## v0.6.4 Mahon — Correo de bienvenida tras la activación de Sailor (Lista para release — validación de producción pendiente)

### Español

Implementación completa; validación de producción pendiente. El único objetivo
funcional es el correo de bienvenida operativo después de la confirmación de
consentimiento de Sailor desde Admin. Las comprobaciones focalizadas de
implementación pasaron durante el desarrollo; la validación SMTP/manual real de
producción sigue pendiente.

### Añadido

* Correo de bienvenida automático tras la activación de Sailor.
* Soporte SMTP autenticado de OVH con configuración runtime.
* Origen público configurado de TackBar para los enlaces Personal.
* Estado persistido de entrega del correo.
* Estado de entrega y reenvío explícito desde Admin.
* Enlace Personal TackBar actual en el mensaje bilingüe.

### Refinado

* Copy personal aprobado del correo, en primera persona de Maxi.
* Jerarquía de las cards del historial de Session de Sailor.
* Marcadores compactos de barco/casco orientados por COG.
* Viewport estable del mapa al cambiar únicamente los límites de Analysis Window.

### Conservado

* Un fallo SMTP no revierte el consentimiento `ACTIVE`.
* El envío no regenera la capability de Personal TackBar.
* Las semánticas existentes de ingesta, Session, Viewer y consentimiento
  permanecen sin cambios, salvo las mejoras de presentación entregadas
  explícitamente.
* El matching de Sessions, la autorización de Sessions compartidas y las
  semánticas analíticas del Viewer permanecen sin cambios.

### Incluido de trabajo posterior a v0.6.3

* Las cards del historial de Session en el detalle de Sailor separan fecha/hora
  de navegación, estado de capability, metadata de Activity/expiración y acceso
  a Session para una jerarquía mobile-first más clara, con el uso correcto de
  `Activity` / `Activities`.

### Validación

Las comprobaciones focalizadas de implementación pasaron durante el desarrollo.
La validación SMTP/manual real de producción sigue pendiente; no se afirma PASS.

---

## v0.6.3 Mahon — Usability & Maintenance

### English

TackBar v0.6.3 is a focused mobile and tablet corrective release for the visual temporal zoom introduced in v0.6.2.

### Fixed

* Time-series charts now use Pointer Events for touch, stylus and mouse press-drag-release zoom selection.
* Pointer capture and cancellation handling keep chart selection local and prevent stale selections when an interaction is cancelled or loses capture.
* Admin Session capability links use the shorter responsive microcopy `Open session` instead of `Open shared Session`.
* Session Viewer Activity selectors hide the domain of email-derived labels while retaining `@`.
* Admin navigation now follows `Ingestions → Sailors → Sessions`, with Ingestions as the default section after access.

### Improved

* The deployment workflow uses `actions/checkout@v5`.

### Preserved

* Zoom remains local presentation state and does not change the Analysis Window, map, Summary, replay or shared `playbackTime`.
* Individual SOG + COG chart axes, colors, circular COG handling, APIs, persistence and existing comparison-chart semantics remain unchanged.

### Validated

Focused temporal zoom and Individual Analysis checks passed, together with frontend typecheck, production build and `git diff --check`. No full repository regression suite is claimed for this release.

---

## v0.6.3 Mahon — Usabilidad y mantenimiento

### Español

TackBar v0.6.3 es una release correctiva focalizada para móvil y tablet del zoom temporal visual introducido en v0.6.2.

### Corregido

* Los gráficos temporales usan ahora Pointer Events para la selección de zoom mediante pulsar, arrastrar y soltar con toque, lápiz o ratón.
* La captura de puntero y el manejo de cancelación mantienen la selección dentro del gráfico y evitan estados obsoletos cuando se cancela una interacción o se pierde la captura.
* Los enlaces de capability de Session en Admin usan el microcopy responsive más corto `Open session` en lugar de `Open shared Session`.
* Los selectores de Activity en Session Viewer ocultan el dominio de las etiquetas derivadas del email y conservan `@`.
* La navegación de Admin sigue ahora `Ingestions → Sailors → Sessions`, con Ingestions como sección inicial tras el acceso.

### Mejorado

* El workflow de despliegue usa `actions/checkout@v5`.

### Preservado

* El zoom sigue siendo estado local de presentación y no cambia Analysis Window, mapa, Summary, replay ni el `playbackTime` compartido.
* Los ejes, colores y tratamiento circular de COG del gráfico individual SOG + COG, las APIs, la persistencia y la semántica del gráfico de comparación existente permanecen sin cambios.

### Validado

Pasaron las comprobaciones focalizadas de zoom temporal e Individual Analysis, además del typecheck frontend, build de producción y `git diff --check`. No se afirma una regresión completa del repositorio para esta release.

---

## v0.6.2 Mahon — Viewer & Admin Usability

### English

TackBar v0.6.2 is a focused usability release that improves individual Session Viewer analysis and clarifies operational Admin context while preserving the validated v0.6.1 OVH mailbox baseline.

### Added

* Individual Analysis inside the existing Session Viewer with one dual-axis SOG + COG chart per selected Activity.
* Visual-only temporal zoom with Reset and independent zoom state per chart.
* Current Sailor consent status in the Admin Ingestion `Result` section.

### Improved

* Individual charts share the GPS/UTC X axis, use SOG in knots on the primary Y axis and COG on a fixed 0°–360° secondary Y axis.
* Admin Session cards present prominent `ACTIVE` / `EXPIRED` lifetime status, expiration date and remaining days separately from Shared capability state.
* Admin Ingestion `Processed` / `Failed` badges use the established positive/negative Admin status language, while Sailor status is labelled explicitly as `Sailor status`.

### Design

* Individual Analysis remains inside the existing Session Viewer; it does not introduce a separate Activity Viewer or persisted analytics.
* Temporal zoom is presentation-only and does not change the Analysis Window, map, Summary, replay or shared `playbackTime`.
* Sailor consent status in an Ingestion is current derived context and is not persisted as an Ingestion snapshot.
* Session lifetime is derived only from `expires_at` and remains independent from capability state.
* Activity identity, Session matching and membership, consent lifecycle, ACTIVE-only shared visibility, capability and renewal semantics, persistence, ingestion processing and existing comparison chart behavior remain unchanged.
* COG circular-angle semantics remain unchanged.

### Validated

Focused regression checks for Individual Analysis, temporal chart zoom, Admin Ingestion and Admin Session usability passed, together with frontend typecheck, production build and `git diff --check`. No full repository regression suite is claimed for this release.

---

## v0.6.2 Mahon — Usabilidad de Viewer y Admin

### Español

TackBar v0.6.2 es una release focalizada de usabilidad que mejora el análisis individual en el Session Viewer y aclara el contexto operativo de Admin, preservando la baseline validada de v0.6.1 con buzón OVH.

### Añadido

* Individual Analysis dentro del Session Viewer existente, con un chart dual SOG + COG por cada Activity seleccionada.
* Zoom temporal visual con Reset y estado de zoom independiente por chart.
* Estado actual de consentimiento del Sailor en la sección `Result` de Admin Ingestion.

### Mejorado

* Los charts individuales comparten el eje GPS/UTC, usan SOG en nudos en el eje Y primario y COG en un eje Y secundario fijo de 0°–360°.
* Las cards de Admin Session muestran de forma prominente el estado de vigencia `ACTIVE` / `EXPIRED`, la expiración y los días restantes, separado del estado de Shared capability.
* Los badges `Processed` / `Failed` de Admin Ingestion reutilizan el lenguaje visual positivo/negativo existente; el consentimiento se etiqueta explícitamente como `Sailor status`.

### Diseño

* Individual Analysis permanece dentro del Session Viewer existente; no introduce un Activity Viewer separado ni analytics persistidos.
* El zoom temporal es solo de presentación y no cambia Analysis Window, mapa, Summary, replay ni `playbackTime` compartido.
* El estado de consentimiento del Sailor en una Ingestion es contexto actual derivado y no se persiste como snapshot de la Ingestion.
* La vigencia de Session se deriva únicamente de `expires_at` y permanece independiente del estado de capability.
* Se mantienen sin cambios identidad y membresía de Activity/Session, Session matching, ciclo de consentimiento, visibilidad compartida exclusiva para `ACTIVE`, semánticas de capability y renovación, persistencia, procesamiento de ingestas y chart de comparación existente.
* Se mantienen las semánticas circulares de COG.

### Validado

Pasaron las comprobaciones focalizadas de Individual Analysis, zoom temporal, Admin Ingestion y Admin Session, además del typecheck frontend, build de producción y `git diff --check`. No se afirma una regresión completa del repositorio para esta release.

---

## v0.6.1 Mahon — OVH Mailbox Ingestion

### English

TackBar v0.6.1 replaces Gmail as the operational production mailbox with `share@tackbar.eu` on OVHcloud Zimbra, while preserving the existing provider-independent ingestion pipeline and established TackBar product semantics.

### Added

* OVHcloud Zimbra mailbox acquisition through IMAP over TLS at `imap.mail.ovh.net:993`.
* Runtime-configured mailbox provider selection using `TACKBAR_MAILBOX_PROVIDER`.
* Runtime OVH mailbox configuration for host, port, username and password, with credentials kept outside the repository.
* OVH email adapter that converts real mailbox messages into the existing `InboundEmail` boundary.
* Stable OVH provider-message identity based on IMAP `UIDVALIDITY + UID` under a distinct provider key.
* Focused regression coverage for the OVH adapter, provider selection, provider-message identity/deduplication and the common ingestion path.

### Design

* OVHcloud remains an acquisition adapter only; parsing, normalization, Sailor resolution, Activity creation, Session matching, consent, Personal TackBar, Admin ingestion semantics and Viewer behavior remain provider-independent.
* Gmail remains available in the codebase for compatibility/rollback but is no longer the production ingestion path.
* Production ingestion no longer depends on Gmail OAuth refresh-token renewal.
* Remote IMAP `Seen`/`Unread` flags are not TackBar processing state; ingestion history remains the source of truth.
* Sender identity continues to use the outer message sender; forwarded-message sender reconstruction is not introduced.
* Supported input formats remain Vakaros CSV/CSV.GZ.
* Automatic polling, outbound email, `info@tackbar.eu`, new track formats, consent redesign, Admin redesign and Viewer changes remain outside v0.6.1.

### Validated

Focused implementation validation passed 80 backend tests together with Python compile and `git diff --check`, with no new Python dependencies.

The production cutover was manually validated with a real message received by `share@tackbar.eu` and processed through the existing TackBar flow:

`real email → share@tackbar.eu → OVH IMAP adapter → InboundEmail → ingestion → Sailor → Activity → Session → Viewer`

Production was configured with OVH runtime credentials outside the repository, the backend health check passed after restart, and the small pilot runtime dataset was intentionally reset and rebuilt from a clean baseline.

Manual production validation is recorded as `PASS` in `docs/v0.6.1-manual-validation.md`.

---

## v0.6.1 Mahon — Ingesta de buzón OVH

### Español

TackBar v0.6.1 sustituye Gmail como buzón operativo de producción por `share@tackbar.eu` en OVHcloud Zimbra, manteniendo el pipeline de ingesta independiente del proveedor y las semánticas de producto existentes.

### Añadido

* Adquisición desde OVHcloud Zimbra mediante IMAP/TLS en `imap.mail.ovh.net:993`.
* Selección del proveedor de buzón mediante configuración runtime con `TACKBAR_MAILBOX_PROVIDER`.
* Configuración runtime del host, puerto, usuario y contraseña del buzón OVH, manteniendo las credenciales fuera del repositorio.
* Adapter OVH que convierte los mensajes reales del buzón en el `InboundEmail` existente.
* Identidad estable de mensaje OVH basada en `UIDVALIDITY + UID` bajo una clave de proveedor diferenciada.
* Cobertura de regresión focalizada para adapter OVH, selección de proveedor, identidad/deduplicación de mensaje y pipeline común de ingesta.

### Diseño

* OVHcloud es únicamente un adapter de adquisición; parsing, normalización, resolución de Sailor, creación de Activity, Session matching, consentimiento, Personal TackBar, semánticas Admin y Viewer permanecen independientes del proveedor.
* Gmail permanece en el código para compatibilidad/rollback, pero deja de ser el camino operativo de producción.
* La ingesta de producción deja de depender de la renovación de refresh tokens OAuth de Gmail.
* Los flags IMAP `Seen`/`Unread` no son estado TackBar; el historial de ingesta sigue siendo la fuente de verdad.
* La identidad del Sailor sigue usando el remitente exterior del mensaje; no se reconstruye el remitente original de forwards.
* Los formatos soportados siguen siendo Vakaros CSV/CSV.GZ.
* Polling automático, email saliente, `info@tackbar.eu`, nuevos formatos, rediseño del consentimiento, Admin o Viewer quedan fuera de v0.6.1.

### Validado

La validación focalizada de implementación superó 80 tests backend, además de compile de Python y `git diff --check`, sin añadir dependencias Python.

El cutover de producción se validó manualmente con un mensaje real recibido por `share@tackbar.eu` y procesado mediante el flujo TackBar existente:

`correo real → share@tackbar.eu → adapter IMAP OVH → InboundEmail → ingesta → Sailor → Activity → Session → Viewer`

Producción quedó configurada con credenciales OVH runtime fuera del repositorio, el health check del backend pasó tras el reinicio y el pequeño dataset del piloto se reinició intencionadamente desde una baseline limpia.

La validación manual de producción figura como `PASS` en `docs/v0.6.1-manual-validation.md`.

---

## v0.6.0 Mahon — Pilot Operations

### English

TackBar v0.6.0 Mahon consolidates the complete v0.6 work developed after v0.5.1 into the smallest coherent operational build for the Mahon pilot, focused on Personal TackBar access, practical Admin ingestion maintenance, visual-brand consolidation and release hardening.

### Added

* Personal TackBar / My Sessions provides ACTIVE Sailors with a stable, non-guessable personal capability URL and read-only Session participation history derived through `Sailor → Activity → Session`.
* Admin can inspect, copy, regenerate and revoke personal Sailor capability access without changing consent state.
* Admin Ingestions now have a separate administrative disposition (`active` / `discarded`) alongside technical processing status (`processed` / `failed`).
* Semantic `Discard` / `Restore` operations preserve ingestion history, deduplication knowledge, originals, Activities, Session membership, consent and capabilities.
* Admin Ingestions can be filtered independently by technical status and administrative disposition.
* The Session Viewer now includes the standard MapLibre navigation/compass control for manual rotation and north reset.

### Improved

* Admin Sessions are ordered deterministically by real sailing start time, newest sailing first.
* Admin Ingestion cards now prioritize the real sailing date/time and duration, keep operational metadata secondary and present the processing result explicitly through Sailor email, Activity and Session references.
* The Session Viewer uses the quieter OpenFreeMap Positron basemap while preserving existing functional track colors and Viewer semantics.
* TackBar application surfaces progressively adopt the canonical TackBar visual identity, official logo family and shared core palette from `tackbar-web`.
* Session capability generation now rejects collisions with existing personal Sailor capability tokens as well as existing Session tokens.
* Admin ingestion API regression coverage now includes default and combined filters plus Reprocess, Discard and Restore mutations.
* Public ingestion test data is aligned with the v0.6 `disposition` field so regression execution no longer mutates the versioned fixture in place.

### Design

* Gmail remains the current mailbox provider and email remains the track-sharing channel for v0.6.0.
* Existing Activity identity, Session matching, consent lifecycle, ACTIVE-only shared visibility, Session capability/lifetime semantics, persistence and Viewer analytics/replay remain unchanged.
* `Discard` is an administrative classification, not deletion: it does not roll back Activity or Session domain results.
* `Restore` changes only administrative disposition and does not reprocess automatically.
* Reprocess continues to operate on the preserved original and remains an explicit technical recovery/reprocessing action.
* Personal access reuses the existing collaborative Session Viewer and does not introduce a standalone Activity Viewer or a second personal Viewer.
* TackBar-owned public source code transitions to Mozilla Public License 2.0; historical releases remain under their original license grants.
* Multi-provider mailbox ingestion, broad Session-maintenance redesign and GPX/VKX/FIT ingestion remain outside v0.6.0 scope.

### Validated

The Mahon release was manually validated end-to-end with real sailing data, real Gmail ingestion and persistent runtime data, including:

`Gmail track → Admin mailbox review → Ingestion → Activity → Session → Sailor/consent → Personal TackBar → shared Session Viewer`

Manual release validation is recorded as `PASS` in `docs/v0.6.0-manual-test.md`, covering Admin Sessions, Ingestions, deduplication, Sailor/consent, Personal TackBar, Session Viewer, real Gmail flow and persistence across restart.

Automated release validation confirmed:

* backend regression suite passes 210 tests;
* frontend regression suite passes 129 tests across 14 test files;
* TypeScript typecheck passes;
* production frontend build passes;
* backend `compileall` passes;
* `git diff --check` passes.

---

## v0.6.0 Mahon — Pilot Operations

### Español

TackBar v0.6.0 Mahon consolida todo el trabajo v0.6 desarrollado después de v0.5.1 en la build operativa mínima y coherente para el piloto de Mahon, centrada en Personal TackBar, mantenimiento práctico de ingestas en Admin, consolidación visual de marca y hardening de release.

### Añadido

* Personal TackBar / My Sessions ofrece a los Sailors `ACTIVE` una capability URL personal estable y no adivinable, con historial de participación en Sessions de solo lectura derivado mediante `Sailor → Activity → Session`.
* Admin puede inspeccionar, copiar, regenerar y revocar la capability personal de un Sailor sin cambiar su estado de consentimiento.
* Admin Ingestions incorpora una disposición administrativa separada (`active` / `discarded`) junto al estado técnico de procesamiento (`processed` / `failed`).
* Las operaciones semánticas `Discard` / `Restore` preservan historial de ingesta, conocimiento de deduplicación, originales, Activities, membresía de Session, consentimiento y capabilities.
* Admin Ingestions permite filtrar de forma independiente por estado técnico y disposición administrativa.
* El Session Viewer incorpora el control estándar de navegación/brújula de MapLibre para rotación manual y vuelta al norte.

### Mejorado

* Admin Sessions se ordena de forma determinista por hora real de inicio de navegación, más reciente primero.
* Las cards de Admin Ingestion priorizan ahora la fecha/hora real de navegación y la duración, mantienen la metadata operativa en segundo plano y muestran explícitamente el resultado del procesamiento mediante email del Sailor, Activity y Session.
* El Session Viewer utiliza el basemap OpenFreeMap Positron, más neutro, preservando los colores funcionales actuales de los tracks y las semánticas del Viewer.
* Las superficies de la aplicación adoptan progresivamente la identidad visual canónica de TackBar, la familia oficial de logos y la paleta principal compartida con `tackbar-web`.
* La generación de capability de Session evita ahora colisiones tanto con capabilities personales existentes como con otros tokens de Session.
* La cobertura de regresión de la API Admin de ingestas incluye filtros por defecto y combinados, además de las mutaciones Reprocess, Discard y Restore.
* Los datos públicos de prueba de ingesta quedan alineados con el campo v0.6 `disposition`, evitando que la regresión modifique el fixture versionado durante su ejecución.

### Diseño

* Gmail sigue siendo el proveedor de buzón actual y el email continúa siendo el canal de envío de tracks en v0.6.0.
* Se mantienen sin cambios la identidad de Activity, Session matching, ciclo de consentimiento, visibilidad compartida exclusiva para `ACTIVE`, semánticas de capability/vigencia de Session, persistencia y analytics/replay del Viewer.
* `Discard` es una clasificación administrativa y no un borrado: no revierte los resultados de dominio Activity o Session.
* `Restore` cambia únicamente la disposición administrativa y no reprocesa automáticamente.
* Reprocess continúa operando sobre el original preservado y sigue siendo una acción técnica explícita de recuperación/reprocesamiento.
* El acceso personal reutiliza el Session Viewer colaborativo existente y no introduce un Activity Viewer independiente ni un segundo Viewer personal.
* El código fuente público propiedad de TackBar pasa a Mozilla Public License 2.0; las releases históricas conservan las licencias bajo las que fueron publicadas.
* La ingesta multi-proveedor, el rediseño amplio del mantenimiento de Sessions y la ingesta GPX/VKX/FIT permanecen fuera del alcance de v0.6.0.

### Validado

La release Mahon fue validada manualmente end-to-end con datos reales de navegación, ingesta Gmail real y persistencia runtime real, incluyendo:

`Track Gmail → revisión de buzón Admin → Ingestion → Activity → Session → Sailor/consent → Personal TackBar → Session Viewer compartido`

La validación manual de release figura como `PASS` en `docs/v0.6.0-manual-test.md` y cubre Admin Sessions, Ingestions, deduplicación, Sailor/consent, Personal TackBar, Session Viewer, flujo Gmail real y persistencia tras reinicio.

La validación automatizada confirmó:

* la suite de regresión backend supera 210 tests;
* la suite de regresión frontend supera 129 tests distribuidos en 14 archivos de test;
* el typecheck de TypeScript finaliza correctamente;
* el build frontend de producción finaliza correctamente;
* `compileall` del backend finaliza correctamente;
* `git diff --check` finaliza correctamente.

---

## v0.5.1 — Pilot Fix & Usability

### English

TackBar v0.5.1 is a small Pilot Fix & Usability release focused on improving the Admin experience when operating real sailing data, while preserving the validated v0.5.0 Real Sailing Pilot behavior.

### Improved

* Admin Sessions now expose real sailing intervals derived from Activity timestamps, ACTIVE Sailors represented in the Session and consent coverage by unique Sailor.
* Admin Sailors now expose Activity count, unique Session count, most recent sailing context and Session participation history.
* Admin Ingestions now expose the associated Activity sailing interval and sample count, clearly separating email reception time from actual track time.
* Existing Activity counts, capability state, expiration and operational Admin context remain available alongside the new derived information.

### Design

* All new Admin information is derived from existing persisted Sailor, Activity and Session data.
* No new domain persistence concepts were introduced for these summaries.
* Existing Activity identity, deduplication, Session matching, Session membership, consent lifecycle, ACTIVE-only shared visibility, capability authorization, Session expiration/renewal, Gmail ingestion, reprocessing, persistence, Session Viewer, Analysis Window, replay and metrics remain unchanged.

### Validated

Validation confirmed:

* backend regression suite passes 181 tests;
* frontend regression suite passes 107 tests;
* TypeScript typecheck passes;
* production build passes;
* backend `compileall` passes;
* `git diff --check` passes.

---

## v0.5.1 — Correcciones y usabilidad del piloto

### Español

TackBar v0.5.1 es una release menor de correcciones y usabilidad del piloto centrada en mejorar la experiencia Admin al operar datos reales de navegación, manteniendo intacto el comportamiento validado de v0.5.0 Real Sailing Pilot.

### Mejorado

* Admin Sessions muestra ahora el intervalo real de navegación derivado de las Activities, los Sailors `ACTIVE` representados en la Session y la cobertura de consentimiento por Sailor único.
* Admin Sailors muestra ahora el número de Activities, el número de Sessions únicas, el contexto de navegación más reciente y el historial de participación en Sessions.
* Admin Ingestions muestra ahora el intervalo de navegación de la Activity asociada y su número de muestras, diferenciando claramente la recepción del correo del tiempo real del track.
* Los conteos existentes de Activities, el estado de capability, la expiración y el resto del contexto operativo Admin se mantienen junto con la nueva información derivada.

### Diseño

* Toda la nueva información Admin se deriva de los datos ya persistidos de Sailor, Activity y Session.
* No se introdujeron nuevos conceptos de persistencia de dominio para estos resúmenes.
* Se mantienen sin cambios la identidad de Activity, deduplicación, Session matching, membresía de Session, ciclo de consentimiento, visibilidad compartida exclusiva para `ACTIVE`, autorización mediante capability, expiración/renovación de Session, ingesta Gmail, reproceso, persistencia, Session Viewer, Analysis Window, replay y métricas.

### Validado

La validación confirmó:

* la suite de regresión backend supera 181 tests;
* la suite de regresión frontend supera 107 tests;
* el typecheck de TypeScript finaliza correctamente;
* el build de producción finaliza correctamente;
* `compileall` del backend finaliza correctamente;
* `git diff --check` finaliza correctamente.

---

## v0.5.0 — Real Sailing Pilot

### English

TackBar v0.5.0 extends the collaborative debrief baseline with the operational capabilities required to run a controlled pilot with real sailors, real Gmail track submissions, explicit consent and capability-based shared Session access.

### Added

* Consent-aware Sailor lifecycle with `PENDING`, `ACTIVE` and `REVOKED` states plus structured consent-event history.
* Administrative consent operations for marking a consent request as sent, confirming consent after explicit email acceptance, recording withdrawal/decline and starting a new consent cycle.
* Protected `/admin` operational interface using a dedicated TackBar Admin credential kept separate from shared Session access.
* Admin views for Sailors, Sessions and ingestion records.
* Capability-based shared Session access using non-guessable tokens independent from internal Session IDs.
* ACTIVE-only shared Activity visibility enforced by the backend.
* Session lifetime management with `created_at`, initial 60-day `expires_at`, explicit renewal, capability regeneration and capability revocation.
* Persistent ingestion records containing Gmail/provider metadata, attachment identity, processing status, attempt information, safe error context and resulting Activity/Session references.
* Preservation of original received attachments under the private TackBar runtime data root.
* Idempotent reprocessing of known ingestions from preserved originals without requiring Gmail access.
* Admin-triggered Gmail mailbox review reusing the provider-independent ingestion pipeline.
* Gmail mailbox pagination and support for processing multiple independent Vakaros track messages during one review.
* Ingestion history isolated from legacy development/runtime paths so a clean private runtime remains clean until real ingestion occurs.
* Admin ingestion presentation showing the Gmail `received_at` timestamp separately from processing `last_attempt_at`.
* Admin ingestion ordering by email reception time, newest first, so reprocessing an old track does not make it appear as a newly received message.
* Local pilot startup and preflight tooling for backend, frontend, runtime configuration and Gmail readiness.

### Design

* Consent controls shared visibility, not technical ingestion or Session matching: valid Activities may be ingested and associated with Sessions while their Sailor is `PENDING` or `REVOKED`.
* Only Activities whose Sailor is currently `ACTIVE` are exposed through shared Session APIs.
* `REVOKED` is not permanent exclusion: a new participation cycle returns the Sailor to `PENDING` until consent is explicitly confirmed again.
* The v0.5 consent flow remains deliberately human-operated: the administrator sends the invitation/request through Gmail, reviews the explicit reply and confirms consent in TackBar Admin.
* Gmail `unread` state is not used as TackBar processing state; ingestion identity and processing history are maintained internally.
* Gmail remains an adapter and does not define downstream Activity, Session or Viewer semantics.
* Shared Session authorization is based on possession of a high-entropy capability URL; Sailor login is not required for the PoC.
* Session expiration governs shared access only. Activities, tracks and technical Session membership remain persisted after expiration.
* Renewal replaces `expires_at` using the current UTC time plus the selected duration and does not implicitly regenerate, un-revoke or create a capability.
* Admin operations use backend services/repositories rather than direct frontend access to JSON persistence.
* Private pilot data remains outside the repository through `TACKBAR_DATA_DIR`.
* Existing v0.4 Activity identity, deduplication, Session matching, Viewer behavior, Analysis Window, replay and metrics remain unchanged.

### Validated

The Real Sailing Pilot workflow was validated end-to-end using real Gmail messages and real TackBar runtime persistence:

`Gmail track → Admin mailbox review → Ingestion → Activity → Session → Sailor PENDING → consent request → explicit acceptance → Admin confirmation → Sailor ACTIVE → capability URL → shared Session Viewer`

Validation confirmed:

* multiple valid Gmail/Vakaros track messages can be discovered and processed in one mailbox review;
* Gmail read/unread state does not affect whether an unprocessed track is ingested;
* processed messages are tracked by TackBar independently from Gmail state;
* invalid sailing files are retained and reported as failed ingestions without creating invalid Activities;
* preserved originals are available for diagnosis and reprocessing;
* reprocessing remains idempotent with respect to Activity and Session creation;
* real ingestions create Activities and resolve Sessions through the existing Session-matching implementation;
* newly discovered Sailors remain non-shareable until explicit consent is confirmed;
* confirming consent immediately enables the Sailor's existing matched Activities for shared visibility;
* shared Session access exposes only Activities belonging to `ACTIVE` Sailors;
* Session capability access works through the public `/s/:token` route;
* the persisted Session Viewer remains compatible with the consent-filtered shared API flow;
* local Gmail OAuth recovery and non-interactive mailbox operation were validated;
* backend regression suite passes 181 tests;
* frontend regression suite passes 107 tests, together with typecheck and production build;
* backend `compileall` and `git diff --check` pass.

### Next

The next stage will focus on **Pilot Deployment & Communication**:

* deploy the TackBar pilot runtime on an EU-hosted VPS;
* expose the frontend and FastAPI backend through a public domain with HTTPS;
* keep private runtime data and secrets outside the repository;
* validate backup and restore for pilot data;
* prepare simple operational and communication material for real pilot participants;
* keep v0.5 product behavior stable while gathering feedback from real usage.

---

## v0.5.0 — Piloto real de vela

### Español

TackBar v0.5.0 amplía la baseline de debriefing colaborativo con las capacidades operativas necesarias para ejecutar un piloto controlado con regatistas reales, envío real de tracks mediante Gmail, consentimiento explícito y acceso compartido a Sessions mediante capability URL.

### Añadido

* Ciclo de consentimiento de Sailor con estados `PENDING`, `ACTIVE` y `REVOKED`, junto con historial estructurado de eventos de consentimiento.
* Operaciones administrativas para marcar una solicitud de consentimiento como enviada, confirmar consentimiento después de una aceptación explícita por email, registrar retirada/rechazo e iniciar un nuevo ciclo de consentimiento.
* Interfaz operativa `/admin` protegida mediante una credencial Admin específica de TackBar y separada del acceso compartido a Sessions.
* Vistas Admin para Sailors, Sessions y registros de ingesta.
* Acceso compartido a Sessions mediante capability tokens no adivinables e independientes de los Session IDs internos.
* Visibilidad compartida exclusivamente para Activities de Sailors `ACTIVE`, aplicada en backend.
* Gestión de vigencia de Session mediante `created_at`, `expires_at` inicial de 60 días, renovación explícita, regeneración y revocación de capability.
* Registros persistentes de ingesta con metadata de Gmail/proveedor, identidad del adjunto, estado de proceso, intentos, contexto seguro de error y referencias a Activity/Session resultantes.
* Conservación del adjunto original recibido dentro del runtime privado de TackBar.
* Reproceso idempotente de ingestas conocidas a partir del original preservado, sin depender de Gmail.
* Revisión manual del buzón Gmail desde Admin reutilizando el pipeline de ingesta independiente del proveedor.
* Paginación del buzón Gmail y soporte para procesar múltiples mensajes Vakaros independientes en una misma revisión.
* Aislamiento del historial de ingesta respecto a rutas legacy/de desarrollo, de forma que un runtime privado limpio permanece limpio hasta que se produzca una ingesta real.
* Presentación en Admin de la fecha `received_at` del correo Gmail separada de `last_attempt_at`.
* Orden de las ingestas por fecha de recepción del correo, de más reciente a más antiguo, evitando que un reproceso convierta visualmente un correo antiguo en uno reciente.
* Herramientas locales de arranque y preflight para backend, frontend, configuración del runtime y preparación de Gmail.

### Diseño

* El consentimiento controla la visibilidad compartida, no la ingesta técnica ni el Session matching: una Activity válida puede procesarse y asociarse a una Session aunque su Sailor esté `PENDING` o `REVOKED`.
* Sólo las Activities cuyo Sailor está actualmente `ACTIVE` se exponen mediante las APIs compartidas.
* `REVOKED` no implica exclusión permanente: un nuevo ciclo de participación devuelve al Sailor a `PENDING` hasta que el consentimiento vuelva a confirmarse explícitamente.
* El flujo de consentimiento de v0.5 se mantiene deliberadamente asistido por administrador: el Admin envía la solicitud por Gmail, revisa la respuesta explícita y confirma el consentimiento en TackBar.
* El estado `unread` de Gmail no se utiliza como estado de procesamiento TackBar; la identidad y el historial de ingesta se mantienen internamente.
* Gmail sigue siendo un adapter y no define las semánticas downstream de Activity, Session o Viewer.
* La autorización de una Session compartida se basa en la posesión de una capability URL de alta entropía; la PoC no requiere login de Sailor.
* La expiración de una Session gobierna únicamente el acceso compartido. Activities, tracks y membresía técnica de la Session permanecen persistidos después de la expiración.
* La renovación sustituye `expires_at` usando la hora UTC actual más la duración seleccionada y no regenera, desrevoca ni crea implícitamente una capability.
* Las operaciones Admin utilizan servicios/repositorios backend y no acceso directo del frontend a la persistencia JSON.
* Los datos privados del piloto permanecen fuera del repositorio mediante `TACKBAR_DATA_DIR`.
* Se mantienen sin cambios las semánticas de identidad de Activity, deduplicación, Session matching, Viewer, Analysis Window, replay y métricas validadas en v0.4.

### Validado

El flujo del Real Sailing Pilot fue validado end-to-end utilizando mensajes Gmail reales y persistencia runtime real de TackBar:

`Track Gmail → revisión de buzón Admin → Ingestion → Activity → Session → Sailor PENDING → solicitud de consentimiento → aceptación explícita → confirmación Admin → Sailor ACTIVE → capability URL → Shared Session Viewer`

La validación confirmó:

* múltiples mensajes Gmail/Vakaros válidos pueden descubrirse y procesarse en una misma revisión del buzón;
* el estado leído/no leído de Gmail no afecta a la ingesta de un track todavía no procesado;
* los mensajes procesados son controlados por TackBar de forma independiente al estado de Gmail;
* archivos de navegación inválidos se preservan y registran como ingestas fallidas sin crear Activities inválidas;
* los originales preservados quedan disponibles para diagnóstico y reproceso;
* el reproceso mantiene la idempotencia respecto a la creación de Activities y Sessions;
* las ingestas reales crean Activities y resuelven Sessions usando el Session matching existente;
* los nuevos Sailors permanecen fuera de la visibilidad compartida hasta que se confirma explícitamente el consentimiento;
* confirmar el consentimiento hace inmediatamente compartibles las Activities existentes y ya asociadas a Sessions;
* el acceso compartido sólo expone Activities pertenecientes a Sailors `ACTIVE`;
* el acceso mediante capability funciona a través de la ruta pública `/s/:token`;
* el Session Viewer persistido continúa funcionando sobre el flujo de API compartida filtrado por consentimiento;
* se validó la recuperación de OAuth Gmail y la posterior operación no interactiva del buzón;
* la suite de regresión backend supera 181 tests;
* la suite de regresión frontend supera 107 tests, junto con typecheck y build de producción;
* `compileall` del backend y `git diff --check` finalizan correctamente.

### Siguiente

La siguiente etapa se centrará en **Pilot Deployment & Communication**:

* desplegar el runtime del piloto TackBar en un VPS alojado en la UE;
* publicar frontend y backend FastAPI mediante dominio público y HTTPS;
* mantener los datos privados y secretos del runtime fuera del repositorio;
* validar backup y restore de los datos del piloto;
* preparar material operativo y de comunicación sencillo para los participantes reales;
* mantener estable el comportamiento de producto de v0.5 mientras se obtiene feedback de uso real.

---

## v0.4.0 — Collaborative Sailing Debrief

### English

TackBar v0.4.0 connects the mobile-first Session Viewer to Sessions, Activities and canonical tracks actually persisted by the backend, completing the first end-to-end proof of concept for collaborative post-sailing debriefing.

### Added

* Separate `Sailor` and `Boat` runtime domain concepts, with each Activity linked to its Sailor and optionally to the Boat used for that sailing.
* Read-only FastAPI endpoints for recent Sessions, Session detail and complete canonical Activity tracks.
* Frontend Session and track loading through the backend API, removing runtime Session/track fixture dependencies.
* Fixed map replay telemetry showing shared GPS time plus instantaneous SOG, COG and HEEL for the selected Activities.
* Refined Analysis Window summary with Distance, Avg SOG, Max SOG, Dominant COG, signed Avg HEEL and signed Avg TRIM.
* HEEL and TRIM time-series charts alongside the existing SOG and COG charts.
* Horizontal `0°` reference for signed HEEL and TRIM charts.
* Compact temporal Replay controls with shared scrubber and selectable x1, x2, x5 and x10 playback speeds.

### Design

* The frontend consumes backend APIs only and remains isolated from JSON persistence, canonical track files and `TACKBAR_DATA_DIR`.
* Sailor identity is separated from Boat context; email remains an external ingestion identity rather than the permanent domain identifier.
* Primary and Comparison Activities continue to share one absolute GPS/UTC Analysis Window and one synchronized `playbackTime`.
* The map provides fixed instantaneous navigation context while the metric selector independently controls the analytical time-series chart.
* Replay is intentionally limited to temporal navigation: play/pause, shared GPS time, scrubber and playback speed.
* HEEL and TRIM preserve the sign of canonical sensor values without assigning unvalidated port/starboard or bow-up/bow-down semantics.
* Rendering optimizations remain presentation-only; metrics use the complete valid normalized sample population inside the current Analysis Window.
* Collaborative debriefing means sailors reviewing and discussing the same Session Viewer together around a phone or tablet; built-in chat or real-time multi-user collaboration is not required.

### Validated

The complete persisted-data workflow was validated using the public sanitized TEST Session:

`Session persistence → FastAPI → Recent Sessions → Session Viewer → Primary / Comparison → Analysis Window → Map → Replay → Summary → SOG / COG / HEEL / TRIM`

Validation confirmed:

* complete canonical tracks are retrieved through the backend API;
* one or two Activities can be compared over their shared GPS/UTC interval;
* map positions and telemetry remain synchronized through one `playbackTime`;
* Analysis Window changes propagate consistently to map tracks, replay, summary metrics and charts;
* SOG, COG, HEEL and TRIM charts work with one or two Activities;
* circular COG presentation remains protected across the `0°/360°` boundary;
* missing sensor values remain unavailable rather than being invented;
* mobile phone and larger/tablet layouts support the complete debrief workflow;
* backend regression suite passes 116 tests;
* frontend regression suite passes 88 tests, together with typecheck and production build.

### Next

`v0.5.0` will focus on the Real Sailing Pilot: validating TackBar with real sailors and sailing sessions, including the operational access/privacy workflow and further product feedback before expanding analytics or integrations.

---

## v0.4.0 — Debriefing colaborativo de vela

### Español

TackBar v0.4.0 conecta el Session Viewer mobile-first con Sessions, Activities y tracks canónicos realmente persistidos por el backend, completando la primera prueba de concepto end-to-end para el debriefing colaborativo después de navegar.

### Añadido

* Conceptos de dominio runtime `Sailor` y `Boat` separados, con cada Activity vinculada a su Sailor y opcionalmente al Boat utilizado en esa navegación.
* Endpoints FastAPI de solo lectura para Sessions recientes, detalle de Session y tracks canónicos completos de cada Activity.
* Carga de Sessions y tracks desde el frontend mediante la API backend, eliminando la dependencia runtime de fixtures de Sessions/tracks.
* Telemetría fija de replay en el mapa con tiempo GPS compartido y SOG, COG y HEEL instantáneos para las Activities seleccionadas.
* Resumen de Analysis Window refinado con Distance, Avg SOG, Max SOG, Dominant COG y promedios positivos/negativos de HEEL y TRIM.
* Gráficos temporales de HEEL y TRIM junto con los gráficos existentes de SOG y COG.
* Referencia horizontal de `0°` en los gráficos con signo de HEEL y TRIM.
* Controles de Replay temporales y compactos con scrubber compartido y velocidades x1, x2, x5 y x10 seleccionables.

### Diseño

* El frontend consume únicamente APIs backend y permanece aislado de la persistencia JSON, los archivos de tracks canónicos y `TACKBAR_DATA_DIR`.
* La identidad de Sailor queda separada del contexto Boat; el email continúa siendo una identidad externa de ingesta y no el identificador permanente del dominio.
* Las Activities Primary y Comparison continúan compartiendo una única Analysis Window GPS/UTC absoluta y un único `playbackTime` sincronizado.
* El mapa proporciona contexto de navegación instantáneo fijo, mientras que el selector de métricas controla independientemente el gráfico temporal analítico.
* Replay queda deliberadamente limitado a navegación temporal: play/pause, tiempo GPS compartido, scrubber y velocidad de reproducción.
* HEEL y TRIM conservan el signo de los valores canónicos del sensor sin asignar semánticas no validadas de babor/estribor ni proa arriba/proa abajo.
* Las optimizaciones de renderizado permanecen exclusivamente en la presentación; las métricas utilizan el conjunto completo de muestras normalizadas válidas dentro de la Analysis Window actual.
* El debriefing colaborativo consiste en que los regatistas revisen y discutan juntos la misma Session Viewer alrededor de un móvil o tablet; no requiere chat integrado ni colaboración multiusuario en tiempo real.

### Validado

El flujo completo con datos persistidos fue validado utilizando la Session TEST pública y sanitizada:

`Persistencia de Session → FastAPI → Sessions recientes → Session Viewer → Primary / Comparison → Analysis Window → Mapa → Replay → Resumen → SOG / COG / HEEL / TRIM`

La validación confirmó:

* recuperación de los tracks canónicos completos mediante la API backend;
* comparación de una o dos Activities sobre su intervalo GPS/UTC compartido;
* sincronización de posiciones y telemetría del mapa mediante un único `playbackTime`;
* propagación consistente de cambios de Analysis Window al mapa, replay, métricas resumen y gráficos;
* funcionamiento de los gráficos SOG, COG, HEEL y TRIM con una o dos Activities;
* preservación de la representación circular de COG en el límite `0°/360°`;
* conservación de los valores de sensor ausentes como no disponibles, sin inventarlos;
* funcionamiento del flujo completo de debriefing en móvil y en pantallas tablet/mayores;
* suite de regresión backend con 116 tests superados;
* suite de regresión frontend con 88 tests superados, además de typecheck y build de producción.

### Siguiente

`v0.5.0` se centrará en el Real Sailing Pilot: validar TackBar con regatistas y sesiones reales, incluyendo el flujo operativo de acceso/privacidad y nuevo feedback de producto antes de ampliar la analítica o las integraciones.

---

## v0.3.1 — Session Viewer Stabilization

### English

Stabilization release focused on temporal interaction, replay consistency and the separation between public test data and private pilot data.

### Added

* Shared dual-handle Analysis Window control for selecting the active temporal interval.
* Dedicated replay scrubber directly associated with the selected Analysis Window.
* Public sanitized TEST dataset using the same persistence structure as private runtime data.
* Configurable private runtime storage through `TACKBAR_DATA_DIR`.

### Design

* Analysis Window and Replay now have clearly separated responsibilities: the Analysis Window defines the interval to analyze, while `playbackTime` provides fine-grained navigation inside that interval.
* Replay position, map markers, charts and current metric values are constrained to the selected Analysis Window.
* Primary and Comparison Activities continue to share one absolute GPS/UTC Analysis Window and one synchronized `playbackTime`.
* SOG and COG remain the enabled time-series/replay metrics; HEEL and TRIM remain available as summary metrics and are deferred for time-series visualization.
* Public repository data is limited to intentionally publishable TEST/demo data. Real participant, ingestion and sailing data is stored outside the repository in private runtime storage.
* TEST and private runtime environments share the same persistence model and application logic; only the configured data root changes.

### Validated

The Session Viewer was validated with the public two-Activity TEST dataset, including:

`Analysis Window → Map → Replay → SOG / COG → Summary`

Validation confirmed:

* synchronized Primary and Comparison replay inside the selected Analysis Window;
* fine-grained replay navigation over long Activities;
* Analysis Window filtering across map, charts and summary metrics;
* consistent SOG/COG replay presentation;
* Avg SOG presentation in `kt`;
* public TEST data separated from private runtime data.

### Next

The next development stage will introduce the read-only backend Session Viewer API and replace direct frontend fixtures with backend-provided Sessions, Activities and tracks.

---

## v0.3.1 — Estabilización del Session Viewer

### Español

Versión de estabilización centrada en la interacción temporal, la consistencia del replay y la separación entre datos públicos de prueba y datos privados del piloto.

### Añadido

* Control compartido de doble handle para seleccionar el intervalo activo de Analysis Window.
* Control de replay independiente para navegación temporal precisa dentro de la Analysis Window seleccionada.
* Dataset TEST público y sanitizado con la misma estructura de persistencia que los datos privados.
* Almacenamiento runtime privado configurable mediante `TACKBAR_DATA_DIR`.

### Diseño

* Analysis Window y Replay tienen responsabilidades claramente separadas: Analysis Window define el intervalo a analizar y `playbackTime` permite navegación precisa dentro de ese intervalo.
* La posición de replay, los marcadores del mapa, los gráficos y los valores de la métrica actual quedan limitados a la Analysis Window seleccionada.
* Las Actividades Primary y Comparison continúan compartiendo una única Analysis Window GPS/UTC absoluta y un único `playbackTime` sincronizado.
* SOG y COG siguen siendo las métricas habilitadas para series temporales/replay; HEEL y TRIM permanecen disponibles como métricas resumen y se difiere su visualización temporal.
* El repositorio público contiene únicamente datos TEST/demo intencionadamente publicables. Los datos reales de participantes, ingesta y navegación se almacenan fuera del repositorio en almacenamiento runtime privado.
* TEST y runtime privado utilizan el mismo modelo de persistencia y la misma lógica de aplicación; únicamente cambia la raíz de datos configurada.

### Validado

El Session Viewer fue validado con el dataset TEST público de dos Actividades, incluyendo:

`Analysis Window → Mapa → Replay → SOG / COG → Resumen`

La validación confirmó:

* replay sincronizado de Primary y Comparison dentro de la Analysis Window seleccionada;
* navegación temporal precisa sobre Actividades largas;
* filtrado por Analysis Window en mapa, gráficos y métricas resumen;
* presentación consistente de SOG/COG durante el replay;
* presentación de Avg SOG en `kt`;
* separación entre los datos TEST públicos y los datos runtime privados.

### Siguiente

La siguiente etapa introducirá la API backend de solo lectura del Session Viewer y sustituirá los fixtures directos del frontend por Sesiones, Actividades y tracks proporcionados por el backend.

---

## v0.3.0 — Multi-Track Viewer

### English

First functional proof of concept of the mobile-first Session Viewer for visual sailing debriefing and synchronized Activity comparison.

### Added

* Canonical normalized track persistence with immutable original files, replaceable normalized tracks and offline Activity reprocessing.
* Mobile-first Session Viewer with Primary Activity and optional Comparison Activity.
* Complete real-track visualization with MapLibre and automatic fitting to the selected track interval.
* Ephemeral shared Analysis Window using absolute GPS/UTC time.
* Synchronized replay with a single playback clock and x1, x2, x5 and x10 speeds.
* Summary metrics for the selected Analysis Window: Distance, Avg SOG, Dominant COG, Avg HEEL and Avg TRIM.
* SOG and COG time-series charts synchronized with replay.
* Two-Activity visual comparison with shared Analysis Window, synchronized boat positions, map tracks, charts and summary metrics.
* Support for uncompressed Vakaros `.csv` attachments in addition to `.csv.gz`.

### Design

* Activity remains the identity of each received track; Session groups compatible Activities without merging them.
* Primary and Comparison Activities share one absolute GPS/UTC Analysis Window and one `playbackTime`.
* Two-Activity synchronization is timestamp-based and does not depend on sample index or sampling frequency.
* COG summary calculations preserve circular 0°/360° semantics.
* Frontend fixtures are intentionally used to validate the complete viewer experience before introducing the backend read API.

### Validated

Real sailing data was used to validate the complete Session Viewer flow:

`Session → Activities → Analysis Window → Map → Replay → Summary → SOG / COG`

The viewer supports one or two Activities over the same temporal window, with synchronized tracks, boat positions, metrics and charts.

### Next

The next development stage will replace frontend development fixtures with a narrow read-only backend API for Sessions, Activities and normalized tracks.

---

## v0.3.0 — Visor Multi-Track

### Español

Primera prueba de concepto funcional del Session Viewer mobile-first para debriefing visual y comparación sincronizada de Actividades de navegación.

### Añadido

* Persistencia canónica de tracks normalizados con originales inmutables, tracks normalizados reemplazables y reprocesamiento offline de Actividades.
* Session Viewer mobile-first con Actividad principal y Actividad de comparación opcional.
* Visualización de tracks reales completos con MapLibre y ajuste automático al intervalo seleccionado.
* Analysis Window compartida y efímera basada en tiempo absoluto GPS/UTC.
* Replay sincronizado con un único reloj y velocidades x1, x2, x5 y x10.
* Métricas resumen para la Analysis Window seleccionada: distancia, SOG promedio, COG dominante, HEEL promedio y TRIM promedio.
* Gráficos temporales de SOG y COG sincronizados con el replay.
* Comparación visual de dos Actividades con Analysis Window compartida, posiciones sincronizadas, tracks, gráficos y métricas resumen.
* Soporte para adjuntos Vakaros `.csv` sin comprimir además de `.csv.gz`.

### Diseño

* La Actividad mantiene la identidad de cada track recibido; la Sesión agrupa Actividades compatibles sin fusionarlas.
* Las Actividades principal y de comparación comparten una única Analysis Window GPS/UTC y un único `playbackTime`.
* La sincronización de dos Actividades se basa en timestamps y no depende del índice de muestras ni de su frecuencia.
* Los cálculos resumen de COG preservan la semántica circular 0°/360°.
* Los fixtures frontend se utilizan intencionadamente para validar la experiencia completa del visor antes de introducir la API de lectura del backend.

### Validado

Se utilizaron datos reales de navegación para validar el flujo completo del Session Viewer:

`Sesión → Actividades → Analysis Window → Mapa → Replay → Resumen → SOG / COG`

El visor permite trabajar con una o dos Actividades sobre la misma ventana temporal, con tracks, posiciones de barco, métricas y gráficos sincronizados.

### Siguiente

La siguiente etapa sustituirá los fixtures de desarrollo frontend por una API backend de solo lectura para Sesiones, Actividades y tracks normalizados.

---

## v0.2.0 — Automatic Session Detection

### English

Automatic grouping of sailing activities into sessions.

### Added

- Automatic Session creation and matching.
- Temporal matching using sailing activity intervals.
- Geographical matching using GPS track centers.
- Activity spatial summaries including center and bounding box.
- Deterministic and idempotent Session assignment.
- Automatic creation of participants from previously unknown sender emails.
- Persistent provider-independent ingestion history.

### Validated

Multiple real sailing tracks from the same sailing area and time period were automatically grouped into the same Session.

Matching thresholds remain intentionally simple and will be refined with additional real-world sailing data.

---

## v0.2.0 — Detección automática de sesiones

### Español

Agrupación automática de actividades de navegación en sesiones.

### Añadido

- Creación y matching automático de Sesiones.
- Matching temporal mediante intervalos de las actividades.
- Matching geográfico mediante centros GPS de los tracks.
- Resumen espacial de Activities mediante centro y bounding box.
- Asignación de Sesiones determinista e idempotente.
- Creación automática de participantes para nuevos remitentes.
- Historial de ingesta persistente e independiente del proveedor.

### Validado

Varios tracks reales correspondientes a la misma zona y periodo de navegación fueron agrupados automáticamente en una misma Sesión.

Los umbrales de matching se mantienen deliberadamente simples y se ajustarán posteriormente utilizando más datos reales.

---

## v0.1.0 — Email Track Ingestion PoC

### English

First functional proof of concept for automatic sailing-track ingestion.

### Added

* Automatic reception of Vakaros `CSV.GZ` tracks from Gmail.
* OAuth 2.0 read-only Gmail integration.
* Vakaros sailing-track parser and normalized activity model.
* Manual participant and boat configuration for the initial pilot.
* Participant identification using normalized sender email.
* Persistent activity registry with start/end time, GPS positions and track metadata.
* Provider-independent ingestion history.
* Message and activity deduplication.
* Automated tests using real Vakaros activity data.

### Validated

Real end-to-end workflow:

`Vakaros → Email → Gmail → TackBar → Participant → Activity`

The same sailing activity is correctly detected even when received through different email messages.

### Next

`v0.2.0` will focus on automatically grouping activities into sailing sessions using time and GPS proximity.

---

# Historial de cambios

---

## v0.1.0 — PoC de ingesta de tracks por email

### Español

Primera prueba de concepto funcional para la ingesta automática de tracks de navegación.

### Añadido

* Recepción automática de tracks Vakaros `CSV.GZ` desde Gmail.
* Integración OAuth 2.0 con Gmail en modo solo lectura.
* Parser de tracks Vakaros y modelo de actividad normalizado.
* Configuración manual de participantes y barcos para el piloto inicial.
* Identificación del participante mediante email normalizado.
* Registro persistente de actividades con tiempos, posiciones GPS y metadata del track.
* Historial de ingesta independiente del proveedor.
* Deduplicación de mensajes y actividades.
* Tests automatizados utilizando datos reales de Vakaros.

### Validado

Flujo real completo:

`Vakaros → Email → Gmail → TackBar → Participante → Actividad`

La misma navegación se identifica correctamente aunque llegue mediante diferentes mensajes de correo.

### Siguiente

`v0.2.0` se centrará en agrupar automáticamente las actividades en sesiones de navegación utilizando proximidad temporal y GPS.
