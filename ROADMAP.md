# TackBar Roadmap

TackBar development will evolve incrementally, validating each step with real sailing activities before adding more complexity.

The roadmap is intentionally simple and focused on the core product hypothesis:

**multiple sailors → share tracks → automatic session detection → collaborative debriefing**

---

## PoC 1 — Email track ingestion

Goal: prove that TackBar can automatically receive and process sailing tracks sent by email.

Planned scope:

* Receive sailing tracks as email attachments
* Support Vakaros `CSV.GZ` exports
* Identify the participant using the sender email address
* Extract and validate the attachment
* Parse track data
* Store original file metadata
* Extract device name from the exported filename when available
* Normalize activity data into an internal TackBar activity model

Initial flow:

`Vakaros Connect → Export CSV/GZIP → Email → TackBar`

---

## PoC 2 — Automatic session detection

Goal: automatically identify tracks that belong to the same sailing session.

Planned scope:

* Detect activity start and end time
* Determine geographic location from GPS data
* Compare temporal overlap between activities
* Compare geographic proximity between tracks
* Automatically create a new session when necessary
* Automatically associate compatible activities with an existing session
* Allow manual correction when automatic matching is uncertain

Initial matching signals:

* date
* start/end time
* temporal overlap
* GPS proximity
* track location

---

## PoC 3 — Multi-track viewer

Goal: visualize several sailors from the same session together.

Planned scope:

* Display multiple tracks on the same map
* Differentiate participants and boats
* Synchronize activities by time
* Navigate through the session timeline
* Display basic activity information
* Show basic comparative metrics
* Provide a tablet-friendly interface

---

## PoC 4 — Collaborative sailing debrief

Goal: validate TackBar as a real post-sailing debriefing tool.

Planned scope:

* Session overview
* Participant list
* User-to-boat association
* Boat metadata
* Sailing class
* Sail number
* Shared session access
* Selection of relevant moments
* Basic track comparison
* Post-sailing discussion workflow

---

## MVP — Real sailing pilot

Goal: validate TackBar with real sailors, coaches and sailing sessions.

Expected scope:

* Multiple users
* Multiple boats
* Automatic activity ingestion
* Reliable session matching
* Shared debriefing sessions
* Tablet-first user experience
* Basic user and boat management
* Improved sailing analytics
* Feedback from real sailors and coaches

---

## Future integrations

Potential activity sources and integrations include:

* Garmin Connect Activity API
* Direct Vakaros integration
* VKX support
* FIT support
* GPX support
* Intervals.icu
* Strava
* Other sailing devices and activity platforms

TackBar is intended to remain device-independent.

---

## Future sailing analytics

Potential future analysis capabilities include:

* Speed comparison
* Heading comparison
* Course over ground analysis
* True heading analysis
* Heel and trim analysis
* Wind-oriented visualization
* Start analysis
* Sailing leg detection
* Tactical event identification
* Distance gained/lost between boats
* Automatic detection of relevant debriefing moments

---

## Releases

Development milestones will be published as GitHub Releases.

Initial release sequence:

* `v0.1.0` — Email Track Ingestion PoC
* `v0.2.0` — Automatic Session Detection
* `v0.3.0` — Multi-Track Viewer
* `v0.4.0` — Collaborative Sailing Debrief PoC
* `v0.5.0` — Real Sailing Pilot

Release scope may evolve as the project is validated.

---

# Versión en español

El desarrollo de TackBar evolucionará de forma incremental, validando cada paso con actividades reales de navegación antes de incorporar más complejidad.

El roadmap se mantiene deliberadamente simple y centrado en la hipótesis principal del producto:

**varios regatistas → comparten tracks → detección automática de sesión → debriefing colaborativo**

---

## PoC 1 — Ingesta de tracks por email

Objetivo: demostrar que TackBar puede recibir y procesar automáticamente tracks de navegación enviados por correo electrónico.

Alcance previsto:

* Recibir tracks de navegación como adjuntos de correo
* Soportar exportaciones Vakaros `CSV.GZ`
* Identificar al participante mediante la dirección de correo remitente
* Extraer y validar el adjunto
* Parsear los datos del track
* Conservar metadata del archivo original
* Obtener el nombre del dispositivo desde el nombre de archivo cuando esté disponible
* Normalizar los datos en el modelo interno de actividad de TackBar

Flujo inicial:

`Vakaros Connect → Exportar CSV/GZIP → Email → TackBar`

---

## PoC 2 — Detección automática de sesiones

Objetivo: identificar automáticamente tracks que pertenecen a una misma sesión de navegación.

Alcance previsto:

* Detectar hora de inicio y finalización de la actividad
* Determinar la localización geográfica mediante los datos GPS
* Comparar el solapamiento temporal entre actividades
* Comparar la proximidad geográfica entre tracks
* Crear automáticamente una nueva sesión cuando sea necesario
* Asociar automáticamente actividades compatibles con una sesión existente
* Permitir correcciones manuales cuando el matching automático sea incierto

Señales iniciales utilizadas para el matching:

* fecha
* hora de inicio/finalización
* solapamiento temporal
* proximidad GPS
* localización del track

---

## PoC 3 — Visor multi-track

Objetivo: visualizar conjuntamente a varios regatistas pertenecientes a una misma sesión.

Alcance previsto:

* Mostrar varios tracks en un mismo mapa
* Diferenciar participantes y barcos
* Sincronizar las actividades temporalmente
* Navegar por la línea temporal de la sesión
* Mostrar información básica de cada actividad
* Mostrar métricas comparativas básicas
* Proporcionar una interfaz adaptada a tablet

---

## PoC 4 — Debriefing colaborativo de vela

Objetivo: validar TackBar como herramienta real de debriefing después de navegar.

Alcance previsto:

* Vista general de sesión
* Lista de participantes
* Asociación usuario-barco
* Metadata del barco
* Clase de vela
* Número de vela
* Acceso compartido a la sesión
* Selección de momentos relevantes
* Comparación básica de tracks
* Flujo de discusión posterior a la navegación

---

## MVP — Piloto con regatistas reales

Objetivo: validar TackBar con regatistas, entrenadores y sesiones de navegación reales.

Alcance esperado:

* Varios usuarios
* Varios barcos
* Ingesta automática de actividades
* Detección fiable de sesiones
* Sesiones de debriefing compartidas
* Experiencia tablet-first
* Gestión básica de usuarios y barcos
* Mejora de la analítica de navegación
* Feedback de regatistas y entrenadores reales

---

## Integraciones futuras

Posibles fuentes de actividad e integraciones:

* Garmin Connect Activity API
* Integración directa con Vakaros
* Soporte VKX
* Soporte FIT
* Soporte GPX
* Intervals.icu
* Strava
* Otros dispositivos y plataformas de actividad

TackBar pretende mantenerse independiente del dispositivo utilizado.

---

## Analítica de vela futura

Posibles capacidades futuras:

* Comparación de velocidad
* Comparación de rumbo
* Análisis de course over ground
* Análisis de heading verdadero
* Análisis de escora y trimado
* Visualización orientada al viento
* Análisis de salidas
* Detección de tramos de navegación
* Identificación de eventos tácticos
* Distancia ganada/perdida entre barcos
* Detección automática de momentos relevantes para el debriefing

---

## Releases

Los principales hitos de desarrollo se publicarán mediante GitHub Releases.

Secuencia inicial:

* `v0.1.0` — PoC de ingesta de tracks por email
* `v0.2.0` — Detección automática de sesiones
* `v0.3.0` — Visor multi-track
* `v0.4.0` — PoC de debriefing colaborativo
* `v0.5.0` — Piloto con regatistas reales

El alcance de cada release podrá evolucionar a medida que se valide el proyecto.
