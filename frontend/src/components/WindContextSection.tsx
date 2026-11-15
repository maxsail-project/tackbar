import { useId, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import { formatTwdDegrees } from '../utils/twdPresentation'
import {
  formatTwdSource,
  formatWindClassification,
  formatWindShare,
  type EffectiveTwd,
  type WindContextResult,
} from '../utils/windContext'

type Role = 'primary' | 'comparison'

interface WindContextSectionProps {
  effectiveTwd: EffectiveTwd
  /** Displayed TWD, formatted exactly as in the map TWD control. */
  displayDegrees: number
  primary: WindContextResult
  comparison?: WindContextResult
}

function roleLabel(role: Role) {
  return role === 'primary' ? 'P' : 'C'
}

function formatMeanTwa(value: number | null) {
  return value === null ? '—' : `${Math.round(value)}°`
}

export default function WindContextSection({
  effectiveTwd,
  displayDegrees,
  primary,
  comparison,
}: WindContextSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const rows: { role: Role, result: WindContextResult }[] = [
    { role: 'primary', result: primary },
    ...(comparison ? [{ role: 'comparison' as const, result: comparison }] : []),
  ]
  const tackRows = rows.filter(({ result }) => result.upwindTack !== null)

  return (
    <section className="content-section maneuver-section wind-context-section" aria-labelledby="wind-context-title">
      <div className="maneuver-section__header">
        <p className="section-kicker" id="wind-context-title">Wind Analysis</p>
        <span className="wind-context__reference" aria-label={`Effective TWD ${formatTwdDegrees(displayDegrees)}, ${formatTwdSource(effectiveTwd.source)}`}>
          TWD <strong>{formatTwdDegrees(displayDegrees)}</strong> · {formatTwdSource(effectiveTwd.source)}
        </span>
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
        <table className="wind-context-table" aria-label="Wind sector composition">
          <thead><tr>
            <th scope="col" aria-label="Activity">P/C</th>
            <th scope="col">Upwind</th>
            <th scope="col">Reaching</th>
            <th scope="col">Downwind</th>
            <th scope="col">Window</th>
          </tr></thead>
          <tbody>
            {rows.map(({ role, result }) => (
              <tr key={role} data-wind-role={role}>
                <th scope="row" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</th>
                <td>{formatWindShare(result.sectorShares?.upwind)}</td>
                <td>{formatWindShare(result.sectorShares?.reaching)}</td>
                <td>{formatWindShare(result.sectorShares?.downwind)}</td>
                <td className="wind-context-table__classification">{formatWindClassification(result.classification)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {tackRows.length > 0 && (
          <table className="wind-context-table wind-context-table--tack" aria-label="Upwind tack split">
            <thead><tr>
              <th scope="col" aria-label="Activity">P/C</th>
              <th scope="col">Stbd · TWA</th>
              <th scope="col">Port · TWA</th>
              <th scope="col">Indet.</th>
              <th scope="col">Check</th>
            </tr></thead>
            <tbody>
              {tackRows.map(({ role, result }) => {
                const tack = result.upwindTack!
                return (
                  <tr key={role} data-wind-tack-role={role}>
                    <th scope="row" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</th>
                    <td>{formatWindShare(tack.shares.starboard)} · {formatMeanTwa(tack.meanAbsTwaDegrees.starboard)}</td>
                    <td>{formatWindShare(tack.shares.port)} · {formatMeanTwa(tack.meanAbsTwaDegrees.port)}</td>
                    <td>{formatWindShare(tack.shares.indeterminate)}</td>
                    <td className="wind-context-table__check">{tack.check.labels.join(' ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <p className="wind-context__note">
          Shares of moving time (SOG ≥ {WIND_CONTEXT_CONFIG.movingMinSogKnots} kn) from COG and the effective TWD. Tack split for upwind windows only; HDG/HEEL only check the COG tack.
        </p>
      </div>
    </section>
  )
}
