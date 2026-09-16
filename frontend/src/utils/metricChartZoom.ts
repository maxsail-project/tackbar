export interface TemporalRange {
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
