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

## Current pilot workflow

`Sail → share Vakaros activity → email ingestion → Sailor → Activity → Session → capability URL → shared Session Viewer → collaborative debrief`

The current pilot accepts **Vakaros CSV and CSV.GZ** exports through Gmail.
Admin triggers mailbox review, manages consent and shares Session links.
The normalized sender email resolves the Sailor; each received track becomes
an Activity with optional Boat context and is automatically matched to a Session.

Consent controls shared visibility, not technical ingestion or Session matching.
Only Activities of currently `ACTIVE` Sailors appear in shared Sessions.
Access uses a valid Session capability URL, without a general Sailor login.

GPX, VKX and FIT are planned formats, not current support. OVHcloud ingestion
is part of the v0.6 direction and is not yet operational in this baseline.

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

Planned format support is described in the roadmap section below.

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

The current pilot connects the Viewer to Sessions, Activities and canonical tracks
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

**Controlled real-sailing pilot, with v0.6.0 as the current productization increment.**

**v0.5.0 — Real Sailing Pilot** is delivered and validated end-to-end with real
Gmail messages, runtime persistence, explicit consent and capability-based
shared Session access. **v0.5.1 — Pilot Fix & Usability** is delivered, adding
clearer sailing and participation context to Admin.

The delivered baseline includes Sailor / optional Boat context, automatic
Session matching, one/two-Activity comparison, a shared GPS/UTC Analysis
Window, synchronized replay and SOG/COG/HEEL/TRIM analysis.

The debrief is collaborative because sailors inspect and discuss the Session
together around a phone or tablet; it does not require built-in chat or
messaging.

See the [CHANGELOG](CHANGELOG.md) for delivered changes and the
[pilot participation and consent conditions](docs/pilot-participation-consent.md).

The project is not currently affiliated with or endorsed by Garmin, Vakaros or any other device manufacturer.

## Next direction

### v0.6.0 — Personal TackBar & Pilot Operations

Current development direction; the following functionality is planned, not yet
part of the delivered pilot baseline:

- Personal TackBar / My Sessions: read-only history of Sessions derived through
  the Sailor's Activities, with ACTIVE consent and a valid personal capability.
  Available Sessions open in the existing shared Viewer; unavailable Sessions
  remain history but cannot currently be opened;
- pilot/Admin operational improvements;
- Gmail + OVHcloud acquisition through provider-independent ingestion;
- application visual consolidation using `tackbar-web` as the current brand reference.

The MPL-2.0 licensing transition is already applied in the current repository.
This does not mean the whole v0.6.0 release is delivered.

See the [v0.6 requirements](docs/v0.6-personal-tackbar-pilot-operations-requirements.md).

### v0.7.0 — Multi-Format Track Ingestion

Planned: preserve CSV/CSV.GZ and add **GPX → VKX → FIT**, validating each in
that order. All formats will converge on one canonical TackBar normalized
track, with deterministic, Sailor-scoped post-normalization logical duplicate
resolution. The fingerprint contract remains to be finalized using representative
multi-format data.

See the [v0.7 requirements](docs/v0.7-multi-format-track-ingestion-requirements.md)
and [ROADMAP](ROADMAP.md) for further context.

## Public website

[tackbar.eu](https://tackbar.eu) is the public TackBar website. The application
and its source code are developed in [this GitHub repository](https://github.com/maxsail-project/tackbar),
separately from the marketing website in [tackbar-web](https://github.com/maxsail-project/tackbar-web).

---

## Open source

TackBar source code is released under the [Mozilla Public License 2.0 (MPL-2.0)](LICENSE).

Open-source code does not make participant information, emails, GPS tracks or
private pilot/runtime data open data.

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

## Flujo actual del piloto

`Navegar → compartir actividad Vakaros → ingesta por email → Sailor → Activity → Session → capability URL → Session Viewer compartido → debriefing colaborativo`

El piloto actual admite exportaciones **Vakaros CSV y CSV.GZ** mediante Gmail.
Admin inicia la revisión del buzón, gestiona el consentimiento y comparte los
enlaces de Session. El email remitente normalizado resuelve el Sailor; cada
track recibido se convierte en una Activity con contexto Boat opcional y se
asocia automáticamente a una Session.

El consentimiento controla la visibilidad compartida, no la ingesta técnica ni
el Session matching. Sólo las Activities de Sailors actualmente `ACTIVE`
aparecen en Sessions compartidas. El acceso utiliza una capability URL de
Session válida, sin un sistema general de login de Sailor.

GPX, VKX y FIT son formatos previstos, no soporte actual. La ingesta OVHcloud
forma parte de la dirección v0.6 y aún no está operativa en esta baseline.

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

El soporte previsto de formatos se describe en la sección de roadmap más abajo.

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

El piloto actual conecta el Viewer con Sessions, Activities y tracks canónicos realmente
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

**Piloto controlado con navegaciones reales, con v0.6.0 como incremento actual de consolidación del producto.**

**v0.5.0 — Real Sailing Pilot** está entregado y validado de extremo a extremo
con mensajes Gmail reales, persistencia runtime, consentimiento explícito y
acceso compartido a Sessions mediante capability URL. **v0.5.1 — Pilot Fix &
Usability** está entregado y aporta un contexto más claro de navegación y
participación en Admin.

La baseline entregada incluye Sailor / contexto Boat opcional, Session matching
automático, comparación de una/dos Activities, Analysis Window GPS/UTC
compartida, replay sincronizado y análisis SOG/COG/HEEL/TRIM.

El debriefing es colaborativo porque los regatistas inspeccionan y comentan la
Session juntos alrededor de un móvil o tablet; no requiere chat ni mensajería
integrados.

Consulta el [CHANGELOG](CHANGELOG.md) para los cambios entregados y las
[condiciones de participación y consentimiento](docs/pilot-participation-consent.md).

Actualmente el proyecto no está afiliado ni respaldado por Garmin, Vakaros ni ningún otro fabricante de dispositivos.

## Próxima dirección

### v0.6.0 — Personal TackBar & Pilot Operations

Dirección actual de desarrollo; las siguientes funcionalidades están previstas
y aún no forman parte de la baseline entregada del piloto:

- Personal TackBar / My Sessions: historial de solo lectura de Sessions derivado
  de las Activities del Sailor, con consentimiento ACTIVE y capability personal
  válida. Las Sessions disponibles se abren en el Viewer compartido existente;
  las no disponibles permanecen en el historial, pero no se pueden abrir;
- mejoras operativas del piloto y de Admin;
- adquisición mediante Gmail + OVHcloud con ingesta independiente del proveedor;
- consolidación visual de la aplicación usando `tackbar-web` como referencia de marca actual.

La transición de licencia a MPL-2.0 ya está aplicada en el repositorio actual.
Esto no significa que toda la release v0.6.0 esté entregada.

Consulta los [requisitos v0.6](docs/v0.6-personal-tackbar-pilot-operations-requirements.md).

### v0.7.0 — Multi-Format Track Ingestion

Previsto: conservar CSV/CSV.GZ y añadir **GPX → VKX → FIT**, validando cada
formato en ese orden. Todos convergerán en un único track normalizado canónico
de TackBar, con resolución determinista de duplicados lógicos por Sailor tras
la normalización. El contrato de fingerprint queda pendiente de cerrar con
datos representativos de varios formatos.

Consulta los [requisitos v0.7](docs/v0.7-multi-format-track-ingestion-requirements.md)
y el [ROADMAP](ROADMAP.md) para más contexto.

## Web pública

[tackbar.eu](https://tackbar.eu) es la web pública de TackBar. La aplicación y
su código fuente se desarrollan en [este repositorio GitHub](https://github.com/maxsail-project/tackbar),
por separado de la web de presentación en [tackbar-web](https://github.com/maxsail-project/tackbar-web).

---

## Open source

El código fuente de TackBar se publica bajo la [Mozilla Public License 2.0 (MPL-2.0)](LICENSE).

El código abierto no convierte la información de participantes, emails, tracks
GPS ni datos privados del piloto/runtime en datos abiertos.

---

# About the author / Sobre el autor

Hi! I'm **Maximiliano Mannise**, a software engineer working in the industry since 1998, a data and analytics enthusiast, and a passionate sailor.

I've been sailing for more than 20 years: first for fun, later in cruising regattas, and since 2020 in the **Snipe dinghy class**.

My professional background naturally leads me to approach sailing from an analytical perspective: tracks, speed, headings, metrics and comparisons.

**MaxSail Analytics** started as an experimental tool to explore sailing GPS data and understand what happened on the water.

**TackBar** takes that idea one step further.

The goal is not only to analyze an individual track, but to make the post-sailing debriefing easier and more collaborative: collect tracks from several sailors, automatically identify which activities belong to the same session, compare them and discuss what happened.

TackBar is an open-source project and is currently running a controlled real-sailing pilot.

Contributions, ideas, testing and feedback from sailors, coaches and developers are very welcome.

**See you on the water — and afterwards at TackBar!**

---

¡Hola! Soy **Maximiliano Mannise**, ingeniero en informática, trabajando en el sector desde 1998, apasionado por los datos, los indicadores y las métricas, y también por la vela.

Navego desde hace más de 20 años: primero por diversión, después en regatas de crucero y, desde 2020, en **vela ligera clase Snipe**.

Por deformación profesional, suelo llevar también la navegación al terreno analítico: tracks, velocidad, rumbos, métricas y comparaciones.

**MaxSail Analytics** nació como una herramienta experimental para explorar datos GPS de navegación y comprender mejor qué había ocurrido en el agua.

**TackBar** lleva esa idea un paso más allá.

El objetivo ya no es únicamente analizar un track individual, sino facilitar un debriefing posterior a la navegación más sencillo y colaborativo: recoger tracks de varios regatistas, identificar automáticamente qué actividades pertenecen a la misma sesión, compararlas y discutir qué ocurrió.

TackBar es un proyecto open-source y actualmente está en fase de piloto controlado con navegaciones reales.

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

TackBar source code is released under the **Mozilla Public License 2.0 (MPL-2.0)**.

El código fuente de TackBar se publica bajo la **Mozilla Public License 2.0 (MPL-2.0)**.

---

## Contributions / Contribuciones

Contributions, suggestions and forks are welcome.

If you'd like to report a bug, suggest an enhancement or contribute to TackBar, please open an **issue** or **pull request** in this repository.

Las mejoras, sugerencias y forks son bienvenidos.

Si quieres reportar un error, proponer una mejora o colaborar con TackBar, abre un **issue** o un **pull request** en este repositorio.
