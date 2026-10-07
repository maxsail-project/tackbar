import { ACTIVITY_COLORS } from '../config/activityColors'
import type { DisplayManeuver, ManeuverActivityRole } from '../utils/maneuverEvents'
import { formatHeadingChange } from '../utils/maneuverEvents'
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
    </tr>
  )
}

export default function ManeuverEventTable({
  events,
  primaryStatus,
  comparisonStatus,
  onSelect,
}: ManeuverEventTableProps) {
  const statuses = [primaryStatus, comparisonStatus].filter(
    (status): status is ManeuverPresentationStatus => status !== undefined,
  )
  const hasAvailableAnalytics = statuses.includes('available')
  const hasLoadingAnalytics = statuses.includes('loading')

  return (
    <section className="content-section maneuver-section" aria-labelledby="maneuver-title">
      <p className="section-kicker" id="maneuver-title">Maneuvers</p>

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
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Activity</th>
                <th scope="col">ΔHDG</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <ManeuverEventRow
                  key={`${event.activityRole}:${event.maneuver.start_time}:${event.maneuver.center_time}:${event.maneuver.end_time}`}
                  event={event}
                  onSelect={onSelect}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : !hasLoadingAnalytics && hasAvailableAnalytics ? (
        <p className="maneuver-empty">No maneuvers detected in this Analysis Window.</p>
      ) : null}
    </section>
  )
}
