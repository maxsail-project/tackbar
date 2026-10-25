import { useMemo, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { MANEUVER_ANGLE_RANGE } from '../config/maneuverProfile'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import { buildSogSignalPath, buildSogTrendPoints, type SogChartPoint } from '../utils/metricChartData'
import { aggregatePreparedSogPopulation, type PreparedSogPopulation, type TypicalSogProfile } from '../utils/typicalSogProfile'
import ManeuverAngleRange, { type AngleBand } from './ManeuverAngleRange'

const axis = { start: -25_000, end: 25_000 }

export function supportedSogPoints(profile: TypicalSogProfile): SogChartPoint[] {
  return profile.grid.map((point) => ({
    time: point.offsetSeconds * 1_000,
    sog: profile.status === 'ready' && point.contributorCount >= 3 ? point.medianSogKn : null,
  }))
}

function smoothedAfterMedian(raw: SogChartPoint[]) {
  const minima = new Map<number, number>()
  for (let index = 1; index < raw.length - 1; index += 1) {
    const before = raw[index - 1].sog
    const current = raw[index].sog
    const after = raw[index + 1].sog
    if (before !== null && current !== null && after !== null
      && current < before && current < after) minima.set(raw[index].time, current)
  }
  return buildSogTrendPoints(raw).map((point) => ({
    ...point,
    sog: point.sog === null ? null : minima.get(point.time) ?? point.sog,
  }))
}

function countSummary(role: 'P' | 'C', profile: TypicalSogProfile, missingCourseCount: number) {
  const warning = profile.coverageEligibleCount === 0 ? 'No usable profile'
    : profile.coverageEligibleCount < 3 ? 'At least 3 profiles needed' : null
  return <p className="maneuver-profile__count">
    <strong style={{ color: role === 'P' ? ACTIVITY_COLORS.primary : ACTIVITY_COLORS.comparison }}>{role}</strong> · {profile.detectedCount} detected · {profile.windowEligibleCount} in window · {profile.angularBandSelectedCount} in band · {profile.coverageEligibleCount} SOG eligible
    {missingCourseCount > 0 && <span> · {missingCourseCount} without common ΔCOG</span>}
    {warning && <span> · {warning}</span>}
  </p>
}

export default function ManeuverSogComparison({ primary, comparison }: {
  primary: PreparedSogPopulation | null
  comparison?: PreparedSogPopulation | null
}) {
  const [range, setRange] = useState<AngleBand>({
    minimum: MANEUVER_ANGLE_RANGE.initialMinimum,
    maximum: MANEUVER_ANGLE_RANGE.initialMaximum,
  })
  const p = useMemo(() => primary && aggregatePreparedSogPopulation(primary, range.minimum, range.maximum), [primary, range])
  const c = useMemo(() => comparison && aggregatePreparedSogPopulation(comparison, range.minimum, range.maximum), [comparison, range])
  const pRaw = p ? supportedSogPoints(p) : []
  const cRaw = c ? supportedSogPoints(c) : []
  const maxSog = Math.max(1, Math.ceil(Math.max(...[...pRaw, ...cRaw].map((point) => point.sog ?? 0))))
  const curves = [
    { role: 'comparison', raw: cRaw, color: ACTIVITY_COLORS.comparison },
    { role: 'primary', raw: pRaw, color: ACTIVITY_COLORS.primary },
  ]
  return <section className="maneuver-profile" aria-label="Typical SOG maneuver comparison">
    <div className="metric-chart__heading"><div><strong>Typical SOG through a maneuver</strong><span>Median knots · relative to event center</span></div>
      <span>Raw thin · smoothed bold</span></div>
    <ManeuverAngleRange range={range} onChange={setRange} />
    <p className="maneuver-profile__basis">Common |ΔCOG| filter from canonical course context; event ΔHDG/ΔCOG and HIGH/LOW evidence remain in the table.</p>
    {p && countSummary('P', p, primary!.missingCourseCount)}
    {c && countSummary('C', c, comparison!.missingCourseCount)}
    {!p && <p className="maneuver-profile__count">P profile data unavailable.</p>}
    {!c && comparison !== undefined && <p className="maneuver-profile__count">C profile data unavailable.</p>}
    <div className="metric-chart__canvas metric-chart__canvas--sog">
      <div className="sog-signal-chart">
        <div className="sog-signal-chart__y-axis" aria-hidden="true"><span>{maxSog} kt</span><span>{maxSog / 2} kt</span><span>0 kt</span></div>
        <div className="sog-signal-chart__plot"><svg viewBox="0 0 1000 200" preserveAspectRatio="none" role="img" aria-label="Median SOG by seconds from maneuver center">
          <g className="sog-signal-chart__grid" aria-hidden="true"><line x1="0" x2="1000" y1="8" y2="8" /><line x1="0" x2="1000" y1="100" y2="100" /><line x1="0" x2="1000" y1="192" y2="192" /></g>
          <line data-maneuver-center="true" x1="500" x2="500" y1="8" y2="192" />
          {curves.map(({ role, raw, color }) => {
            const rawPath = buildSogSignalPath(raw, axis, maxSog)
            const smoothPath = buildSogSignalPath(smoothedAfterMedian(raw), axis, maxSog)
            return <g key={role}>
              {rawPath && <path data-profile-series={`${role}-raw`} d={rawPath} fill="none" stroke={color} strokeWidth={SOG_SIGNAL_TUNING.rawStrokeWidth} strokeOpacity={SOG_SIGNAL_TUNING.rawOpacity} vectorEffect="non-scaling-stroke" />}
              {smoothPath && <path data-profile-series={`${role}-smoothed`} d={smoothPath} fill="none" stroke={color} strokeWidth={SOG_SIGNAL_TUNING.smoothedStrokeWidth} strokeOpacity={SOG_SIGNAL_TUNING.smoothedOpacity} vectorEffect="non-scaling-stroke" />}
            </g>
          })}
        </svg></div>
        <div className="sog-signal-chart__x-axis" aria-hidden="true"><span>−25 s</span><span>t=0</span><span>+25 s</span></div>
      </div>
    </div>
    <p className="maneuver-profile__basis">Curves require 3 SOG-eligible maneuvers and 3 contributors at each drawn second. Gaps remain open.</p>
  </section>
}
