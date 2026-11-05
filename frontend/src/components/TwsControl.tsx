import { useState, type FormEvent, type MouseEvent, type PointerEvent } from 'react'
import { parseWholeKnotTws, type TwsPresentation, type TwsReference } from '../utils/twsReference'

export default function TwsControl({ reference, presentation, expanded, onExpandedChange, onApply, onReset }: {
  reference: TwsReference
  presentation: TwsPresentation
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onApply: (knots: string) => void
  onReset: () => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)
  const displayed = presentation.speedKnots === null ? '--' : `${presentation.speedKnots} kt`
  const apply = (event: FormEvent) => {
    event.preventDefault()
    const knots = parseWholeKnotTws(draft)
    if (knots === null) {
      setError(true)
      return
    }
    setError(false)
    onApply(knots)
  }

  return <div className={`map-tws${expanded ? ' map-tws--expanded' : ''}`} role="group" aria-label="True wind speed control" onPointerDown={(event: PointerEvent) => event.stopPropagation()} onClick={(event: MouseEvent) => event.stopPropagation()}>
    <button type="button" className="map-tws__chip" aria-label={`TWS ${displayed}. Show wind speed reference details`} aria-expanded={expanded} aria-controls="map-tws-detail" onClick={() => onExpandedChange(!expanded)}>
      <span>TWS</span><strong>{displayed}</strong>
    </button>
    {presentation.manual && <div className="map-tws__manual"><span>Manual · Viewer</span><button type="button" aria-label="Reset TWS to automatic" onClick={onReset}>Reset</button></div>}
    {expanded && <section id="map-tws-detail" className="map-tws__detail" aria-label="TWS reference details">
      <p>{reference.status === 'unavailable' ? 'No automatic TWS reference available.' : `Automatic TWS: ${reference.speedKnots} kt · ${reference.source}`}</p>
      {presentation.gustKnots !== null && <p>Gust: {presentation.gustKnots} kt</p>}
      <p>Displayed TWS: {displayed}{presentation.manual ? ' · Manual · Viewer' : ''}</p>
      <form onSubmit={apply} noValidate>
        <label htmlFor="map-tws-input">Manual TWS (whole knots)</label>
        <div className="map-tws__entry"><input id="map-tws-input" type="number" inputMode="numeric" min="0" step="1" value={draft} aria-invalid={error} aria-describedby={error ? 'map-tws-error' : undefined} onChange={(event) => { setDraft(event.target.value); setError(false) }} /><button type="submit">Apply</button></div>
        {error && <p id="map-tws-error" role="alert">Enter a nonnegative whole number of knots.</p>}
      </form>
      <p>This Viewer reference is temporary and is not saved.</p>
    </section>}
  </div>
}
