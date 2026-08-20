import type { ActivityOption } from '../types/session'

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).find(Boolean)
}

function abbreviateParticipantId(participantId: string) {
  const normalizedId = participantId.trim()
  const atIndex = normalizedId.indexOf('@')

  return atIndex === -1 ? normalizedId : normalizedId.slice(0, atIndex + 1)
}

function utcHourMinute(timestamp: string) {
  const normalizedTimestamp = timestamp.trim()
  const timestampMatch = normalizedTimestamp.match(/(?:T|\s)(\d{2}:\d{2})/)
  const timeOnlyMatch = normalizedTimestamp.match(/^(\d{2}:\d{2})/)

  return timestampMatch?.[1] ?? timeOnlyMatch?.[1] ?? normalizedTimestamp
}

export function formatActivityLabel(activity: ActivityOption) {
  const { participant } = activity
  const identity = firstNonEmpty(
    participant.sail_number,
    participant.boat_name,
    participant.name,
  ) ?? abbreviateParticipantId(participant.id)

  return `${identity} · ${utcHourMinute(activity.start_time)}–${utcHourMinute(activity.end_time)}`
}
