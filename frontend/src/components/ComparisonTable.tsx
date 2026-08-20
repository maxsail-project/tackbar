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

const rows: SummaryRow[] = [
  {
    label: 'Distance',
    format: (metrics) => `${metrics.distanceNm.toFixed(2)} NM`,
  },
  {
    label: 'Avg SOG',
    format: (metrics) => formatAverageSog(metrics.avgSogKnots),
  },
  {
    label: 'Dominant COG',
    format: (metrics) => formatNullable(metrics.dominantCogDegrees, 0, '°'),
  },
  {
    label: 'Avg HEEL',
    format: (metrics) => formatNullable(metrics.avgHeelDegrees, 1, '°'),
  },
  {
    label: 'Avg TRIM',
    format: (metrics) => formatNullable(metrics.avgTrimDegrees, 1, '°'),
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
