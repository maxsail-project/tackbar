import type { MouseEvent, PointerEvent } from 'react'
import type { TwdReference } from '../utils/twdReference'
import { formatTwdDegrees, type TwdPresentation } from '../utils/twdPresentation'
import { formatHistoricalConditionsTime } from '../utils/historicalConditions'

function stopMapInteraction(event: PointerEvent) {
  event.stopPropagation()
}

export default function TwdControl({ reference, presentation, expanded, onExpandedChange, onStep, onAutomatic }: {
  reference: TwdReference
  presentation: TwdPresentation
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onStep: (step: -5 | 5) => void
  onAutomatic: () => void
}) {
  const displayed = presentation.displayDegrees === null ? '—' : formatTwdDegrees(presentation.displayDegrees)

  return <div className={`map-navigation-group${expanded ? ' map-navigation-group--expanded' : ''}`} role="group" aria-label="True wind direction control" onPointerDown={stopMapInteraction} onClick={(event: MouseEvent) => event.stopPropagation()}>
    <div className="map-navigation-group__direction">
      {expanded && <button type="button" className="map-twd__header-dismiss" aria-label="Close TWD reference details" onClick={() => onExpandedChange(false)} />}
      <button type="button" aria-label="Adjust TWD 5 degrees counterclockwise" onClick={() => onStep(-5)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 2 7M4 4v6h6" /></svg>
      </button>
      <button type="button" className="map-bearing__value" aria-label={`TWD ${displayed}. Show wind reference details`} aria-expanded={expanded} aria-controls="map-twd-detail" onClick={() => onExpandedChange(!expanded)}>
        <span>TWD</span><strong>{displayed}</strong>
      </button>
      <button type="button" aria-label="Adjust TWD 5 degrees clockwise" onClick={() => onStep(5)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10a8 8 0 1 0-2 7m2-13v6h-6" /></svg>
      </button>
    </div>
    {presentation.manual && <div className="map-twd__manual">
      <span>Manual · Viewer</span>
      <button type="button" aria-label="Reset TWD to automatic" onClick={onAutomatic}>Reset</button>
    </div>}
    {expanded && <section id="map-twd-detail" className="map-twd__detail" aria-label="TWD reference details">
      {reference.status === 'available' ? <dl>
        <div><dt>Source</dt><dd>Modelled weather</dd></div>
        <div><dt>Method</dt><dd>Nearest valid wind sample to window midpoint</dd></div>
        <div><dt>Sample time</dt><dd>{formatHistoricalConditionsTime(reference.sourceTimeUtc)}</dd></div>
        <div><dt>Provider</dt><dd>{reference.provenance.provider ?? 'Unavailable'}</dd></div>
        <div><dt>Original TWD</dt><dd>{reference.directionDegrees}°</dd></div>
        <div><dt>Automatic rounded TWD</dt><dd>{formatTwdDegrees(presentation.automaticDegrees!)}</dd></div>
      </dl> : <p>No automatic TWD reference available.</p>}
      {presentation.manual
        ? <p>Viewer correction: {displayed}{reference.status === 'unavailable' ? ' · Manual only' : ''}</p>
        : <p>Displayed TWD: {displayed}</p>}
    </section>}
  </div>
}
