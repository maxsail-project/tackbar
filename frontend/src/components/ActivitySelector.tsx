import type { SessionActivity } from '../types/session'
import { formatActivitySelectorLabel } from '../utils/activityLabel'

interface ActivitySelectorProps {
  label: string
  activities: SessionActivity[]
  selectedId: string | null
  onChange: (activityId: string | null) => void
  disabled?: boolean
  optional?: boolean
  labels?: ReadonlyMap<string, string>
}

export default function ActivitySelector({
  label,
  activities,
  selectedId,
  onChange,
  disabled = false,
  optional = false,
  labels,
}: ActivitySelectorProps) {
  return (
    <label className="activity-selector">
      <span className="section-kicker">{label}</span>
      <span className="select-wrap">
        <select
          value={selectedId ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          aria-label={label}
          disabled={disabled}
        >
          {optional && (
            <option value="">
              {disabled ? 'Comparison available in a later increment' : '+ Select another track'}
            </option>
          )}
          {activities.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {labels?.get(activity.id) ?? formatActivitySelectorLabel(activity)}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}
