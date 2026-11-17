import { useEffect, useId, useRef, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import type { TwdReference } from '../utils/twdReference'
import { formatTwdDegrees, type TwdPresentation } from '../utils/twdPresentation'
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
  formatProgressGaps,
  formatProgressReason,
  type WindProgress,
} from '../utils/windProgress'
import type { WindSegment } from '../utils/windSegments'
import { MINUS_SIGN, formatRounded } from '../utils/numberFormat'
import { TwdDetail, TwdStepper } from './TwdControl'
import WindSegmentsList, { countListedWindSegments, formatWindSegmentCount } from './WindSegmentsSection'

type Role = 'primary' | 'comparison'

interface WindContextSectionProps {
  effectiveTwd: EffectiveTwd
  /** Displayed TWD, formatted exactly as in the map TWD control. */
  displayDegrees: number
  primary: WindContextResult
  comparison?: WindContextResult
  primaryProgress?: WindProgress
  comparisonProgress?: WindProgress
  /** P-referenced wind segments over P's full track (#192.3); the list is filter-only (#192.3.1). */
  segments?: WindSegment[]
  analysisWindow?: AnalysisWindowRange | null
  availableRange?: AnalysisWindowRange | null
  onSegmentSelect?: (segment: WindSegment) => void
  /** Same handler and side effects as the Analysis Window Reset. */
  onWindowReset?: () => void
  /** Changing this (the Primary Activity) resets the segment filter to All. */
  filterResetKey?: string
  comparisonSegmentClassifications?: WindWindowClassification[]
  /** Same page handlers as the map TWD control (#192.3.2); the controls are omitted without them. */
  onTwdStep?: (step: -5 | 5) => void
  /** The TWD detail's Automatic reset, same handler as the map's (#192.4). */
  onTwdReset?: () => void
  /** Same reference and presentation as the map; the value opens the shared TWD detail (#192.4). */
  twdReference?: TwdReference
  twdPresentation?: TwdPresentation
}

interface MetricRow {
  key: string
  label: string
  values: Record<Role, string>
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
  return rounded < 0 ? `${MINUS_SIGN}${Math.abs(rounded)}` : `+${rounded}`
}

function formatAxis(axis: TackAxis | null) {
  return axis === null ? '—' : `${formatTwdDegrees(axis.degrees)} (${formatSignedDegrees(axis.offsetDegrees)})`
}

function formatTackAngle(axis: TackAxis | null) {
  return axis === null ? '—' : `${Math.round(axis.tackAngleDegrees)}°`
}

function formatMetres(value: number | null) {
  return value === null ? '—' : `${formatRounded(value)} m`
}

function formatDegrees(value: number | null) {
  return value === null ? '—' : `${Math.round(value)}°`
}

/**
 * One row per metric, bare values only (units and direction live in the row label). A row is
 * dropped when every shown Activity reads "—" (#192.4). The sector follows P's classification.
 */
export function buildWindMetricRows(
  sector: WindWindowClassification,
  results: Record<Role, WindContextResult | undefined>,
  progress: Record<Role, WindProgress | undefined>,
  roles: Role[],
): MetricRow[] {
  const row = (key: string, label: string, read: (role: Role) => string): MetricRow => ({
    key,
    label,
    values: {
      primary: roles.includes('primary') ? read('primary') : '—',
      comparison: roles.includes('comparison') ? read('comparison') : '—',
    },
  })
  const share = (name: 'upwind' | 'reaching' | 'downwind') => (role: Role) => formatWindShare(results[role]?.sectorShares?.[name])
  const available = (role: Role) => {
    const value = progress[role]
    return value?.status === 'available' ? value : null
  }
  const progressMetres = (role: Role) => {
    const value = available(role)
    return value ? formatMetres(value.progressMeters) : '—'
  }
  const efficiency = (role: Role) => {
    const value = available(role)
    return value ? formatWindShare(value.efficiency) : '—'
  }
  const distance = (role: Role) => formatMetres(progress[role]?.distanceMeters ?? null)
  const tack = (role: Role) => results[role]?.upwindTack ?? null
  const rows: MetricRow[] = []
  if (sector === 'upwind') {
    rows.push(
      row('upwind-share', 'Upwind share', share('upwind')),
      row('progress', 'Progress to windward', progressMetres),
      row('distance', 'Distance', distance),
      row('efficiency', 'Efficiency', efficiency),
      row('time-starboard', 'Time on starboard', (role) => { const value = tack(role); return value ? formatWindShare(value.shares.starboard) : '—' }),
      row('time-port', 'Time on port', (role) => { const value = tack(role); return value ? formatWindShare(value.shares.port) : '—' }),
      row('time-tack-unclear', 'Time tack unclear', (role) => { const value = tack(role); return value ? formatWindShare(value.shares.indeterminate) : '—' }),
      row('twa-starboard', 'TWA on starboard', (role) => formatMeanTwa(tack(role)?.meanAbsTwaDegrees.starboard ?? null)),
      row('twa-port', 'TWA on port', (role) => formatMeanTwa(tack(role)?.meanAbsTwaDegrees.port ?? null)),
      row('axis', 'Axis', (role) => formatAxis(tack(role)?.axis ?? null)),
      row('tack-angle', 'Tack angle', (role) => formatTackAngle(tack(role)?.axis ?? null)),
      row('tack-check', 'Tack check', (role) => tack(role)?.check.labels.join(' ') || '—'),
    )
  } else if (sector === 'downwind') {
    rows.push(
      row('downwind-share', 'Downwind share', share('downwind')),
      row('progress', 'Progress to leeward', progressMetres),
      row('distance', 'Distance', distance),
      row('efficiency', 'Efficiency', efficiency),
      row('depth', 'Depth (mean TWA)', (role) => formatDegrees(results[role]?.downwind?.depthDegrees ?? null)),
      row('gybe-angle', 'Gybe angle', (role) => formatDegrees(results[role]?.downwind?.gybeAngleDegrees ?? null)),
    )
  } else {
    rows.push(
      row('upwind-share', 'Upwind share', share('upwind')),
      row('reaching-share', 'Reaching share', share('reaching')),
      row('downwind-share', 'Downwind share', share('downwind')),
      row('distance', 'Distance', distance),
    )
  }
  return rows.filter((entry) => roles.some((role) => entry.values[role] !== '—'))
}

export function formatWindAnalysisSummary(
  displayDegrees: number,
  source: EffectiveTwd['source'],
  classification: WindContextResult['classification'],
  segmentCount = 0,
) {
  return `${formatWindSegmentCount(segmentCount)} · TWD ${formatTwdDegrees(displayDegrees)}${source === 'manual' ? ' Manual' : ''} · ${formatWindClassification(classification)}`
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
  segments = [],
  analysisWindow = null,
  availableRange = null,
  onSegmentSelect = () => undefined,
  onWindowReset,
  filterResetKey = '',
  comparisonSegmentClassifications,
  onTwdStep,
  onTwdReset,
  twdReference,
  twdPresentation,
}: WindContextSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [twdDetailExpanded, setTwdDetailExpanded] = useState(false)
  const [breakdownExpanded, setBreakdownExpanded] = useState(false)
  const breakdownId = useId()
  const [notesExpanded, setNotesExpanded] = useState(false)
  const contentId = useId()
  const notesId = useId()
  const notesRef = useRef<HTMLDivElement>(null)
  const rows: { role: Role, result: WindContextResult }[] = [
    { role: 'primary', result: primary },
    ...(comparison ? [{ role: 'comparison' as const, result: comparison }] : []),
  ]
  const axisHelpId = useId()
  const hint = resolveTackAxisHint(
    effectiveTwd.degrees,
    primary.upwindTack?.axis ?? null,
    comparison !== undefined,
    comparison?.upwindTack?.axis ?? null,
  )
  const progressDifference = primaryProgress && comparison
    ? calculateProgressDifference(primaryProgress, comparisonProgress)
    : null
  const roles: Role[] = comparison ? ['primary', 'comparison'] : ['primary']
  const metricRows = buildWindMetricRows(
    primary.classification,
    { primary, comparison },
    { primary: primaryProgress, comparison: comparisonProgress },
    roles,
  )
  const hasTwdDetail = twdReference !== undefined && twdPresentation !== undefined && onTwdReset !== undefined
  const twdDetailId = `${contentId}-twd-detail`
  const twdRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!twdDetailExpanded) return
    const dismissOutside = (event: Event) => {
      const target = event.target
      if (!(target instanceof Node) || twdRef.current === null || twdRef.current.contains(target)) return
      setTwdDetailExpanded(false)
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('click', dismissOutside, true)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('click', dismissOutside, true)
    }
  }, [twdDetailExpanded])

  return (
    <section className="content-section maneuver-section wind-context-section" aria-labelledby="wind-context-title">
      <div className="maneuver-section__header">
        <p className="section-kicker" id="wind-context-title">Wind Analysis</p>
        <span className="wind-section__summary" data-wind-context-summary>
          {formatWindAnalysisSummary(displayDegrees, effectiveTwd.source, primary.classification, countListedWindSegments(segments, analysisWindow))}
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
        <WindSegmentsList
          segments={segments}
          analysisWindow={analysisWindow}
          availableRange={availableRange}
          onWindowReset={onWindowReset}
          onSegmentSelect={onSegmentSelect}
          filterResetKey={filterResetKey}
          comparisonSegmentClassifications={comparisonSegmentClassifications}
        />

        <div className="wind-context__info-row">
          <div className="wind-context__twd" ref={twdRef}>
            {(() => {
              const label = formatTwdDegrees(displayDegrees)
              const content = <><span>TWD</span><strong>{label}</strong></>
              const value = hasTwdDetail
                ? (
                  <button type="button" className="map-bearing__value" data-wind-twd-value aria-label={`TWD ${label}. Show wind reference details`} aria-expanded={twdDetailExpanded} aria-controls={twdDetailId} onClick={() => setTwdDetailExpanded((current) => !current)}>{content}</button>
                )
                : <span className="map-bearing__value" data-wind-twd-value aria-label={`Effective TWD ${label}`}>{content}</span>
              return onTwdStep !== undefined && onTwdReset !== undefined
                ? (
                  <div className="map-navigation-group wind-context__twd-stepper" role="group" aria-label="Adjust TWD">
                    <TwdStepper onStep={onTwdStep} decreaseLabel="Decrease TWD by 5°" increaseLabel="Increase TWD by 5°" value={value} />
                  </div>
                )
                : <div className="map-navigation-group wind-context__twd-stepper"><div className="map-navigation-group__direction">{value}</div></div>
            })()}
            <span className="wind-context__reference" data-wind-twd-source>{formatTwdSource(effectiveTwd.source)}</span>
            {hasTwdDetail && twdDetailExpanded && (
              <TwdDetail id={twdDetailId} className="wind-context__twd-detail" reference={twdReference} presentation={twdPresentation} onAutomatic={() => { onTwdReset(); setTwdDetailExpanded(false) }} />
            )}
          </div>
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

        <div className="wind-conclusion" data-wind-conclusion>
          <p className="wind-conclusion__title" data-wind-conclusion-title>{formatWindClassification(primary.classification).toUpperCase()}</p>
          {progressDifference !== null ? (
            <>
              <p className="wind-conclusion__line" data-wind-progress-difference>{formatProgressDifference(progressDifference)}</p>
              <p className="wind-conclusion__line" data-wind-progress-gaps>{formatProgressGaps(progressDifference)}</p>
            </>
          ) : primaryProgress?.status === 'available' ? (
            <p className="wind-conclusion__line" data-wind-progress-own>
              {formatMetres(primaryProgress.progressMeters)} to {primaryProgress.sector === 'upwind' ? 'windward' : 'leeward'}{primaryProgress.efficiency === null ? '' : ` · ${formatWindShare(primaryProgress.efficiency)} efficiency`}
            </p>
          ) : primaryProgress?.status === 'unavailable' ? (
            <p className="wind-conclusion__line wind-conclusion__line--reason" data-wind-progress-reason={primaryProgress.reason}>{formatProgressReason(primaryProgress.reason)}</p>
          ) : null}
          {progressDifference?.wideLateralSeparation === true && (
            <p className="wind-conclusion__caution" data-wind-lateral-caution>Boats far apart sideways: results sensitive to TWD</p>
          )}
        </div>

        {metricRows.length > 0 && (
          <table className="wind-metric-table" aria-label="Wind metrics">
            <thead><tr>
              <th scope="col" className="wind-metric-table__label" aria-label="Metric" />
              {roles.map((role) => <th key={role} scope="col" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</th>)}
            </tr></thead>
            <tbody>
              {metricRows.map((metric) => (
                <tr key={metric.key} data-wind-metric={metric.key}>
                  <th scope="row" aria-describedby={metric.key === 'axis' ? axisHelpId : undefined}>{metric.label}</th>
                  {roles.map((role) => <td key={role} data-wind-metric-role={role}>{metric.values[role]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {hint !== null && <p className="wind-context__hint" data-wind-axis-hint><strong>{formatTackAxisHint(hint)}</strong></p>}

        <div className="wind-breakdown">
          <button
            type="button"
            className="wind-breakdown__toggle"
            aria-expanded={breakdownExpanded}
            aria-controls={breakdownId}
            onClick={() => setBreakdownExpanded((current) => !current)}
          >
            Sector breakdown
          </button>
          <div id={breakdownId} hidden={!breakdownExpanded} data-wind-breakdown>
            <table className="wind-metric-table wind-metric-table--breakdown" aria-label="Sector breakdown">
              <thead><tr>
                <th scope="col" aria-label="Activity">P/C</th>
                <th scope="col">Upwind</th>
                <th scope="col">Reaching</th>
                <th scope="col">Downwind</th>
              </tr></thead>
              <tbody>
                {rows.map(({ role, result }) => (
                  <tr key={role} data-wind-role={role}>
                    <th scope="row" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</th>
                    <td>{formatWindShare(result.sectorShares?.upwind)}</td>
                    <td>{formatWindShare(result.sectorShares?.reaching)}</td>
                    <td>{formatWindShare(result.sectorShares?.downwind)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div id={notesId} ref={notesRef} className="maneuver-evidence__help" popover="auto"
          role="note" aria-labelledby={`${notesId}-title`} data-wind-notes
          onToggle={(event) => setNotesExpanded(event.newState === 'open')}
        >
          <h3 id={`${notesId}-title`}>Wind analysis notes</h3>
          <p className="maneuver-evidence__secondary">Sectors: COG vs effective TWD, over moving time (SOG ≥ {WIND_CONTEXT_CONFIG.movingMinSogKnots} kt).</p>
          <p className="maneuver-evidence__secondary">Tacks: upwind only; HDG/HEEL only confirm them.</p>
          <p className="maneuver-evidence__secondary">Tack unclear: upwind time with TWA too close to the wind to assign a tack.</p>
          <p className="maneuver-evidence__secondary" id={axisHelpId}>Axis: estimated bisector of the upwind tacks; not applied to TWD.</p>
          <p className="maneuver-evidence__secondary">Progress: net distance along the wind axis; not VMG. Seconds convert the metre difference using both boats&apos; average speed along that axis. Along the wind axis, not toward a mark; gap error grows with lateral separation.</p>
          <p className="maneuver-evidence__secondary">Depth / Gybe angle: mean downwind TWA / angle between the two downwind courses.</p>
          <p className="maneuver-evidence__secondary">Segments: P&apos;s track split by wind sector using the modelled TWD at each sample; tap one to set the Analysis Window.</p>
        </div>
      </div>
    </section>
  )
}
