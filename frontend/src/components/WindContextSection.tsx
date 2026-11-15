import { useId, useState } from 'react'
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
  type WindWindowClassification,
} from '../utils/windContext'
import {
  calculateProgressDifference,
  formatProgressDifference,
  formatProgressReason,
  type WindProgress,
} from '../utils/windProgress'
import { formatGpsTime } from '../utils/replay'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import {
  formatWindSegmentKind,
  windSegmentMatchesWindow,
  type WindSegment,
} from '../utils/windSegments'
import { formatAnalysisWindowDuration } from './AnalysisWindow'

type Role = 'primary' | 'comparison'

interface WindContextSectionProps {
  effectiveTwd: EffectiveTwd
  /** Displayed TWD, formatted exactly as in the map TWD control. */
  displayDegrees: number
  primary: WindContextResult
  comparison?: WindContextResult
  primaryProgress?: WindProgress
  /** P-referenced wind segments (#192.3); omitted hides the list. */
  segments?: WindSegment[]
  analysisWindow?: AnalysisWindowRange | null
  onSegmentSelect?: (segment: WindSegment) => void
  /**
   * Isolated C column: C's classification over each P segment interval, index-aligned with
   * `segments`. Omit to remove the column.
   */
  comparisonSegmentClassifications?: WindWindowClassification[]
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
  segments,
  analysisWindow = null,
  onSegmentSelect,
  comparisonSegmentClassifications,
}: WindContextSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const rows: { role: Role, result: WindContextResult }[] = [
    { role: 'primary', result: primary },
    ...(comparison ? [{ role: 'comparison' as const, result: comparison }] : []),
  ]
  const tackRows = rows.filter(({ result }) => result.upwindTack !== null)
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
  const downwindRows = rows.filter(({ result }) => result.downwind !== null)

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
        {segments !== undefined && (
          <div className="wind-segments">
            <p className="wind-segments__title">Segments (P)</p>
            {segments.length === 0 ? (
              <p className="wind-context__note">No segments for P in the available range.</p>
            ) : (
              <div className="wind-context-table-wrap wind-segments__wrap">
              <table className="wind-context-table wind-segments__table" aria-label="P wind segments">
                <thead><tr>
                  <th scope="col">Segment</th>
                  <th scope="col">Time (UTC)</th>
                  <th scope="col">Duration</th>
                  {comparisonSegmentClassifications !== undefined && <th scope="col">C</th>}
                </tr></thead>
                <tbody>
                  {segments.map((segment, index) => {
                    const current = windSegmentMatchesWindow(segment, analysisWindow)
                    const secondary = segment.kind === 'unclassified' || segment.kind === 'pre-start'
                    const label = formatWindSegmentKind(segment.kind)
                    const time = `${formatGpsTime(segment.start)}–${formatGpsTime(segment.end)}`
                    return (
                      <tr
                        key={`${segment.start}:${segment.end}`}
                        className={`wind-segments__row${secondary ? ' wind-segments__row--secondary' : ''}${current ? ' wind-segments__row--current' : ''}`}
                        data-wind-segment={segment.kind}
                        onClick={() => onSegmentSelect?.(segment)}
                      >
                        <td>
                          <button
                            type="button"
                            className="wind-segments__button"
                            aria-pressed={current}
                            aria-label={`Set Analysis Window to ${label} segment ${time} UTC`}
                          >
                            {label}
                          </button>
                        </td>
                        <td>{time}</td>
                        <td>{formatAnalysisWindowDuration(segment.end - segment.start)}</td>
                        {comparisonSegmentClassifications !== undefined && (
                          <td data-wind-segment-comparison style={{ color: ACTIVITY_COLORS.comparison }}>
                            {formatWindClassification(comparisonSegmentClassifications[index] ?? 'unavailable')}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}

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
                const tack = result.upwindTack!
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
                  <td>{formatDegrees(result.downwind!.depthDegrees)}</td>
                  <td>{formatDegrees(result.downwind!.gybeAngleDegrees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        <p className="wind-context__note">
          Shares of moving time (SOG ≥ {WIND_CONTEXT_CONFIG.movingMinSogKnots} kn) from COG and the effective TWD. Tack split for upwind windows only; HDG/HEEL only check the COG tack.
        </p>
        {tackRows.length > 0 && (
          <p className="wind-context__note" id={axisHelpId}>
            Axis is the estimated bisector of the upwind tacks, with its signed difference from the effective TWD; it is not applied to TWD. Tack angle is the sum of mean starboard and port |TWA|. Both need at least {WIND_CONTEXT_CONFIG.tackAxisMinTackSeconds} s on each tack and no inconsistent check.
          </p>
        )}
        {progressRows.length > 0 && (
          <p className="wind-context__note">
            Progress is the window's net displacement projected on the effective TWD axis (downwind: TWD + 180°), for upwind or downwind windows with a net course within {WIND_CONTEXT_CONFIG.progressMaxAxisOffsetDegrees}° of that axis. Efficiency is progress divided by distance sailed. It is not VMG.
          </p>
        )}
        {downwindRows.length > 0 && (
          <p className="wind-context__note">
            Depth is the mean downwind |TWA|. Gybe angle is the course difference between two COG groups, shown only when each has at least {WIND_CONTEXT_CONFIG.tackAxisMinTackSeconds} s and they differ by at least {WIND_CONTEXT_CONFIG.gybeAngleMinDegrees}°.
          </p>
        )}
      </div>
    </section>
  )
}
