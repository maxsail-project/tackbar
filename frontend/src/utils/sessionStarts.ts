export interface SessionTimerActivity {
  activity_id: string
  race_timer_events: { timestamp: string, event_type: number }[]
  line_positions?: { timestamp: string, endpoint_type: 0 | 1, latitude: number, longitude: number }[]
}

export interface SessionStartThresholds {
  synchronizationToleranceMs: number
  distinctStartGapMs: number
}

export interface InferredSessionStart {
  label: string
  time: number
  activityIds: string[]
}

export interface ActivityStartCandidate {
  activityId: string
  time: number
  sourceIndex: number
}

export const SESSION_START_THRESHOLDS: Readonly<SessionStartThresholds> = {
  synchronizationToleranceMs: 3_000,
  distinctStartGapMs: 300_000,
}

/** Preserve every valid timer-zero observation as an Activity candidate. */
export function extractActivityStartCandidates(activity: SessionTimerActivity): ActivityStartCandidate[] {
  return activity.race_timer_events
    .map((event, sourceIndex) => ({
      eventType: event.event_type,
      time: Date.parse(event.timestamp),
      sourceIndex,
    }))
    .filter((event) => Number.isFinite(event.time) && event.eventType === 3)
    .sort((a, b) => a.time - b.time || a.sourceIndex - b.sourceIndex)
    .map((event) => ({ activityId: activity.activity_id, time: event.time, sourceIndex: event.sourceIndex }))
}

interface SynchronizationGroup {
  time: number
  activityIds: string[]
}

function median(times: number[]): number {
  const middle = Math.floor(times.length / 2)
  return times.length % 2 === 1 ? times[middle] : (times[middle - 1] + times[middle]) / 2
}

/** Each candidate anchors a maximum-span window; one latest candidate per Activity contributes. */
function synchronizationGroups(candidates: ActivityStartCandidate[], toleranceMs: number): SynchronizationGroup[] {
  const ordered = [...candidates].sort((a, b) => a.time - b.time || a.activityId.localeCompare(b.activityId) || a.sourceIndex - b.sourceIndex)
  const groups = new Map<string, SynchronizationGroup>()

  for (const anchor of ordered) {
    const byActivity = new Map<string, ActivityStartCandidate>()
    for (const candidate of ordered) {
      if (candidate.time < anchor.time) continue
      if (candidate.time - anchor.time > toleranceMs) break
      byActivity.set(candidate.activityId, candidate)
    }
    const contributors = [...byActivity.values()].sort((a, b) => a.time - b.time || a.activityId.localeCompare(b.activityId))
    const activityIds = contributors.map((candidate) => candidate.activityId).sort()
    const time = median(contributors.map((candidate) => candidate.time))
    const key = `${time}:${activityIds.join('\u0000')}`
    groups.set(key, { time, activityIds })
  }
  return [...groups.values()]
}

/** Infer ephemeral Session starts from every authorized, visible Activity. */
export function inferSessionStarts(
  activities: SessionTimerActivity[],
  thresholds: Partial<SessionStartThresholds> = {},
): InferredSessionStart[] {
  const { synchronizationToleranceMs, distinctStartGapMs } = {
    ...SESSION_START_THRESHOLDS,
    ...thresholds,
  }
  const candidates = activities.flatMap(extractActivityStartCandidates)
  if (candidates.length === 0) return []

  const contributorCount = new Set(candidates.map((candidate) => candidate.activityId)).size
  const eligibleGroups = synchronizationGroups(candidates, synchronizationToleranceMs)
    .filter((group) => contributorCount === 1 || group.activityIds.length >= 2)
    .sort((a, b) =>
      b.activityIds.length - a.activityIds.length
      || b.time - a.time
      || a.activityIds.join('\u0000').localeCompare(b.activityIds.join('\u0000')),
    )

  const selected: SynchronizationGroup[] = []
  for (const group of eligibleGroups) {
    if (selected.every((winner) => Math.abs(group.time - winner.time) >= distinctStartGapMs)) {
      selected.push(group)
    }
  }
  return selected
    .sort((a, b) => a.time - b.time)
    .map((group, index) => ({
      label: `S${index + 1}`,
      time: group.time,
      activityIds: group.activityIds,
    }))
}
