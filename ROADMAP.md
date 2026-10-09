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
  maneuver-oriented analysis and navigation to useful moments in shared replay.

See [CHANGELOG.md](CHANGELOG.md) and
[GitHub Releases](https://github.com/maxsail-project/tackbar/releases) for
delivered release detail.

## Current product direction

Continue validating and deepening the collaborative post-sailing debrief
workflow with real sailors, selecting increments from the issue backlog based
on observed product and operational needs. This direction does not commit a
release, version or next feature.

## Future directions

Broad, non-committed themes include:

- richer collaborative debrief analytics;
- additional Activity sources and formats;
- pilot and production automation and robustness;
- saved and personal debrief concepts.

Open GitHub Issues are the canonical pending-work inventory. The GitHub Project
provides physical backlog ordering and presentation. These future directions do
not assign versions, ordering or release commitments.

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
  orientado a maniobras y navegación a momentos útiles del replay compartido.

Consulta [CHANGELOG.md](CHANGELOG.md) y
[GitHub Releases](https://github.com/maxsail-project/tackbar/releases) para el
detalle de las releases entregadas.

## Dirección actual del producto

Continuar validando y profundizando con regatistas reales el flujo de debriefing
colaborativo posterior a la navegación, seleccionando incrementos del backlog de
Issues según las necesidades observadas de producto y operación. Esta dirección
no compromete una release, versión ni siguiente funcionalidad.

## Direcciones futuras

Los temas amplios y no comprometidos incluyen:

- analítica más rica para el debriefing colaborativo;
- fuentes y formatos adicionales de Activities;
- automatización y robustez del piloto y producción;
- conceptos de debriefing guardado y personal.

Los Issues abiertos de GitHub son el inventario canónico del trabajo pendiente.
El GitHub Project proporciona su orden físico y presentación. Estas direcciones
futuras no asignan versiones, orden ni compromisos de release.
