import { ACTIVITY_COLORS } from '../config/activityColors'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import {
  formatHeadingChange,
  formatKnots,
  formatMetres,
  formatSeconds,
} from '../utils/maneuverEvents'
import { formatGpsTime } from '../utils/replay'

interface SelectedManeuversProps {
  current: DisplayManeuver | null
  previous: DisplayManeuver | null
}

function withUnit(value: string, unit: string) {
  return value === '—' ? value : `${value} ${unit}`
}

function ManeuverMetrics({ event, position }: {
  event: DisplayManeuver | null
  position: 'Latest' | 'Previous'
}) {
  if (event === null) {
    return <div className="selected-maneuvers__record selected-maneuvers__record--empty" role="listitem">
      <span>No {position.toLowerCase()} selection</span>
    </div>
  }

  const maneuver = event.maneuver
  const direction = maneuver.heading_change_deg !== null
    ? `ΔHDG ${formatHeadingChange(maneuver.heading_change_deg)}°`
    : maneuver.course_change_deg !== null
      ? `ΔCOG ${formatHeadingChange(maneuver.course_change_deg)}°`
      : '—'
  const role = event.activityRole === 'primary' ? 'P' : 'C'

  return <div className="selected-maneuvers__record" role="listitem">
    <span className="selected-maneuvers__sr-only">{position} selected maneuver, {role}. </span>
    <span aria-label={`UTC time ${formatGpsTime(event.centerTimeMs)}`}>{formatGpsTime(event.centerTimeMs)} UTC</span>
    <span aria-label={`Loss distance ${withUnit(formatMetres(maneuver.speed_loss_distance_m), 'm')}; equivalent Loss time ${withUnit(formatSeconds(maneuver.speed_loss_time_s), 's')}`}>
      Loss {withUnit(formatMetres(maneuver.speed_loss_distance_m), 'm')} / {withUnit(formatSeconds(maneuver.speed_loss_time_s), 's')}
    </span>
    <span aria-label={`Recovery ${withUnit(formatSeconds(maneuver.recovery_time_s), 's')}`}>
      Rec {withUnit(formatSeconds(maneuver.recovery_time_s), 's')}
    </span>
    <span aria-label={`Entry SOG ${formatKnots(maneuver.sog_entry_kn)}, Minimum SOG ${formatKnots(maneuver.sog_min_kn)}, Exit SOG ${formatKnots(maneuver.sog_exit_kn)} knots`}>
      SOG {formatKnots(maneuver.sog_entry_kn)} / {formatKnots(maneuver.sog_min_kn)} / {formatKnots(maneuver.sog_exit_kn)} kn
    </span>
    <span aria-label={`Direction change ${direction}`}>{direction}</span>
    <span aria-label={`Duration ${withUnit(formatSeconds(maneuver.duration_s), 's')}`}>
      Dur {withUnit(formatSeconds(maneuver.duration_s), 's')}
    </span>
  </div>
}

export default function SelectedManeuvers({ current, previous }: SelectedManeuversProps) {
  return <section className="selected-maneuvers" aria-labelledby="selected-maneuvers-title">
    <h2 id="selected-maneuvers-title">Selected Maneuvers</h2>
    <div className="selected-maneuvers__body">
      <div className="selected-maneuvers__roles" aria-hidden="true">
        <span style={current ? { color: ACTIVITY_COLORS[current.activityRole] } : undefined}>
          {current ? current.activityRole === 'primary' ? 'P' : 'C' : '—'}
        </span>
        <span style={previous ? { color: ACTIVITY_COLORS[previous.activityRole] } : undefined}>
          {previous ? previous.activityRole === 'primary' ? 'P' : 'C' : '—'}
        </span>
      </div>
      <div className="selected-maneuvers__scroll" role="list" tabIndex={0} aria-label="Latest and previous selected maneuver metrics; scroll horizontally for all values">
        <ManeuverMetrics event={current} position="Latest" />
        <ManeuverMetrics event={previous} position="Previous" />
      </div>
    </div>
  </section>
}
