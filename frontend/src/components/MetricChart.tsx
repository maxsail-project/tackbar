import type { SailingMetric } from '../types/session'

interface MetricChartProps {
  metric: SailingMetric
}

export default function MetricChart({ metric }: MetricChartProps) {
  return (
    <section className="chart-placeholder" aria-label={`${metric} chart placeholder`}>
      <div className="chart-placeholder__grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="chart-placeholder__content">
        <strong>{metric} chart</strong>
        <span>Metric data will appear here</span>
      </div>
    </section>
  )
}

