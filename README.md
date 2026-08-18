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

The first TackBar proof of concept focuses on a deliberately simple workflow:

1. A sailor records a sailing activity.
2. The activity track is exported from the device platform.
3. The sailor sends the track as an email attachment.
4. TackBar receives and processes the attachment.
5. The sender email identifies the sailor.
6. Date, time and GPS proximity are used to determine which sailing session the activity belongs to.
7. Tracks from multiple sailors are grouped automatically.
8. The resulting session can be opened and reviewed collaboratively.

Initial testing is being performed using **Vakaros activity exports**.

For the first PoC, the preferred format is:

`CSV + GZIP`

Example:

`Vakaros Connect → Export CSV/GZIP → Email → TackBar → Session`

---

## Activity identification

For the initial PoC, the sender email address is used to identify the participant.

The domain model is expected to evolve towards:

`Email → User → Boat → Class / Category / Sail Number`

This keeps identity, boat information and activity data separated.

A user may eventually be associated with multiple boats, while each individual activity keeps a reference to the boat used during that particular session.

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

The initial architecture is intentionally simple:

`Email → Activity Ingestion → Track Parser → Session Matcher → TackBar`

Planned technology stack:

* **Frontend:** React + TypeScript
* **Backend:** Python + FastAPI
* **Analytics:** independent Python library
* **Initial persistence:** SQLite
* **Activity ingestion:** inbound email webhook or Gmail API
* **Target experience:** tablet-first web application / PWA

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

The immediate goal is to validate the complete workflow:

`multiple sailors → email tracks → automatic session detection → collaborative track comparison`

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

La primera prueba de concepto de TackBar se centra deliberadamente en un flujo muy sencillo:

1. Un regatista registra una actividad de navegación.
2. El track se exporta desde la plataforma del dispositivo.
3. El regatista envía el track como archivo adjunto por correo electrónico.
4. TackBar recibe y procesa el adjunto.
5. La dirección de correo remitente identifica al regatista.
6. La fecha, la hora y la proximidad GPS permiten determinar a qué sesión pertenece la actividad.
7. Los tracks de varios regatistas se agrupan automáticamente.
8. La sesión resultante puede abrirse y analizarse de forma colaborativa.

Las primeras pruebas se están realizando utilizando **exportaciones de actividades Vakaros**.

Para la primera PoC, el formato preferido es:

`CSV + GZIP`

Ejemplo:

`Vakaros Connect → Exportar CSV/GZIP → Email → TackBar → Sesión`

---

## Identificación de la actividad

Para la PoC inicial, la dirección de correo del remitente se utiliza para identificar al participante.

El modelo de dominio evolucionará hacia:

`Email → Usuario → Barco → Clase / Categoría / Número de vela`

Esto permite mantener separadas la identidad del usuario, la información del barco y los datos de cada actividad.

Un usuario podrá estar asociado en el futuro a varios barcos, mientras que cada actividad individual conservará la referencia al barco utilizado en esa navegación concreta.

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

La arquitectura inicial se mantiene deliberadamente sencilla:

`Email → Ingesta de actividad → Parser de track → Session Matcher → TackBar`

Stack tecnológico previsto:

* **Frontend:** React + TypeScript
* **Backend:** Python + FastAPI
* **Analytics:** librería Python independiente
* **Persistencia inicial:** SQLite
* **Ingesta de actividad:** webhook de correo entrante o Gmail API
* **Experiencia objetivo:** aplicación web/PWA tablet-first

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

El objetivo inmediato es validar el flujo completo:

`varios regatistas → envío de tracks por email → detección automática de sesión → comparación colaborativa`

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
