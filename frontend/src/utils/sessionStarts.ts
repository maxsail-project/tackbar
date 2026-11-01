export interface SessionTimerActivity {
  activity_id: string
  race_timer_events: { timestamp: string, event_type: number }[]
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

/** Keep the final timer-zero in each delimited or well-separated timer cycle. */
export function extractActivityStartCandidates(
  activity: SessionTimerActivity,
  distinctStartGapMs = SESSION_START_THRESHOLDS.distinctStartGapMs,
): ActivityStartCandidate[] {
  const events = activity.race_timer_events
    .map((event, sourceIndex) => ({
      eventType: event.event_type,
      time: Date.parse(event.timestamp),
      sourceIndex,
    }))
    .filter((event) => Number.isFinite(event.time) && (event.eventType === 1 || event.eventType === 3 || event.eventType === 4))
    .sort((a, b) => a.time - b.time || a.sourceIndex - b.sourceIndex)

  const candidates: ActivityStartCandidate[] = []
  let lastStart: typeof events[number] | null = null
  const finishCycle = () => {
    if (lastStart) {
      candidates.push({ activityId: activity.activity_id, time: lastStart.time, sourceIndex: lastStart.sourceIndex })
    }
    lastStart = null
  }
  for (const event of events) {
    if (event.eventType === 3) {
      if (lastStart && event.time - lastStart.time >= distinctStartGapMs) finishCycle()
      lastStart = event
    } else {
      // RACE_END always closes a period; a new timer START closes it only after timer zero.
      finishCycle()
    }
  }
  finishCycle()
  return candidates
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
  const candidates = activities.flatMap((activity) => extractActivityStartCandidates(activity, distinctStartGapMs))
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
      label: `S${String(index + 1).padStart(2, '0')}`,
      time: group.time,
      activityIds: group.activityIds,
    }))
}
