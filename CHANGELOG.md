# Changelog

All notable changes to TackBar will be documented in this file.

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
