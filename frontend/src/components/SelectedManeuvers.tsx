import { ACTIVITY_COLORS } from '../config/activityColors'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import {
  formatHeadingChange,
  formatKnots,
  formatSeconds,
} from '../utils/maneuverEvents'
import { compactSeconds, formatManeuverLoss, withUnit } from '../utils/maneuverLossFormat'
import { formatGpsTime } from '../utils/replay'

interface SelectedManeuversProps {
  current: DisplayManeuver | null
  previous: DisplayManeuver | null
}

function ManeuverRow({ event, position }: {
  event: DisplayManeuver | null
  position: 'Latest' | 'Previous'
}) {
  if (event === null) {
    return <tr>
      <th scope="row" className="selected-maneuvers__role" aria-label={`${position} selected maneuver: none`}>—</th>
      <td colSpan={5} className="selected-maneuvers__empty">No {position.toLowerCase()} selection</td>
    </tr>
  }

  const maneuver = event.maneuver
  const direction = maneuver.heading_change_deg !== null
    ? `${formatHeadingChange(maneuver.heading_change_deg)}°`
    : maneuver.course_change_deg !== null
      ? `${formatHeadingChange(maneuver.course_change_deg)}°`
      : '—'
  const role = event.activityRole === 'primary' ? 'P' : 'C'
  const loss = formatManeuverLoss(maneuver)
  const recovery = withUnit(formatSeconds(maneuver.recovery_time_s), 's')
  const recoveryText = compactSeconds(formatSeconds(maneuver.recovery_time_s))
  const entrySog = formatKnots(maneuver.sog_entry_kn)
  const minimumSog = formatKnots(maneuver.sog_min_kn)
  const exitSog = formatKnots(maneuver.sog_exit_kn)
  const sogTriplet = `${entrySog}/${minimumSog}/${exitSog}`
  const sogDisplay = [entrySog, minimumSog, exitSog].every(value => value === '—')
    ? sogTriplet
    : `${sogTriplet} kt`

  return <tr>
    <th scope="row" className="selected-maneuvers__role" style={{ color: ACTIVITY_COLORS[event.activityRole] }} aria-label={`${position} selected maneuver, ${role}`}>{role}</th>
    <td aria-label={`UTC time ${formatGpsTime(event.centerTimeMs)}`}>{formatGpsTime(event.centerTimeMs)}</td>
    <td aria-label={loss.ariaLabel}>{loss.text}</td>
    <td className="selected-maneuvers__recovery" aria-label={`Recovery ${recovery}`}>{recoveryText}</td>
    <td className="selected-maneuvers__sog" aria-label={`Entry SOG ${withUnit(formatKnots(maneuver.sog_entry_kn), 'knots')}, Minimum SOG ${withUnit(formatKnots(maneuver.sog_min_kn), 'knots')}, Exit SOG ${withUnit(formatKnots(maneuver.sog_exit_kn), 'knots')}`}>
      {sogDisplay}
    </td>
    <td aria-label={`Direction change ${direction}`}>{direction}</td>
  </tr>
}

export default function SelectedManeuvers({ current, previous }: SelectedManeuversProps) {
  return <section className="selected-maneuvers" aria-labelledby="selected-maneuvers-title">
    <table className="selected-maneuvers__table" aria-labelledby="selected-maneuvers-title">
      <thead>
        <tr>
          <th scope="col" className="selected-maneuvers__role-header"><span className="selected-maneuvers__sr-only">Activity</span></th>
          <th scope="col" className="selected-maneuvers__time" aria-label="Maneuver UTC time"><strong id="selected-maneuvers-title">MANEUVERS</strong></th>
          <th scope="col" className="selected-maneuvers__loss" aria-label="Loss distance and equivalent time">Loss</th>
          <th scope="col" className="selected-maneuvers__recovery">Rec</th>
          <th scope="col" className="selected-maneuvers__sog">SOG (in/min/out)</th>
          <th scope="col" className="selected-maneuvers__direction" aria-label="Direction change in degrees">Δ (°)</th>
        </tr>
      </thead>
      <tbody>
        <ManeuverRow event={current} position="Latest" />
        <ManeuverRow event={previous} position="Previous" />
      </tbody>
    </table>
  </section>
}
