/**
 * Viewer-only scroll helper (#211.4): brings the existing map into view after a maneuver
 * is activated from the Maneuver Analysis table. It never changes the map camera, replay
 * or keyboard focus; it only scrolls the page when the map is not already fully visible.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * Scrolls `mapElement` to the top of the viewport unless it is missing, not rendered
 * (no layout box) or already fully visible vertically. The Viewer has no sticky or fixed
 * page header, so top alignment leaves the map unobstructed. Returns whether a scroll
 * was requested.
 */
export function revealMapIfNeeded(
  mapElement: Element | null,
  { reducedMotion }: { reducedMotion: boolean },
): boolean {
  if (mapElement === null || !mapElement.isConnected) return false
  const rect = mapElement.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return false
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  if (rect.top >= 0 && rect.bottom <= viewportHeight) return false
  mapElement.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
    inline: 'nearest',
  })
  return true
}
