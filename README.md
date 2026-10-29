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

`Sail → share track → email ingestion → Sailor → Activity → Session → capability URL → shared Session Viewer → collaborative debrief`

The accepted implementation supports **Vakaros CSV, CSV.GZ, VKX and VKX.GZ,
plus plain GPX** tracks
through the OVH mailbox `share@tackbar.eu`.
TackBar reviews that mailbox automatically on the current single-VPS systemd
schedule; Admin **Review mailbox now** remains the manual fallback. Admin also
manages consent and shares Session links. The normalized sender email resolves
the Sailor; each received track becomes an Activity with optional Boat context
and is automatically matched to a Session.

Consent controls shared visibility, not technical ingestion or Session matching.
Only Activities of currently `ACTIVE` Sailors appear in shared Sessions.
Access uses a valid Session capability URL, without a general Sailor login.

Protected Admin also offers an exceptional operator/testing upload path for
one file up to 16 MiB and an explicitly selected existing `ACTIVE` Sailor.
Accepted uploads process independently of the browser and send no automatic
emails. Email remains the normal Sailor sharing path.

GPX requires one track and one nonempty segment, strictly increasing UTC and
no adjacent gap over 10 seconds. Compressed GPX and extension telemetry mapping
are unsupported. FIT and generalized multi-provider ingestion remain future
work. See [Ingestion and Data](docs/current/ingestion-and-data.md).

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

The current supported Vakaros exports provide data such as:

* timestamp;
* latitude;
* longitude;
* speed over ground;
* course over ground;
* true heading;
* heel;
* trim.

Current format support is described in the pilot workflow above.

TackBar is intended to remain device-independent.

---

## Architecture

The current architecture is intentionally simple:

`Email/provider → ingestion → parsing/normalization → Sailor → Activity + optional Boat → Session matching → persistence → FastAPI read API → Session Viewer`

Current technology and persistence:

* **Frontend:** React + TypeScript Session Viewer
* **Backend:** Python + FastAPI
* **Persistence:** JSON metadata plus filesystem originals and normalized tracks
* **Activity ingestion:** OVH IMAP adapter with provider-independent downstream processing
* **Target experience:** mobile-first web application that also works naturally on tablets

The current pilot connects the Viewer to Sessions, Activities and canonical tracks
actually persisted by the backend. It provides one/two-Activity comparison, a
shared GPS/UTC Analysis Window, fixed map telemetry, synchronized replay, the
refined Summary, native-SVG SOG/COG/HEEL/TRIM signal charts, represented-time
VS distributions, and Individual Analysis with a per-Activity SOG + COG chart
and HEEL × SOG density map. Public sanitized TEST data validates the same
runtime/API path without becoming a frontend fixture fallback. SQLite is not a
prerequisite for this PoC.
Additional visible Activities can provide passive fleet context on the map
while analysis remains limited to two. Session-owned location and optional
historical conditions support Viewer and Personal TackBar recognition; public
headers offer About and release identity from available build metadata.

Maneuver analytics prefers HIGH detection from canonical HDG; otherwise usable
canonical COG/SOG can support LOW. The Viewer identifies P/C maneuver evidence
and distinguishes heading change (ΔHDG) from course change (ΔCOG). Evidence is
not an overall track-quality rating or an accuracy guarantee. Version-6
artifacts regenerate lazily as version 7 through authorized analytics paths.
See [Analytics](docs/current/analytics.md) for availability and limitations.

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

**Controlled real-sailing pilot. Latest published release: v0.7.16 Californian
— Every Turn Tells a Story.**

The delivered baseline includes OVH mailbox ingestion through
`share@tackbar.eu`, track-first onboarding and explicit consent, Personal
TackBar, capability-based shared Session access and neutral maneuver analytics
integrated into the collaborative Viewer. It also includes richer native-SVG
signal and distribution comparison plus per-Activity Individual Analysis.
Accepted increments for v0.7.14 add plain GPX, protected Admin upload and
HIGH/LOW maneuver evidence. v0.7.15 adds safe notices for actionable
track-email failures and directs replies to `hello@tackbar.eu`. The current
delivered Viewer increment adds one chart comparing typical maneuver profiles
for Primary and Comparison across SOG, relative COG and absolute-magnitude
HEEL, with signal-specific Insights. Accepted follow-up Viewer work separates
individual Maneuver Analysis from typical Maneuver Profiles and adds compact
Selected Maneuvers near the map. Publication is established by
immutable tags and GitHub Releases; production deployment is established by
successful execution of the exact-release deployment workflow, as described
in the [production runbook](docs/production-runbook.md).

The delivered v0.5.x baseline includes Sailor / optional Boat context, automatic
Session matching, one/two-Activity comparison, a shared GPS/UTC Analysis
Window, synchronized replay and SOG/COG/HEEL/TRIM analysis.

The debrief is collaborative because sailors inspect and discuss the Session
together around a phone or tablet; it does not require built-in chat or
messaging.

See the [CHANGELOG](CHANGELOG.md) for delivered changes and the
[pilot participation and consent conditions](docs/pilot-participation-consent.md).

The project is not currently affiliated with or endorsed by Garmin, Vakaros or any other device manufacturer.

## Published release and next direction

### v0.7.16 Californian — Every Turn Tells a Story

v0.7.16 adds one typical maneuver-profile chart for Primary and Comparison,
covering SOG, relative COG and absolute-magnitude HEEL with signal-specific
Insights. Analytical comparison remains limited to two Activities.

The accepted scope for **v0.7.14 Californian — GPX & Maneuver Analytics** is
recorded in the [CHANGELOG](CHANGELOG.md). The
[current specification index](docs/current/index.md) owns functional behavior.

Open GitHub Issues are the canonical pending-work inventory, and the GitHub
Project provides its physical ordering without assigning release scope.

See the [v0.7 requirements](docs/v0.7-collaborative-debrief-analytics-requirements.md),
[analytics decisions](docs/v0.7-decisions.md),
[current mailbox operations decisions](docs/mailbox-operations-decisions.md),
[CHANGELOG](CHANGELOG.md) and [ROADMAP](ROADMAP.md).

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

`Navegar → compartir track → ingesta por email → Sailor → Activity → Session → capability URL → Session Viewer compartido → debriefing colaborativo`

La implementación aceptada admite tracks **Vakaros CSV, CSV.GZ, VKX y VKX.GZ,
además de GPX sin comprimir**
mediante el buzón OVH `share@tackbar.eu`.
TackBar revisa ese buzón automáticamente mediante el calendario systemd actual
del VPS; **Review mailbox now** en Admin sigue siendo la alternativa manual.
Admin también gestiona el consentimiento y comparte los enlaces de Session. El
email remitente normalizado resuelve el Sailor; cada track recibido se convierte
en una Activity con contexto Boat opcional y se asocia automáticamente a una
Session.

El consentimiento controla la visibilidad compartida, no la ingesta técnica ni
el Session matching. Sólo las Activities de Sailors actualmente `ACTIVE`
aparecen en Sessions compartidas. El acceso utiliza una capability URL de
Session válida, sin un sistema general de login de Sailor.

Admin protegido también ofrece una carga excepcional para operadores/pruebas:
un archivo de hasta 16 MiB y un Sailor existente `ACTIVE` seleccionado
explícitamente. La carga aceptada se procesa independientemente del navegador
y no envía emails automáticos. El email sigue siendo el canal habitual.

GPX exige un track y un segmento no vacío, UTC estrictamente creciente y
ningún salto entre muestras superior a 10 segundos. GPX comprimido y el mapeo
de telemetría de extensiones no están soportados. FIT y proveedores adicionales
siguen siendo trabajo futuro. Consulta
[Ingestion and Data](docs/current/ingestion-and-data.md).

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

Las exportaciones Vakaros admitidas actualmente proporcionan información como:

* timestamp;
* latitud;
* longitud;
* velocidad sobre el fondo;
* rumbo sobre el fondo;
* heading verdadero;
* escora;
* trimado.

El soporte actual de formatos se describe en el flujo del piloto anterior.

TackBar pretende ser independiente del dispositivo utilizado.

---

## Arquitectura

La arquitectura actual se mantiene deliberadamente sencilla:

`Email/proveedor → ingesta → parsing/normalización → Sailor → Activity + Boat opcional → matching de Session → persistencia → API FastAPI de lectura → Session Viewer`

Tecnología y persistencia actuales:

* **Frontend:** Session Viewer con React + TypeScript
* **Backend:** Python + FastAPI
* **Persistencia:** metadata JSON más originales y tracks normalizados en el sistema de archivos
* **Ingesta de Activity:** adaptador IMAP OVH con procesamiento posterior independiente del proveedor
* **Experiencia objetivo:** aplicación web mobile-first que también funciona de forma natural en tablet

El piloto actual conecta el Viewer con Sessions, Activities y tracks canónicos realmente
persistidos por el backend. Incluye comparación de una/dos Activities, Analysis
Window GPS/UTC compartida, telemetría fija en el mapa, replay sincronizado,
Summary refinado, charts de señal SOG/COG/HEEL/TRIM en SVG nativo,
distribuciones VS por tiempo representado e Individual Analysis con chart SOG +
COG y mapa de densidad HEEL × SOG por Activity. Los datos TEST públicos y
sanitizados validan la misma ruta runtime/API sin actuar como fallback de
fixtures frontend. SQLite no es un requisito previo para esta PoC.
Otras Activities visibles pueden aportar contexto pasivo de flota en el mapa,
mientras el análisis sigue limitado a dos. La ubicación de la Session y sus
condiciones históricas opcionales ayudan a reconocerla en Viewer y Personal
TackBar; las cabeceras públicas ofrecen About y la identidad de release según
los metadatos de build disponibles.

La analítica de maniobras prefiere HIGH con HDG canónico; si no está disponible,
COG/SOG canónicos utilizables pueden permitir LOW. El Viewer identifica la
evidencia P/C y distingue cambio de heading (ΔHDG) de cambio de rumbo sobre el
fondo (ΔCOG). La evidencia no califica la calidad global del track ni garantiza
precisión. Los artefactos v6 se regeneran bajo demanda como v7 mediante las
rutas analíticas autorizadas. Consulta [Analytics](docs/current/analytics.md)
para disponibilidad y limitaciones.

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

**Piloto controlado con navegaciones reales. Última release publicada:
v0.7.16 Californian — Every Turn Tells a Story.**

La baseline entregada incluye ingesta del buzón OVH mediante
`share@tackbar.eu`, onboarding iniciado por track y consentimiento explícito,
Personal TackBar, acceso compartido a Sessions mediante capability y analítica
neutral de maniobras integrada en el Viewer colaborativo. También incluye una
comparación más rica de señales y distribuciones en SVG nativo e Individual
Analysis por Activity. Los incrementos aceptados para v0.7.14 añaden GPX sin
comprimir, carga protegida en Admin y evidencia HIGH/LOW de maniobras. v0.7.15
añade avisos seguros ante fallos accionables de correo con tracks y dirige las
respuestas a `hello@tackbar.eu`. El incremento actual del Viewer añade un único
gráfico comparativo P/C de perfiles típicos de maniobras para SOG, COG relativo
y magnitud absoluta de HEEL, con Insights específicos por señal. El trabajo
posterior aceptado del Viewer separa Maneuver Analysis individual de Maneuver
Profiles típicos y añade Selected Maneuvers junto al mapa. Los tags
inmutables y GitHub Releases establecen la publicación; la ejecución correcta
del workflow para esa release establece el despliegue técnico, según el
[runbook de producción](docs/production-runbook.md).

La baseline v0.5.x entregada incluye Sailor / contexto Boat opcional, Session
matching automático, comparación de una/dos Activities, Analysis Window GPS/UTC
compartida, replay sincronizado y análisis SOG/COG/HEEL/TRIM.

El debriefing es colaborativo porque los regatistas inspeccionan y comentan la
Session juntos alrededor de un móvil o tablet; no requiere chat ni mensajería
integrados.

Consulta el [CHANGELOG](CHANGELOG.md) para los cambios entregados y las
[condiciones de participación y consentimiento](docs/pilot-participation-consent.md).

Actualmente el proyecto no está afiliado ni respaldado por Garmin, Vakaros ni ningún otro fabricante de dispositivos.

## Release publicada y próxima dirección

### v0.7.16 Californian — Every Turn Tells a Story

v0.7.16 añade un gráfico de perfiles típicos de maniobras para Primary y
Comparison, con SOG, COG relativo y magnitud absoluta de HEEL e Insights por
señal. La comparación analítica sigue limitada a dos Activities.

El alcance aceptado de **v0.7.14 Californian — GPX & Maneuver Analytics** queda
recogido en [CHANGELOG](CHANGELOG.md). El
[índice de especificaciones actuales](docs/current/index.md) define el
comportamiento funcional.

Los Issues abiertos de GitHub son el inventario canónico de trabajo pendiente y
GitHub Project aporta su orden físico sin asignar alcance de release.

Consulta los [requisitos v0.7](docs/v0.7-collaborative-debrief-analytics-requirements.md),
las [decisiones de analítica](docs/v0.7-decisions.md), las
[decisiones operativas actuales del buzón](docs/mailbox-operations-decisions.md),
el [CHANGELOG](CHANGELOG.md) y el [ROADMAP](ROADMAP.md).

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
