import type { ManeuverProfilePoint } from './maneuverProfiles'
import type { ManeuverCourseReferences } from './maneuverCourseChange'

function shortestTurn(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

/** Keep source offsets and continuity, but express each segment on the entry-to-exit turn axis. */
export function relativeCogProfile(
  points: readonly ManeuverProfilePoint[],
  references: ManeuverCourseReferences | null,
): ManeuverProfilePoint[] | null {
  if (references === null) return null
  const turn = references.signedChangeDeg
  if (!Number.isFinite(turn) || Math.abs(turn) < 1e-9 || Math.abs(Math.abs(turn) - 180) < 1e-9) return null
  const orientation = Math.sign(turn)
  const midpoint = Math.abs(turn) / 2
  const result: ManeuverProfilePoint[] = []
  let previous: ManeuverProfilePoint | null = null
  let unwrapped = 0
  for (const point of points) {
    const step = previous !== null && point.connectToPrevious
      ? shortestTurn(previous.value, point.value) : shortestTurn(references.entryDeg, point.value)
    // Exactly 180 degrees has no unique direction. Do not connect across it.
    if (Math.abs(Math.abs(step) - 180) < 1e-9) {
      previous = null
      continue
    }
    unwrapped = previous !== null && point.connectToPrevious ? unwrapped + step : step
    result.push({ ...point, value: orientation * unwrapped - midpoint,
      connectToPrevious: previous !== null && point.connectToPrevious })
    previous = point
  }
  return result
}

export function relativeCogAxisBounds(...series: readonly { sog: number | null }[][]) {
  const values = series.flat().flatMap((point) => point.sog === null ? [] : [point.sog])
  const halfSpan = values.length === 0 ? 10 : Math.max(10, Math.ceil(Math.max(...values.map(Math.abs)) / 10) * 10)
  return { minimum: -halfSpan, maximum: halfSpan }
}
