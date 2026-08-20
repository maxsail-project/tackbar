# Changelog

All notable changes to TackBar will be documented in this file.

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

## v0.2.0 — Detección automática de sesiones

---

## v0.2.0 — Automatic Session Detection

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
