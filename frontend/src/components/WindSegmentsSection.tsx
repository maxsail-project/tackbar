import { useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import { formatGpsTime } from '../utils/replay'
import { formatWindClassification, type WindWindowClassification } from '../utils/windContext'
import {
  formatWindSegmentKind,
  windSegmentMatchesWindow,
  type WindSegment,
  type WindSegmentKind,
} from '../utils/windSegments'
import { formatAnalysisWindowDuration } from './AnalysisWindow'

interface WindSegmentsListProps {
  /** P-referenced wind segments over P's full track in the available range (#192.3). */
  segments: WindSegment[]
  analysisWindow: AnalysisWindowRange | null
  /** Full available range; the section Reset shows while the window differs from it (#192.3.1). */
  availableRange?: AnalysisWindowRange | null
  /** Restores the full Analysis Window through the same handler as the Analysis Window Reset. */
  onWindowReset?: () => void
  onSegmentSelect: (segment: WindSegment) => void
  /** Changing this (the Primary Activity) resets the type filter to All. */
  filterResetKey: string
  /**
   * Isolated C column: C's classification over each P segment interval, index-aligned with
   * `segments`. Omit to remove the column.
   */
  comparisonSegmentClassifications?: WindWindowClassification[]
}

export type WindSegmentFilter = 'all' | WindSegmentKind

const FILTERS: WindSegmentFilter[] = ['all', 'upwind', 'reaching', 'downwind', 'unclassified']

const FILTER_SHORT_LABELS: Record<WindSegmentFilter, string> = {
  all: 'All',
  upwind: 'Up',
  reaching: 'Reach',
  downwind: 'Down',
  unclassified: 'Other',
}

function filterFullLabel(filter: WindSegmentFilter) {
  return filter === 'all' ? 'All' : formatWindSegmentKind(filter)
}

export function formatWindSegmentCount(count: number) {
  return `${count} ${count === 1 ? 'segment' : 'segments'}`
}

function overlapsWindow(segment: WindSegment, analysisWindow: AnalysisWindowRange | null) {
  return analysisWindow === null || (segment.start < analysisWindow.end && segment.end > analysisWindow.start)
}

function extendsBeyondWindow(segment: WindSegment, analysisWindow: AnalysisWindowRange | null) {
  return analysisWindow !== null && (segment.start < analysisWindow.start || segment.end > analysisWindow.end)
}

/** Segments overlapping the Analysis Window: the list and the header count (#192.3.1). */
export function countListedWindSegments(segments: WindSegment[], analysisWindow: AnalysisWindowRange | null) {
  return segments.filter((segment) => overlapsWindow(segment, analysisWindow)).length
}

export const WIND_SEGMENTS_RESET_LABEL = 'Reset wind segments and Analysis Window'

export default function WindSegmentsList({
  segments,
  analysisWindow,
  availableRange = null,
  onWindowReset,
  onSegmentSelect,
  filterResetKey,
  comparisonSegmentClassifications,
}: WindSegmentsListProps) {
  // Ephemeral filter, tied to the Primary it was chosen for; a new Primary falls back to All.
  const [filterState, setFilterState] = useState<{ key: string, value: WindSegmentFilter }>({ key: filterResetKey, value: 'all' })

  // Computed on P's full track; only segments overlapping the current window are listed.
  const listed = segments
    .map((segment, index) => ({ segment, comparison: comparisonSegmentClassifications?.[index] }))
    .filter(({ segment }) => overlapsWindow(segment, analysisWindow))
  const counts = new Map<WindSegmentFilter, number>(FILTERS.map((filter) => [
    filter,
    filter === 'all' ? listed.length : listed.filter(({ segment }) => segment.kind === filter).length,
  ]))
  const activeFilter: WindSegmentFilter = filterState.key === filterResetKey ? filterState.value : 'all'
  const visible = activeFilter === 'all' ? listed : listed.filter(({ segment }) => segment.kind === activeFilter)
  const windowIsFull = analysisWindow === null || availableRange === null
    || (analysisWindow.start === availableRange.start && analysisWindow.end === availableRange.end)
  // The first option becomes Reset while a filter or a narrowed window is active (#192.3.1).
  const resetActive = activeFilter !== 'all' || !windowIsFull

  return (
    <div className="wind-segments">
      {listed.length === 0 && !resetActive ? (
          <p className="wind-context__note">No segments for P in this Analysis Window.</p>
        ) : (
          <>
            <div className="wind-segments__filter" role="group" aria-label="Filter wind segments by type">
              {FILTERS.map((filter) => {
                const count = counts.get(filter) ?? 0
                if (filter === 'all' && resetActive) {
                  return (
                    <button
                      key={filter}
                      type="button"
                      className="wind-segments__filter-option"
                      data-wind-segment-filter="all"
                      data-wind-segments-reset
                      aria-label={WIND_SEGMENTS_RESET_LABEL}
                      onClick={() => {
                        onWindowReset?.()
                        setFilterState({ key: filterResetKey, value: 'all' })
                      }}
                    >
                      Reset
                    </button>
                  )
                }
                return (
                  <button
                    key={filter}
                    type="button"
                    className="wind-segments__filter-option"
                    data-wind-segment-filter={filter}
                    aria-pressed={activeFilter === filter}
                    aria-label={`${filterFullLabel(filter)}, ${formatWindSegmentCount(count)}`}
                    disabled={count === 0 && activeFilter !== filter}
                    onClick={() => setFilterState({ key: filterResetKey, value: filter })}
                  >
                    {FILTER_SHORT_LABELS[filter]} {count}
                  </button>
                )
              })}
            </div>
            {visible.length === 0 ? (
              <p className="wind-context__note" data-wind-segments-empty>
                {activeFilter === 'all' ? 'No segments for P in this Analysis Window.' : `No ${filterFullLabel(activeFilter)} segments in this window`}
              </p>
            ) : (
            <table className="wind-context-table wind-segments__table" aria-label="P wind segments">
              <thead><tr>
                <th scope="col" className="wind-segments__segment-column" aria-label="P segment">P</th>
                <th scope="col">Time (UTC)</th>
                <th scope="col">Duration</th>
                {comparisonSegmentClassifications !== undefined && <th scope="col" aria-label="C segment">C</th>}
              </tr></thead>
              <tbody>
                {visible.map(({ segment, comparison }) => {
                  const current = windSegmentMatchesWindow(segment, analysisWindow)
                  const partial = extendsBeyondWindow(segment, analysisWindow)
                  const label = formatWindSegmentKind(segment.kind)
                  const time = `${formatGpsTime(segment.start)}–${formatGpsTime(segment.end)}`
                  return (
                    <tr
                      key={`${segment.start}:${segment.end}`}
                      className={`wind-segments__row${segment.kind === 'unclassified' ? ' wind-segments__row--secondary' : ''}${current ? ' wind-segments__row--current' : ''}`}
                      data-wind-segment={segment.kind}
                      data-wind-segment-partial={partial || undefined}
                      onClick={() => onSegmentSelect(segment)}
                    >
                      <td className="wind-segments__segment-column">
                        <button
                          type="button"
                          className={`wind-segments__button${segment.kind === 'unclassified' ? ' wind-segments__label--muted' : ''}`}
                          style={{ color: ACTIVITY_COLORS.primary }}
                          aria-pressed={current}
                          aria-label={`Set Analysis Window to ${label} segment ${time} UTC${partial ? ', partly outside the current window' : ''}`}
                        >
                          {label}
                          {partial && <span className="wind-segments__partial">partial</span>}
                        </button>
                      </td>
                      <td>{time}</td>
                      <td>{formatAnalysisWindowDuration(segment.end - segment.start)}</td>
                      {comparisonSegmentClassifications !== undefined && (
                        <td
                          data-wind-segment-comparison
                          className={comparison === undefined || comparison === 'mixed' || comparison === 'unavailable' ? 'wind-segments__label--muted' : undefined}
                          style={{ color: ACTIVITY_COLORS.comparison }}
                        >
                          {comparison === undefined ? '—' : formatWindClassification(comparison)}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            )}
          </>
        )}
    </div>
  )
}
