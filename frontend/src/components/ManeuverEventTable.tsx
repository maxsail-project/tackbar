import { useId, useMemo, useRef, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { ActivityManeuverAnalytics } from '../types/maneuver'
import type { DisplayManeuver, ManeuverActivityRole } from '../utils/maneuverEvents'
import {
  formatHeadingChange,
  formatKnots,
  formatMetres,
  formatSeconds,
  maneuverSelectionKey,
} from '../utils/maneuverEvents'
import { formatGpsTime } from '../utils/replay'
import type { PreparedSogPopulation } from '../utils/typicalSogProfile'
import ManeuverSogComparison from './ManeuverSogComparison'

export type ManeuverPresentationStatus =
  | 'loading'
  | 'available'
  | 'unavailable'
  | 'error'

interface ManeuverEventTableProps {
  events: DisplayManeuver[]
  primaryStatus: ManeuverPresentationStatus
  comparisonStatus?: ManeuverPresentationStatus
  primaryDetectorMode?: ActivityManeuverAnalytics['detector_mode']
  comparisonDetectorMode?: ActivityManeuverAnalytics['detector_mode']
  selectedManeuverKey?: string | null
  onSelect: (event: DisplayManeuver) => void
  primaryProfilePopulation?: PreparedSogPopulation | null
  comparisonProfilePopulation?: PreparedSogPopulation | null
}

export type ManeuverSortDirection = 'asc' | 'desc'

export function sortManeuverEvents(
  events: DisplayManeuver[],
  direction: ManeuverSortDirection,
) {
  const timeMultiplier = direction === 'asc' ? 1 : -1

  return [...events].sort((first, second) => {
    const timeDifference = first.centerTimeMs - second.centerTimeMs
    if (timeDifference !== 0) return timeDifference * timeMultiplier
    if (first.activityRole !== second.activityRole) {
      return first.activityRole === 'primary' ? -1 : 1
    }
    const startDifference = first.maneuver.start_time.localeCompare(
      second.maneuver.start_time,
    )
    if (startDifference !== 0) return startDifference
    return first.maneuver.end_time.localeCompare(second.maneuver.end_time)
  })
}

export function toggledExpandedState(expanded: boolean) {
  return !expanded
}

export function toggledSortDirection(direction: ManeuverSortDirection) {
  return direction === 'asc' ? 'desc' : 'asc'
}

function roleLabel(role: ManeuverActivityRole) {
  return role === 'primary' ? 'P' : 'C'
}

export function ManeuverEventRow({
  event,
  selected,
  onSelect,
}: {
  event: DisplayManeuver
  selected: boolean
  onSelect: (event: DisplayManeuver) => void
}) {
  const label = roleLabel(event.activityRole)

  return (
    <tr
      className={`maneuver-event-table__row${selected
        ? ` maneuver-event-table__row--selected maneuver-event-table__row--${event.activityRole}`
        : ''}`}
      aria-selected={selected}
      onClick={() => onSelect(event)}
    >
      <td>
        <button
          type="button"
          className="maneuver-event-table__button"
          aria-label={`Move replay to ${formatGpsTime(event.centerTimeMs)} UTC, Activity ${label}`}
        >
          {formatGpsTime(event.centerTimeMs)}
        </button>
      </td>
      <td
        className="maneuver-event-table__activity"
        style={{ color: ACTIVITY_COLORS[event.activityRole] }}
      >
        {label}
      </td>
      <td>{formatMetres(event.maneuver.speed_loss_distance_m)}</td>
      <td>{formatSeconds(event.maneuver.speed_loss_time_s)}</td>
      <td>{formatSeconds(event.maneuver.recovery_time_s)}</td>
      <td>{formatKnots(event.maneuver.sog_entry_kn)}</td>
      <td>{formatKnots(event.maneuver.sog_min_kn)}</td>
      <td>{formatKnots(event.maneuver.sog_exit_kn)}</td>
      <td>{event.maneuver.heading_change_deg !== null
        ? `ΔHDG ${formatHeadingChange(event.maneuver.heading_change_deg)}`
        : event.maneuver.course_change_deg !== null
          ? `ΔCOG ${formatHeadingChange(event.maneuver.course_change_deg)}`
          : '—'}</td>
      <td>{formatSeconds(event.maneuver.duration_s)}</td>
    </tr>
  )
}

export default function ManeuverEventTable({
  events,
  primaryStatus,
  comparisonStatus,
  primaryDetectorMode,
  comparisonDetectorMode,
  selectedManeuverKey = null,
  onSelect,
  primaryProfilePopulation = null,
  comparisonProfilePopulation,
}: ManeuverEventTableProps) {
  const [expanded, setExpanded] = useState(false)
  const [helpExpanded, setHelpExpanded] = useState(false)
  const [sortDirection, setSortDirection] = useState<ManeuverSortDirection>('asc')
  const contentId = useId()
  const helpId = useId()
  const helpRef = useRef<HTMLDivElement>(null)
  const evidence = [
    { role: 'primary' as const, status: primaryStatus, mode: primaryDetectorMode },
    { role: 'comparison' as const, status: comparisonStatus, mode: comparisonDetectorMode },
  ].filter(({ status, mode }) => status === 'available' && (mode === 'HIGH' || mode === 'LOW'))
  const statuses = [primaryStatus, comparisonStatus].filter(
    (status): status is ManeuverPresentationStatus => status !== undefined,
  )
  const allSelectedAnalyticsAvailable = statuses.every(
    (status) => status === 'available',
  )
  const sortedEvents = useMemo(
    () => sortManeuverEvents(events, sortDirection),
    [events, sortDirection],
  )

  return (
    <section className="content-section maneuver-section" aria-labelledby="maneuver-title">
      <div className="maneuver-section__header">
        <p className="section-kicker" id="maneuver-title">Maneuvers</p>
        <button
          type="button"
          className="maneuver-section__collapse"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => {
            helpRef.current?.hidePopover()
            setExpanded((current) => toggledExpandedState(current))
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div id={contentId} hidden={!expanded}>
          {evidence.length > 0 && <>
            <div className="maneuver-evidence">
              {evidence.map(({ role, mode }) => (
                <span key={role} style={{ color: ACTIVITY_COLORS[role] }}>
                  {roleLabel(role)} · {mode} evidence
                </span>
              ))}
              <button
                type="button"
                className="maneuver-evidence__info"
                aria-label="About maneuver evidence"
                aria-expanded={helpExpanded}
                aria-controls={helpId}
                popoverTarget={helpId}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v6" />
                  <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
            <div id={helpId} ref={helpRef} className="maneuver-evidence__help" popover="auto"
              role="note" aria-labelledby={`${helpId}-title`}
              onToggle={(event) => setHelpExpanded(event.newState === 'open')}
            >
              <h3 id={`${helpId}-title`}>Maneuver detection evidence</h3>
              <p><strong>HIGH evidence:</strong> Detection based on heading (HDG), with supporting signals such as heel (HEEL), course (COG), and speed (SOG) when available.</p>
              <p><strong>LOW evidence:</strong> Detection based on course (COG) and speed (SOG).</p>
              <p className="maneuver-evidence__secondary">HIGH uses richer telemetry, but neither level guarantees detection accuracy or indicates overall track quality.</p>
              <p className="maneuver-evidence__secondary">ΔHDG = heading change · ΔCOG = course change</p>
            </div>
          </>}
          <div className="maneuver-statuses" aria-live="polite">
            {primaryStatus === 'loading' && <p>Loading maneuver analytics for P…</p>}
            {(primaryStatus === 'unavailable' || primaryStatus === 'error') && (
              <p>Maneuver analytics unavailable for P.</p>
            )}
            {comparisonStatus === 'loading' && <p>Loading maneuver analytics for C…</p>}
            {(comparisonStatus === 'unavailable' || comparisonStatus === 'error') && (
              <p>Maneuver analytics unavailable for C.</p>
            )}
          </div>

          {events.length > 0 ? (
            <div className="maneuver-event-table-wrap">
              <table className="maneuver-event-table" aria-label="Detected maneuvers">
                <colgroup>
                  <col className="maneuver-event-table__time-column" />
                  <col className="maneuver-event-table__activity-column" />
                  <col className="maneuver-event-table__loss-column" span={2} />
                  <col className="maneuver-event-table__recovery-column" />
                  <col className="maneuver-event-table__sog-column" span={3} />
                  <col className="maneuver-event-table__heading-column" />
                  <col className="maneuver-event-table__duration-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" aria-sort={sortDirection === 'asc' ? 'ascending' : 'descending'}>
                      <button
                        type="button"
                        className="maneuver-event-table__sort"
                        aria-label={`Sort maneuvers by time ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
                        onClick={() => setSortDirection((current) => toggledSortDirection(current))}
                      >
                        Time {sortDirection.toUpperCase()}
                      </button>
                    </th>
                    <th scope="col">Act</th>
                    <th scope="col">Loss (m)</th>
                    <th scope="col">Loss (s)</th>
                    <th scope="col">Rec (s)</th>
                    <th scope="col">SOG in</th>
                    <th scope="col">SOG min</th>
                    <th scope="col">SOG out</th>
                    <th scope="col">Δ (°)</th>
                    <th scope="col">Dur (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEvents.map((event) => (
                    <ManeuverEventRow
                      key={`${event.activityRole}:${event.maneuver.start_time}:${event.maneuver.center_time}:${event.maneuver.end_time}`}
                      event={event}
                      selected={maneuverSelectionKey(event) === selectedManeuverKey}
                      onSelect={onSelect}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : allSelectedAnalyticsAvailable ? (
            <p className="maneuver-empty">No maneuvers detected in this Analysis Window.</p>
          ) : null}
          <ManeuverSogComparison primary={primaryProfilePopulation} comparison={comparisonProfilePopulation} />
      </div>
    </section>
  )
}
