import type { SessionActivity } from '../types/session'

interface Interval {
  id: string
  start: number
  end: number
  duration: number
  score: number
}

export function initialPrimaryActivityId(activities: SessionActivity[]): string {
  const intervals: Interval[] = activities.map((activity) => {
    const start = Date.parse(activity.start_time)
    const end = Date.parse(activity.end_time)
    const valid = Number.isFinite(start) && Number.isFinite(end) && end > start
    return {
      id: activity.id,
      start,
      end,
      duration: valid ? end - start : 0,
      score: 0,
    }
  })

  for (let i = 0; i < intervals.length; i += 1) {
    const current = intervals[i]
    if (current.duration === 0) continue
    for (let j = i + 1; j < intervals.length; j += 1) {
      const other = intervals[j]
      if (other.duration === 0) continue
      const overlap = Math.max(0, Math.min(current.end, other.end) - Math.max(current.start, other.start))
      current.score += overlap
      other.score += overlap
    }
  }

  // Scores and durations are nonnegative; ascending Activity ID settles every remaining tie.
  const best = intervals.reduce<Interval | null>((winner, candidate) => {
    if (!winner || candidate.score > winner.score) return candidate
    if (candidate.score < winner.score) return winner
    if (candidate.duration > winner.duration) return candidate
    if (candidate.duration < winner.duration) return winner
    return candidate.id < winner.id ? candidate : winner
  }, null)
  return best?.id ?? ''
}
