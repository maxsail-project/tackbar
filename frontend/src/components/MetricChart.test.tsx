import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { COG_SIGNAL_TUNING } from '../config/cogSignal'
import { HEEL_SIGNAL_TUNING } from '../config/heelSignal'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import { TRIM_SIGNAL_TUNING } from '../config/trimSignal'
import type { SailingMetric } from '../types/session'
import type { TrackSample } from '../types/track'
import MetricChart from './MetricChart'

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

function sogLegendRoleTag(markup: string, role: string) {
  const tag = markup.match(new RegExp(`<line[^>]*data-sog-legend-role="${role}"[^>]*>`))?.[0]
  expect(tag).toBeDefined()
  return tag ?? ''
}

function cogSeriesTag(markup: string, series: string) {
  const tag = markup.match(new RegExp(`<path[^>]*data-cog-series="${series}"[^>]*>`))?.[0]
  expect(tag).toBeDefined()
  return tag ?? ''
}

function cogSeriesPath(markup: string, series: string) {
  const tag = cogSeriesTag(markup, series)
  return tag.match(/ d="([^"]+)"/)?.[1] ?? ''
}

function cogLegendRoleTag(markup: string, role: string) {
  const tag = markup.match(new RegExp(`<line[^>]*data-cog-legend-role="${role}"[^>]*>`))?.[0]
  expect(tag).toBeDefined()
  return tag ?? ''
}

function heelSeriesTag(markup: string, series: string) {
  const tag = markup.match(new RegExp(`<path[^>]*data-heel-series="${series}"[^>]*>`))?.[0]
  expect(tag).toBeDefined()
  return tag ?? ''
}

function heelSeriesPath(markup: string, series: string) {
  return heelSeriesTag(markup, series).match(/ d="([^"]+)"/)?.[1] ?? ''
}

function trimSeriesTag(markup: string, series: string) {
  const tag = markup.match(new RegExp(`<path[^>]*data-trim-series="${series}"[^>]*>`))?.[0]
  expect(tag).toBeDefined()
  return tag ?? ''
}

function trimSeriesPath(markup: string, series: string) {
  return trimSeriesTag(markup, series).match(/ d="([^"]+)"/)?.[1] ?? ''
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
      rawOpacity: 0.6,
      rawStrokeWidth: 0.8,
      smoothedOpacity: 0.6,
      smoothedStrokeWidth: 4,
      smoothingWindowSeconds: 10,
      rawPointBudget: 800,
    })
    expect(comparisonSmoothed).toContain('stroke-linecap="round"')
    expect(comparisonSmoothed).toContain('stroke-linejoin="round"')
    expect(primarySmoothed).toContain('stroke-linecap="round"')
    expect(primarySmoothed).toContain('stroke-linejoin="round"')
  })

  it('renders a compact role-only legend using the configured raw and smoothed styles', () => {
    const markup = renderChart('SOG', true)
    const legend = markup.match(/<ul class="sog-signal-chart__legend"[^>]*>[\s\S]*?<\/ul>/)?.[0]

    expect(legend).toBeDefined()
    expect(legend).toContain('Raw')
    expect(legend).toContain('Smoothed')
    expect(legend).not.toContain('Primary')
    expect(legend).not.toContain('Comparison')
    expect(sogLegendRoleTag(markup, 'raw')).toContain(
      `stroke-width="${SOG_SIGNAL_TUNING.rawStrokeWidth}" stroke-opacity="${SOG_SIGNAL_TUNING.rawOpacity}"`,
    )
    expect(sogLegendRoleTag(markup, 'smoothed')).toContain(
      `stroke-width="${SOG_SIGNAL_TUNING.smoothedStrokeWidth}" stroke-opacity="${SOG_SIGNAL_TUNING.smoothedOpacity}"`,
    )
  })

  it('reduces only raw native-SVG paths while retaining full trend inputs', () => {
    const denseSamples = Array.from({ length: 900 }, (_, index): TrackSample => ({
      ...samples[0],
      utc: new Date(Date.parse(samples[0].utc) + index * 100).toISOString(),
      sog: 4 + (index % 5),
    }))
    const markup = renderChart('SOG', false, denseSamples)

    expect(sogSeriesPath(markup, 'primary-raw').match(/[ML]/g))
      .toHaveLength(SOG_SIGNAL_TUNING.rawPointBudget)
    expect(sogSeriesPath(markup, 'primary-smoothed').match(/[ML]/g)).toHaveLength(900)
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

  it('renders P/C COG as native SVG in C raw, P raw, C smooth, P smooth order', () => {
    const markup = renderChart('COG', true)
    const series = [...markup.matchAll(/data-cog-series="([^"]+)"/g)]
      .map((match) => match[1])

    expect(markup).toContain('<svg viewBox="0 0 1000 200"')
    expect(markup).not.toContain('data-recharts-chart')
    expect(series).toEqual([
      'comparison-raw',
      'primary-raw',
      'comparison-smoothed',
      'primary-smoothed',
    ])
    expect(cogSeriesTag(markup, 'comparison-raw'))
      .toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
    expect(cogSeriesTag(markup, 'comparison-smoothed'))
      .toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
    expect(cogSeriesTag(markup, 'primary-raw'))
      .toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
    expect(cogSeriesTag(markup, 'primary-smoothed'))
      .toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
  })

  it('renders P-only COG with raw context and foreground smoothing', () => {
    const markup = renderChart('COG', false)

    expect([...markup.matchAll(/data-cog-series="([^"]+)"/g)].map((match) => match[1]))
      .toEqual(['primary-raw', 'primary-smoothed'])
  })

  it('uses equal P/C COG role styling and a compact role-only legend', () => {
    const markup = renderChart('COG', true)
    const comparisonRaw = cogSeriesTag(markup, 'comparison-raw')
    const primaryRaw = cogSeriesTag(markup, 'primary-raw')
    const comparisonSmoothed = cogSeriesTag(markup, 'comparison-smoothed')
    const primarySmoothed = cogSeriesTag(markup, 'primary-smoothed')
    const rawStyle = `stroke-width="${COG_SIGNAL_TUNING.rawStrokeWidth}" stroke-opacity="${COG_SIGNAL_TUNING.rawOpacity}"`
    const smoothedStyle = `stroke-width="${COG_SIGNAL_TUNING.smoothedStrokeWidth}" stroke-opacity="${COG_SIGNAL_TUNING.smoothedOpacity}"`
    const legend = markup.match(/<ul class="cog-signal-chart__legend"[^>]*>[\s\S]*?<\/ul>/)?.[0]

    expect(comparisonRaw).toContain(rawStyle)
    expect(primaryRaw).toContain(rawStyle)
    expect(comparisonSmoothed).toContain(smoothedStyle)
    expect(primarySmoothed).toContain(smoothedStyle)
    expect(legend).toContain('Raw')
    expect(legend).toContain('Smoothed')
    expect(legend).not.toContain('Primary')
    expect(legend).not.toContain('Comparison')
    expect(cogLegendRoleTag(markup, 'raw')).toContain(rawStyle)
    expect(cogLegendRoleTag(markup, 'smoothed')).toContain(smoothedStyle)
  })

  it('reduces only raw COG paths while smoothing all canonical samples', () => {
    const denseSamples = Array.from({ length: 900 }, (_, index): TrackSample => ({
      ...samples[0],
      utc: new Date(Date.parse(samples[0].utc) + index * 100).toISOString(),
      cog: 120 + (index % 5),
    }))
    const markup = renderChart('COG', false, denseSamples)

    expect(cogSeriesPath(markup, 'primary-raw').match(/[ML]/g))
      .toHaveLength(COG_SIGNAL_TUNING.rawPointBudget)
    expect(cogSeriesPath(markup, 'primary-smoothed').match(/[ML]/g)).toHaveLength(900)
  })

  it('keeps fixed COG axes and positions the playback cursor on shared UTC', () => {
    const chartSamples: TrackSample[] = [
      { ...samples[0], utc: '2026-09-05T12:00:00Z', cog: 359 },
      { ...samples[0], utc: '2026-09-05T12:00:02Z', cog: 1 },
    ]
    const markup = renderChart(
      'COG',
      false,
      chartSamples,
      Date.parse('2026-09-05T12:00:01Z'),
    )

    expect(markup).toContain('>360°</span>')
    expect(markup).toContain('>180°</span>')
    expect(markup).toContain('>0°</span>')
    expect(markup).toContain('data-cog-playback-cursor="true" x1="500" x2="500"')
  })

  it('updates the native-SVG COG UTC axis from Analysis Window-filtered samples', () => {
    const full = renderChart('COG', false, [
      { ...samples[0], utc: '2026-09-05T12:00:00Z' },
      { ...samples[0], utc: '2026-09-05T12:00:10Z' },
    ])
    const narrowed = renderChart('COG', false, [
      { ...samples[0], utc: '2026-09-05T12:00:02Z' },
      { ...samples[0], utc: '2026-09-05T12:00:08Z' },
    ])

    expect(full).toContain('>12:00:00</time>')
    expect(full).toContain('>12:00:10</time>')
    expect(narrowed).toContain('>12:00:02</time>')
    expect(narrowed).toContain('>12:00:08</time>')
  })

  it('has no COG local zoom, Reset, Recharts chart, or tooltip chrome', () => {
    const markup = renderChart('COG', false)

    expect(markup).toContain('class="cog-signal-chart__x-axis"')
    expect(markup).not.toContain('metric-chart__reset')
    expect(markup).not.toContain('>Reset</button>')
    expect(markup).not.toContain('data-recharts-chart')
    expect(markup).not.toContain('data-recharts-tooltip')
  })

  it('renders P/C HEEL as native SVG in Comparison then Primary order', () => {
    const markup = renderChart('HEEL', true)
    const series = [...markup.matchAll(/data-heel-series="([^"]+)"/g)]
      .map((match) => match[1])

    expect(markup).toContain('<svg viewBox="0 0 1000 200"')
    expect(markup).not.toContain('data-recharts-chart')
    expect(series).toEqual(['comparison', 'primary'])
    expect(heelSeriesTag(markup, 'comparison'))
      .toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
    expect(heelSeriesTag(markup, 'primary'))
      .toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
  })

  it('renders P-only HEEL with the configured stepped trace treatment', () => {
    const markup = renderChart('HEEL', false)
    const primary = heelSeriesTag(markup, 'primary')
    const traceStyle = `stroke-width="${HEEL_SIGNAL_TUNING.traceStrokeWidth}" stroke-opacity="${HEEL_SIGNAL_TUNING.traceOpacity}"`

    expect([...markup.matchAll(/data-heel-series="([^"]+)"/g)].map((match) => match[1]))
      .toEqual(['primary'])
    expect(primary).toContain(traceStyle)
  })

  it('uses equal P/C HEEL styling from centralized tuning', () => {
    const markup = renderChart('HEEL', true)
    const traceStyle = `stroke-width="${HEEL_SIGNAL_TUNING.traceStrokeWidth}" stroke-opacity="${HEEL_SIGNAL_TUNING.traceOpacity}"`

    expect(HEEL_SIGNAL_TUNING).toEqual({
      bucketSeconds: 2,
      maxGapSeconds: 1.5,
      traceOpacity: 0.6,
      traceStrokeWidth: 3,
    })
    expect(heelSeriesTag(markup, 'comparison')).toContain(traceStyle)
    expect(heelSeriesTag(markup, 'primary')).toContain(traceStyle)
  })

  it('renders one step instead of the full raw high-frequency HEEL signal', () => {
    const denseSamples = Array.from({ length: 21 }, (_, index): TrackSample => ({
      ...samples[0],
      utc: new Date(Date.parse(samples[0].utc) + index * 100).toISOString(),
      heel: (index % 21) - 10,
    }))
    const markup = renderChart('HEEL', false, denseSamples)

    expect(heelSeriesPath(markup, 'primary').match(/[ML]/g))
      .toHaveLength(2)
  })

  it('keeps signed HEEL, the zero reference, and the playback cursor visible', () => {
    const chartSamples: TrackSample[] = [
      { ...samples[0], utc: '2026-09-05T12:00:00Z', heel: -10 },
      { ...samples[0], utc: '2026-09-05T12:00:01Z', heel: -10 },
      { ...samples[0], utc: '2026-09-05T12:00:02Z', heel: null },
      { ...samples[0], utc: '2026-09-05T12:00:03Z', heel: 10 },
      { ...samples[0], utc: '2026-09-05T12:00:04Z', heel: 10 },
    ]
    const markup = renderChart(
      'HEEL',
      false,
      chartSamples,
      Date.parse('2026-09-05T12:00:02Z'),
    )

    expect(heelSeriesPath(markup, 'primary'))
      .toBe('M0.00,192.00 L500.00,192.00 M500.00,8.00 L1000.00,8.00')
    expect(markup).toContain('data-heel-zero-reference="true"')
    expect(markup).toContain('y1="100" y2="100"')
    expect(markup).toContain('data-heel-playback-cursor="true" x1="500" x2="500"')
  })

  it('updates the native-SVG HEEL UTC axis from Analysis Window-filtered samples', () => {
    const intervalSamples = (startSecond: number, endSecond: number) => Array.from(
      { length: endSecond - startSecond + 1 },
      (_, index): TrackSample => ({
        ...samples[0],
        utc: new Date(Date.parse('2026-09-05T12:00:00Z') + (startSecond + index) * 1_000)
          .toISOString(),
      }),
    )
    const full = renderChart('HEEL', false, intervalSamples(0, 10))
    const narrowed = renderChart('HEEL', false, intervalSamples(2, 8))

    expect(full).toContain('>12:00:00</time>')
    expect(full).toContain('>12:00:10</time>')
    expect(narrowed).toContain('>12:00:02</time>')
    expect(narrowed).toContain('>12:00:08</time>')
  })

  it('has no HEEL local zoom, Reset, Recharts chart, tooltip, or smoothing role', () => {
    const markup = renderChart('HEEL', false)

    expect(markup).toContain('class="heel-signal-chart__x-axis"')
    expect(markup).not.toContain('metric-chart__reset')
    expect(markup).not.toContain('>Reset</button>')
    expect(markup).not.toContain('data-recharts-chart')
    expect(markup).not.toContain('data-recharts-tooltip')
    expect(markup).not.toContain('Smoothed')
  })

  it('renders P/C TRIM as native SVG in Comparison then Primary order', () => {
    const markup = renderChart('TRIM', true)
    const series = [...markup.matchAll(/data-trim-series="([^"]+)"/g)]
      .map((match) => match[1])

    expect(markup).toContain('<svg viewBox="0 0 1000 200"')
    expect(markup).not.toContain('data-recharts-chart')
    expect(series).toEqual(['comparison', 'primary'])
    expect(trimSeriesTag(markup, 'comparison'))
      .toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
    expect(trimSeriesTag(markup, 'primary'))
      .toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
  })

  it('renders P-only TRIM with the same configured raw trace treatment', () => {
    const markup = renderChart('TRIM', false)
    const primary = trimSeriesTag(markup, 'primary')
    const traceStyle = `stroke-width="${TRIM_SIGNAL_TUNING.traceStrokeWidth}" stroke-opacity="${TRIM_SIGNAL_TUNING.traceOpacity}"`

    expect([...markup.matchAll(/data-trim-series="([^"]+)"/g)].map((match) => match[1]))
      .toEqual(['primary'])
    expect(primary).toContain(traceStyle)
  })

  it('uses equal P/C TRIM styling from centralized tuning', () => {
    const markup = renderChart('TRIM', true)
    const traceStyle = `stroke-width="${TRIM_SIGNAL_TUNING.traceStrokeWidth}" stroke-opacity="${TRIM_SIGNAL_TUNING.traceOpacity}"`

    expect(TRIM_SIGNAL_TUNING).toEqual({
      traceOpacity: 0.6,
      traceStrokeWidth: 3,
      rawPointBudget: 800,
    })
    expect(trimSeriesTag(markup, 'comparison')).toContain(traceStyle)
    expect(trimSeriesTag(markup, 'primary')).toContain(traceStyle)
  })

  it('reduces the rendered TRIM path to the configured point budget', () => {
    const denseSamples = Array.from({ length: 900 }, (_, index): TrackSample => ({
      ...samples[0],
      utc: new Date(Date.parse(samples[0].utc) + index * 100).toISOString(),
      trim: (index % 21) - 10,
    }))
    const markup = renderChart('TRIM', false, denseSamples)

    expect(trimSeriesPath(markup, 'primary').match(/[ML]/g))
      .toHaveLength(TRIM_SIGNAL_TUNING.rawPointBudget)
  })

  it('keeps signed TRIM, the zero reference, and the playback cursor visible', () => {
    const chartSamples: TrackSample[] = [
      { ...samples[0], utc: '2026-09-05T12:00:00Z', trim: -10 },
      { ...samples[0], utc: '2026-09-05T12:00:01Z', trim: null },
      { ...samples[0], utc: '2026-09-05T12:00:02Z', trim: 10 },
    ]
    const markup = renderChart(
      'TRIM',
      false,
      chartSamples,
      Date.parse('2026-09-05T12:00:01Z'),
    )

    expect(trimSeriesPath(markup, 'primary'))
      .toBe('M0.00,192.00 M1000.00,8.00')
    expect(markup).toContain('data-trim-zero-reference="true"')
    expect(markup).toContain('y1="100" y2="100"')
    expect(markup).toContain('data-trim-playback-cursor="true" x1="500" x2="500"')
  })

  it('updates the native-SVG TRIM UTC axis from Analysis Window-filtered samples', () => {
    const full = renderChart('TRIM', false, [
      { ...samples[0], utc: '2026-09-05T12:00:00Z' },
      { ...samples[0], utc: '2026-09-05T12:00:10Z' },
    ])
    const narrowed = renderChart('TRIM', false, [
      { ...samples[0], utc: '2026-09-05T12:00:02Z' },
      { ...samples[0], utc: '2026-09-05T12:00:08Z' },
    ])

    expect(full).toContain('>12:00:00</time>')
    expect(full).toContain('>12:00:10</time>')
    expect(narrowed).toContain('>12:00:02</time>')
    expect(narrowed).toContain('>12:00:08</time>')
  })

  it('has no TRIM local zoom, Reset, Recharts chart, tooltip, or smoothing role', () => {
    const markup = renderChart('TRIM', false)

    expect(markup).toContain('class="trim-signal-chart__x-axis"')
    expect(markup).not.toContain('metric-chart__reset')
    expect(markup).not.toContain('>Reset</button>')
    expect(markup).not.toContain('data-recharts-chart')
    expect(markup).not.toContain('data-recharts-tooltip')
    expect(markup).not.toContain('Smoothed')
  })
})
