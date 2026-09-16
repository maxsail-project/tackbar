export interface TemporalRange {
  start: number
  end: number
}

export interface TemporalZoomChartPresentation {
  domain: [number, number] | ['dataMin', 'dataMax']
  allowDataOverflow: boolean
  playbackReferenceOverflow: 'discard' | 'extendDomain'
}

export interface TemporalPointerBounds {
  left: number
  right: number
}

export interface TemporalPointerSelection {
  pointerId: number
  start: number
  end: number
}

export function createTemporalRange(timestamps: number[]): TemporalRange | null {
  const validTimestamps = timestamps.filter(Number.isFinite)
  if (validTimestamps.length === 0) return null

  return {
    start: Math.min(...validTimestamps),
    end: Math.max(...validTimestamps),
  }
}

export function selectTemporalZoom(
  originalRange: TemporalRange | null,
  selectionStart: number | null,
  selectionEnd: number | null,
): TemporalRange | null {
  if (
    originalRange === null
    || selectionStart === null
    || selectionEnd === null
    || !Number.isFinite(selectionStart)
    || !Number.isFinite(selectionEnd)
  ) return null

  const start = Math.max(originalRange.start, Math.min(selectionStart, selectionEnd))
  const end = Math.min(originalRange.end, Math.max(selectionStart, selectionEnd))

  if (start >= end) return null
  if (start === originalRange.start && end === originalRange.end) return null

  return { start, end }
}

export function resolveTemporalPointerTimestamp(
  range: TemporalRange | null,
  clientX: number,
  bounds: TemporalPointerBounds,
): number | null {
  if (
    range === null
    || !Number.isFinite(clientX)
    || !Number.isFinite(bounds.left)
    || !Number.isFinite(bounds.right)
    || bounds.right <= bounds.left
    || range.end <= range.start
  ) return null

  const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / (bounds.right - bounds.left)))
  return range.start + ((range.end - range.start) * ratio)
}

export function startTemporalPointerSelection(
  pointerId: number,
  timestamp: number | null,
): TemporalPointerSelection | null {
  if (!Number.isFinite(pointerId) || timestamp === null || !Number.isFinite(timestamp)) return null

  return { pointerId, start: timestamp, end: timestamp }
}

export function updateTemporalPointerSelection(
  selection: TemporalPointerSelection | null,
  pointerId: number,
  timestamp: number | null,
): TemporalPointerSelection | null {
  if (
    selection === null
    || selection.pointerId !== pointerId
    || timestamp === null
    || !Number.isFinite(timestamp)
  ) return selection

  return { ...selection, end: timestamp }
}

export function finishTemporalPointerSelection(
  originalRange: TemporalRange | null,
  selection: TemporalPointerSelection | null,
  pointerId: number,
  timestamp: number | null,
): TemporalRange | null {
  const completedSelection = updateTemporalPointerSelection(selection, pointerId, timestamp)

  if (completedSelection === null || completedSelection.pointerId !== pointerId) return null

  return selectTemporalZoom(originalRange, completedSelection.start, completedSelection.end)
}

export function resolveTemporalZoomChartPresentation(
  zoomRange: TemporalRange | null,
): TemporalZoomChartPresentation {
  if (zoomRange === null) {
    return {
      domain: ['dataMin', 'dataMax'],
      allowDataOverflow: false,
      playbackReferenceOverflow: 'extendDomain',
    }
  }

  return {
    domain: [zoomRange.start, zoomRange.end],
    allowDataOverflow: true,
    playbackReferenceOverflow: 'discard',
  }
}
