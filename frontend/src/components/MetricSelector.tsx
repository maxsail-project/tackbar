import { SAILING_METRICS, type SailingMetric } from '../types/session'

interface MetricSelectorProps {
  selectedMetric: SailingMetric
  onChange: (metric: SailingMetric) => void
}

export default function MetricSelector({
  selectedMetric,
  onChange,
}: MetricSelectorProps) {
  return (
    <section className="content-section" aria-labelledby="metric-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="metric-title">Metric</p>
          <p className="section-description">Shared by both selected tracks</p>
        </div>
      </div>
      <div className="metric-options">
        {SAILING_METRICS.map((metric) => (
          <button
            type="button"
            key={metric}
            className={selectedMetric === metric ? 'is-active' : ''}
            onClick={() => onChange(metric)}
            aria-pressed={selectedMetric === metric}
            title={`${metric} time-series metric`}
          >
            {metric}
          </button>
        ))}
      </div>
    </section>
  )
}
