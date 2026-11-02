import type { InferredSessionStart, SessionTimerActivity } from './sessionStarts'

export const SESSION_START_LINE_THRESHOLDS = { endpointToleranceMeters: 3, equivalentBearingDegrees: 10 } as const

export interface SessionStartLine {
  label: string
  time: number
  pin: { latitude: number, longitude: number } | null
  boat: { latitude: number, longitude: number } | null
}

function distanceMeters(a: { latitude: number, longitude: number }, b: { latitude: number, longitude: number }) {
  const radians = Math.PI / 180
  const lat1 = a.latitude * radians
  const lat2 = b.latitude * radians
  const dLat = (b.latitude - a.latitude) * radians
  const dLon = (b.longitude - a.longitude) * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function bearing(pin: { latitude: number, longitude: number }, boat: { latitude: number, longitude: number }) {
  const radians = Math.PI / 180
  const lat1 = pin.latitude * radians
  const lat2 = boat.latitude * radians
  const dLon = (boat.longitude - pin.longitude) * radians
  return (Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)) / radians + 360) % 360
}

function latestEndpoint(activity: SessionTimerActivity, start: number, endpointType: 0 | 1) {
  return (activity.line_positions ?? [])
    .map((position, sourceIndex) => ({ position, sourceIndex, time: Date.parse(position.timestamp) }))
    .filter(({ position, time }) => position.endpoint_type === endpointType && Number.isFinite(time) && time <= start)
    .sort((a, b) => b.time - a.time || b.sourceIndex - a.sourceIndex)[0]?.position ?? null
}

interface Candidate { activityId: string, point: { latitude: number, longitude: number } }

function consensus(candidates: Candidate[], tolerance: number) {
  const groups = new Map<string, Candidate[]>()
  for (const anchor of candidates) {
    const compatible = candidates.filter((candidate) => distanceMeters(anchor.point, candidate.point) <= tolerance)
    const byActivity = new Map<string, Candidate>()
    for (const candidate of compatible) {
      const current = byActivity.get(candidate.activityId)
      if (!current || distanceMeters(anchor.point, candidate.point) < distanceMeters(anchor.point, current.point)) byActivity.set(candidate.activityId, candidate)
    }
    const group = [...byActivity.values()]
    const key = group.map((item) => item.activityId).sort().join('|')
    if (!groups.has(key) || (groups.get(key)?.length ?? 0) < group.length) groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.length - a.length || a.map((item) => item.activityId).sort().join('|').localeCompare(b.map((item) => item.activityId).sort().join('|')))[0] ?? []
}

export function inferSessionStartLines(starts: InferredSessionStart[], activities: SessionTimerActivity[]): SessionStartLine[] {
  return starts.map((start) => {
    const pins: Candidate[] = []
    const boats: Candidate[] = []
    for (const activity of activities) {
      for (const [endpoint, target] of [[0, pins], [1, boats]] as const) {
        const observation = latestEndpoint(activity, start.time, endpoint)
        if (observation) target.push({ activityId: activity.activity_id, point: { latitude: observation.latitude, longitude: observation.longitude } })
      }
    }
    const pinGroup = consensus(pins, SESSION_START_LINE_THRESHOLDS.endpointToleranceMeters)
    const boatGroup = consensus(boats, SESSION_START_LINE_THRESHOLDS.endpointToleranceMeters)
    const pinOptions = pinGroup.length > 0 ? pinGroup : consensus(pins, SESSION_START_LINE_THRESHOLDS.endpointToleranceMeters)
    const boatOptions = boatGroup.length > 0 ? boatGroup : consensus(boats, SESSION_START_LINE_THRESHOLDS.endpointToleranceMeters)
    let pair: { pin: Candidate, boat: Candidate, length: number } | null = null
    for (const pin of pinOptions) for (const boat of boatOptions) {
      const length = distanceMeters(pin.point, boat.point)
      if (pair === null || length > pair.length) pair = { pin, boat, length }
    }
    return {
      label: start.label,
      time: start.time,
      pin: pair?.pin.point ?? pinGroup[0]?.point ?? pins[0]?.point ?? null,
      boat: pair?.boat.point ?? boatGroup[0]?.point ?? boats[0]?.point ?? null,
    }
  })
}

export function visibleDeduplicatedSessionStartLines(lines: SessionStartLine[], window: { start: number, end: number }): SessionStartLine[] {
  const visible = lines.filter((line) => line.time >= window.start && line.time <= window.end)
  const result: SessionStartLine[] = []
  for (const line of visible) {
    if (!line.pin || !line.boat) { result.push(line); continue }
    const angle = bearing(line.pin, line.boat)
    const equivalent = result.some((other) => {
      if (!other.pin || !other.boat) return false
      const otherAngle = bearing(other.pin, other.boat)
      const angleDifference = Math.min(Math.abs(angle - otherAngle), 360 - Math.abs(angle - otherAngle))
      return distanceMeters(line.pin!, other.pin!) <= SESSION_START_LINE_THRESHOLDS.endpointToleranceMeters
        && distanceMeters(line.boat!, other.boat!) <= SESSION_START_LINE_THRESHOLDS.endpointToleranceMeters
        && angleDifference < SESSION_START_LINE_THRESHOLDS.equivalentBearingDegrees
    })
    if (!equivalent) result.push(line)
  }
  return result
}
