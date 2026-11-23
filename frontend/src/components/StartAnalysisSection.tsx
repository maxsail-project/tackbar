import { useId, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { StartDetailFormat } from '../config/startAnalysis'
import { formatFixed, formatRounded, formatSogNumber, withTypographicMinus } from '../utils/numberFormat'
import { formatGpsTime } from '../utils/replay'
import type { StartActivityMetrics, StartAnalysisRow, StartDetailRow } from '../utils/startAnalysis'
import { formatAnalysisWindowDuration } from './AnalysisWindow'

type Role = 'primary' | 'comparison'

interface StartAnalysisSectionProps {
  /** One row group per inferred Session Start (#38.1) with its detailed table (#38.2); the section is absent without any. */
  rows: StartAnalysisRow[]
  /** Same behaviour as tapping a Start label: seek to the gun and focus the map (#38 D11). */
  onSelect: (start: { label: string, time: number }) => void
}

/** Signed one-decimal value (`+2.5`, `−6.0`); a value that displays as zero stays unsigned. */
function formatSignedOneDecimal(value: number | null) {
  if (value === null) return '—'
  const text = formatFixed(value, 1)
  return value > 0 && text !== '0.0' ? `+${text}` : text
}

export function formatStartCross(value: number | null) {
  return formatSignedOneDecimal(value)
}

export function formatStartDistance(value: number | null) {
  return formatSignedOneDecimal(value)
}

export function formatStartLinePercent(value: number | null) {
  return value === null ? '—' : formatRounded(value)
}

/** #38 D8: the fact only, in the Viewer compact duration format (e.g. `⚠ Ends +1m24s`). */
export function formatStartTimingNote(shortTimingMs: number | null) {
  return shortTimingMs === null ? '' : `⚠ Ends +${formatAnalysisWindowDuration(shortTimingMs)}`
}

/** Offset column label: `−20` … `+20`, `0` for the gun (#38 D4). */
export function formatStartOffset(seconds: number) {
  if (seconds === 0) return '0'
  return seconds > 0 ? `+${seconds}` : withTypographicMinus(String(seconds))
}

/** Detailed-table value in its configured format (#38 D3); `—` when unavailable. */
export function formatStartDetailValue(value: number | null, format: StartDetailFormat) {
  if (value === null) return '—'
  switch (format) {
    case 'fixed1': return formatFixed(value, 1)
    case 'signed1': return formatSignedOneDecimal(value)
    case 'direction': return String(((Math.round(value) % 360) + 360) % 360)
    case 'integer': return formatRounded(value)
  }
}

function roleLabel(role: Role) {
  return role === 'primary' ? 'P' : 'C'
}

function startKey(row: Pick<StartAnalysisRow, 'label' | 'time'>) {
  return `${row.label}:${row.time}`
}

/** Consecutive rows of the same indicator: P then C, or the single P–C row. */
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
  const time = formatGpsTime(row.time)
  return (
    <div className="start-analysis-detail" data-start-analysis-detail={row.label}>
      <h3 className="start-analysis-detail__title">{row.label} {time} UTC · seconds from the gun</h3>
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
                    {detailRow.values.map((value, offsetIndex) => (
                      <td key={row.detail.offsetsSeconds[offsetIndex]} className="start-analysis-table__number">
                        {formatStartDetailValue(value, indicator.format)}
                      </td>
                    ))}
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

export default function StartAnalysisSection({ rows, onSelect }: StartAnalysisSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const contentId = useId()
  if (rows.length === 0) return null
  const selectedRow = rows.find((row) => startKey(row) === selectedKey)

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
        <div className="maneuver-event-table-wrap">
          <table className="start-analysis-table" aria-label="Start summary">
            <thead>
              <tr>
                <th scope="col"><span className="maneuver-event-table__sr-only">Activity</span></th>
                <th scope="col">Start</th>
                <th scope="col" className="start-analysis-table__number">Cross (s)</th>
                <th scope="col" className="start-analysis-table__number">Dist at gun (m)</th>
                <th scope="col" className="start-analysis-table__number">Line (%)</th>
                <th scope="col" className="start-analysis-table__number">SOG cross (kt)</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            {rows.map((row) => {
              const key = startKey(row)
              const selected = key === selectedKey
              const roles: { role: Role, metrics: StartActivityMetrics }[] = [
                { role: 'primary', metrics: row.primary },
                ...(row.comparison === null ? [] : [{ role: 'comparison' as const, metrics: row.comparison }]),
              ]
              const time = formatGpsTime(row.time)
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
                            {row.label} {time}
                          </button>
                        </td>
                      )}
                      <td className="start-analysis-table__number" data-start-analysis-value="cross">{formatStartCross(metrics.crossSeconds)}</td>
                      <td className="start-analysis-table__number" data-start-analysis-value="distance">{formatStartDistance(metrics.distanceAtGunMeters)}</td>
                      <td className="start-analysis-table__number" data-start-analysis-value="line">{formatStartLinePercent(metrics.linePercent)}</td>
                      <td className="start-analysis-table__number" data-start-analysis-value="sog">{formatSogNumber(metrics.sogCrossKnots)}</td>
                      {index === 0 && (
                        <td rowSpan={roles.length} data-start-analysis-value="note">{formatStartTimingNote(row.shortTimingMs)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        </div>
        {selectedRow && <StartDetailTable row={selectedRow} />}
      </div>
    </section>
  )
}
