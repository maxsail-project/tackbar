import type { SummaryMetrics } from '../utils/summaryMetrics'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { formatAverageSog } from '../utils/metricPresentation'

interface ComparisonTableProps {
  primaryLabel: string
  primaryMetrics: SummaryMetrics | null
  comparisonLabel?: string
  comparisonMetrics?: SummaryMetrics | null
}

interface SummaryRow {
  label: string
  format: (metrics: SummaryMetrics) => string
}

function formatNullable(
  value: number | null,
  fractionDigits: number,
  unit: string,
) {
  return value === null ? '—' : `${value.toFixed(fractionDigits)}${unit}`
}

function formatSignedDegrees(value: number | null) {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : '−'
  return `${sign}${Math.abs(value).toFixed(1)}°`
}

const rows: SummaryRow[] = [
  {
    label: 'Distance',
    format: (metrics) => `${Math.round(metrics.distanceMeters)} m`,
  },
  {
    label: 'Avg SOG',
    format: (metrics) => formatAverageSog(metrics.avgSogKnots),
  },
  {
    label: 'Max SOG',
    format: (metrics) => formatNullable(metrics.maxSogKnots, 2, ' kt'),
  },
  {
    label: 'Dominant COG',
    format: (metrics) => formatNullable(metrics.dominantCogDegrees, 0, '°'),
  },
  {
    label: 'Median HEEL +',
    format: (metrics) => formatSignedDegrees(
      metrics.medianPositiveHeelDegrees,
    ),
  },
  {
    label: 'Median HEEL −',
    format: (metrics) => formatSignedDegrees(
      metrics.medianNegativeHeelDegrees,
    ),
  },
  {
    label: 'Median TRIM +',
    format: (metrics) => formatSignedDegrees(
      metrics.medianPositiveTrimDegrees,
    ),
  },
  {
    label: 'Median TRIM −',
    format: (metrics) => formatSignedDegrees(
      metrics.medianNegativeTrimDegrees,
    ),
  },
]

export default function ComparisonTable({
  primaryLabel,
  primaryMetrics,
  comparisonLabel,
  comparisonMetrics,
}: ComparisonTableProps) {
  return (
    <section className="content-section" aria-labelledby="comparison-title">
      <p className="section-kicker" id="comparison-title">Summary</p>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">
                <span className="activity-identity">
                  <span
                    className="activity-identity__dot"
                    style={{ backgroundColor: ACTIVITY_COLORS.primary }}
                  />
                  {primaryLabel}
                </span>
              </th>
              {comparisonLabel && (
                <th scope="col">
                  <span className="activity-identity">
                    <span
                      className="activity-identity__dot"
                      style={{ backgroundColor: ACTIVITY_COLORS.comparison }}
                    />
                    {comparisonLabel}
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{primaryMetrics ? row.format(primaryMetrics) : '—'}</td>
                {comparisonLabel && (
                  <td>
                    {comparisonMetrics ? row.format(comparisonMetrics) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
