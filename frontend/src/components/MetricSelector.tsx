import { SAILING_METRICS, type SailingMetric } from '../types/session'

export const VIEWER_METRIC_VIEWS = ['VS', ...SAILING_METRICS] as const

export type ViewerMetricView = 'VS' | SailingMetric

export const DEFAULT_VIEWER_METRIC_VIEW: ViewerMetricView = 'VS'

interface MetricSelectorProps {
  selectedMetric: ViewerMetricView
  onChange: (metric: ViewerMetricView) => void
}

export default function MetricSelector({
  selectedMetric,
  onChange,
}: MetricSelectorProps) {
  return (
    <section className="content-section" aria-labelledby="metric-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="metric-title">Track Analysis</p>
          <p className="section-description">Shared Analysis Window</p>
        </div>
      </div>
      <div className="metric-options">
        {VIEWER_METRIC_VIEWS.map((metric) => (
          <button
            type="button"
            key={metric}
            className={selectedMetric === metric ? 'is-active' : ''}
            onClick={() => onChange(metric)}
            aria-pressed={selectedMetric === metric}
            title={metric === 'VS' ? 'VS distribution view' : `${metric} time-series metric`}
          >
            {metric}
          </button>
        ))}
      </div>
    </section>
  )
}
