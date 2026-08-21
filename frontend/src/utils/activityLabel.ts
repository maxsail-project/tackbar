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
  return firstNonEmpty(
    activity.boat?.sail_number,
    activity.boat?.name,
    activity.sailor.name,
    activity.sailor.email,
    activity.sailor.id,
  ) ?? 'Activity'
}

export function formatActivityLabel(activity: SessionActivity) {
  const identity = formatActivityIdentity(activity)

  return `${identity} · ${utcHourMinute(activity.start_time)}–${utcHourMinute(activity.end_time)}`
}
