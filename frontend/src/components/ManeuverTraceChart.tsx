import { ACTIVITY_COLORS } from '../config/activityColors'
import {
  TRACE_MEDIAN_MIN_CONTRIBUTORS,
  TRACE_MEDIAN_MIN_COVERAGE,
  TRACE_MEDIAN_MIN_MANEUVERS,
  TRACE_TURN_ANGLE_MIN_MANEUVERS,
  type TraceAggregate,
  type TracePoint,
  type TraceSideAggregate,
} from '../utils/maneuverTrace'
import { roundedInsightComparison } from '../utils/insightComparison'

type Role = 'primary' | 'comparison'

const MINIMUM_HALF_SIDE_M = 10

/** Square metre frame around the origin; a square SVG with `meet` keeps 1 m = 1 m on both axes. */
export function traceViewFrame(points: readonly TracePoint[]) {
  let halfWidth = MINIMUM_HALF_SIDE_M
  let minimumY = -MINIMUM_HALF_SIDE_M
  let maximumY = MINIMUM_HALF_SIDE_M
  for (const { x, y } of points) {
    halfWidth = Math.max(halfWidth, Math.abs(x))
    minimumY = Math.min(minimumY, y)
    maximumY = Math.max(maximumY, y)
  }
  const side = Math.max(2 * halfWidth, maximumY - minimumY) * 1.12
  const centerY = (minimumY + maximumY) / 2
  // SVG y grows downward; forward (positive y) is drawn up.
  return { minX: -side / 2, minY: -centerY - side / 2, side }
}

export function traceScaleBarMetres(side: number): number {
  const target = side / 4
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= target / 1.8) ?? 10
  return step * magnitude
}

function segmentPath(points: readonly TracePoint[]): string {
  return points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${(-y).toFixed(2)}`).join(' ')
}

function individualPath(side: TraceSideAggregate): string {
  return side.traces.flat().filter((segment) => segment.length >= 2).map(segmentPath).join(' ')
}

/** Draw only between consecutive supported offsets; absent offsets stay open. */
export function medianPath(side: TraceSideAggregate): string {
  const runs: TracePoint[][] = [[]]
  for (const { point } of side.median) {
    if (point === null) runs.push([])
    else runs.at(-1)!.push(point)
  }
  return runs.filter((run) => run.length >= 2).map(segmentPath).join(' ')
}

function sideLabel(side: TraceSideAggregate) {
  const letter = side.side === 'right' ? 'R' : 'L'
  if (side.tracedCount === 0) return null
  const median = side.status === 'ready'
    ? `median from ${side.medianEligibleCount}`
    : `median insufficient (${side.medianEligibleCount}/${TRACE_MEDIAN_MIN_MANEUVERS} with ≥${Math.round(TRACE_MEDIAN_MIN_COVERAGE * 100)}% coverage)`
  return <span key={letter} data-trace-side-count={letter}> · {letter} {side.tracedCount} traced, {median}</span>
}

function traceCounts(roleLetter: 'P' | 'C', trace: TraceAggregate) {
  const excluded = trace.windowEligibleCount - trace.tracedCount
  const reasons = [
    trace.missingCourseCount > 0 ? `${trace.missingCourseCount} without common ΔCOG` : null,
    trace.outsideBandCount > 0 ? `${trace.outsideBandCount} outside |ΔCOG| band` : null,
    trace.ambiguousTurnCount > 0 ? `${trace.ambiguousTurnCount} 0°/180° turn` : null,
    trace.missingCenterCount > 0 ? `${trace.missingCenterCount} without t=0 position` : null,
  ].filter(Boolean)
  return <p className="maneuver-profile__count" data-trace-count={roleLetter}>
    <strong style={{ color: roleLetter === 'P' ? ACTIVITY_COLORS.primary : ACTIVITY_COLORS.comparison }}>{roleLetter}</strong> · {trace.windowEligibleCount} in window · {trace.tracedCount} traced
    {excluded > 0 && <span> · {excluded} excluded{reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}</span>}
    {sideLabel(trace.right)}
    {sideLabel(trace.left)}
    {trace.tracedCount === 0 && <span> · No traceable maneuver</span>}
  </p>
}

function turnAngleCell(side: TraceSideAggregate | undefined) {
  return side?.turnAngle.medianDeg == null ? '—' : `${side.turnAngle.medianDeg.toFixed(1)}° (${side.turnAngle.count})`
}

/** #202: median event |ΔCOG| per P/C × turn side, from the existing course references. */
function turnAngleTable(primary: TraceAggregate | null, comparison: TraceAggregate | null | undefined,
  band: { minimum: number, maximum: number } | undefined) {
  const median = (trace: TraceAggregate | null | undefined, side: 'left' | 'right') => trace?.[side].turnAngle.medianDeg ?? null
  const leftMinusRight = (trace: TraceAggregate | null | undefined) =>
    roundedInsightComparison(median(trace, 'left'), median(trace, 'right'), '°', ['L', 'R'])
  const primaryMinusComparison = (side: 'left' | 'right') => roundedInsightComparison(median(primary, side), median(comparison, side), '°')
  return <section className="maneuver-insights" aria-label="Median event |ΔCOG| by turn side" data-trace-turn-angles="true">
    <h3>Median event |ΔCOG| by turn side</h3>
    <p>{band ? `|ΔCOG| band ${band.minimum}°–${band.maximum}° · ` : ''}per-event course change of all traced maneuvers (count), not the COG Insights Turn angle · at least {TRACE_TURN_ANGLE_MIN_MANEUVERS} per cell</p>
    <table className="maneuver-insights__table">
      <thead><tr><th scope="col" aria-label="Activity" /><th scope="col">Left turns</th><th scope="col">Right turns</th><th scope="col">L − R</th></tr></thead>
      <tbody>
        <tr><th scope="row" style={{ color: ACTIVITY_COLORS.primary }}>P</th><td>{turnAngleCell(primary?.left)}</td><td>{turnAngleCell(primary?.right)}</td><td>{leftMinusRight(primary)}</td></tr>
        {comparison !== undefined && <>
          <tr><th scope="row" style={{ color: ACTIVITY_COLORS.comparison }}>C</th><td>{turnAngleCell(comparison?.left)}</td><td>{turnAngleCell(comparison?.right)}</td><td>{leftMinusRight(comparison)}</td></tr>
          <tr className="maneuver-insights__compare"><th scope="row">P − C</th><td>{primaryMinusComparison('left')}</td><td>{primaryMinusComparison('right')}</td><td>—</td></tr>
        </>}
      </tbody>
    </table>
  </section>
}

export default function ManeuverTraceChart({ primary, comparison, band }: {
  primary: TraceAggregate | null
  comparison?: TraceAggregate | null
  band?: { minimum: number, maximum: number }
}) {
  const roles = ([['comparison', comparison ?? null], ['primary', primary]] as const)
    .filter((entry): entry is readonly [Role, TraceAggregate] => entry[1] !== null)
  const allPoints = roles.flatMap(([, trace]) => [trace.left, trace.right].flatMap((side) => [
    ...side.traces.flat(2),
    ...side.median.flatMap(({ point }) => point === null ? [] : [point]),
  ]))
  const { minX, minY, side } = traceViewFrame(allPoints)
  const scale = traceScaleBarMetres(side)
  const inset = side * 0.05
  const barY = minY + side - inset
  const markerSize = side * 0.018
  const fontSize = side * 0.035

  return <>
    {primary ? traceCounts('P', primary) : <p className="maneuver-profile__count">P profile data unavailable.</p>}
    {comparison ? traceCounts('C', comparison)
      : comparison === null && <p className="maneuver-profile__count">C profile data unavailable.</p>}
    <figure className="maneuver-trace" data-trace-chart="true">
      <div className="maneuver-trace__frame">
        <p className="maneuver-trace__axis maneuver-trace__axis--along" data-trace-axis="along">Along mean course (m) · forward up</p>
        <div className="maneuver-trace__plot">
          <svg viewBox={`${minX} ${minY} ${side} ${side}`} preserveAspectRatio="xMidYMid meet" role="img"
            data-trace-scale="equal" aria-label="Bisector-aligned maneuver paths in metres, t=0 at origin, forward up">
            <g className="maneuver-trace__axes" aria-hidden="true">
              <line data-trace-forward-axis="true" x1="0" x2="0" y1={minY} y2={minY + side} />
              <line x1={minX} x2={minX + side} y1="0" y2="0" />
            </g>
            {roles.map(([role, trace]) => {
              const color = role === 'primary' ? ACTIVITY_COLORS.primary : ACTIVITY_COLORS.comparison
              return <g key={`${role}-individual`}>
                {[trace.right, trace.left].map((group) => {
                  const path = individualPath(group)
                  return path && <path key={group.side} data-trace-individual={`${role}-${group.side}`} d={path}
                    fill="none" stroke={color} strokeWidth="0.8" strokeOpacity="0.4" vectorEffect="non-scaling-stroke" />
                })}
              </g>
            })}
            {roles.map(([role, trace]) => {
              const color = role === 'primary' ? ACTIVITY_COLORS.primary : ACTIVITY_COLORS.comparison
              return <g key={`${role}-median`}>
                {[trace.right, trace.left].map((group) => {
                  const path = medianPath(group)
                  return path && <path key={group.side} data-trace-median={`${role}-${group.side}`} d={path}
                    fill="none" stroke={color} strokeWidth="3.5" strokeOpacity="0.9" vectorEffect="non-scaling-stroke" />
                })}
              </g>
            })}
            <g data-trace-origin="true" aria-label="t=0 origin">
              <circle cx="0" cy="0" r={markerSize} fill="white" stroke="#17323a" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <text x={markerSize * 1.6} y={-markerSize * 1.4} fontSize={fontSize} fill="#17323a">t=0</text>
            </g>
            <g data-trace-scale-bar={scale} aria-label={`Scale bar ${scale} m`}>
              <line x1={minX + inset} x2={minX + inset + scale} y1={barY} y2={barY} stroke="#17323a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <text x={minX + inset} y={barY - fontSize * 0.5} fontSize={fontSize} fill="#17323a">{scale} m</text>
            </g>
          </svg>
        </div>
        <p className="maneuver-trace__axis maneuver-trace__axis--across" data-trace-axis="across">
          <span>← Left turns</span><span>Across mean course (m)</span><span>Right turns →</span>
        </p>
      </div>
    </figure>
    {turnAngleTable(primary, comparison, band)}
    <p className="maneuver-profile__basis" data-trace-reading-note="true"><strong>How to read:</strong> axes follow each maneuver's mean course (entry/exit bisector), not north or wind (no TWD); 1 m = 1 m. The lower arm is the approach before t=0 and the upper arm the exit; each arm leans from vertical by about half the turn angle, so wider arms mean larger turns. Thin lines are original GPS positions; bold lines are time-aligned medians per turn side, not a sailed track: a shorter median means less distance in the same time, not a tighter turn. A median needs {TRACE_MEDIAN_MIN_MANEUVERS} maneuvers with ≥{Math.round(TRACE_MEDIAN_MIN_COVERAGE * 100)}% position coverage and {TRACE_MEDIAN_MIN_CONTRIBUTORS} contributors at each drawn second; gaps remain open.</p>
  </>
}
