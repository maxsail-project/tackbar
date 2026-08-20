import type { ActivityOption } from '../types/session'
import { formatActivityLabel } from '../utils/activityLabel'

interface ActivitySelectorProps {
  label: string
  activities: ActivityOption[]
  selectedId: string | null
  onChange: (activityId: string | null) => void
  optional?: boolean
}

export default function ActivitySelector({
  label,
  activities,
  selectedId,
  onChange,
  optional = false,
}: ActivitySelectorProps) {
  return (
    <label className="activity-selector">
      <span className="section-kicker">{label}</span>
      <span className="select-wrap">
        <select
          value={selectedId ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          aria-label={label}
        >
          {optional && <option value="">+ Select another track</option>}
          {activities.map((activity) => (
            <option key={activity.activity_id} value={activity.activity_id}>
              {formatActivityLabel(activity)}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}
