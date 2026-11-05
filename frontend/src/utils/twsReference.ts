export type TwsReference =
  | { status: 'unavailable' }
  | { status: 'available'; speedKnots: number; gustKnots: number | null; source: string }

export interface TwsPresentation {
  speedKnots: string | null
  gustKnots: number | null
  manual: boolean
}

export function stepViewerTws(currentKnots: string | null, step: -1 | 1): string {
  const stepped = BigInt(currentKnots ?? '0') + BigInt(step)
  return String(stepped < 0n ? 0n : stepped)
}

export function resolveTwsPresentation(reference: TwsReference, manualKnots: string | null): TwsPresentation {
  return {
    speedKnots: manualKnots ?? (reference.status === 'available' ? String(reference.speedKnots) : null),
    gustKnots: reference.status === 'available' ? reference.gustKnots : null,
    manual: manualKnots !== null,
  }
}
