import { useMemo } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import {
  calculateVsDistributions,
  type ActivityVsDistribution,
  type MetricDistribution,
  type SogDistributionBin,
} from '../utils/vsDistribution'

interface VsDistributionViewProps {
  primarySamples: TrackSample[]
  comparisonSamples?: TrackSample[]
  analysisWindow: AnalysisWindowRange
}

type ActivityRole = 'Primary' | 'Comparison'

function formatCoverage(coverage: number) {
  return `${Math.round(coverage * 100)}%`
}

export function nicePercentageCeiling(maxPercentage: number) {
  const step = VS_CONFIG.percentageScaleStep
  if (!Number.isFinite(maxPercentage) || maxPercentage <= 0) return step
  return Math.ceil(maxPercentage / step - 1e-12) * step
}

function formatPercentageTick(percentage: number) {
  return `${percentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

function Coverage({
  primary,
  comparison,
}: {
  primary: MetricDistribution
  comparison: MetricDistribution | null
}) {
  return (
    <div className="vs-distribution__coverage" aria-label="Metric coverage">
      <span>
        <i aria-hidden="true" style={{ backgroundColor: ACTIVITY_COLORS.primary }} />
        P · {formatCoverage(primary.coverage)} coverage
      </span>
      {comparison && (
        <span>
          <i aria-hidden="true" style={{ backgroundColor: ACTIVITY_COLORS.comparison }} />
          C · {formatCoverage(comparison.coverage)} coverage
        </span>
      )}
    </div>
  )
}

function UnavailableMessages({
  title,
  metric,
  primary,
  comparison,
}: {
  title: string
  metric: 'SOG' | 'COG'
  primary: MetricDistribution
  comparison: MetricDistribution | null
}) {
  const messages: Array<{ role: ActivityRole, coverage: number }> = []
  if (!primary.eligible) messages.push({ role: 'Primary', coverage: primary.coverage })
  if (comparison && !comparison.eligible) {
    messages.push({ role: 'Comparison', coverage: comparison.coverage })
  }

  return messages.map(({ role, coverage }) => (
    <p className="vs-distribution__unavailable" key={role}>
      {title} unavailable for {role} · {metric} coverage {formatCoverage(coverage)}
    </p>
  ))
}

function SogHistogram({
  bins,
}: {
  bins: SogDistributionBin[]
}) {
  const { histogramWidth: width, histogramHeight: height, histogramMargin: margin } = VS_CONFIG
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom
  let maxPercentage = 0
  bins.forEach((bin) => {
    maxPercentage = Math.max(
      maxPercentage,
      bin.primaryPercentage ?? 0,
      bin.comparisonPercentage ?? 0,
    )
  })
  const scaleMaximum = nicePercentageCeiling(maxPercentage)
  const binWidth = chartWidth / Math.max(1, bins.length)
  const tickEvery = Math.max(1, Math.ceil(bins.length / VS_CONFIG.sogMaxTickCount))
  const barHeight = (percentage: number) => percentage / scaleMaximum * chartHeight

  return (
    <svg
      className="vs-distribution__histogram"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Time-weighted SOG histogram"
    >
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        className="vs-distribution__axis"
      />
      <line
        x1={margin.left}
        x2={margin.left}
        y1={margin.top}
        y2={height - margin.bottom}
        className="vs-distribution__axis"
      />
      {Array.from({ length: VS_CONFIG.histogramGuideLineCount }, (_unused, index) => {
        const guideNumber = index + 1
        const percentage = scaleMaximum * guideNumber / VS_CONFIG.histogramGuideLineCount
        const y = height - margin.bottom - percentage / scaleMaximum * chartHeight
        return (
          <g key={percentage}>
            <line
              data-guide="sog"
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke={VS_CONFIG.guideColor}
              strokeWidth={VS_CONFIG.guideStrokeWidth}
            />
            {guideNumber === VS_CONFIG.histogramGuideLineCount && (
              <text
                x={margin.left - 6}
                y={y + 4}
                textAnchor="end"
                className="vs-distribution__tick vs-distribution__y-tick"
              >
                {formatPercentageTick(scaleMaximum)}
              </text>
            )}
          </g>
        )
      })}
      {bins.map((bin, index) => {
        const x = margin.left + index * binWidth + binWidth * 0.06
        const renderedWidth = Math.max(1, binWidth * 0.88)
        return bin.comparisonPercentage !== null && (
          <rect
            data-activity-role="comparison"
            key={`comparison-${bin.start}`}
            x={x}
            y={height - margin.bottom - barHeight(bin.comparisonPercentage)}
            width={renderedWidth}
            height={barHeight(bin.comparisonPercentage)}
            fill={ACTIVITY_COLORS.comparison}
            fillOpacity={VS_CONFIG.comparisonOpacity}
            stroke={ACTIVITY_COLORS.comparison}
            strokeWidth={VS_CONFIG.comparisonStrokeWidth}
          />
        )
      })}
      {bins.map((bin, index) => {
        const x = margin.left + index * binWidth + binWidth * 0.06
        const renderedWidth = Math.max(1, binWidth * 0.88)
        return bin.primaryPercentage !== null && (
          <rect
            data-activity-role="primary"
            key={`primary-${bin.start}`}
            x={x}
            y={height - margin.bottom - barHeight(bin.primaryPercentage)}
            width={renderedWidth}
            height={barHeight(bin.primaryPercentage)}
            fill={ACTIVITY_COLORS.primary}
            fillOpacity={VS_CONFIG.primaryOpacity}
            stroke={ACTIVITY_COLORS.primary}
            strokeWidth={VS_CONFIG.primaryStrokeWidth}
          />
        )
      })}
      {bins.map((bin, index) => (
        <g key={bin.start}>
            {index % tickEvery === 0 && (
              <text
                x={margin.left + (index + 0.5) * binWidth}
                y={height - margin.bottom + 16}
                textAnchor="middle"
                className="vs-distribution__tick"
              >
                {bin.start.toFixed(bin.start % 1 === 0 ? 0 : 1)}
              </text>
            )}
        </g>
      ))}
      <text x={margin.left + chartWidth / 2} y={height - 5} textAnchor="middle" className="vs-distribution__axis-label">
        SOG (kt)
      </text>
    </svg>
  )
}

function polarPoint(center: number, radius: number, angleDegrees: number) {
  const radians = angleDegrees * Math.PI / 180
  return {
    x: center + radius * Math.sin(radians),
    y: center - radius * Math.cos(radians),
  }
}

function sectorPath(
  center: number,
  radius: number,
  centerAngle: number,
  binSize: number,
) {
  const start = polarPoint(center, radius, centerAngle - binSize / 2)
  const end = polarPoint(center, radius, centerAngle + binSize / 2)
  return [
    `M ${center} ${center}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ')
}

function CogRose({
  primary,
  comparison,
}: {
  primary: ActivityVsDistribution['cog']
  comparison: ActivityVsDistribution['cog'] | null
}) {
  const size = VS_CONFIG.roseSize
  const center = size / 2
  const radius = VS_CONFIG.roseRadius
  const eligiblePercentages = [
    ...(primary.eligible ? primary.sectorPercentages : []),
    ...(comparison?.eligible ? comparison.sectorPercentages : []),
  ]
  let maxPercentage = 0
  eligiblePercentages.forEach((percentage) => {
    maxPercentage = Math.max(maxPercentage, percentage)
  })
  const scaleMaximum = nicePercentageCeiling(maxPercentage)
  const radialLabelPoint = polarPoint(
    center,
    radius,
    VS_CONFIG.roseRadialLabelAngle,
  )
  const renderSectors = (
    percentages: number[],
    role: 'comparison' | 'primary',
    color: string,
    opacity: number,
    strokeWidth: number,
  ) => percentages.map((percentage, index) => (
    percentage > 0 && (
      <path
        data-activity-role={role}
        key={`${role}-${index}`}
        d={sectorPath(
          center,
          percentage / scaleMaximum * radius,
          index * VS_CONFIG.cogBinDeg,
          VS_CONFIG.cogBinDeg,
        )}
        fill={color}
        fillOpacity={opacity}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    )
  ))

  return (
    <svg
      className="vs-distribution__rose"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Time-weighted COG circular rose"
    >
      {Array.from({ length: VS_CONFIG.roseRingCount }, (_unused, index) => (
        <circle
          data-guide="cog"
          key={index}
          cx={center}
          cy={center}
          r={radius * (index + 1) / (VS_CONFIG.roseRingCount + 1)}
          fill="none"
          stroke={VS_CONFIG.guideColor}
          strokeWidth={VS_CONFIG.guideStrokeWidth}
        />
      ))}
      <circle
        cx={center}
        cy={center}
        r={radius}
        className="vs-distribution__axis"
        data-guide="cog-boundary"
      />
      <line
        data-guide="cog-axis"
        x1={center}
        y1={center - radius}
        x2={center}
        y2={center + radius}
        className="vs-distribution__axis"
      />
      <line
        data-guide="cog-axis"
        x1={center - radius}
        y1={center}
        x2={center + radius}
        y2={center}
        className="vs-distribution__axis"
      />
      {comparison?.eligible && renderSectors(
        comparison.sectorPercentages,
        'comparison',
        ACTIVITY_COLORS.comparison,
        VS_CONFIG.comparisonOpacity,
        VS_CONFIG.comparisonStrokeWidth,
      )}
      {primary.eligible && renderSectors(
        primary.sectorPercentages,
        'primary',
        ACTIVITY_COLORS.primary,
        VS_CONFIG.primaryOpacity,
        VS_CONFIG.primaryStrokeWidth,
      )}
      <text
        x={radialLabelPoint.x - VS_CONFIG.roseRadialLabelOffset}
        y={radialLabelPoint.y}
        textAnchor="end"
        dominantBaseline="middle"
        className="vs-distribution__tick vs-distribution__radial-label"
      >
        {formatPercentageTick(scaleMaximum)}
      </text>
      {Array.from(
        { length: 360 / VS_CONFIG.roseDegreeLabelStep },
        (_unused, index) => {
          const degrees = index * VS_CONFIG.roseDegreeLabelStep
          const point = polarPoint(
            center,
            radius + VS_CONFIG.roseDegreeLabelOffset,
            degrees,
          )
          return (
            <text
              key={degrees}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="vs-distribution__angular-label"
            >
              {degrees}°
            </text>
          )
        },
      )}
    </svg>
  )
}

export default function VsDistributionView({
  primarySamples,
  comparisonSamples,
  analysisWindow,
}: VsDistributionViewProps) {
  const distributions = useMemo(
    () => calculateVsDistributions(
      primarySamples,
      comparisonSamples ?? null,
      analysisWindow,
    ),
    [analysisWindow, comparisonSamples, primarySamples],
  )
  const { primary, comparison, sogBins } = distributions
  const hasSog = primary.sog.eligible || comparison?.sog.eligible === true
  const hasCog = primary.cog.eligible || comparison?.cog.eligible === true

  return (
    <section className="vs-distribution" aria-label="VS Analysis Window distributions">
      <article className="vs-distribution__panel">
        <header>
          <strong>Speed distribution</strong>
          <span>Time-weighted SOG</span>
        </header>
        <Coverage primary={primary.sog} comparison={comparison?.sog ?? null} />
        {hasSog
          ? <SogHistogram bins={sogBins} />
          : <p className="vs-distribution__empty">Speed distribution unavailable</p>}
        <UnavailableMessages
          title="Speed distribution"
          metric="SOG"
          primary={primary.sog}
          comparison={comparison?.sog ?? null}
        />
      </article>
      <article className="vs-distribution__panel">
        <header>
          <strong>Course distribution</strong>
          <span>Time-weighted COG</span>
        </header>
        <Coverage primary={primary.cog} comparison={comparison?.cog ?? null} />
        {hasCog
          ? <CogRose primary={primary.cog} comparison={comparison?.cog ?? null} />
          : <p className="vs-distribution__empty">Course distribution unavailable</p>}
        <UnavailableMessages
          title="Course distribution"
          metric="COG"
          primary={primary.cog}
          comparison={comparison?.cog ?? null}
        />
      </article>
    </section>
  )
}
