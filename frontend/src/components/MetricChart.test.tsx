import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SailingMetric } from '../types/session'
import type { TrackSample } from '../types/track'
import MetricChart from './MetricChart'

vi.mock('recharts', async () => {
  const React = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children)
  const empty = () => null

  return {
    CartesianGrid: empty,
    Line: ({ name, strokeOpacity }: { name: string; strokeOpacity?: number }) => React.createElement('i', {
      'data-series': name,
      ...(strokeOpacity === undefined ? {} : { 'data-stroke-opacity': strokeOpacity }),
    }),
    LineChart: passthrough,
    ReferenceArea: empty,
    ReferenceLine: empty,
    ResponsiveContainer: passthrough,
    Tooltip: empty,
    XAxis: empty,
    YAxis: empty,
  }
})

const samples: TrackSample[] = [
  {
    utc: '2026-09-05T12:00:00Z',
    lat: 39,
    lon: 2,
    dist: 0,
    sog: 5.2,
    cog: 120,
    hdg: 118,
    heel: -2.6,
    trim: 1.4,
  },
]

function renderChart(metric: SailingMetric, withComparison: boolean) {
  return renderToStaticMarkup(
    <MetricChart
      metric={metric}
      primarySamples={samples}
      comparisonSamples={withComparison ? samples : null}
      playbackTime={Date.parse(samples[0].utc)}
      primaryLabel="Primary"
      comparisonLabel="Comparison"
    />,
  )
}

describe('MetricChart series rendering hierarchy', () => {
  it.each(['SOG', 'COG', 'HEEL', 'TRIM'] as const)('renders Comparison below Primary for %s', (metric) => {
    const markup = renderChart(metric, true)

    expect(markup.indexOf('data-series="Comparison"')).toBeLessThan(markup.indexOf('data-series="Primary"'))
    expect(markup).toContain('data-series="Comparison" data-stroke-opacity="0.55"')
    expect(markup).toContain('data-series="Primary" data-stroke-opacity="0.85"')
  })

  it.each(['SOG', 'COG', 'HEEL', 'TRIM'] as const)('preserves full-opacity Primary-only rendering for %s', (metric) => {
    const markup = renderChart(metric, false)

    expect(markup).toContain('data-series="Primary"')
    expect(markup).not.toContain('data-series="Comparison"')
    expect(markup).not.toContain('data-stroke-opacity')
  })
})
