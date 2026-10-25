import type { Maneuver } from '../types/maneuver'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { timestampToMilliseconds } from './replay'

type CourseSample = { time: number, cog: number }
export type PreparedCourseRun = { times: number[], smoothed: (number | null)[] }

function firstTimeAtOrAfter(times: readonly number[], target: number, strict: boolean): number {
  let low = 0
  let high = times.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (strict ? times[middle] <= target : times[middle] < target) low = middle + 1
    else high = middle
  }
  return low
}

function circularMean(values: number[]): number | null {
  if (values.length === 0) return null
  const sine = values.reduce((sum, value) => sum + Math.sin(value * Math.PI / 180), 0)
  const cosine = values.reduce((sum, value) => sum + Math.cos(value * Math.PI / 180), 0)
  if (Math.hypot(sine, cosine) <= 1e-12 * values.length) return null
  return ((Math.atan2(sine, cosine) * 180 / Math.PI) + 360) % 360
}

function continuousRuns(samples: readonly TrackSample[], window: AnalysisWindowRange): CourseSample[][] {
  const runs: CourseSample[][] = []
  let run: CourseSample[] = []
  const finish = () => { if (run.length > 0) runs.push(run); run = [] }
  for (const sample of samples) {
    let time: number
    try { time = timestampToMilliseconds(sample.utc) } catch { finish(); continue }
    if (time < window.start || time > window.end) { finish(); continue }
    if (sample.cog === null || !Number.isFinite(sample.cog)
      || sample.sog === null || !Number.isFinite(sample.sog) || sample.sog < 0) {
      finish()
      continue
    }
    if (run.length > 0 && (time <= run.at(-1)!.time || time - run.at(-1)!.time > 10_000)) finish()
    run.push({ time, cog: ((sample.cog % 360) + 360) % 360 })
  }
  finish()
  return runs
}

export function prepareCourseEvidence(samples: readonly TrackSample[], window: AnalysisWindowRange): PreparedCourseRun[] {
  return continuousRuns(samples, window).map((run) => {
    let left = 0
    let right = 0
    const smoothed = run.map((point) => {
      while (run[left].time < point.time - 2_000) left += 1
      while (right < run.length && run[right].time <= point.time + 2_000) right += 1
      return circularMean(run.slice(left, right).map((neighbor) => neighbor.cog))
    })
    return { times: run.map((point) => point.time), smoothed }
  })
}

/** LOW Phases contextual |ΔCOG|, derived only for the common maneuver filter. */
export function maneuverCourseChangeMagnitude(
  maneuver: Maneuver,
  samples: readonly TrackSample[],
  window: AnalysisWindowRange,
): number | null {
  return maneuverCourseChangeFromEvidence(maneuver, prepareCourseEvidence(samples, window), window)
}

export function maneuverCourseChangeFromEvidence(
  maneuver: Maneuver,
  runs: readonly PreparedCourseRun[],
  window: AnalysisWindowRange,
): number | null {
  let start: number
  let end: number
  try {
    start = timestampToMilliseconds(maneuver.start_time)
    end = timestampToMilliseconds(maneuver.end_time)
  } catch { return null }
  if (start > end || !Number.isFinite(window.start) || !Number.isFinite(window.end)) return null

  for (const run of runs) {
    if (run.times[0] > start || run.times.at(-1)! < end) continue
    const pre = run.smoothed.slice(
      firstTimeAtOrAfter(run.times, start - 10_000, false),
      firstTimeAtOrAfter(run.times, start - 2_000, false),
    ).filter((value) => value !== null) as number[]
    const post = run.smoothed.slice(
      firstTimeAtOrAfter(run.times, end + 2_000, true),
      firstTimeAtOrAfter(run.times, end + 10_000, true),
    ).filter((value) => value !== null) as number[]
    if (pre.length < 3 || post.length < 3) continue
    const before = circularMean(pre)
    const after = circularMean(post)
    if (before === null || after === null) continue
    return Math.abs(((after - before + 540) % 360) - 180)
  }
  return null
}
