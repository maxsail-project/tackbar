import type { AnalysisWindowRange } from './analysisWindow'
import type { InferredSessionStart, SessionTimerActivity } from './sessionStarts'

/** VKX `RACE_END` timer observation type (#220 D3, D7). */
export const RACE_END_EVENT_TYPE = 4

export interface SessionRaceSettings {
  /** Pre-start margin before the inferred Session Start (#220 D2). */
  preStartMarginSeconds: number
}

export const SESSION_RACE_SETTINGS: Readonly<SessionRaceSettings> = {
  preStartMarginSeconds: 300,
}

/** Ephemeral Viewer race shortcut; not a persisted or official Race (#220 D5). */
export interface InferredSessionRace {
  /** `R<n>`, reusing the number of its Session Start `S<n>` (#220 D8). */
  label: string
  startTime: number
  endTime: number
  /** Requested Analysis Window `[start − margin, end]`, before clamping. */
  window: AnalysisWindowRange
}

function raceEndTimes(activities: SessionTimerActivity[]): number[] {
  return activities.flatMap((activity) => activity.race_timer_events
    .filter((event) => event.event_type === RACE_END_EVENT_TYPE)
    .map((event) => Date.parse(event.timestamp))
    .filter(Number.isFinite))
}

/**
 * Anchor each Session Start `Sn` on its race end. A course Start with a course `end_utc` ends
 * there (#242 D10); otherwise the latest valid `RACE_END` of any visible Activity strictly
 * after `Sn` and before `Sn+1` (no upper bound for the last Start). A Start without such an
 * end yields no race (#220 D3).
 */
export function inferSessionRaces(
  starts: (InferredSessionStart & { courseEndTime?: number | null })[],
  activities: SessionTimerActivity[],
  settings: Partial<SessionRaceSettings> = {},
): InferredSessionRace[] {
  const { preStartMarginSeconds } = { ...SESSION_RACE_SETTINGS, ...settings }
  const ends = raceEndTimes(activities)
  const orderedStarts = [...starts].sort((a, b) => a.time - b.time)
  return orderedStarts.flatMap((start, index) => {
    const nextStartTime = orderedStarts[index + 1]?.time ?? Number.POSITIVE_INFINITY
    const candidates = ends.filter((time) => time > start.time && time < nextStartTime)
    const endTime = start.courseEndTime ?? (candidates.length === 0 ? null : Math.max(...candidates))
    if (endTime === null) return []
    return [{
      label: start.label.replace(/^S/, 'R'),
      startTime: start.time,
      endTime,
      window: { start: start.time - preStartMarginSeconds * 1_000, end: endTime },
    }]
  })
}
