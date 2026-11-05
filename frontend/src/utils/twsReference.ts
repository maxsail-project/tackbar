import type { HistoricalConditions } from '../types/session'

export type TwsReference =
  | { status: 'unavailable' }
  | {
      status: 'available'
      speedKnots: number
      sourceKind: 'modelled_weather'
      sourceTimeUtc: string
      provenance: { provider: string | null }
    }

export interface TwsPresentation {
  speedKnots: string | null
  manual: boolean
}

/** Resolve original modelled TWS at a UTC instant, independent of Viewer presentation. */
export function resolveTwsReference(targetUtcMs: number, conditions: HistoricalConditions | null): TwsReference {
  if (!Number.isFinite(targetUtcMs) || !conditions?.hourly.length) return { status: 'unavailable' }

  let selectedSpeed: number | null = null
  let selectedTime = 0
  let selectedDistance = Number.POSITIVE_INFINITY

  for (const sample of conditions.hourly) {
    const speed = sample.wind_speed_10m_kn
    if (speed === null || !Number.isFinite(speed) || speed < 0) continue

    // Match TWD's explicit-timezone rule so browser local time cannot change selection.
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(sample.time)) continue
    const sampleTime = Date.parse(sample.time)
    if (!Number.isFinite(sampleTime)) continue

    const distance = Math.abs(sampleTime - targetUtcMs)
    if (distance < selectedDistance || (distance === selectedDistance && sampleTime < selectedTime)) {
      selectedSpeed = speed
      selectedTime = sampleTime
      selectedDistance = distance
    }
  }

  if (selectedSpeed === null) return { status: 'unavailable' }
  return {
    status: 'available',
    speedKnots: selectedSpeed,
    sourceKind: 'modelled_weather',
    sourceTimeUtc: new Date(selectedTime).toISOString(),
    provenance: { provider: conditions.weather_source?.provider ?? null },
  }
}

export function stepViewerTws(currentKnots: string | null, step: -1 | 1): string {
  const stepped = BigInt(currentKnots ?? '0') + BigInt(step)
  return String(stepped < 0n ? 0n : stepped)
}

export function resolveTwsPresentation(reference: TwsReference, manualKnots: string | null): TwsPresentation {
  return {
    speedKnots: manualKnots ?? (reference.status === 'available' ? BigInt(Math.round(reference.speedKnots)).toString() : null),
    manual: manualKnots !== null,
  }
}
