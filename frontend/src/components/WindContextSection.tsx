import { useId, useRef, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import { formatTwdDegrees } from '../utils/twdPresentation'
import {
  formatTwdSource,
  formatWindClassification,
  formatWindShare,
  resolveTackAxisHint,
  type EffectiveTwd,
  type TackAxis,
  type TackAxisHint,
  type WindContextResult,
} from '../utils/windContext'
import {
  calculateProgressDifference,
  formatProgressDifference,
  formatProgressReason,
  type WindProgress,
} from '../utils/windProgress'

type Role = 'primary' | 'comparison'

interface WindContextSectionProps {
  effectiveTwd: EffectiveTwd
  /** Displayed TWD, formatted exactly as in the map TWD control. */
  displayDegrees: number
  primary: WindContextResult
  comparison?: WindContextResult
  primaryProgress?: WindProgress
  comparisonProgress?: WindProgress
}

function roleLabel(role: Role) {
  return role === 'primary' ? 'P' : 'C'
}

function formatMeanTwa(value: number | null) {
  return value === null ? '—' : `${Math.round(value)}°`
}

function formatSignedDegrees(value: number) {
  const rounded = Math.round(value)
  if (rounded === 0) return '0'
  return rounded < 0 ? `−${Math.abs(rounded)}` : `+${rounded}`
}

function formatAxis(axis: TackAxis | null) {
  return axis === null ? '—' : `${formatTwdDegrees(axis.degrees)} (${formatSignedDegrees(axis.offsetDegrees)})`
}

function formatTackAngle(axis: TackAxis | null) {
  return axis === null ? '—' : `${Math.round(axis.tackAngleDegrees)}°`
}

function formatMetres(value: number | null) {
  return value === null ? '—' : `${Math.round(value)} m`
}

function formatDegrees(value: number | null) {
  return value === null ? '—' : `${Math.round(value)}°`
}

export function formatWindAnalysisSummary(
  displayDegrees: number,
  source: EffectiveTwd['source'],
  classification: WindContextResult['classification'],
) {
  return `TWD ${formatTwdDegrees(displayDegrees)}${source === 'manual' ? ' Manual' : ''} · ${formatWindClassification(classification)}`
}

export function formatTackAxisHint(hint: TackAxisHint) {
  const subject = hint.combined ? 'Both tack axes' : 'Tack axis'
  return `${subject} ≈ ${formatTwdDegrees(hint.degrees)} (${formatSignedDegrees(hint.offsetDegrees)}°) — consider adjusting TWD`
}

export default function WindContextSection({
  effectiveTwd,
  displayDegrees,
  primary,
  comparison,
  primaryProgress,
  comparisonProgress,
}: WindContextSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const contentId = useId()
  const notesId = useId()
  const notesRef = useRef<HTMLDivElement>(null)
  const rows: { role: Role, result: WindContextResult }[] = [
    { role: 'primary', result: primary },
    ...(comparison ? [{ role: 'comparison' as const, result: comparison }] : []),
  ]
  const tackRows = rows.some(({ result }) => result.upwindTack !== null)
    ? rows.filter(({ role, result }) => role === 'comparison' || result.upwindTack !== null)
    : []
  const axisHelpId = useId()
  const hint = resolveTackAxisHint(
    effectiveTwd.degrees,
    primary.upwindTack?.axis ?? null,
    comparison !== undefined,
    comparison?.upwindTack?.axis ?? null,
  )
  const progressRows: { role: Role, progress: WindProgress }[] = [
    ...(primaryProgress ? [{ role: 'primary' as const, progress: primaryProgress }] : []),
    ...(comparison && comparisonProgress ? [{ role: 'comparison' as const, progress: comparisonProgress }] : []),
  ]
  const progressDifference = primaryProgress && comparison
    ? calculateProgressDifference(primaryProgress, comparisonProgress)
    : null
  const downwindRows = rows.some(({ result }) => result.downwind !== null)
    ? rows.filter(({ role, result }) => role === 'comparison' || result.downwind !== null)
    : []

  return (
    <section className="content-section maneuver-section wind-context-section" aria-labelledby="wind-context-title">
      <div className="maneuver-section__header">
        <p className="section-kicker" id="wind-context-title">Wind Analysis</p>
        <span className="wind-section__summary" data-wind-context-summary>
          {formatWindAnalysisSummary(displayDegrees, effectiveTwd.source, primary.classification)}
        </span>
        <button
          type="button"
          className="maneuver-section__collapse"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => {
            notesRef.current?.hidePopover?.()
            setExpanded((current) => !current)
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div id={contentId} hidden={!expanded}>
        <div className="wind-context__info-row">
          <span className="wind-context__reference" aria-label={`Effective TWD ${formatTwdDegrees(displayDegrees)}, ${formatTwdSource(effectiveTwd.source)}`}>
            TWD <strong>{formatTwdDegrees(displayDegrees)}</strong> · {formatTwdSource(effectiveTwd.source)}
          </span>
          <button
            type="button"
            className="maneuver-evidence__info"
            aria-label="About wind analysis"
            aria-expanded={notesExpanded}
            aria-controls={notesId}
            popoverTarget={notesId}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6" />
              <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>

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
          <div className="wind-context-table-wrap">
          <table className="wind-context-table wind-context-table--tack" aria-label="Upwind tack split">
            <thead><tr>
              <th scope="col" aria-label="Activity">P/C</th>
              <th scope="col">Stbd · TWA</th>
              <th scope="col">Port · TWA</th>
              <th scope="col">Indet.</th>
              <th scope="col">Check</th>
              <th scope="col" aria-describedby={axisHelpId}>Axis</th>
              <th scope="col">Tack angle</th>
            </tr></thead>
            <tbody>
              {tackRows.map(({ role, result }) => {
                const tack = result.upwindTack
                if (tack === null) {
                  return (
                    <tr key={role} data-wind-tack-role={role}>
                      <th scope="row" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</th>
                      <td>—</td><td>—</td><td>—</td><td>—</td><td data-wind-axis>—</td><td data-wind-tack-angle>—</td>
                    </tr>
                  )
                }
                return (
                  <tr key={role} data-wind-tack-role={role}>
                    <th scope="row" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</th>
                    <td>{formatWindShare(tack.shares.starboard)} · {formatMeanTwa(tack.meanAbsTwaDegrees.starboard)}</td>
                    <td>{formatWindShare(tack.shares.port)} · {formatMeanTwa(tack.meanAbsTwaDegrees.port)}</td>
                    <td>{formatWindShare(tack.shares.indeterminate)}</td>
                    <td className="wind-context-table__check">{tack.check.labels.join(' ')}</td>
                    <td data-wind-axis>{formatAxis(tack.axis)}</td>
                    <td data-wind-tack-angle>{formatTackAngle(tack.axis)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}

        {hint !== null && <p className="wind-context__hint" data-wind-axis-hint><strong>{formatTackAxisHint(hint)}</strong></p>}

        {progressRows.length > 0 && (
          <div className="wind-context-table-wrap">
          <table className="wind-context-table wind-context-table--progress" aria-label="Progress relative to the wind">
            <thead><tr>
              <th scope="col" aria-label="Activity">P/C</th>
              <th scope="col">Progress</th>
              <th scope="col">Distance</th>
              <th scope="col">Efficiency</th>
            </tr></thead>
            <tbody>
              {progressRows.map(({ role, progress }) => (
                <tr key={role} data-wind-progress-role={role}>
                  <th scope="row" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</th>
                  {progress.status === 'available' ? <>
                    <td>{formatMetres(progress.progressMeters)} to {progress.sector === 'upwind' ? 'windward' : 'leeward'}</td>
                    <td>{formatMetres(progress.distanceMeters)}</td>
                    <td>{formatWindShare(progress.efficiency)}</td>
                  </> : <>
                    <td className="wind-context-table__reason" data-wind-progress-reason={progress.reason}>{formatProgressReason(progress.reason)}</td>
                    <td>{formatMetres(progress.distanceMeters)}</td>
                    <td>—</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {progressDifference !== null && (
          <p className="wind-context__difference" data-wind-progress-difference>{formatProgressDifference(progressDifference)}</p>
        )}

        {downwindRows.length > 0 && (
          <div className="wind-context-table-wrap">
          <table className="wind-context-table wind-context-table--downwind" aria-label="Downwind readings">
            <thead><tr>
              <th scope="col" aria-label="Activity">P/C</th>
              <th scope="col">Depth</th>
              <th scope="col">Gybe angle</th>
            </tr></thead>
            <tbody>
              {downwindRows.map(({ role, result }) => (
                <tr key={role} data-wind-downwind-role={role}>
                  <th scope="row" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</th>
                  <td>{formatDegrees(result.downwind?.depthDegrees ?? null)}</td>
                  <td>{formatDegrees(result.downwind?.gybeAngleDegrees ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        <div id={notesId} ref={notesRef} className="maneuver-evidence__help" popover="auto"
          role="note" aria-labelledby={`${notesId}-title`} data-wind-notes
          onToggle={(event) => setNotesExpanded(event.newState === 'open')}
        >
          <h3 id={`${notesId}-title`}>Wind analysis notes</h3>
          <p className="maneuver-evidence__secondary">Sectors: COG vs effective TWD, over moving time (SOG ≥ {WIND_CONTEXT_CONFIG.movingMinSogKnots} kn).</p>
          <p className="maneuver-evidence__secondary">Tacks: upwind only; HDG/HEEL only confirm them.</p>
          <p className="maneuver-evidence__secondary" id={axisHelpId}>Axis: estimated bisector of the upwind tacks; not applied to TWD.</p>
          <p className="maneuver-evidence__secondary">Progress: net distance along the wind axis; not VMG.</p>
          <p className="maneuver-evidence__secondary">Depth / Gybe angle: mean downwind TWA / angle between the two downwind courses.</p>
          <p className="maneuver-evidence__secondary">Segments: P&apos;s track split by wind sector; tap one to set the Analysis Window.</p>
        </div>
      </div>
    </section>
  )
}
