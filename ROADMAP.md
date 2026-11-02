# TackBar Roadmap

This is TackBar's canonical high-level roadmap. It describes product evolution
and direction, not detailed release history, committed requirements or backlog
ordering.

## Product direction

```text
multiple sailors
→ share tracks
→ automatic Activity / Session processing
→ collaborative mobile debrief
→ progressively richer sailing analysis
```

TackBar evolves incrementally by validating the complete post-sailing workflow
with real sailors before adding complexity.

## Delivered evolution

- **v0.1.x — Email Track Ingestion PoC:** established email track acquisition,
  normalization and provider-independent Activity processing.
- **v0.2.x — Automatic Session Detection:** grouped compatible Activities into
  Sessions using sailing-time and location context.
- **v0.3.x — Multi-Track Viewer:** introduced mobile viewing, one/two-Activity
  comparison, a shared Analysis Window, replay and basic metrics.
- **v0.4.x — Collaborative Sailing Debrief PoC:** connected persisted Sailor,
  Boat, Activity and Session data to the collaborative Session Viewer.
- **v0.5.x — Real Sailing Pilot:** added controlled consent, pilot operations,
  shared visibility and capability-based Session access.
- **v0.6.x Mahon — Personal TackBar & Pilot Operations:** established personal
  Session access and matured onboarding, mailbox, Admin and Viewer operation.
- **v0.7.x Californian — Collaborative Debrief Analytics:** added
  maneuver-oriented collaborative debrief analytics, richer signal and
  distribution comparison, and per-Activity Individual Analysis. Accepted
  increments also add plain GPX ingestion, protected Admin track upload and
  HIGH/LOW maneuver detection with explicit evidence in the Viewer, plus safe
  feedback for actionable track-email failures and a clear human support contact.
  The accepted Viewer increments also add a unified typical maneuver profile
  chart for Primary and Comparison across SOG, relative COG and
  absolute-magnitude HEEL, with signal-specific Insights.

See [CHANGELOG.md](CHANGELOG.md) and
[GitHub Releases](https://github.com/maxsail-project/tackbar/releases) for
delivered release detail.

## Current product direction

Build on TackBar's validated post-sailing workflow and delivered collaborative debrief capabilities. Track ingestion, consent-aware Session sharing, personal Sailor/Boat/Activity context, synchronized replay, comparative analytics, historical weather context, and recorded race-start evidence now provide a substantial foundation for real sailing debriefs.

The next product focus is to make this evidence easier to explore, interpret and discuss together. TackBar should help sailors identify meaningful situations, compare observations and ask better questions, without automatically judging tactical decisions or presenting unsupported inferences as facts.

Continue evolving the tablet-first experience through small, focused increments validated with real sailors. Prioritize clarity, traceability, reliable operations and reuse of existing capabilities over unnecessary complexity. Specific features and releases remain subject to explicit product decisions.

## Future directions

Broad, non-committed areas for exploration include:

- **Evidence-led collaborative debrief:** contextual Session Moments, meaningful comparisons, neutral sailing questions and guided exploration of tracks, replay and analytics, building on the [Debrief Experiences family (#149)](https://github.com/maxsail-project/tackbar/issues/149).
- **Wind-aware sailing context:** wind-relative map orientation, transparent source provenance, manual wind references and progressively validated estimates or measurements, following the [Wind Reference family (#163)](https://github.com/maxsail-project/tackbar/issues/163) and related sensor feasibility research.
- **Race and course context:** further use of recorded start-line and device observations, exploration of race-course references and wind-dependent analysis only where supported by reliable evidence.
- **Additional Activity sources and formats:** broader compatibility with sailing instruments and navigation platforms, including Garmin-related integrations and other formats when technically and operationally viable.
- **Debrief continuity and collaboration:** saved analysis windows, selected moments, focused sharing and personal follow-up experiences that extend the usefulness of a Session beyond the initial debrief.
- **Operational maturity:** incremental improvements to ingestion automation, diagnostics, security, reliability and production operations, preserving the simplicity of the pilot workflow.

These directions are opportunities for independent, evidence-driven increments, not a fixed implementation sequence or a commitment to additional features.

Completed functionality is documented in the authoritative `docs/current/` specifications and recorded in the changelog. Open GitHub Issues remain the canonical pending-work inventory, while the GitHub Project provides backlog organization and presentation. Neither this roadmap nor backlog placement assigns release scope, priority or implementation authorization.

---

# Versión en español

Este es el roadmap canónico de alto nivel de TackBar. Describe la evolución y
dirección del producto, no el historial detallado de releases, los requisitos
comprometidos ni el orden del backlog.

## Dirección del producto

```text
varios regatistas
→ comparten tracks
→ procesamiento automático de Activities / Sessions
→ debriefing colaborativo móvil
→ análisis de navegación progresivamente más rico
```

TackBar evoluciona incrementalmente, validando con regatistas reales el flujo
completo posterior a la navegación antes de añadir complejidad.

## Evolución entregada

- **v0.1.x — Email Track Ingestion PoC:** estableció la adquisición de tracks
  por email, su normalización y el procesamiento de Activities independiente del
  proveedor.
- **v0.2.x — Automatic Session Detection:** agrupó Activities compatibles en
  Sessions según el contexto temporal y geográfico de navegación.
- **v0.3.x — Multi-Track Viewer:** introdujo visualización móvil, comparación de
  una/dos Activities, Analysis Window compartida, replay y métricas básicas.
- **v0.4.x — Collaborative Sailing Debrief PoC:** conectó datos persistidos de
  Sailor, Boat, Activity y Session con el Session Viewer colaborativo.
- **v0.5.x — Real Sailing Pilot:** añadió consentimiento controlado, operaciones
  del piloto, visibilidad compartida y acceso a Sessions mediante capabilities.
- **v0.6.x Mahon — Personal TackBar & Pilot Operations:** estableció acceso
  personal a Sessions y maduró onboarding, correo, Admin y operación del Viewer.
- **v0.7.x Californian — Collaborative Debrief Analytics:** añadió análisis
  colaborativo orientado a maniobras, comparación más rica de señales y
  distribuciones, e Individual Analysis por Activity. Los incrementos aceptados
  también añaden ingesta GPX sin comprimir, carga protegida de tracks en Admin y
  detección HIGH/LOW de maniobras con evidencia explícita en el Viewer. Además,
  se añaden avisos seguros para fallos accionables de correo con tracks y un
  contacto humano claro. Los incrementos aceptados del Viewer añaden también
  un único gráfico comparativo P/C de perfiles típicos de maniobras para SOG,
  COG relativo y magnitud absoluta de HEEL, con Insights específicos por señal.

Consulta [CHANGELOG.md](CHANGELOG.md) y
[GitHub Releases](https://github.com/maxsail-project/tackbar/releases) para el
detalle de las releases entregadas.

## Dirección actual del producto

Consolidar el flujo de trabajo validado de TackBar y las capacidades de debriefing colaborativo ya entregadas. La ingesta de tracks, las Sessions compartidas con control de consentimiento, el contexto personal de Sailor/Boat/Activity, el replay sincronizado, la analítica comparativa, el contexto meteorológico histórico y las evidencias registradas de las salidas de regata constituyen una base funcional sólida para analizar navegaciones reales.

La siguiente prioridad de producto es facilitar la exploración, interpretación y discusión conjunta de esas evidencias. TackBar debe ayudar a los regatistas a identificar situaciones relevantes, comparar observaciones y plantear mejores preguntas, sin evaluar automáticamente decisiones tácticas ni presentar inferencias insuficientemente respaldadas como hechos.

Continuar evolucionando la experiencia *tablet-first* mediante incrementos pequeños y focalizados, validados con regatistas reales. Priorizar claridad, trazabilidad, fiabilidad operativa y reutilización de las capacidades existentes frente a complejidad innecesaria. Las funcionalidades y releases concretas requieren decisiones explícitas de producto.

## Direcciones futuras

Las principales áreas de exploración, todavía no comprometidas, incluyen:

- **Debriefing colaborativo basado en evidencias:** Contextual Session Moments, comparaciones significativas, preguntas neutrales de navegación y exploración guiada de tracks, replay y analítica, siguiendo la [familia Debrief Experiences (#149)](https://github.com/maxsail-project/tackbar/issues/149).
- **Contexto de navegación respecto al viento:** orientación del mapa, procedencia transparente de la dirección del viento, referencias manuales y estimaciones o mediciones progresivamente validadas, conforme a la [familia Wind Reference (#163)](https://github.com/maxsail-project/tackbar/issues/163) y las investigaciones instrumentales relacionadas.
- **Contexto de regata y recorrido:** aprovechamiento de los registros de salida y observaciones de los dispositivos, exploración de referencias del campo de regatas y análisis dependientes del viento únicamente cuando existan evidencias suficientes.
- **Nuevas fuentes y formatos de Activities:** ampliación de la compatibilidad con instrumentos de navegación y plataformas como Garmin, así como otros formatos cuya viabilidad técnica y operativa quede demostrada.
- **Continuidad y colaboración en el debriefing:** ventanas de análisis guardadas, momentos seleccionados, compartición focalizada y experiencias personales que permitan aprovechar una Session más allá del debriefing inicial.
- **Madurez operativa:** mejoras incrementales en automatización de ingesta, diagnóstico, seguridad, fiabilidad y operación en producción, preservando la sencillez del flujo validado durante el piloto.

Estas direcciones representan oportunidades de evolución mediante incrementos independientes y respaldados por evidencias. No constituyen una secuencia fija de implementación ni un compromiso de nuevas funcionalidades.

Las capacidades entregadas se documentan en las especificaciones vigentes de `docs/current/` y se registran en el changelog. Los Issues abiertos de GitHub siguen siendo el inventario canónico del trabajo pendiente, mientras que el GitHub Project organiza y presenta el backlog. Ni este roadmap ni la posición de un Issue asignan alcance de release, prioridad o autorización de implementación.
