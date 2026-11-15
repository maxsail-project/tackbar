import type { HistoricalConditions } from '../types/session'

export type TwdReference =
  | { status: 'unavailable' }
  | {
      status: 'available'
      directionDegrees: number
      sourceKind: 'modelled_weather'
      sourceTimeUtc: string
      provenance: { provider: string | null }
    }

interface ValidWindSample {
  time: number
  direction: number
}

/** Persisted samples with finite wind direction and an explicit-timezone UTC time, in source order. */
function validWindSamples(conditions: HistoricalConditions | null): ValidWindSample[] {
  const samples: ValidWindSample[] = []
  for (const sample of conditions?.hourly ?? []) {
    const direction = sample.wind_direction_10m_deg
    if (direction === null || !Number.isFinite(direction)) continue

    // Require an explicit timezone so a local browser timezone cannot change selection.
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(sample.time)) continue
    const time = Date.parse(sample.time)
    if (!Number.isFinite(time)) continue
    samples.push({ time, direction })
  }
  return samples
}

/** Resolve original modelled TWD at a UTC instant, independent of Viewer presentation. */
export function resolveTwdReference(
  targetUtcMs: number,
  conditions: HistoricalConditions | null,
): TwdReference {
  if (!Number.isFinite(targetUtcMs) || !conditions?.hourly.length) {
    return { status: 'unavailable' }
  }

  let selectedDirection: number | null = null
  let selectedTime = 0
  let selectedDistance = Number.POSITIVE_INFINITY

  for (const { time: sampleTime, direction } of validWindSamples(conditions)) {
    const distance = Math.abs(sampleTime - targetUtcMs)
    if (distance < selectedDistance || (distance === selectedDistance && sampleTime < selectedTime)) {
      selectedDirection = direction
      selectedTime = sampleTime
      selectedDistance = distance
    }
  }

  if (selectedDirection === null) return { status: 'unavailable' }

  return {
    status: 'available',
    directionDegrees: selectedDirection,
    sourceKind: 'modelled_weather',
    sourceTimeUtc: new Date(selectedTime).toISOString(),
    provenance: { provider: conditions.weather_source?.provider ?? null },
  }
}

/**
 * Original unrounded modelled TWD for any UTC instant with the same nearest-sample and
 * earlier-tie rule as `resolveTwdReference`, pre-sorted for repeated per-sample lookups.
 * Returns null when no valid modelled direction exists.
 */
export function createTwdTimeResolver(
  conditions: HistoricalConditions | null,
): ((targetUtcMs: number) => number) | null {
  const sorted: ValidWindSample[] = []
  // Stable sort; for equal times keep the first source sample, as the linear rule does.
  for (const sample of [...validWindSamples(conditions)].sort((first, second) => first.time - second.time)) {
    if (sorted.length === 0 || sorted[sorted.length - 1].time !== sample.time) sorted.push(sample)
  }
  if (sorted.length === 0) return null

  return (targetUtcMs: number) => {
    let low = 0
    let high = sorted.length - 1
    // Last sample at or before the target (or the first sample when none).
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (sorted[middle].time <= targetUtcMs) low = middle
      else high = middle - 1
    }
    const before = sorted[low]
    const after = sorted[low + 1]
    if (after === undefined || before.time > targetUtcMs) return before.direction
    // Equal distance chooses the earlier sample.
    return after.time - targetUtcMs < targetUtcMs - before.time ? after.direction : before.direction
  }
}
