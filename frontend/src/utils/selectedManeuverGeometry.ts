import type { ActivityTrack, TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import type { DisplayManeuver, ManeuverActivityRole } from './maneuverEvents'
import { interpolatePosition, timestampToMilliseconds, type TrackPosition } from './replay'

const HIGHLIGHT_HALF_SPAN_MS = 25_000
const MAX_CONTINUOUS_INTERVAL_MS = 1_500

export interface SelectedManeuverHighlight {
  activityRole: ManeuverActivityRole
  selectionIndex: 1 | 2
  geoJson: {
    type: 'Feature'
    properties: Record<string, never>
    geometry: { type: 'MultiLineString', coordinates: [number, number][][] }
  }
}

function validPosition(sample: TrackSample) {
  return Number.isFinite(sample.lat) && Number.isFinite(sample.lon)
    && Math.abs(sample.lat) <= 90 && Math.abs(sample.lon) <= 180
}

function coordinates(position: TrackPosition): [number, number] {
  return [position.lon, position.lat]
}

function highlightGeometry(
  event: DisplayManeuver,
  track: ActivityTrack,
  analysisWindow: AnalysisWindowRange,
) {
  if (!Number.isFinite(event.centerTimeMs)) return null
  const start = Math.max(event.centerTimeMs - HIGHLIGHT_HALF_SPAN_MS, analysisWindow.start)
  const end = Math.min(event.centerTimeMs + HIGHLIGHT_HALF_SPAN_MS, analysisWindow.end)
  if (start >= end) return null

  const lines: [number, number][][] = []
  let line: [number, number][] | null = null
  let previousEnd: number | null = null

  for (let index = 1; index < track.samples.length; index += 1) {
    const before = track.samples[index - 1]
    const after = track.samples[index]
    let beforeTime: number
    let afterTime: number
    try {
      beforeTime = timestampToMilliseconds(before.utc)
      afterTime = timestampToMilliseconds(after.utc)
    } catch {
      line = null
      previousEnd = null
      continue
    }
    if (
      !validPosition(before) || !validPosition(after)
      || afterTime <= beforeTime
      || afterTime - beforeTime > MAX_CONTINUOUS_INTERVAL_MS
    ) {
      line = null
      previousEnd = null
      continue
    }

    const clippedStart = Math.max(start, beforeTime)
    const clippedEnd = Math.min(end, afterTime)
    if (clippedStart >= clippedEnd) continue

    const intervalSamples = [before, after]
    const from = coordinates(interpolatePosition(intervalSamples, clippedStart))
    const to = coordinates(interpolatePosition(intervalSamples, clippedEnd))
    if (line !== null && previousEnd === clippedStart) {
      line.push(to)
    } else {
      line = [from, to]
      lines.push(line)
    }
    previousEnd = clippedEnd
  }

  return lines.length > 0 ? {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'MultiLineString' as const, coordinates: lines },
  } : null
}

export function createSelectedManeuverHighlights(
  current: DisplayManeuver | null,
  previous: DisplayManeuver | null,
  primaryTrack: ActivityTrack | null,
  comparisonTrack: ActivityTrack | null,
  analysisWindow: AnalysisWindowRange | null,
): SelectedManeuverHighlight[] {
  if (analysisWindow === null) return []
  return ([current, previous] as const).flatMap((event, index) => {
    if (event === null) return []
    const track = event.activityRole === 'primary' ? primaryTrack : comparisonTrack
    if (track === null) return []
    const geoJson = highlightGeometry(event, track, analysisWindow)
    return geoJson === null ? [] : [{
      activityRole: event.activityRole,
      selectionIndex: (index + 1) as 1 | 2,
      geoJson,
    }]
  })
}
