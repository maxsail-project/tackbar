import { useId, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import { formatGpsTime } from '../utils/replay'
import { formatWindClassification, type WindWindowClassification } from '../utils/windContext'
import {
  formatWindSegmentKind,
  windSegmentMatchesWindow,
  type WindSegment,
} from '../utils/windSegments'
import { formatAnalysisWindowDuration } from './AnalysisWindow'

interface WindSegmentsSectionProps {
  /** P-referenced wind segments (#192.3). */
  segments: WindSegment[]
  analysisWindow: AnalysisWindowRange | null
  onSegmentSelect: (segment: WindSegment) => void
  /**
   * Isolated C column: C's classification over each P segment interval, index-aligned with
   * `segments`. Omit to remove the column.
   */
  comparisonSegmentClassifications?: WindWindowClassification[]
}

export function formatWindSegmentCount(count: number) {
  return `${count} ${count === 1 ? 'segment' : 'segments'}`
}

export default function WindSegmentsSection({
  segments,
  analysisWindow,
  onSegmentSelect,
  comparisonSegmentClassifications,
}: WindSegmentsSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()

  return (
    <section className="content-section maneuver-section wind-segments-section" aria-labelledby="wind-segments-title">
      <div className="maneuver-section__header">
        <p className="section-kicker" id="wind-segments-title">Wind Segments (P)</p>
        <span className="wind-context__reference" data-wind-segments-summary>{formatWindSegmentCount(segments.length)}</span>
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
        {segments.length === 0 ? (
          <p className="wind-context__note">No segments for P in the available range.</p>
        ) : (
          <table className="wind-context-table wind-segments__table" aria-label="P wind segments">
            <thead><tr>
              <th scope="col" className="wind-segments__segment-column">Segment</th>
              <th scope="col">Time (UTC)</th>
              <th scope="col">Duration</th>
              {comparisonSegmentClassifications !== undefined && <th scope="col">C</th>}
            </tr></thead>
            <tbody>
              {segments.map((segment, index) => {
                const current = windSegmentMatchesWindow(segment, analysisWindow)
                const label = formatWindSegmentKind(segment.kind)
                const time = `${formatGpsTime(segment.start)}–${formatGpsTime(segment.end)}`
                return (
                  <tr
                    key={`${segment.start}:${segment.end}`}
                    className={`wind-segments__row${segment.kind === 'unclassified' ? ' wind-segments__row--secondary' : ''}${current ? ' wind-segments__row--current' : ''}`}
                    data-wind-segment={segment.kind}
                    onClick={() => onSegmentSelect(segment)}
                  >
                    <td className="wind-segments__segment-column">
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
        )}
      </div>
    </section>
  )
}
