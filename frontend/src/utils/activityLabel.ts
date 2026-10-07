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
  return formatActivityIdentity(activity)
}

export function formatActivitySelectorLabel(activity: SessionActivity) {
  const identity = formatActivitySelectorIdentity(activity)

  return `${identity} · ${utcHourMinute(activity.start_time)}–${utcHourMinute(activity.end_time)}`
}
