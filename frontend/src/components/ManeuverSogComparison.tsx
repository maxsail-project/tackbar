import { useMemo, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { MANEUVER_ANGLE_RANGE } from '../config/maneuverProfile'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import { buildSogTrendPoints, type SogChartPoint } from '../utils/metricChartData'
import {
  buildSogManeuverPath,
  calculateSogManeuverInsights,
  compareSogManeuverInsight,
  sogManeuverAxisBounds,
  type SogInsightMetric,
  type SogManeuverInsights,
} from '../utils/maneuverSogInsights'
import { aggregatePreparedSogPopulation, type PreparedSogPopulation, type TypicalSogProfile } from '../utils/typicalSogProfile'
import ManeuverAngleRange, { type AngleBand } from './ManeuverAngleRange'

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
  const excluded = profile.windowEligibleCount - profile.coverageEligibleCount
  const warning = profile.coverageEligibleCount === 0 ? 'No usable profile'
    : profile.coverageEligibleCount < 3 ? 'At least 3 profiles needed' : null
  return <p className="maneuver-profile__count">
    <strong style={{ color: role === 'P' ? ACTIVITY_COLORS.primary : ACTIVITY_COLORS.comparison }}>{role}</strong> · {profile.windowEligibleCount} in window · {profile.coverageEligibleCount} used
    {excluded > 0 && <span> · {excluded} excluded{missingCourseCount > 0 ? ` (${missingCourseCount} without common ΔCOG)` : ''}</span>}
    {warning && <span> · {warning}</span>}
  </p>
}

function insightValue(value: number | null, metric: SogInsightMetric) {
  if (value === null) return '—'
  const displayed = `${value.toFixed(1)} kt`
  return metric === 'sogDrop' && value < 0 ? `${displayed} · no confirmed drop` : displayed
}

function insightRow(label: string, metric: SogInsightMetric, p: SogManeuverInsights | null, c: SogManeuverInsights | null) {
  const primary = p?.[metric] ?? null
  const comparison = c?.[metric] ?? null
  return <tr key={metric}><th scope="row">{label}</th><td>{insightValue(primary, metric)}</td><td>{insightValue(comparison, metric)}</td>
    <td>{compareSogManeuverInsight(metric, primary, comparison)}</td></tr>
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
  const bounds = sogManeuverAxisBounds(pRaw, cRaw)
  const pInsights = p ? calculateSogManeuverInsights(pRaw) : null
  const cInsights = c ? calculateSogManeuverInsights(cRaw) : null
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
        <div className="sog-signal-chart__y-axis" aria-hidden="true"><span>{bounds.maximum} kt</span><span>{((bounds.minimum + bounds.maximum) / 2).toFixed(1)} kt</span><span>{bounds.minimum} kt</span></div>
        <div className="sog-signal-chart__plot"><svg viewBox="0 0 1000 200" preserveAspectRatio="none" role="img" aria-label="Median SOG by seconds from maneuver center">
          <g className="sog-signal-chart__grid" aria-hidden="true"><line x1="0" x2="1000" y1="8" y2="8" /><line x1="0" x2="1000" y1="100" y2="100" /><line x1="0" x2="1000" y1="192" y2="192" /></g>
          <line data-maneuver-center="true" x1="500" x2="500" y1="8" y2="192" />
          {curves.map(({ role, raw, color }) => {
            const rawPath = buildSogManeuverPath(raw, bounds)
            const smoothPath = buildSogManeuverPath(smoothedAfterMedian(raw), bounds)
            return <g key={role}>
              {rawPath && <path data-profile-series={`${role}-raw`} d={rawPath} fill="none" stroke={color} strokeWidth={SOG_SIGNAL_TUNING.rawStrokeWidth} strokeOpacity={SOG_SIGNAL_TUNING.rawOpacity} vectorEffect="non-scaling-stroke" />}
              {smoothPath && <path data-profile-series={`${role}-smoothed`} d={smoothPath} fill="none" stroke={color} strokeWidth={SOG_SIGNAL_TUNING.smoothedStrokeWidth} strokeOpacity={SOG_SIGNAL_TUNING.smoothedOpacity} vectorEffect="non-scaling-stroke" />}
            </g>
          })}
        </svg></div>
        <div className="sog-signal-chart__x-axis" aria-hidden="true"><span>−25 s</span><span>t=0</span><span>+25 s</span></div>
      </div>
    </div>
    <section className="maneuver-insights" aria-label="Maneuver Insights">
      <h3>Maneuver Insights</h3>
      <p>Supported raw median SOG · P {p ? `${p.coverageEligibleCount} used` : 'unavailable'}{comparison !== undefined ? ` · C ${c ? `${c.coverageEligibleCount} used` : 'unavailable'}` : ''}</p>
      <div className="maneuver-insights__table-scroll"><table><thead><tr><th scope="col">Indicator</th><th scope="col" style={{ color: ACTIVITY_COLORS.primary }}>P</th><th scope="col" style={{ color: ACTIVITY_COLORS.comparison }}>C</th><th scope="col">Reading</th></tr></thead>
        <tbody>{[
          insightRow('Entry SOG', 'entrySog', pInsights, cInsights),
          insightRow('Minimum SOG', 'minimumSog', pInsights, cInsights),
          insightRow('SOG drop', 'sogDrop', pInsights, cInsights),
        ]}</tbody></table></div>
    </section>
    <p className="maneuver-profile__basis">Curves require 3 SOG-eligible maneuvers and 3 contributors at each drawn second. Gaps remain open.</p>
  </section>
}
