import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import {
  classifyWindSector,
  signedTwaDegrees,
  type WindSector,
  type WindWindowClassification,
} from './windContext'

type WindContextConfig = typeof WIND_CONTEXT_CONFIG

export type WindSegmentKind = WindSector | 'unclassified' | 'pre-start'

/**
 * Window-independent segmentation wind reference: TWD for a sample's own UTC time — the
 * nearest persisted modelled direction, or the active Manual · Viewer value for every sample.
 */
export type TwdAtTime = (utcMs: number) => number | null

export function createSegmentTwdAtTime(
  modelledAtTime: ((utcMs: number) => number) | null,
  manualDegrees: number | null,
): TwdAtTime | null {
  if (manualDegrees !== null && Number.isFinite(manualDegrees)) return () => manualDegrees
  return modelledAtTime
}

/**
 * Ephemeral Viewer shortcut to an Analysis Window (#192.3): not an Activity, Session,
 * race, leg or Saved Segment, and never persisted.
 */
export interface WindSegment {
  kind: WindSegmentKind
  start: number
  end: number
}

type IntervalLabel = WindSector | 'none'

interface LabelledInterval {
  label: IntervalLabel
  start: number
  end: number
}

/**
 * Each canonical sample inside the range represents its interval to the next sample, clipped
 * at the range end. Intervals over the gap limit are uncovered and split blocks; nonpositive
 * intervals add nothing. Missing COG/SOG or SOG below moving speed is labelled `none`.
 */
function labelIntervals(
  samples: TrackSample[],
  range: AnalysisWindowRange,
  twdAt: TwdAtTime,
  config: WindContextConfig,
) {
  const blocks: LabelledInterval[][] = []
  let current: LabelledInterval[] = []
  const maxGapMs = config.maxGapSeconds * 1_000

  for (let index = 0; index + 1 < samples.length; index += 1) {
    const sample = samples[index]
    const start = Date.parse(sample.utc)
    const next = Date.parse(samples[index + 1].utc)
    if (!Number.isFinite(start) || !Number.isFinite(next)) continue
    if (start < range.start || start >= range.end) continue
    const duration = next - start
    if (duration <= 0) continue
    if (duration > maxGapMs) {
      if (current.length > 0) blocks.push(current)
      current = []
      continue
    }
    const end = Math.min(next, range.end)
    const moving = sample.sog !== null && Number.isFinite(sample.sog) && sample.sog >= config.movingMinSogKnots
    const twd = moving ? twdAt(start) : null
    const twa = twd === null ? null : signedTwaDegrees(twd, sample.cog)
    const label: IntervalLabel = twa === null ? 'none' : classifyWindSector(twa, config)
    const previous = current[current.length - 1]
    if (previous !== undefined && previous.end !== start) {
      // Defensive: non-contiguous coverage starts a new block.
      blocks.push(current)
      current = []
    }
    current.push({ label, start, end })
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

/** Split blocks at forced boundaries (inferred Session Starts) strictly inside each block. */
function splitAtBoundaries(blocks: LabelledInterval[][], boundaries: number[]) {
  const result: LabelledInterval[][] = []
  for (const block of blocks) {
    let current: LabelledInterval[] = []
    for (const interval of block) {
      // A boundary exactly at an interval start closes the preceding block.
      if (boundaries.includes(interval.start) && current.length > 0) {
        result.push(current)
        current = []
      }
      let start = interval.start
      for (const boundary of boundaries) {
        if (boundary <= start || boundary >= interval.end) continue
        current.push({ label: interval.label, start, end: boundary })
        result.push(current)
        current = []
        start = boundary
      }
      current.push({ label: interval.label, start, end: interval.end })
    }
    if (current.length > 0) result.push(current)
  }
  return result
}

function compressRuns(block: LabelledInterval[]) {
  const runs: LabelledInterval[] = []
  for (const interval of block) {
    const previous = runs[runs.length - 1]
    if (previous !== undefined && previous.label === interval.label && previous.end === interval.start) {
      previous.end = interval.end
    } else {
      runs.push({ ...interval })
    }
  }
  return runs
}

/**
 * Within one contiguous block: starting from each sector run in order, merge later runs of the
 * same sector separated by less than the absorption limit; a merged span reaching the minimum
 * becomes a segment, otherwise that starting run stays unclassified. Remaining time is
 * one merged Unclassified segment per uncovered stretch.
 */
function segmentBlock(block: LabelledInterval[], config: WindContextConfig): WindSegment[] {
  const runs = compressRuns(block)
  const absorbMs = config.segmentAbsorbSeconds * 1_000
  const minMs = config.segmentMinSeconds * 1_000
  const classified: WindSegment[] = []

  let index = 0
  while (index < runs.length) {
    const run = runs[index]
    if (run.label === 'none') {
      index += 1
      continue
    }
    let end = run.end
    let last = index
    for (let next = index + 1; next < runs.length; next += 1) {
      if (runs[next].start - end >= absorbMs) break
      if (runs[next].label === run.label) {
        end = runs[next].end
        last = next
      }
    }
    if (end - run.start >= minMs) {
      classified.push({ kind: run.label, start: run.start, end })
      index = last + 1
    } else {
      index += 1
    }
  }

  const blockStart = block[0].start
  const blockEnd = block[block.length - 1].end
  const segments: WindSegment[] = []
  let cursor = blockStart
  for (const segment of classified) {
    if (segment.start > cursor) segments.push({ kind: 'unclassified', start: cursor, end: segment.start })
    segments.push(segment)
    cursor = segment.end
  }
  if (cursor < blockEnd) segments.push({ kind: 'unclassified', start: cursor, end: blockEnd })
  return segments
}

/**
 * P-referenced wind segments over the available range (#192.3), classified per sample with
 * the window-independent `twdAt` reference.
 * Boundaries are forced at each inferred Session Start inside the range; an Unclassified
 * segment ending exactly at a Start is labelled Pre-start.
 */
export function detectWindSegments(
  samples: TrackSample[],
  range: AnalysisWindowRange | null,
  twdAt: TwdAtTime | null,
  sessionStartTimes: number[] = [],
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): WindSegment[] {
  if (range === null || twdAt === null || range.end <= range.start) return []
  const starts = [...new Set(sessionStartTimes)]
    .filter((time) => Number.isFinite(time) && time > range.start && time < range.end)
    .sort((first, second) => first - second)
  const blocks = splitAtBoundaries(labelIntervals(samples, range, twdAt, config), starts)
  return blocks.flatMap((block) => segmentBlock(block, config)).map((segment) => (
    segment.kind === 'unclassified' && starts.includes(segment.end)
      ? { ...segment, kind: 'pre-start' as const }
      : segment
  ))
}

/**
 * C column: dominant sector / Mixed / Unavailable of an Activity over one P segment interval,
 * with the #192.1 moving-time shares and dominance rule but the per-sample `twdAt` reference.
 */
export function classifySegmentInterval(
  samples: TrackSample[],
  interval: AnalysisWindowRange,
  twdAt: TwdAtTime | null,
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): WindWindowClassification {
  if (twdAt === null || interval.end <= interval.start) return 'unavailable'
  const sectorMs: Record<WindSector, number> = { upwind: 0, reaching: 0, downwind: 0 }
  for (const block of labelIntervals(samples, interval, twdAt, config)) {
    for (const { label, start, end } of block) {
      if (label !== 'none') sectorMs[label] += end - start
    }
  }
  const total = sectorMs.upwind + sectorMs.reaching + sectorMs.downwind
  if (total <= 0) return 'unavailable'
  const dominant = (Object.keys(sectorMs) as WindSector[])
    .find((sector) => sectorMs[sector] / total >= config.dominantShare)
  return dominant ?? 'mixed'
}

export function formatWindSegmentKind(kind: WindSegmentKind) {
  switch (kind) {
    case 'upwind': return 'Upwind'
    case 'reaching': return 'Reaching'
    case 'downwind': return 'Downwind'
    case 'pre-start': return 'Pre-start'
    default: return 'Unclassified'
  }
}

export function windSegmentMatchesWindow(segment: WindSegment, analysisWindow: AnalysisWindowRange | null) {
  return analysisWindow !== null && segment.start === analysisWindow.start && segment.end === analysisWindow.end
}
