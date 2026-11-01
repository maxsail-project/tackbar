import type { SessionActivity } from '../types/session'

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).find(Boolean)
}

function utcHourMinute(timestamp: string) {
  const normalizedTimestamp = timestamp.trim()
  const timestampMatch = normalizedTimestamp.match(/(?:T|\s)(\d{2}:\d{2})/)
  const timeOnlyMatch = normalizedTimestamp.match(/^(\d{2}:\d{2})/)

  return timestampMatch?.[1] ?? timeOnlyMatch?.[1] ?? normalizedTimestamp
}

export function formatActivityIdentity(activity: SessionActivity) {
  const boatIdentity = firstNonEmpty(activity.boat?.sail_number, activity.boat?.name)
  if (boatIdentity) return boatIdentity

  const sailorName = firstNonEmpty(activity.sailor.name)
  if (sailorName) return sailorName

  const sailorEmail = firstNonEmpty(activity.sailor.email)
  if (sailorEmail) {
    const atIndex = sailorEmail.indexOf('@')
    return atIndex >= 0 ? sailorEmail.slice(0, atIndex + 1) : sailorEmail
  }

  return firstNonEmpty(activity.sailor.id) ?? 'Activity'
}

export function formatActivityLabel(activity: SessionActivity) {
  const identity = formatActivityIdentity(activity)

  return `${identity} · ${utcHourMinute(activity.start_time)}–${utcHourMinute(activity.end_time)}`
}

export function formatActivitySelectorIdentity(activity: SessionActivity) {
  return firstNonEmpty(
    activity.boat?.sail_number,
    activity.boat?.name,
    activity.boat?.sailing_class,
    activity.device_label,
    activity.device_name,
  ) ?? formatActivityIdentity(activity)
}

export function formatActivitySelectorLabel(activity: SessionActivity) {
  const identity = formatActivitySelectorIdentity(activity)

  return `${identity} · ${utcHourMinute(activity.start_time)}–${utcHourMinute(activity.end_time)}`
}

export function buildActivitySelectorLabels(activities: SessionActivity[]): Map<string, string> {
  const groups = new Map<string, SessionActivity[]>()
  for (const activity of activities) {
    const label = formatActivitySelectorLabel(activity)
    const group = groups.get(label) ?? []
    group.push(activity)
    groups.set(label, group)
  }

  const labels = new Map<string, string>()
  for (const [label, group] of groups) {
    if (group.length === 1) {
      labels.set(group[0].id, label)
      continue
    }
    const ordered = [...group].sort((left, right) => {
      const leftTime = Date.parse(left.start_time)
      const rightTime = Date.parse(right.start_time)
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        if (leftTime !== rightTime) return leftTime - rightTime
      } else if (left.start_time !== right.start_time) {
        return left.start_time < right.start_time ? -1 : 1
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
    ordered.forEach((activity, index) => labels.set(activity.id, `${label} #${index + 1}`))
  }
  return labels
}
