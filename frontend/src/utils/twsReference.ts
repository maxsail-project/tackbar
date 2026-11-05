export type TwsReference =
  | { status: 'unavailable' }
  | { status: 'available'; speedKnots: number; gustKnots: number | null; source: string }

export interface TwsPresentation {
  speedKnots: string | null
  gustKnots: number | null
  manual: boolean
}

export function parseWholeKnotTws(input: string): string | null {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return trimmed.replace(/^0+(?=\d)/, '')
}

export function resolveTwsPresentation(reference: TwsReference, manualKnots: string | null): TwsPresentation {
  return {
    speedKnots: manualKnots ?? (reference.status === 'available' ? String(reference.speedKnots) : null),
    gustKnots: reference.status === 'available' ? reference.gustKnots : null,
    manual: manualKnots !== null,
  }
}
