# TackBar Roadmap

This is TackBar's canonical high-level roadmap. It describes product evolution
and direction, not detailed release history, committed requirements or backlog
ordering.

**Links:** [Latest release](https://github.com/maxsail-project/tackbar/releases/latest) · [CHANGELOG](CHANGELOG.md) · [Open Issues](https://github.com/maxsail-project/tackbar/issues) · [README](README.md) · [Español](#versión-en-español)

<!--
For the Release Preparer: this roadmap is deliberately generic. "Delivered
evolution" lists release families only; do not add per-release increments,
issue numbers or feature names, and do not turn "Future directions" into a
commitment. Release detail belongs in CHANGELOG.md and GitHub Releases.
-->

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
  distribution comparison, per-Activity analysis, and wider input and
  operational support.

See [CHANGELOG.md](CHANGELOG.md) and
[GitHub Releases](https://github.com/maxsail-project/tackbar/releases) for
delivered release detail.

## Current product direction

Build on TackBar's validated post-sailing workflow and delivered collaborative debrief capabilities. Track ingestion, consent-aware Session sharing, personal context, synchronized replay, comparative analytics and contextual information provide a substantial foundation for real sailing debriefs.

The next product focus is to make this evidence easier to explore, interpret and discuss together. TackBar should help sailors identify meaningful situations, compare observations and ask better questions, without automatically judging tactical decisions or presenting unsupported inferences as facts.

Continue evolving the mobile-first experience, which also works well on tablets, through small, focused increments validated with real sailors. Prioritize clarity, traceability, reliable operations and reuse of existing capabilities over unnecessary complexity. Specific features and releases remain subject to explicit product decisions.

## Future directions

Broad, non-committed areas for exploration include:

- **Collaborative debrief:** easier exploration, interpretation and discussion of Session evidence by sailors together.
- **Sailing context:** additional environmental and course context, only where supported by reliable evidence.
- **Activity sources and formats:** broader compatibility with sailing instruments and navigation platforms, when technically and operationally viable.
- **Debrief continuity:** ways to extend the usefulness of a Session beyond the initial debrief.
- **Operational maturity:** incremental improvements to ingestion, diagnostics, security, reliability and production operations, preserving the simplicity of the pilot workflow.

These directions are opportunities for independent, evidence-driven increments, not a fixed implementation sequence or a commitment to additional features.

Completed functionality is documented in the authoritative `docs/current/` specifications and recorded in the changelog. Open GitHub Issues remain the canonical pending-work inventory, while the GitHub Project provides backlog organization and presentation. Neither this roadmap nor backlog placement assigns release scope, priority or implementation authorization.

---

# Versión en español

Este es el roadmap canónico de alto nivel de TackBar. Describe la evolución y
dirección del producto, no el historial detallado de releases, los requisitos
comprometidos ni el orden del backlog.

**Enlaces:** [Última release](https://github.com/maxsail-project/tackbar/releases/latest) · [CHANGELOG](CHANGELOG.md) · [Issues abiertos](https://github.com/maxsail-project/tackbar/issues) · [README](README.md) · [English](#tackbar-roadmap)

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
  distribuciones, análisis por Activity y mayor soporte de entradas y de
  operación.

Consulta [CHANGELOG.md](CHANGELOG.md) y
[GitHub Releases](https://github.com/maxsail-project/tackbar/releases) para el
detalle de las releases entregadas.

## Dirección actual del producto

Consolidar el flujo de trabajo validado de TackBar y las capacidades de debriefing colaborativo ya entregadas. La ingesta de tracks, las Sessions compartidas con control de consentimiento, el contexto personal, el replay sincronizado, la analítica comparativa y la información contextual constituyen una base funcional sólida para analizar navegaciones reales.

La siguiente prioridad de producto es facilitar la exploración, interpretación y discusión conjunta de esas evidencias. TackBar debe ayudar a los regatistas a identificar situaciones relevantes, comparar observaciones y plantear mejores preguntas, sin evaluar automáticamente decisiones tácticas ni presentar inferencias insuficientemente respaldadas como hechos.

Continuar evolucionando la experiencia *mobile-first*, que también funciona bien en tablet, mediante incrementos pequeños y focalizados, validados con regatistas reales. Priorizar claridad, trazabilidad, fiabilidad operativa y reutilización de las capacidades existentes frente a complejidad innecesaria. Las funcionalidades y releases concretas requieren decisiones explícitas de producto.

## Direcciones futuras

Las principales áreas de exploración, todavía no comprometidas, incluyen:

- **Debriefing colaborativo:** exploración, interpretación y discusión conjunta de las evidencias de una Session por parte de los regatistas.
- **Contexto de navegación:** contexto ambiental y de recorrido adicional, únicamente cuando existan evidencias fiables.
- **Fuentes y formatos de Activities:** ampliación de la compatibilidad con instrumentos de navegación y plataformas, cuando sea viable técnica y operativamente.
- **Continuidad del debriefing:** formas de ampliar la utilidad de una Session más allá del debriefing inicial.
- **Madurez operativa:** mejoras incrementales en ingesta, diagnóstico, seguridad, fiabilidad y operación en producción, preservando la sencillez del flujo validado durante el piloto.

Estas direcciones representan oportunidades de evolución mediante incrementos independientes y respaldados por evidencias. No constituyen una secuencia fija de implementación ni un compromiso de nuevas funcionalidades.

Las capacidades entregadas se documentan en las especificaciones vigentes de `docs/current/` y se registran en el changelog. Los Issues abiertos de GitHub siguen siendo el inventario canónico del trabajo pendiente, mientras que el GitHub Project organiza y presenta el backlog. Ni este roadmap ni la posición de un Issue asignan alcance de release, prioridad o autorización de implementación.
