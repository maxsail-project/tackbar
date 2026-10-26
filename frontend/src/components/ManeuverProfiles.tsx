import { useId, useState } from 'react'
import type { PreparedSogPopulation } from '../utils/typicalSogProfile'
import ManeuverSogComparison from './ManeuverSogComparison'

export default function ManeuverProfiles({ primary, comparison }: {
  primary: PreparedSogPopulation | null
  comparison?: PreparedSogPopulation | null
}) {
  const [expanded, setExpanded] = useState(true)
  const contentId = useId()
  const titleId = useId()

  return <section className="content-section maneuver-profiles-section" aria-labelledby={titleId}>
    <div className="maneuver-section__header">
      <p className="section-kicker" id={titleId}>Maneuver Profiles</p>
      <button
        type="button"
        className="maneuver-section__collapse"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
    <div id={contentId} hidden={!expanded}>
      <ManeuverSogComparison primary={primary} comparison={comparison} />
    </div>
  </section>
}
