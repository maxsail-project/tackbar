import { useMemo, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { MANEUVER_ANGLE_RANGE, MANEUVER_SOG_INSIGHTS } from '../config/maneuverProfile'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import { buildSogTrendPoints, type SogChartPoint } from '../utils/metricChartData'
import {
  buildSogManeuverPath,
  calculateSogManeuverInsights,
  calculateSogProfileRecovery,
  compareSogManeuverInsight,
  compareSogProfileRecovery,
  sogManeuverAxisBounds,
  sogManeuverCoordinates,
  type SogAxisBounds,
  type SogInsightMetric,
  type SogManeuverInsights,
  type SogProfileRecovery,
} from '../utils/maneuverSogInsights'
import { aggregatePreparedSogPopulation, type PreparedSogPopulation, type TypicalSogProfile } from '../utils/typicalSogProfile'
import { aggregatePreparedCogPopulation, aggregatePreparedHeelPopulation, type TypicalCogProfile, type TypicalHeelProfile } from '../utils/typicalSogProfile'
import { relativeCogAxisBounds } from '../utils/typicalCogProfile'
import { calculateCogManeuverInsights, type CogManeuverInsights } from '../utils/maneuverCogInsights'
import ManeuverAngleRange, { type AngleBand } from './ManeuverAngleRange'

export function supportedSogPoints(profile: TypicalSogProfile): SogChartPoint[] {
  return profile.grid.map((point) => ({
    time: point.offsetSeconds * 1_000,
    sog: profile.status === 'ready' && point.contributorCount >= 3 ? point.medianSogKn : null,
  }))
}

export function supportedCogPoints(profile: TypicalCogProfile): SogChartPoint[] {
  return profile.grid.map((point) => ({
    time: point.offsetSeconds * 1_000,
    sog: profile.status === 'ready' && point.contributorCount >= 3 ? point.medianCogDeg : null,
  }))
}

export function supportedHeelPoints(profile: TypicalHeelProfile): SogChartPoint[] {
  return profile.grid.map((point) => ({
    time: point.offsetSeconds * 1_000,
    sog: profile.status === 'ready' && point.contributorCount >= 3 ? point.medianHeelDeg : null,
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

function countSummary(role: 'P' | 'C', profile: Pick<TypicalSogProfile, 'windowEligibleCount' | 'coverageEligibleCount'>, missingCourseCount: number) {
  const excluded = profile.windowEligibleCount - profile.coverageEligibleCount
  const warning = profile.coverageEligibleCount === 0 ? 'No usable profile'
    : profile.coverageEligibleCount < 3 ? 'At least 3 profiles needed' : null
  return <p className="maneuver-profile__count">
    <strong style={{ color: role === 'P' ? ACTIVITY_COLORS.primary : ACTIVITY_COLORS.comparison }}>{role}</strong> · {profile.windowEligibleCount} in window · {profile.coverageEligibleCount} used
    {excluded > 0 && <span> · {excluded} excluded{missingCourseCount > 0 ? ` (${missingCourseCount} without common ΔCOG)` : ''}</span>}
    {warning && <span> · {warning}</span>}
  </p>
}

function insightValue(value: number | null) {
  if (value === null) return '—'
  return `${value.toFixed(1)} kt`
}

function insightCard(label: string, metric: SogInsightMetric, p: SogManeuverInsights | null, c: SogManeuverInsights | null) {
  const primary = p?.[metric] ?? null
  const comparison = c?.[metric] ?? null
  return <div className="maneuver-insights__card" key={metric}>
    <h4>{label}</h4>
    <div className="maneuver-insights__values">
      <span><strong style={{ color: ACTIVITY_COLORS.primary }}>P</strong> {insightValue(primary)}</span>
      <span><strong style={{ color: ACTIVITY_COLORS.comparison }}>C</strong> {insightValue(comparison)}</span>
    </div>
    <p>{compareSogManeuverInsight(primary, comparison)}</p>
  </div>
}

function recoveryMarker(role: 'P' | 'C', recovery: SogProfileRecovery, bounds: SogAxisBounds, coincident: boolean) {
  if (recovery.status !== 'recovered') return null
  const { x, y } = sogManeuverCoordinates(recovery.offsetSeconds, recovery.sogKnots, bounds)
  const color = role === 'P' ? ACTIVITY_COLORS.primary : ACTIVITY_COLORS.comparison
  let markerOffset = 0
  if (coincident) markerOffset = role === 'P' ? (x > 990 ? -12 : -5) : (x > 990 ? -3 : 5)
  const markerX = x + markerOffset
  return <g key={role} data-profile-recovery={role} aria-label={`${role} profile recovery at +${recovery.offsetSeconds} seconds`}>
    <title>{`${role} profile recovery at +${recovery.offsetSeconds} seconds, ${recovery.sogKnots.toFixed(1)} knots`}</title>
    <line data-profile-recovery-guide={role} x1={x} x2={x} y1="8" y2="192" stroke={color} strokeOpacity="0.22" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    <circle cx={markerX} cy={y} r="5" fill={color} stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
  </g>
}

function recoveryChartLabel(role: 'P' | 'C', recovery: SogProfileRecovery, bounds: SogAxisBounds) {
  if (recovery.status !== 'recovered') return null
  const { x } = sogManeuverCoordinates(recovery.offsetSeconds, recovery.sogKnots, bounds)
  const position = x / 10
  const color = role === 'P' ? ACTIVITY_COLORS.primary : ACTIVITY_COLORS.comparison
  const horizontal = position > 95 ? '-100%' : '-50%'
  return <span className={`maneuver-profile__recovery-label maneuver-profile__recovery-label--${role.toLowerCase()}`}
    style={{ left: `${position}%`, backgroundColor: `${color}33`, borderColor: `${color}80`, transform: `translateX(${horizontal})` }}
    aria-label={`${role} profile recovery at +${recovery.offsetSeconds} seconds`}>
    {role} +{recovery.offsetSeconds}s
  </span>
}

function recoveryText(role: 'P' | 'C', recovery: SogProfileRecovery) {
  if (recovery.status === 'recovered') return `${role} +${recovery.offsetSeconds}s`
  return recovery.status === 'not_reached' ? `${role} not reached by +${MANEUVER_SOG_INSIGHTS.profileHalfSpanSeconds}s` : `${role} unavailable`
}

function cogValue(value: number | null, unit: '°' | 's', signed = false) {
  if (value === null) return 'Unavailable'
  return `${signed && value >= 0 ? '+' : ''}${value.toFixed(1)}${unit}`
}

function cogInsightCard(label: string, metric: 'turnAngleDeg' | 'turnMidpointSeconds' | 'turnDurationSeconds',
  primary: CogManeuverInsights | null, comparison: CogManeuverInsights | null) {
  const p = primary?.[metric] ?? null
  const c = comparison?.[metric] ?? null
  const unit = metric === 'turnAngleDeg' ? '°' : 's'
  const difference = p !== null && c !== null
    ? Math.abs(p - c).toFixed(1) === '0.0' ? `Same to 0.1${unit}` : `Difference ${Math.abs(p - c).toFixed(1)}${unit}`
    : 'Unavailable'
  return <div className="maneuver-insights__card">
    <h4>{label}</h4>
    <div className="maneuver-insights__values">
      <span><strong style={{ color: ACTIVITY_COLORS.primary }}>P</strong> {cogValue(p, unit, metric === 'turnMidpointSeconds')}</span>
      <span><strong style={{ color: ACTIVITY_COLORS.comparison }}>C</strong> {cogValue(c, unit, metric === 'turnMidpointSeconds')}</span>
    </div>
    <p>{difference}</p>
  </div>
}

export default function ManeuverSogComparison({ primary, comparison }: {
  primary: PreparedSogPopulation | null
  comparison?: PreparedSogPopulation | null
}) {
  const [signal, setSignal] = useState<'SOG' | 'COG' | 'HEEL'>('SOG')
  const [range, setRange] = useState<AngleBand>({
    minimum: MANEUVER_ANGLE_RANGE.initialMinimum,
    maximum: MANEUVER_ANGLE_RANGE.initialMaximum,
  })
  const pSog = useMemo(() => signal === 'SOG' && primary
    ? aggregatePreparedSogPopulation(primary, range.minimum, range.maximum) : null, [primary, range, signal])
  const cSog = useMemo(() => signal === 'SOG' && comparison
    ? aggregatePreparedSogPopulation(comparison, range.minimum, range.maximum) : null, [comparison, range, signal])
  const pCog = useMemo(() => signal === 'COG' && primary
    ? aggregatePreparedCogPopulation(primary, range.minimum, range.maximum) : null, [primary, range, signal])
  const cCog = useMemo(() => signal === 'COG' && comparison
    ? aggregatePreparedCogPopulation(comparison, range.minimum, range.maximum) : null, [comparison, range, signal])
  const pHeel = useMemo(() => signal === 'HEEL' && primary
    ? aggregatePreparedHeelPopulation(primary, range.minimum, range.maximum) : null, [primary, range, signal])
  const cHeel = useMemo(() => signal === 'HEEL' && comparison
    ? aggregatePreparedHeelPopulation(comparison, range.minimum, range.maximum) : null, [comparison, range, signal])
  const p = signal === 'SOG' ? pSog : signal === 'COG' ? pCog : pHeel
  const c = signal === 'SOG' ? cSog : signal === 'COG' ? cCog : cHeel
  const pRaw = signal === 'SOG' ? (pSog ? supportedSogPoints(pSog) : [])
    : signal === 'COG' ? (pCog ? supportedCogPoints(pCog) : []) : (pHeel ? supportedHeelPoints(pHeel) : [])
  const cRaw = signal === 'SOG' ? (cSog ? supportedSogPoints(cSog) : [])
    : signal === 'COG' ? (cCog ? supportedCogPoints(cCog) : []) : (cHeel ? supportedHeelPoints(cHeel) : [])
  const pCogInsights = signal === 'COG' && pCog ? calculateCogManeuverInsights(pRaw) : null
  const cCogInsights = signal === 'COG' && cCog ? calculateCogManeuverInsights(cRaw) : null
  const bounds = signal === 'COG' ? relativeCogAxisBounds(pRaw, cRaw) : sogManeuverAxisBounds(pRaw, cRaw)
  const pInsights = signal === 'SOG' && pSog ? calculateSogManeuverInsights(pRaw) : null
  const cInsights = signal === 'SOG' && cSog ? calculateSogManeuverInsights(cRaw) : null
  const pRecovery = calculateSogProfileRecovery(pRaw, pInsights?.entrySog ?? null)
  const cRecovery = calculateSogProfileRecovery(cRaw, cInsights?.entrySog ?? null)
  const coincidentRecovery = pRecovery.status === 'recovered' && cRecovery.status === 'recovered'
    && pRecovery.offsetSeconds === cRecovery.offsetSeconds && Math.abs(pRecovery.sogKnots - cRecovery.sogKnots) < 1e-9
  const recoveryComparison = comparison === undefined ? '' : compareSogProfileRecovery(pRecovery, cRecovery)
  const curves = [
    { role: 'comparison', raw: cRaw, color: ACTIVITY_COLORS.comparison },
    { role: 'primary', raw: pRaw, color: ACTIVITY_COLORS.primary },
  ]
  return <section className="maneuver-profile" aria-label={`Typical ${signal} maneuver comparison`}>
    <div className="metric-chart__heading"><div><strong>Typical {signal} through a maneuver</strong><span>{signal === 'SOG' ? 'Median knots' : signal === 'COG' ? 'Median relative course change (°)' : 'Median |HEEL| (°), magnitude of signed inclination'} · relative to event center</span></div>
      <span>Raw thin · smoothed bold</span></div>
    <div className="metric-options" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label="Maneuver profile signal">
      {(['SOG', 'COG', 'HEEL'] as const).map((option) => <button type="button" key={option} className={signal === option ? 'is-active' : ''}
        aria-pressed={signal === option} onClick={() => setSignal(option)}>{option}</button>)}
    </div>
    <ManeuverAngleRange range={range} onChange={setRange} />
    <p className="maneuver-profile__basis">Common |ΔCOG| filter from canonical course context; event ΔHDG/ΔCOG and HIGH/LOW evidence remain in the table.</p>
    {p && countSummary('P', p, primary!.missingCourseCount)}
    {c && countSummary('C', c, comparison!.missingCourseCount)}
    {!p && <p className="maneuver-profile__count">P profile data unavailable.</p>}
    {!c && comparison !== undefined && <p className="maneuver-profile__count">C profile data unavailable.</p>}
    <div className="metric-chart__canvas metric-chart__canvas--sog">
      <div className="sog-signal-chart">
        <div className="sog-signal-chart__y-axis" aria-hidden="true"><span>{bounds.maximum} {signal === 'SOG' ? 'kt' : '°'}</span><span>{((bounds.minimum + bounds.maximum) / 2).toFixed(1)} {signal === 'SOG' ? 'kt' : '°'}</span><span>{bounds.minimum} {signal === 'SOG' ? 'kt' : '°'}</span></div>
        <div className="sog-signal-chart__plot"><svg viewBox="0 0 1000 200" preserveAspectRatio="none" role="img" aria-label={`Median ${signal === 'SOG' ? 'SOG' : signal === 'COG' ? 'relative COG turn' : 'absolute HEEL magnitude'} by seconds from maneuver center`}>
          <g className="sog-signal-chart__grid" aria-hidden="true"><line x1="0" x2="1000" y1="8" y2="8" /><line x1="0" x2="1000" y1="100" y2="100" /><line x1="0" x2="1000" y1="192" y2="192" /></g>
          <line data-maneuver-center="true" x1="500" x2="500" y1="8" y2="192" />
          {curves.map(({ role, raw, color }) => {
            const rawPath = buildSogManeuverPath(raw, bounds)
            const smoothPath = buildSogManeuverPath(signal === 'SOG' ? smoothedAfterMedian(raw) : buildSogTrendPoints(raw), bounds)
            return <g key={role}>
              {rawPath && <path data-profile-series={`${role}-raw`} d={rawPath} fill="none" stroke={color} strokeWidth={SOG_SIGNAL_TUNING.rawStrokeWidth} strokeOpacity={SOG_SIGNAL_TUNING.rawOpacity} vectorEffect="non-scaling-stroke" />}
              {smoothPath && <path data-profile-series={`${role}-smoothed`} d={smoothPath} fill="none" stroke={color} strokeWidth={SOG_SIGNAL_TUNING.smoothedStrokeWidth} strokeOpacity={SOG_SIGNAL_TUNING.smoothedOpacity} vectorEffect="non-scaling-stroke" />}
            </g>
          })}
          {signal === 'SOG' && recoveryMarker('P', pRecovery, bounds, coincidentRecovery)}
          {signal === 'SOG' && recoveryMarker('C', cRecovery, bounds, coincidentRecovery)}
        </svg>
          {signal === 'SOG' && recoveryChartLabel('P', pRecovery, bounds)}
          {signal === 'SOG' && recoveryChartLabel('C', cRecovery, bounds)}
        </div>
        <div className="sog-signal-chart__x-axis" aria-hidden="true"><span>−25 s</span><span>t=0</span><span>+25 s</span></div>
      </div>
    </div>
    {signal === 'SOG' && <section className="maneuver-insights" aria-label="Maneuver Insights">
      <h3>Maneuver Insights</h3>
      <p>Supported raw median SOG</p>
      <div className="maneuver-insights__grid">{[
        insightCard('Entry SOG', 'entrySog', pInsights, cInsights),
        insightCard('Minimum SOG', 'minimumSog', pInsights, cInsights),
        insightCard('Exit SOG', 'exitSog', pInsights, cInsights),
      ]}</div>
      <p className="maneuver-insights__recovery"><strong>Profile recovery</strong> · <span style={{ color: ACTIVITY_COLORS.primary }}>{recoveryText('P', pRecovery)}</span>
        {comparison !== undefined && <> · <span style={{ color: ACTIVITY_COLORS.comparison }}>{recoveryText('C', cRecovery)}</span></>}
        {recoveryComparison && ` · ${recoveryComparison}`}
        <span> · from t=0; separate from table Recovery</span>
      </p>
    </section>}
    {signal === 'COG' && <section className="maneuver-insights" aria-label="COG Maneuver Insights">
      <h3>COG Maneuver Insights</h3>
      <p>Supported raw median relative COG</p>
      <div className="maneuver-insights__grid">
        {cogInsightCard('Turn angle', 'turnAngleDeg', pCogInsights, cCogInsights)}
        {cogInsightCard('Turn midpoint', 'turnMidpointSeconds', pCogInsights, cCogInsights)}
        {cogInsightCard('Turn duration (10–90%)', 'turnDurationSeconds', pCogInsights, cCogInsights)}
      </div>
    </section>}
    <p className="maneuver-profile__basis">Curves require 3 {signal}-eligible maneuvers and 3 contributors at each drawn second. Gaps remain open.{signal === 'COG' ? ' COG shows oriented relative turn degrees, not geographic course; t=0 remains the event center.' : ''}</p>
  </section>
}
