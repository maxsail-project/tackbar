import { HEEL_SOG_DENSITY_CONFIG } from '../config/heelSogDensity'
import type {
  ActivityHeelSogDensity,
  HeelSogDensityGeometry,
} from '../utils/heelSogDensity'

interface IndividualHeelSogDensityChartProps {
  activityLabel: string
  color: string
  density: ActivityHeelSogDensity
  geometry: HeelSogDensityGeometry
  sharedMaximumCellPercentage: number
}

const { viewBoxWidth, viewBoxHeight, plotMargin } = HEEL_SOG_DENSITY_CONFIG
const plotWidth = viewBoxWidth - plotMargin.left - plotMargin.right
const plotHeight = viewBoxHeight - plotMargin.top - plotMargin.bottom

function percentage(value: number) {
  return `${Math.round(value * 100)}%`
}

export function densityCellOpacity(
  cellPercentage: number,
  sharedMaximumCellPercentage: number,
) {
  if (cellPercentage <= 0 || sharedMaximumCellPercentage <= 0) return 0
  const ratio = Math.min(1, cellPercentage / sharedMaximumCellPercentage)
  return HEEL_SOG_DENSITY_CONFIG.minimumCellOpacity
    + ratio * (
      HEEL_SOG_DENSITY_CONFIG.maximumCellOpacity
      - HEEL_SOG_DENSITY_CONFIG.minimumCellOpacity
    )
}

export default function IndividualHeelSogDensityChart({
  activityLabel,
  color,
  density,
  geometry,
  sharedMaximumCellPercentage,
}: IndividualHeelSogDensityChartProps) {
  const cellWidth = plotWidth / geometry.sogBinCount
  const cellHeight = plotHeight / geometry.heelBinCount
  const heelTicks = [-40, -20, 0, 20, 40]
  const sogTicks = [
    geometry.sogMinimumKnots,
    (geometry.sogMinimumKnots + geometry.sogMaximumKnots) / 2,
    geometry.sogMaximumKnots,
  ]
  const zeroY = plotMargin.top
    + (geometry.heelMaximumDegrees / (
      geometry.heelMaximumDegrees - geometry.heelMinimumDegrees
    )) * plotHeight

  return (
    <section
      className="individual-heel-sog-density"
      aria-label={`${activityLabel} HEEL versus SOG density map`}
      data-shared-intensity-maximum={sharedMaximumCellPercentage}
      data-sog-maximum={geometry.sogMaximumKnots}
      data-sog-bin-count={geometry.sogBinCount}
      data-heel-bin-count={geometry.heelBinCount}
    >
      <div className="individual-heel-sog-density__heading">
        <div>
          <strong>HEEL vs SOG density</strong>
          <span>represented valid time · {percentage(density.coverage)} coverage</span>
        </div>
        <span className="individual-heel-sog-density__key">
          <i style={{ backgroundColor: color }} />
          More represented time
        </span>
      </div>

      {density.lowCoverage ? (
        <p className="individual-heel-sog-density__warning" role="status">
          Low joint HEEL + SOG coverage ({percentage(density.coverage)})
        </p>
      ) : null}

      <div className="individual-heel-sog-density__canvas">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          role="img"
          aria-label={`HEEL versus SOG represented-time density for ${activityLabel}`}
        >
          <rect
            className="individual-heel-sog-density__plot-background"
            x={plotMargin.left}
            y={plotMargin.top}
            width={plotWidth}
            height={plotHeight}
          />

          {density.cells.map((cell) => (
            <rect
              key={`${cell.heelBinIndex}:${cell.sogBinIndex}`}
              data-density-cell="true"
              data-heel-bin={cell.heelBinIndex}
              data-sog-bin={cell.sogBinIndex}
              data-percentage={cell.percentage}
              x={plotMargin.left + cell.sogBinIndex * cellWidth}
              y={
                plotMargin.top
                + (geometry.heelBinCount - cell.heelBinIndex - 1) * cellHeight
              }
              width={cellWidth}
              height={cellHeight}
              fill={color}
              fillOpacity={densityCellOpacity(
                cell.percentage,
                sharedMaximumCellPercentage,
              )}
            />
          ))}

          <line
            data-heel-zero-reference="true"
            className="individual-heel-sog-density__zero-reference"
            x1={plotMargin.left}
            x2={plotMargin.left + plotWidth}
            y1={zeroY}
            y2={zeroY}
          />

          <g className="individual-heel-sog-density__axis" aria-hidden="true">
            {heelTicks.map((tick) => {
              const y = plotMargin.top
                + (
                  (geometry.heelMaximumDegrees - tick)
                  / (geometry.heelMaximumDegrees - geometry.heelMinimumDegrees)
                ) * plotHeight
              return (
                <g key={tick}>
                  <line
                    x1={plotMargin.left - 4}
                    x2={plotMargin.left}
                    y1={y}
                    y2={y}
                  />
                  <text x={plotMargin.left - 8} y={y + 4} textAnchor="end">
                    {tick > 0 ? '+' : ''}{tick}°
                  </text>
                </g>
              )
            })}
            {sogTicks.map((tick, index) => {
              const x = plotMargin.left + (
                (tick - geometry.sogMinimumKnots)
                / (geometry.sogMaximumKnots - geometry.sogMinimumKnots)
              ) * plotWidth
              return (
                <g key={`${tick}-${index}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={plotMargin.top + plotHeight}
                    y2={plotMargin.top + plotHeight + 4}
                  />
                  <text
                    x={x}
                    y={plotMargin.top + plotHeight + 17}
                    textAnchor={index === 0 ? 'start' : index === 2 ? 'end' : 'middle'}
                  >
                    {Number.isInteger(tick) ? tick : tick.toFixed(2)}
                  </text>
                </g>
              )
            })}
            <text
              className="individual-heel-sog-density__axis-label"
              x={plotMargin.left + plotWidth / 2}
              y={viewBoxHeight - 5}
              textAnchor="middle"
            >
              SOG (kt)
            </text>
            <text
              className="individual-heel-sog-density__axis-label"
              x="13"
              y={plotMargin.top + plotHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90 13 ${plotMargin.top + plotHeight / 2})`}
            >
              HEEL (°)
            </text>
          </g>

          {density.cells.length === 0 ? (
            <text
              className="individual-heel-sog-density__empty"
              x={plotMargin.left + plotWidth / 2}
              y={plotMargin.top + plotHeight / 2}
              textAnchor="middle"
            >
              No valid joint HEEL + SOG represented time
            </text>
          ) : null}
        </svg>
      </div>
    </section>
  )
}
