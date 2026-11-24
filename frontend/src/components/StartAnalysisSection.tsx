import { useEffect, useId, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { START_ANALYSIS_CONFIG, type StartDetailFormat } from '../config/startAnalysis'
import { formatFixed, formatRounded, formatSog, withTypographicMinus } from '../utils/numberFormat'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import { formatGpsTime } from '../utils/replay'
import { sessionStartsInWindow } from '../utils/sessionStarts'
import type { StartActivityMetrics, StartAnalysisRow, StartDetailRow, StartLineBias } from '../utils/startAnalysis'
import { formatTwdSource } from '../utils/windContext'
import { formatAnalysisWindowDuration } from './AnalysisWindow'

type Role = 'primary' | 'comparison'

interface StartAnalysisSectionProps {
  /** One row group per inferred Session Start (#38.1) with its detailed table (#38.2); the section is absent without any. */
  rows: StartAnalysisRow[]
  /** Current Analysis Window: the summary lists only Starts whose gun lies inside it, endpoints included (#38 D15). */
  analysisWindow: AnalysisWindowRange | null
  /** Same behaviour as tapping a Start label: seek to the gun and focus the map (#38 D11). */
  onSelect: (start: { label: string, time: number }) => void
}

/** Signed one-decimal value (`+2.5`, `−6.0`); a value that displays as zero stays unsigned. */
function formatSignedOneDecimal(value: number | null) {
  if (value === null) return '—'
  const text = formatFixed(value, 1)
  return value > 0 && text !== '0.0' ? `+${text}` : text
}

/** #38 D16/D24 Cross: compact seconds, crossing SOG and an end-tolerance marker when applicable. */
export function formatStartCross(seconds: number | null, sogKnots: number | null, beyondRecordedEnd = false) {
  return seconds === null ? '—' : `${formatSignedOneDecimal(seconds)}s · ${formatSog(sogKnots)}${beyondRecordedEnd ? ' ↔' : ''}`
}

/** #38 D16 Dist at the gun with its unit (`+15.8 m`). */
export function formatStartDistance(value: number | null) {
  return value === null ? '—' : `${formatSignedOneDecimal(value)} m`
}

/** #38 D16 Line position with its unit (`87%`, may be below 0 or above 100). */
export function formatStartLinePercent(value: number | null) {
  return value === null ? '—' : `${formatRounded(value)}%`
}

/** Summary value cells with accessible names spelling the units (#204). */
function startSummaryCells(metrics: StartActivityMetrics) {
  const { crossSeconds, sogCrossKnots, crossBeyondRecordedEnd, distanceAtGunMeters, linePercent } = metrics
  return [
    {
      key: 'cross',
      text: formatStartCross(crossSeconds, sogCrossKnots, crossBeyondRecordedEnd),
      ariaLabel: crossSeconds === null
        ? 'Cross unavailable'
        : `Cross ${formatSignedOneDecimal(crossSeconds)} seconds, SOG ${sogCrossKnots === null ? 'unavailable' : `${formatFixed(sogCrossKnots, 1)} knots`}${crossBeyondRecordedEnd ? ', beyond the recorded end' : ''}`,
    },
    {
      key: 'distance',
      text: formatStartDistance(distanceAtGunMeters),
      ariaLabel: `Distance to the line at the gun ${distanceAtGunMeters === null ? 'unavailable' : `${formatSignedOneDecimal(distanceAtGunMeters)} metres`}`,
    },
    {
      key: 'line',
      text: formatStartLinePercent(linePercent),
      ariaLabel: `Line position at the gun ${linePercent === null ? 'unavailable' : `${formatRounded(linePercent)} percent`}`,
    },
  ]
}

/** #38 D23 Fav: the favoured end by name, `Square`, or `—` without line or TWD. */
export function formatStartFavoured(line: StartLineBias | null) {
  const end = line?.wind?.favouredEnd
  if (end === undefined) return { text: '—', ariaLabel: 'Favoured end unavailable' }
  if (end === 'square') return { text: 'Square', ariaLabel: 'Line square to the wind' }
  return end === 'pin'
    ? { text: 'PIN', ariaLabel: 'Favoured end PIN' }
    : { text: 'BOAT', ariaLabel: 'Favoured end BOAT' }
}

/**
 * #38 D20 detailed heading: `S<n> HH:MM:SS UTC`, then with a line `Line <length> m`, and with an
 * effective TWD the favoured end `<PIN|BOAT> +<bias>° (<advantage> m)` or `Square` and `TWD <source>`.
 */
export function formatStartDetailHeading(row: Pick<StartAnalysisRow, 'label' | 'time' | 'line'>) {
  const parts = [`${row.label} ${formatGpsTime(row.time)} UTC`]
  if (row.line) {
    parts.push(`Line ${formatRounded(row.line.lengthMeters)} m`)
    const { wind } = row.line
    if (wind) {
      parts.push(wind.favouredEnd === 'square'
        ? 'Square'
        : `${wind.favouredEnd.toUpperCase()} +${formatRounded(Math.abs(wind.biasDegrees))}° (${formatRounded(wind.advantageMeters)} m)`)
      parts.push(`TWD ${formatTwdSource(wind.source)}`)
    }
  }
  return parts.join(' · ')
}

export const START_SUMMARY_HELP_TEXT = 'Cross: time and SOG when crossing the line · Dist, Line: position at the gun'

/** #38 D8: the fact only, in the Viewer compact duration format (e.g. `⚠ Ends +1m24s`). */
export function formatStartTimingNote(shortTimingMs: number | null) {
  return shortTimingMs === null ? '' : `⚠ Ends +${formatAnalysisWindowDuration(shortTimingMs)}`
}

/** Offset column label in compact seconds: `−15s` … `+15s`, `0s` for the gun (#38 D17). */
export function formatStartOffset(seconds: number) {
  if (seconds === 0) return '0s'
  return `${seconds > 0 ? `+${seconds}` : withTypographicMinus(String(seconds))}s`
}

/** #38 D21: the existing #192 along-axis sign identifies the upwind leader. */
export function formatStartUpwindLead(alongMeters: number | null) {
  if (alongMeters === null) return { text: '—', ariaLabel: 'Upwind lead unavailable', leader: null }
  if (Math.abs(alongMeters) < START_ANALYSIS_CONFIG.upwindLeadLevelBelowMeters) {
    return { text: 'Level', ariaLabel: 'Level upwind', leader: null }
  }
  const leader = alongMeters > 0 ? 'P' : 'C'
  const metres = formatRounded(Math.abs(alongMeters))
  return { text: `${leader} ${metres}`, ariaLabel: `${leader} ${metres} metres further upwind`, leader }
}

/** Detailed-table value in its configured format (#38 D3); `—` when unavailable. */
export function formatStartDetailValue(value: number | null, format: StartDetailFormat) {
  if (value === null) return '—'
  switch (format) {
    case 'fixed1': return formatFixed(value, 1)
    case 'signed1': return formatSignedOneDecimal(value)
    case 'direction': return String(((Math.round(value) % 360) + 360) % 360)
    case 'integer': return formatRounded(value)
    case 'upwindLead': return formatStartUpwindLead(value).text
  }
}

function roleLabel(role: Role) {
  return role === 'primary' ? 'P' : 'C'
}

function startKey(row: Pick<StartAnalysisRow, 'label' | 'time'>) {
  return `${row.label}:${row.time}`
}

/** Consecutive rows of the same indicator: P then C, or the single upwind-lead row. */
function groupDetailRows(rows: readonly StartDetailRow[]) {
  const groups: StartDetailRow[][] = []
  rows.forEach((row) => {
    const last = groups[groups.length - 1]
    if (last?.[0].indicator.id === row.indicator.id) last.push(row)
    else groups.push([row])
  })
  return groups
}

/** #38.2 (D3, D4): indicators × offsets around the gun of the selected Start; no Δ rows, no better-value marking. */
function StartDetailTable({ row }: { row: StartAnalysisRow }) {
  return (
    <div className="start-analysis-detail" data-start-analysis-detail={row.label}>
      <h3 className="start-analysis-detail__title">{formatStartDetailHeading(row)}</h3>
      <div className="maneuver-event-table-wrap">
        <table className="start-analysis-table start-analysis-table--detail" aria-label={`${row.label} details around the gun`}>
          <thead>
            <tr>
              <th scope="col"><span className="maneuver-event-table__sr-only">Indicator</span></th>
              <th scope="col"><span className="maneuver-event-table__sr-only">Activity</span></th>
              {row.detail.offsetsSeconds.map((offset) => (
                <th key={offset} scope="col" className="start-analysis-table__number">{formatStartOffset(offset)}</th>
              ))}
            </tr>
          </thead>
          {groupDetailRows(row.detail.rows).map((group) => {
            const { indicator } = group[0]
            return (
              <tbody key={indicator.id} data-start-detail-indicator={indicator.id}>
                {group.map((detailRow, index) => (
                  <tr key={detailRow.role} data-start-detail-role={detailRow.role}>
                    {index === 0 && (
                      <th scope="rowgroup" rowSpan={group.length} className="start-analysis-table__indicator">
                        {indicator.label} ({indicator.unit})
                      </th>
                    )}
                    {detailRow.role === 'pair'
                      ? <td className="start-analysis-table__activity" />
                      : <td className="start-analysis-table__activity" style={{ color: ACTIVITY_COLORS[detailRow.role] }}>{roleLabel(detailRow.role)}</td>}
                    {detailRow.values.map((value, offsetIndex) => {
                      const lead = indicator.format === 'upwindLead' ? formatStartUpwindLead(value) : null
                      return (
                        <td key={row.detail.offsetsSeconds[offsetIndex]} className="start-analysis-table__number" aria-label={lead?.ariaLabel}>
                          {lead?.leader
                            ? <><span style={{ color: ACTIVITY_COLORS[lead.leader === 'P' ? 'primary' : 'comparison'] }}>{lead.leader}</span> {lead.text.slice(2)}</>
                            : lead?.text ?? formatStartDetailValue(value, indicator.format)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            )
          })}
        </table>
      </div>
    </div>
  )
}

export const NO_START_IN_WINDOW_TEXT = 'No inferred Start in the Analysis Window'

export default function StartAnalysisSection({ rows, analysisWindow, onSelect }: StartAnalysisSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const contentId = useId()
  // #38 D15: same window rule as the SOG timeline Start labels; values stay full-track derived.
  const windowRows = analysisWindow === null ? [] : sessionStartsInWindow(rows, analysisWindow)
  const selectedRow = windowRows.find((row) => startKey(row) === selectedKey)
  // #38 D16: the Note column only when a visible Start has a note.
  const showNote = windowRows.some((row) => row.shortTimingMs !== null)
  const selectionLeftWindow = selectedKey !== null && selectedRow === undefined
  useEffect(() => {
    // A selected Start that leaves the Analysis Window is deselected (#38 D15).
    if (selectionLeftWindow) setSelectedKey(null)
  }, [selectionLeftWindow])
  if (rows.length === 0) return null

  return (
    <section className="content-section maneuver-section start-analysis-section" aria-labelledby="start-analysis-title">
      <div className="maneuver-section__header">
        <p className="section-kicker" id="start-analysis-title">Start Analysis</p>
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
        <p className="wind-context__note" data-start-analysis-caption>Starts inferred from race timer · times UTC</p>
        {windowRows.length > 0 && <p className="wind-context__note" data-start-analysis-help>{START_SUMMARY_HELP_TEXT}</p>}
        {windowRows.length === 0 ? (
          <p className="maneuver-empty" data-start-analysis-empty>{NO_START_IN_WINDOW_TEXT}</p>
        ) : (
          <div className="maneuver-event-table-wrap">
            <table className="start-analysis-table" aria-label="Start summary">
              <thead>
                <tr>
                  <th scope="col"><span className="maneuver-event-table__sr-only">Activity</span></th>
                  <th scope="col">Start</th>
                  <th scope="col" className="start-analysis-table__number">Cross</th>
                  <th scope="col" className="start-analysis-table__number">Dist</th>
                  <th scope="col" className="start-analysis-table__number">Line</th>
                  <th scope="col" className="start-analysis-table__number">Fav</th>
                  {showNote && <th scope="col">Note</th>}
                </tr>
              </thead>
              {windowRows.map((row) => {
                const key = startKey(row)
                const selected = key === selectedKey
                const roles: { role: Role, metrics: StartActivityMetrics }[] = [
                  { role: 'primary', metrics: row.primary },
                  ...(row.comparison === null ? [] : [{ role: 'comparison' as const, metrics: row.comparison }]),
                ]
                const time = formatGpsTime(row.time)
                const favoured = formatStartFavoured(row.line)
                const select = () => {
                  setSelectedKey(key)
                  onSelect({ label: row.label, time: row.time })
                }
                return (
                  <tbody
                    key={key}
                    className={`start-analysis-table__start${selected ? ' start-analysis-table__start--selected' : ''}`}
                    data-start-analysis-row={row.label}
                  >
                    {roles.map(({ role, metrics }, index) => (
                      <tr key={role} className="start-analysis-table__row" data-start-analysis-role={role} onClick={select}>
                        <td className="start-analysis-table__activity" style={{ color: ACTIVITY_COLORS[role] }}>{roleLabel(role)}</td>
                        {index === 0 && (
                          <td rowSpan={roles.length} className="start-analysis-table__start-cell">
                            <button
                              type="button"
                              className="maneuver-event-table__button start-analysis-table__button"
                              aria-pressed={selected}
                              aria-label={`Move replay to ${row.label} gun at ${time} UTC, inferred from race timer`}
                            >
                              <span className="start-analysis-table__start-label">{row.label}</span>
                              <span className="start-analysis-table__start-time">{time}</span>
                            </button>
                          </td>
                        )}
                        {startSummaryCells(metrics).map((cell) => (
                          <td key={cell.key} className="start-analysis-table__number" data-start-analysis-value={cell.key} aria-label={cell.ariaLabel}>
                            {cell.text}
                          </td>
                        ))}
                        {index === 0 && (
                          <td rowSpan={roles.length} className="start-analysis-table__number" data-start-analysis-value="favoured" aria-label={favoured.ariaLabel}>
                            {favoured.text}
                          </td>
                        )}
                        {showNote && index === 0 && (
                          <td rowSpan={roles.length} data-start-analysis-value="note">{formatStartTimingNote(row.shortTimingMs)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
          </div>
        )}
        {selectedRow && <StartDetailTable row={selectedRow} />}
      </div>
    </section>
  )
}
