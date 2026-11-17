import type { ManeuverCourseReferences } from './maneuverCourseChange'
import { profileValueAtOffset, type ManeuverPositionProfile } from './maneuverProfiles'
import type { PreparedSogPopulation } from './typicalSogProfile'

/** Mean Earth radius; local equirectangular metres are adequate at maneuver scale. */
const EARTH_RADIUS_M = 6_371_008.8
const GRID_OFFSETS = 51
const GRID_HALF_SPAN = 25
export const TRACE_MEDIAN_MIN_COVERAGE = 0.65
export const TRACE_MEDIAN_MIN_MANEUVERS = 3
export const TRACE_MEDIAN_MIN_CONTRIBUTORS = 3
/** #202: minimum traced maneuvers for a per-side median event |ΔCOG|. */
export const TRACE_TURN_ANGLE_MIN_MANEUVERS = 3

export type TurnSide = 'left' | 'right'

/** Display metres: x to the right of forward travel, y forward (up). */
export interface TracePoint {
  x: number
  y: number
}

export interface ManeuverBisector {
  bisectorDeg: number
  side: TurnSide
}

export interface PreparedManeuverTrace {
  status: 'traced'
  side: TurnSide
  nominalCoverage: number
  /** Original valid GPS samples only, split wherever continuity breaks. */
  segments: TracePoint[][]
  /** 51 one-second offsets from −25s; exact or connected-bracket interpolation, else null. */
  grid: (TracePoint | null)[]
}

export type PreparedTraceResult =
  | PreparedManeuverTrace
  | { status: 'missing_course' | 'ambiguous_turn' | 'missing_center' }

const radians = (degrees: number) => degrees * Math.PI / 180
const normalizeDegrees = (degrees: number) => ((degrees % 360) + 360) % 360
const wrapLongitudeDelta = (degrees: number) => ((degrees + 540) % 360) - 180

/** D1: bisector = entry + signedChange/2; the sign keeps the actual turn side. */
export function maneuverBisector(references: ManeuverCourseReferences | null): ManeuverBisector | null {
  if (references === null) return null
  const { entryDeg, signedChangeDeg } = references
  if (!Number.isFinite(entryDeg) || !Number.isFinite(signedChangeDeg)) return null
  const magnitude = Math.abs(signedChangeDeg)
  // Exactly 0° or ±180° has no unambiguous bisector or direction (same tolerance as relative COG).
  if (magnitude < 1e-9 || Math.abs(magnitude - 180) < 1e-9 || magnitude > 180) return null
  return {
    bisectorDeg: normalizeDegrees(entryDeg + signedChangeDeg / 2),
    side: signedChangeDeg > 0 ? 'right' : 'left',
  }
}

/** D2: locally centred equirectangular east/north metres; longitude difference is antimeridian-safe. */
export function projectLocalMetres(lat: number, lon: number, originLat: number, originLon: number): TracePoint {
  return {
    x: radians(wrapLongitudeDelta(lon - originLon)) * EARTH_RADIUS_M * Math.cos(radians(originLat)),
    y: radians(lat - originLat) * EARTH_RADIUS_M,
  }
}

/** Rotate east/north metres so the geographic bisector bearing points up (forward). */
export function rotateToBisector(point: TracePoint, bisectorDeg: number): TracePoint {
  const angle = radians(bisectorDeg)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return { x: point.x * cosine - point.y * sine, y: point.y * cosine + point.x * sine }
}

function unwrappedLongitudes(position: ManeuverPositionProfile): number[] {
  let previous: number | null = null
  return position.points.map((point) => {
    previous = previous === null ? point.lon : previous + wrapLongitudeDelta(point.lon - previous)
    return previous
  })
}

/** D3: t=0 anchor from an exact sample or a connected ≤1.5s bracket; never drawn as a sample. */
export function traceCenterAnchor(position: ManeuverPositionProfile): { lat: number, lon: number } | null {
  const longitudes = unwrappedLongitudes(position)
  const lat = profileValueAtOffset(position.points.map((point) => ({ ...point, value: point.lat })), 0)
  const lon = profileValueAtOffset(position.points.map((point, index) => ({ ...point, value: longitudes[index] })), 0)
  return lat === null || lon === null ? null : { lat, lon }
}

/** Per-event visual transform only; canonical samples and profile points are not modified. */
export function prepareManeuverTrace(
  position: ManeuverPositionProfile,
  references: ManeuverCourseReferences | null,
): PreparedTraceResult {
  if (references === null) return { status: 'missing_course' }
  const bisector = maneuverBisector(references)
  if (bisector === null) return { status: 'ambiguous_turn' }
  const anchor = traceCenterAnchor(position)
  if (anchor === null) return { status: 'missing_center' }

  const longitudes = unwrappedLongitudes(position)
  const transformed = position.points.map((point, index) => ({
    ...point,
    ...rotateToBisector(projectLocalMetres(point.lat, longitudes[index], anchor.lat, anchor.lon), bisector.bisectorDeg),
  }))
  const segments: TracePoint[][] = []
  for (const point of transformed) {
    if (!point.connectToPrevious || segments.length === 0) segments.push([])
    segments.at(-1)!.push({ x: point.x, y: point.y })
  }
  // The transform is affine, so the shared 1s grid rule applies coordinate-wise.
  const xs = transformed.map((point) => ({ ...point, value: point.x }))
  const ys = transformed.map((point) => ({ ...point, value: point.y }))
  const grid = Array.from({ length: GRID_OFFSETS }, (_, index) => {
    const x = profileValueAtOffset(xs, index - GRID_HALF_SPAN)
    const y = profileValueAtOffset(ys, index - GRID_HALF_SPAN)
    return x === null || y === null ? null : { x, y }
  })
  return { status: 'traced', side: bisector.side, nominalCoverage: position.nominalCoverage, segments, grid }
}

export interface TraceMedianPoint {
  offsetSeconds: number
  point: TracePoint | null
  contributorCount: number
}

export interface TraceSideAggregate {
  side: TurnSide
  tracedCount: number
  medianEligibleCount: number
  status: 'ready' | 'insufficient_maneuvers' | 'no_eligible_maneuvers'
  traces: TracePoint[][][]
  median: TraceMedianPoint[]
  /** #202: median of |signedChangeDeg| over all traced maneuvers of this side; null below the minimum. */
  turnAngle: { medianDeg: number | null, count: number }
}

export interface TraceAggregate {
  windowEligibleCount: number
  missingCourseCount: number
  outsideBandCount: number
  ambiguousTurnCount: number
  missingCenterCount: number
  tracedCount: number
  left: TraceSideAggregate
  right: TraceSideAggregate
}

function median(values: number[]): number {
  values.sort((first, second) => first - second)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2
}

function aggregateSide(side: TurnSide, traced: readonly { trace: PreparedManeuverTrace, turnDeg: number }[]): TraceSideAggregate {
  const traces = traced.map(({ trace }) => trace)
  // Magnitudes lie in 0–180°, so an arithmetic median is valid here (not a course mean).
  const turnAngles = traced.map(({ turnDeg }) => turnDeg)
  const eligible = traces.filter((trace) => trace.nominalCoverage >= TRACE_MEDIAN_MIN_COVERAGE)
  const status: TraceSideAggregate['status'] = eligible.length >= TRACE_MEDIAN_MIN_MANEUVERS ? 'ready'
    : eligible.length === 0 ? 'no_eligible_maneuvers' : 'insufficient_maneuvers'
  const medianPoints = Array.from({ length: GRID_OFFSETS }, (_, index) => {
    const points = eligible.flatMap((trace) => trace.grid[index] === null ? [] : [trace.grid[index]!])
    const supported = status === 'ready' && points.length >= TRACE_MEDIAN_MIN_CONTRIBUTORS
    return {
      offsetSeconds: index - GRID_HALF_SPAN,
      // D2: coordinate-wise median X and median Y, never a geometric median.
      point: supported ? { x: median(points.map((point) => point.x)), y: median(points.map((point) => point.y)) } : null,
      contributorCount: points.length,
    }
  })
  return {
    side,
    tracedCount: traces.length,
    medianEligibleCount: eligible.length,
    status,
    traces: traces.map((trace) => trace.segments),
    median: medianPoints,
    turnAngle: {
      medianDeg: turnAngles.length >= TRACE_TURN_ANGLE_MIN_MANEUVERS ? median(turnAngles) : null,
      count: turnAngles.length,
    },
  }
}

/** One Activity's TRACE view for the common |ΔCOG| band; call independently for P and C. */
export function aggregatePreparedTracePopulation(
  population: PreparedSogPopulation,
  minimumDegrees: number,
  maximumDegrees: number,
): TraceAggregate {
  let outsideBandCount = 0
  let ambiguousTurnCount = 0
  let missingCenterCount = 0
  const traced: { trace: PreparedManeuverTrace, turnDeg: number }[] = []
  for (const maneuver of population.maneuvers) {
    if (maneuver.courseChangeDeg === null) continue
    if (maneuver.courseChangeDeg < minimumDegrees - 1e-9 || maneuver.courseChangeDeg > maximumDegrees + 1e-9) {
      outsideBandCount += 1
      continue
    }
    const trace = maneuver.trace
    // courseChangeDeg is the prepared |signedChangeDeg| of the same course references.
    if (trace?.status === 'traced') traced.push({ trace, turnDeg: maneuver.courseChangeDeg })
    else if (trace?.status === 'ambiguous_turn') ambiguousTurnCount += 1
    else missingCenterCount += 1
  }
  return {
    windowEligibleCount: population.windowEligibleCount,
    missingCourseCount: population.missingCourseCount,
    outsideBandCount,
    ambiguousTurnCount,
    missingCenterCount,
    tracedCount: traced.length,
    left: aggregateSide('left', traced.filter(({ trace }) => trace.side === 'left')),
    right: aggregateSide('right', traced.filter(({ trace }) => trace.side === 'right')),
  }
}
