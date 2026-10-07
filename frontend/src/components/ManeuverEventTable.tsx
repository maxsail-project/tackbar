import { useId, useMemo, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { DisplayManeuver, ManeuverActivityRole } from '../utils/maneuverEvents'
import {
  formatHeadingChange,
  formatKnots,
  formatMetres,
  formatSeconds,
} from '../utils/maneuverEvents'
import { formatGpsTime } from '../utils/replay'

export type ManeuverPresentationStatus =
  | 'loading'
  | 'available'
  | 'unavailable'
  | 'error'

interface ManeuverEventTableProps {
  events: DisplayManeuver[]
  primaryStatus: ManeuverPresentationStatus
  comparisonStatus?: ManeuverPresentationStatus
  onSelect: (centerTimeMs: number) => void
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
  onSelect,
}: {
  event: DisplayManeuver
  onSelect: (centerTimeMs: number) => void
}) {
  const label = roleLabel(event.activityRole)

  return (
    <tr
      className="maneuver-event-table__row"
      onClick={() => onSelect(event.centerTimeMs)}
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
      <td>{formatHeadingChange(event.maneuver.heading_change_deg)}</td>
      <td>{formatSeconds(event.maneuver.duration_s)}</td>
      <td>{formatKnots(event.maneuver.sog_entry_kn)}</td>
      <td>{formatKnots(event.maneuver.sog_min_kn)}</td>
      <td>{formatKnots(event.maneuver.sog_exit_kn)}</td>
      <td>{formatSeconds(event.maneuver.recovery_time_s)}</td>
      <td>{formatMetres(event.maneuver.speed_loss_distance_m)}</td>
      <td>{formatSeconds(event.maneuver.speed_loss_time_s)}</td>
    </tr>
  )
}

export default function ManeuverEventTable({
  events,
  primaryStatus,
  comparisonStatus,
  onSelect,
}: ManeuverEventTableProps) {
  const [expanded, setExpanded] = useState(false)
  const [sortDirection, setSortDirection] = useState<ManeuverSortDirection>('asc')
  const contentId = useId()
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
          onClick={() => setExpanded((current) => toggledExpandedState(current))}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div id={contentId} hidden={!expanded}>
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
                  <col className="maneuver-event-table__heading-column" />
                  <col className="maneuver-event-table__duration-column" />
                  <col className="maneuver-event-table__sog-column" span={3} />
                  <col className="maneuver-event-table__recovery-column" />
                  <col className="maneuver-event-table__loss-column" span={2} />
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
                    <th scope="col">ΔHDG (°)</th>
                    <th scope="col">Dur (s)</th>
                    <th scope="col">SOG in (kt)</th>
                    <th scope="col">SOG min (kt)</th>
                    <th scope="col">SOG out (kt)</th>
                    <th scope="col">Rec (s)</th>
                    <th scope="col">Loss (m)</th>
                    <th scope="col">Loss (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEvents.map((event) => (
                    <ManeuverEventRow
                      key={`${event.activityRole}:${event.maneuver.start_time}:${event.maneuver.center_time}:${event.maneuver.end_time}`}
                      event={event}
                      onSelect={onSelect}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : allSelectedAnalyticsAvailable ? (
            <p className="maneuver-empty">No maneuvers detected in this Analysis Window.</p>
          ) : null}
      </div>
    </section>
  )
}
