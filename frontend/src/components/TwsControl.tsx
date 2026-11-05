import type { MouseEvent, PointerEvent } from 'react'
import type { TwsPresentation, TwsReference } from '../utils/twsReference'
import { formatHistoricalConditionsTime } from '../utils/historicalConditions'

export default function TwsControl({ reference, presentation, expanded, onExpandedChange, onStep, onReset }: {
  reference: TwsReference
  presentation: TwsPresentation
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onStep: (step: -1 | 1) => void
  onReset: () => void
}) {
  const displayed = presentation.speedKnots === null ? '--' : `${presentation.speedKnots} kt`

  return <div className={`map-tws${expanded ? ' map-tws--expanded' : ''}`} role="group" aria-label="True wind speed control" onPointerDown={(event: PointerEvent) => event.stopPropagation()} onClick={(event: MouseEvent) => event.stopPropagation()}>
    <button type="button" className="map-tws__chip" aria-label={`TWS ${displayed}. Show wind speed reference details`} aria-expanded={expanded} aria-controls="map-tws-detail" onClick={() => onExpandedChange(!expanded)}>
      <span>TWS</span><strong>{displayed}</strong>
    </button>
    {expanded && <section id="map-tws-detail" className="map-tws__detail" aria-label="TWS reference details">
      <div className="map-tws__adjustment" role="group" aria-label="Adjust TWS by 1 knot">
        <button type="button" aria-label="Decrease TWS by 1 knot" onClick={() => onStep(-1)}>−</button>
        <output aria-live="polite">TWS <strong>{displayed}</strong></output>
        <button type="button" aria-label="Increase TWS by 1 knot" onClick={() => onStep(1)}>+</button>
      </div>
      {reference.status === 'available' && <dl className="map-tws__source">
        <div><dt>Source</dt><dd>Modelled Weather</dd></div>
        <div><dt>Sample time</dt><dd>{formatHistoricalConditionsTime(reference.sourceTimeUtc)}</dd></div>
        <div><dt>Provider</dt><dd>{reference.provenance.provider ?? 'Unavailable'}</dd></div>
        <div><dt>Original TWS</dt><dd>{reference.speedKnots} kt</dd></div>
      </dl>}
      {presentation.manual && <div className="map-tws__footer"><span>Manual · Viewer</span><button type="button" aria-label="Reset TWS to automatic" onClick={onReset}>Reset</button></div>}
    </section>}
  </div>
}
