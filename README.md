# TackBar

**Collaborative post-sailing debriefing for sailors, coaches and racing teams.**

TackBar is an early-stage open-source project focused on making post-sailing analysis simple, collaborative and immediate.

The core idea is simple:

**Sail → share your track → compare → debrief.**

Instead of manually collecting GPS files from several sailors and trying to align them afterwards, TackBar aims to automatically group tracks that belong to the same sailing session and make them available for collaborative review.

---

## Why TackBar?

A lot of useful discussion happens after sailing:

* Why was one boat faster on a particular leg?
* Who gained on the first beat?
* Where did two boats separate?
* What happened around the start?
* Was the difference tactical, positional or simply speed?

Today, this often means manually exporting files, exchanging them between sailors and loading them into different analysis tools.

TackBar aims to reduce that friction.

> **Sail first. TackBar after.**

The debrief starts when the sailing stops.

---

## Current proof of concept

The current TackBar proof of concept supports a deliberately simple workflow:

1. A sailor records a sailing activity.
2. The activity track is exported from the device platform.
3. The sailor sends the track as an email attachment.
4. TackBar receives and processes the attachment.
5. The normalized sender email resolves the internal Sailor identity.
6. Date, time and GPS proximity are used to determine which sailing session the activity belongs to.
7. The Activity records its Sailor and optional Boat context and is grouped
   automatically into a Session.
8. FastAPI exposes persisted Sessions and canonical Activity tracks through a
   read-only API.
9. The v0.4.0 mobile Session Viewer opens that persisted data for one/two-boat
   comparison and collaborative debriefing.

Initial testing is being performed using **Vakaros activity exports**.

For the first PoC, the preferred format is:

`CSV + GZIP`

Example:

`Vakaros Connect → Export CSV/GZIP → Email → TackBar → Session`

---

## Sailor, Boat and Activity identity

For current email ingestion, the normalized sender email resolves a Sailor.
The Sailor has a stable internal TackBar identity; email remains an external
ingestion identity.

Boat is a separate domain entity. A Sailor may have an optional default Boat
for new ingestion, while each Activity records the Sailor and the Boat used
when that context is known. Activity remains the stable identity of one
received track.

---

## Automatic session detection

TackBar attempts to identify activities that belong to the same sailing session using:

* activity date;
* start and end time;
* temporal overlap;
* geographic proximity;
* GPS track location.

If no compatible session exists, TackBar creates a new session automatically.

The goal is that sailors do not need to create a session manually before sailing.

The first sailor simply sends a track. Subsequent tracks from nearby sailors are automatically associated with the same session when time and location are compatible.

---

## Activity data

The current Vakaros CSV export provides data such as:

* timestamp;
* latitude;
* longitude;
* speed over ground;
* course over ground;
* true heading;
* heel;
* trim.

Additional formats and data sources may be supported progressively, including:

* VKX;
* FIT;
* GPX;
* Garmin Connect;
* Intervals.icu;
* Strava;
* other sailing devices and activity platforms.

TackBar is intended to remain device-independent.

---

## Architecture

The current architecture is intentionally simple:

`Email/provider → ingestion → parsing/normalization → Sailor → Activity + optional Boat → Session matching → persistence → FastAPI read API → Session Viewer`

Current technology and persistence:

* **Frontend:** React + TypeScript Session Viewer
* **Backend:** Python + FastAPI
* **Persistence:** JSON metadata plus filesystem originals and normalized tracks
* **Activity ingestion:** Gmail API adapter with provider-independent downstream processing
* **Target experience:** mobile-first web application that also works naturally on tablets

v0.4.0 connects the Viewer to Sessions, Activities and canonical tracks
actually persisted by the backend. It provides one/two-Activity comparison, a
shared GPS/UTC Analysis Window, fixed map telemetry, synchronized replay, the
refined Summary, and SOG/COG/HEEL/TRIM charts. Public sanitized TEST data
validates the same runtime/API path without becoming a frontend fixture
fallback. SQLite is not a prerequisite for this PoC.

The ingestion layer is intended to remain independent from the analytics layer.

This makes it possible to add new activity sources without changing the core sailing analysis.

---

## Relationship with MaxSail Analytics

TackBar builds on sailing analytics concepts and technical experimentation previously developed in **MaxSail Analytics**.

MaxSail Analytics explored areas such as:

* GPS track visualization;
* comparison between sailing tracks;
* speed and heading analysis;
* time-based track selection;
* wind-oriented visualization;
* sailing-session analysis.

TackBar is a new and independent product direction.

It does not inherit the Streamlit application architecture of MaxSail Analytics.

Reusable TackBar sailing-analysis logic may evolve as an independent Python
analytics/domain layer or library when needed. This direction does not claim a
mature standalone analytics library is already delivered, and it does not turn
v0.4 into an advanced analytics release.

The focus is instead on:

* collaborative debriefing;
* automatic activity ingestion;
* mobile and tablet usage;
* session-based analysis;
* simple post-sailing workflows;
* support for multiple sailors and boats.

---

## Project status

**Early-stage proof of concept.**

`v0.4.0 — Collaborative Sailing Debrief PoC` has delivered the complete
runtime workflow:

`multiple sailors → track ingestion → automatic Session detection → persisted Session → backend API → collaborative visual debrief`

The debrief is collaborative because sailors inspect and discuss the Session
together around a phone or tablet; it does not require built-in chat or
messaging.

The next product stage is `v0.5.0 — Real Sailing Pilot`. It is not yet
delivered.

The project is not currently affiliated with or endorsed by Garmin, Vakaros or any other device manufacturer.

---

## Open source

TackBar is being developed as an open-source project.

Licensing, contribution guidelines and the public roadmap will evolve as the project matures.

---

# Versión en español

**Debriefing colaborativo después de navegar para regatistas, entrenadores y equipos.**

TackBar es un proyecto open-source en fase inicial cuyo objetivo es hacer que el análisis posterior a una navegación sea simple, colaborativo e inmediato.

La idea central es sencilla:

**Navegar → compartir el track → comparar → hacer debriefing.**

En lugar de recopilar manualmente archivos GPS de distintos regatistas e intentar alinearlos posteriormente, TackBar busca agrupar automáticamente los tracks que pertenecen a una misma sesión de navegación y ponerlos a disposición de los participantes para analizarlos conjuntamente.

---

## ¿Por qué TackBar?

Muchas de las conversaciones más útiles ocurren después de navegar:

* ¿Por qué un barco fue más rápido en un tramo?
* ¿Quién ganó metros en la primera ceñida?
* ¿Dónde se separaron dos barcos?
* ¿Qué ocurrió alrededor de la salida?
* ¿La diferencia fue táctica, de posicionamiento o simplemente de velocidad?

Actualmente, esto suele implicar exportar archivos manualmente, intercambiarlos entre regatistas y cargarlos en diferentes herramientas de análisis.

TackBar pretende reducir esa fricción.

> **Primero navegamos. Después, TackBar.**

El debriefing empieza cuando termina la navegación.

---

## Prueba de concepto actual

La prueba de concepto actual de TackBar soporta deliberadamente un flujo muy sencillo:

1. Un regatista registra una actividad de navegación.
2. El track se exporta desde la plataforma del dispositivo.
3. El regatista envía el track como archivo adjunto por correo electrónico.
4. TackBar recibe y procesa el adjunto.
5. El email remitente normalizado resuelve la identidad interna Sailor.
6. La fecha, la hora y la proximidad GPS permiten determinar a qué sesión pertenece la actividad.
7. La Activity registra su Sailor y el contexto Boat opcional y se agrupa
   automáticamente en una Session.
8. FastAPI expone Sessions persistidas y tracks canónicos mediante una API de
   solo lectura.
9. El Session Viewer mobile-first de v0.4.0 abre esos datos persistidos para la
   comparación de uno/dos barcos y el debriefing colaborativo.

Las primeras pruebas se están realizando utilizando **exportaciones de actividades Vakaros**.

Para la primera PoC, el formato preferido es:

`CSV + GZIP`

Ejemplo:

`Vakaros Connect → Exportar CSV/GZIP → Email → TackBar → Sesión`

---

## Identidad de Sailor, Boat y Activity

En la ingesta actual por email, el remitente normalizado resuelve un Sailor. El
Sailor tiene una identidad interna estable de TackBar; el email sigue siendo
una identidad externa de ingesta.

Boat es una entidad de dominio separada. Un Sailor puede tener un Boat por
defecto opcional para nuevas ingestas y cada Activity registra el Sailor y el
Boat utilizado cuando se conoce ese contexto. Activity mantiene la identidad
estable de un track recibido.

---

## Detección automática de sesiones

TackBar intenta identificar las actividades que pertenecen a una misma sesión utilizando:

* fecha de la actividad;
* hora de inicio y finalización;
* solapamiento temporal;
* proximidad geográfica;
* localización del track GPS.

Si no existe una sesión compatible, TackBar crea una nueva automáticamente.

El objetivo es que los regatistas no tengan que crear previamente una sesión antes de salir a navegar.

El primer regatista simplemente envía su track. Los siguientes tracks se asocian automáticamente a la misma sesión cuando la hora y la ubicación son compatibles.

---

## Datos de actividad

La exportación CSV actual de Vakaros proporciona información como:

* timestamp;
* latitud;
* longitud;
* velocidad sobre el fondo;
* rumbo sobre el fondo;
* heading verdadero;
* escora;
* trimado.

Progresivamente podrán incorporarse otros formatos y fuentes:

* VKX;
* FIT;
* GPX;
* Garmin Connect;
* Intervals.icu;
* Strava;
* otros dispositivos y plataformas de actividad.

TackBar pretende ser independiente del dispositivo utilizado.

---

## Arquitectura

La arquitectura actual se mantiene deliberadamente sencilla:

`Email/proveedor → ingesta → parsing/normalización → Sailor → Activity + Boat opcional → matching de Session → persistencia → API FastAPI de lectura → Session Viewer`

Tecnología y persistencia actuales:

* **Frontend:** Session Viewer con React + TypeScript
* **Backend:** Python + FastAPI
* **Persistencia:** metadata JSON más originales y tracks normalizados en el sistema de archivos
* **Ingesta de Activity:** adaptador Gmail API con procesamiento posterior independiente del proveedor
* **Experiencia objetivo:** aplicación web mobile-first que también funciona de forma natural en tablet

v0.4.0 conecta el Viewer con Sessions, Activities y tracks canónicos realmente
persistidos por el backend. Incluye comparación de una/dos Activities, Analysis
Window GPS/UTC compartida, telemetría fija en el mapa, replay sincronizado,
Summary refinado y gráficos SOG/COG/HEEL/TRIM. Los datos TEST públicos y
sanitizados validan la misma ruta runtime/API sin actuar como fallback de
fixtures frontend. SQLite no es un requisito previo para esta PoC.

La capa de ingestión permanecerá separada de la capa analítica.

De esta forma podrán incorporarse nuevas fuentes de actividad sin modificar el núcleo de análisis de navegación.

---

## Relación con MaxSail Analytics

TackBar se apoya en conceptos de analítica de vela y experimentación técnica desarrollados previamente en **MaxSail Analytics**.

MaxSail Analytics exploró áreas como:

* visualización de tracks GPS;
* comparación entre tracks de navegación;
* análisis de velocidad y rumbo;
* selección temporal de tramos;
* visualización orientada al viento;
* análisis de sesiones de navegación.

TackBar representa una nueva dirección de producto independiente.

No hereda la arquitectura de aplicación Streamlit de MaxSail Analytics.

La lógica reutilizable de análisis de vela de TackBar podrá evolucionar como
una capa o librería independiente de analítica/dominio en Python cuando sea
necesario. Esta dirección no afirma que ya exista una librería independiente
madura ni convierte v0.4 en una release de analítica avanzada.

El foco pasa a estar en:

* debriefing colaborativo;
* ingestión automática de actividades;
* uso desde móvil y tablet;
* análisis basado en sesiones;
* simplicidad del flujo posterior a la navegación;
* soporte para varios regatistas y barcos.

---

## Estado del proyecto

**Prueba de concepto en fase inicial.**

`v0.4.0 — PoC de debriefing colaborativo de vela` ha entregado el flujo
runtime completo:

`varios regatistas → ingesta de tracks → detección automática de Session → Session persistida → API backend → debriefing visual colaborativo`

El debriefing es colaborativo porque los regatistas inspeccionan y comentan la
Session juntos alrededor de un móvil o tablet; no requiere chat ni mensajería
integrados.

La siguiente etapa de producto es `v0.5.0 — Piloto con regatistas reales`. Aún
no está entregada.

Actualmente el proyecto no está afiliado ni respaldado por Garmin, Vakaros ni ningún otro fabricante de dispositivos.

---

## Open source

TackBar se desarrolla como proyecto open-source.

La licencia, las guías de contribución y el roadmap público evolucionarán a medida que madure el proyecto.

---

# About the author / Sobre el autor

Hi! I'm **Maximiliano Mannise**, a software engineer working in the industry since 1998, a data and analytics enthusiast, and a passionate sailor.

I've been sailing for more than 20 years: first for fun, later in cruising regattas, and since 2020 in the **Snipe dinghy class**.

My professional background naturally leads me to approach sailing from an analytical perspective: tracks, speed, headings, metrics and comparisons.

**MaxSail Analytics** started as an experimental tool to explore sailing GPS data and understand what happened on the water.

**TackBar** takes that idea one step further.

The goal is not only to analyze an individual track, but to make the post-sailing debriefing easier and more collaborative: collect tracks from several sailors, automatically identify which activities belong to the same session, compare them and discuss what happened.

TackBar is an open-source project and is currently in an early proof-of-concept stage.

Contributions, ideas, testing and feedback from sailors, coaches and developers are very welcome.

**See you on the water — and afterwards at TackBar!**

---

¡Hola! Soy **Maximiliano Mannise**, ingeniero en informática, trabajando en el sector desde 1998, apasionado por los datos, los indicadores y las métricas, y también por la vela.

Navego desde hace más de 20 años: primero por diversión, después en regatas de crucero y, desde 2020, en **vela ligera clase Snipe**.

Por deformación profesional, suelo llevar también la navegación al terreno analítico: tracks, velocidad, rumbos, métricas y comparaciones.

**MaxSail Analytics** nació como una herramienta experimental para explorar datos GPS de navegación y comprender mejor qué había ocurrido en el agua.

**TackBar** lleva esa idea un paso más allá.

El objetivo ya no es únicamente analizar un track individual, sino facilitar un debriefing posterior a la navegación más sencillo y colaborativo: recoger tracks de varios regatistas, identificar automáticamente qué actividades pertenecen a la misma sesión, compararlas y discutir qué ocurrió.

TackBar es un proyecto open-source y actualmente se encuentra en fase inicial de prueba de concepto.

Cualquier colaboración, idea, prueba o feedback por parte de regatistas, entrenadores y desarrolladores será muy bienvenido.

**¡Nos vemos en el agua... y después en TackBar!**

---

## Contact / Contacto

* **Author / Autor:** Maximiliano Mannise
* **LinkedIn:** https://www.linkedin.com/in/mmannise
* **Email:** [maxsail.project@gmail.com](mailto:maxsail.project@gmail.com)
* **GitHub:** maxsail-project

---

## License / Licencia

This project is released under the **MIT License**.

Este proyecto se publica bajo la **licencia MIT**.

---

## Contributions / Contribuciones

Contributions, suggestions and forks are welcome.

If you'd like to report a bug, suggest an enhancement or contribute to TackBar, please open an **issue** or **pull request** in this repository.

Las mejoras, sugerencias y forks son bienvenidos.

Si quieres reportar un error, proponer una mejora o colaborar con TackBar, abre un **issue** o un **pull request** en este repositorio.
