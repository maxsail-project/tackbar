import type { TwdReference } from './twdReference'

export interface TwdPresentation {
  bearing: number
  displayDegrees: number | null
  automaticDegrees: number | null
  manual: boolean
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

export function formatTwdDegrees(value: number) {
  return `${String(normalizeDegrees(Math.round(value))).padStart(3, '0')}°`
}

export function resolveTwdPresentation(
  reference: TwdReference,
  manualDegrees: number | null,
): TwdPresentation {
  const automaticDegrees = reference.status === 'available'
    ? normalizeDegrees(Math.round(reference.directionDegrees / 5) * 5)
    : null
  const displayDegrees = manualDegrees === null
    ? automaticDegrees
    : normalizeDegrees(manualDegrees)
  return {
    bearing: displayDegrees ?? 0,
    displayDegrees,
    automaticDegrees,
    manual: manualDegrees !== null,
  }
}

export function stepViewerTwd(currentDegrees: number | null, step: -5 | 5) {
  return normalizeDegrees((currentDegrees ?? 0) + step)
}

export function resolveGestureTwd(bearing: number, effectiveBeforeGesture: number) {
  if (!Number.isFinite(bearing)) return null
  const snappedBearing = normalizeDegrees(Math.round(bearing / 5) * 5)
  return {
    snappedBearing,
    changed: snappedBearing !== normalizeDegrees(effectiveBeforeGesture),
  }
}
