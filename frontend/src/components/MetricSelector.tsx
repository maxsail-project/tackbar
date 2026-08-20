import type { SailingMetric } from '../types/session'

interface MetricSelectorProps {
  selectedMetric: SailingMetric
  onChange: (metric: SailingMetric) => void
}

const metrics: SailingMetric[] = ['SOG', 'COG', 'HEEL', 'TRIM']

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
        {metrics.map((metric) => {
          const isAvailable = metric === 'SOG' || metric === 'COG'

          return (
            <button
              type="button"
              key={metric}
              className={selectedMetric === metric ? 'is-active' : ''}
              onClick={() => onChange(metric)}
              aria-pressed={selectedMetric === metric}
              disabled={!isAvailable}
              title={isAvailable ? `${metric} time-series metric` : 'Available in a later increment'}
            >
              {metric}
            </button>
          )
        })}
      </div>
    </section>
  )
}
