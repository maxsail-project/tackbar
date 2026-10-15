import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
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
    LineChart: ({ children }: { children?: React.ReactNode }) => React.createElement(
      'div',
      { 'data-recharts-chart': 'true' },
      children,
    ),
    ReferenceArea: empty,
    ReferenceLine: empty,
    ResponsiveContainer: passthrough,
    Tooltip: () => React.createElement('i', { 'data-recharts-tooltip': 'true' }),
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
  {
    utc: '2026-09-05T12:00:01Z',
    lat: 39.0001,
    lon: 2.0001,
    dist: 1,
    sog: 5.6,
    cog: 122,
    hdg: 120,
    heel: -2.2,
    trim: 1.2,
  },
]

function renderChart(
  metric: SailingMetric,
  withComparison: boolean,
  chartSamples: TrackSample[] = samples,
  playbackTime = Date.parse(chartSamples[0].utc),
) {
  return renderToStaticMarkup(
    <MetricChart
      metric={metric}
      primarySamples={chartSamples}
      comparisonSamples={withComparison ? chartSamples : null}
      playbackTime={playbackTime}
      primaryLabel="Primary"
      comparisonLabel="Comparison"
    />,
  )
}

function sogSeriesTag(markup: string, series: string) {
  const tag = markup.match(new RegExp(`<path[^>]*data-sog-series="${series}"[^>]*>`))?.[0]
  expect(tag).toBeDefined()
  return tag ?? ''
}

function sogSeriesPath(markup: string, series: string) {
  const tag = sogSeriesTag(markup, series)
  return tag.match(/ d="([^"]+)"/)?.[1] ?? ''
}

describe('MetricChart series rendering hierarchy', () => {
  it('renders P/C SOG as native SVG in C raw, P raw, C smooth, P smooth order', () => {
    const markup = renderChart('SOG', true)
    const series = [...markup.matchAll(/data-sog-series="([^"]+)"/g)]
      .map((match) => match[1])

    expect(markup).toContain('<svg viewBox="0 0 1000 200"')
    expect(markup).not.toContain('data-recharts-chart')
    expect(series).toEqual([
      'comparison-raw',
      'primary-raw',
      'comparison-smoothed',
      'primary-smoothed',
    ])
    expect(sogSeriesTag(markup, 'comparison-raw'))
      .toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
    expect(sogSeriesTag(markup, 'comparison-smoothed'))
      .toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
    expect(sogSeriesTag(markup, 'primary-raw'))
      .toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
    expect(sogSeriesTag(markup, 'primary-smoothed'))
      .toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
  })

  it('renders P-only SOG with raw context and foreground trend', () => {
    const markup = renderChart('SOG', false)

    expect([...markup.matchAll(/data-sog-series="([^"]+)"/g)].map((match) => match[1]))
      .toEqual(['primary-raw', 'primary-smoothed'])
  })

  it('uses equal P/C visual weight for equivalent roles and stronger trends', () => {
    const markup = renderChart('SOG', true)
    const comparisonRaw = sogSeriesTag(markup, 'comparison-raw')
    const primaryRaw = sogSeriesTag(markup, 'primary-raw')
    const comparisonSmoothed = sogSeriesTag(markup, 'comparison-smoothed')
    const primarySmoothed = sogSeriesTag(markup, 'primary-smoothed')

    const rawStyle = `stroke-width="${SOG_SIGNAL_TUNING.rawStrokeWidth}" stroke-opacity="${SOG_SIGNAL_TUNING.rawOpacity}"`
    const smoothedStyle = `stroke-width="${SOG_SIGNAL_TUNING.smoothedStrokeWidth}" stroke-opacity="${SOG_SIGNAL_TUNING.smoothedOpacity}"`
    expect(comparisonRaw).toContain(rawStyle)
    expect(primaryRaw).toContain(rawStyle)
    expect(comparisonSmoothed).toContain(smoothedStyle)
    expect(primarySmoothed).toContain(smoothedStyle)
    expect(SOG_SIGNAL_TUNING).toEqual({
      rawOpacity: 0.25,
      rawStrokeWidth: 1,
      smoothedOpacity: 0.95,
      smoothedStrokeWidth: 3.25,
      smoothingWindowSeconds: 2,
    })
  })

  it('reduces only raw native-SVG paths while retaining full trend inputs', () => {
    const denseSamples = Array.from({ length: 300 }, (_, index): TrackSample => ({
      ...samples[0],
      utc: new Date(Date.parse(samples[0].utc) + index * 100).toISOString(),
      sog: 4 + (index % 5),
    }))
    const markup = renderChart('SOG', false, denseSamples)

    expect(sogSeriesPath(markup, 'primary-raw').match(/[ML]/g)).toHaveLength(240)
    expect(sogSeriesPath(markup, 'primary-smoothed').match(/[ML]/g)).toHaveLength(300)
  })

  it('positions the native-SVG playback cursor on the shared UTC range', () => {
    const chartSamples: TrackSample[] = [
      { ...samples[0], utc: '2026-09-05T12:00:00Z' },
      { ...samples[0], utc: '2026-09-05T12:00:02Z' },
    ]
    const markup = renderChart(
      'SOG',
      false,
      chartSamples,
      Date.parse('2026-09-05T12:00:01Z'),
    )

    expect(markup).toContain('data-sog-playback-cursor="true" x1="500" x2="500"')
  })

  it('updates the native-SVG UTC axis from Analysis Window-filtered samples', () => {
    const full = renderChart('SOG', false, [
      { ...samples[0], utc: '2026-09-05T12:00:00Z' },
      { ...samples[0], utc: '2026-09-05T12:00:10Z' },
    ])
    const narrowed = renderChart('SOG', false, [
      { ...samples[0], utc: '2026-09-05T12:00:02Z' },
      { ...samples[0], utc: '2026-09-05T12:00:08Z' },
    ])

    expect(full).toContain('>12:00:00</time>')
    expect(full).toContain('>12:00:10</time>')
    expect(narrowed).toContain('>12:00:02</time>')
    expect(narrowed).toContain('>12:00:08</time>')
  })

  it('has simple UTC/knots axes without SOG local zoom, Reset, or tooltip chrome', () => {
    const markup = renderChart('SOG', false)

    expect(markup).toContain('class="sog-signal-chart__y-axis"')
    expect(markup).toContain('class="sog-signal-chart__x-axis"')
    expect(markup).toContain('kt</span>')
    expect(markup).not.toContain('metric-chart__reset')
    expect(markup).not.toContain('>Reset</button>')
    expect(markup).not.toContain('data-recharts-tooltip')
  })

  it.each(['COG', 'HEEL', 'TRIM'] as const)('preserves Recharts Comparison below Primary for %s', (metric) => {
    const markup = renderChart(metric, true)

    expect(markup).toContain('data-recharts-chart="true"')
    expect(markup.indexOf('data-series="Comparison"')).toBeLessThan(markup.indexOf('data-series="Primary"'))
    expect(markup).toContain('data-series="Comparison" data-stroke-opacity="0.55"')
    expect(markup).toContain('data-series="Primary" data-stroke-opacity="0.85"')
  })

  it.each(['COG', 'HEEL', 'TRIM'] as const)('preserves full-opacity Recharts Primary-only rendering for %s', (metric) => {
    const markup = renderChart(metric, false)

    expect(markup).toContain('data-series="Primary"')
    expect(markup).not.toContain('data-series="Comparison"')
    expect(markup).not.toContain('data-stroke-opacity')
  })
})
