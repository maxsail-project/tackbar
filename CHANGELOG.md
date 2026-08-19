# Changelog

All notable changes to TackBar will be documented in this file.

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
