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

  for (const sample of conditions.hourly) {
    const direction = sample.wind_direction_10m_deg
    if (direction === null || !Number.isFinite(direction)) continue

    // Require an explicit timezone so a local browser timezone cannot change selection.
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(sample.time)) continue
    const sampleTime = Date.parse(sample.time)
    if (!Number.isFinite(sampleTime)) continue

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
