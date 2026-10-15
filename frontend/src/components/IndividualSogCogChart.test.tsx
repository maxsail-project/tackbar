import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { COG_SIGNAL_TUNING } from '../config/cogSignal'
import { SOG_SIGNAL_TUNING } from '../config/sogSignal'
import type { TrackSample } from '../types/track'
import {
  buildCanonicalCogChartPoints,
  buildCogSignalPath,
  buildSmoothedCogChartPoints,
  buildSogChartPoints,
  buildSogSignalPath,
  buildSogTrendPoints,
  insertCogWrapBreaks,
  reduceRawCogChartPoints,
  reduceRawSogChartPoints,
} from '../utils/metricChartData'
import IndividualSogCogChart, {
  INDIVIDUAL_SOG_COG_CHART_CONFIG,
} from './IndividualSogCogChart'

function sample(
  seconds: number,
  sog: number | null,
  cog: number | null,
): TrackSample {
  return {
    utc: new Date(Date.parse('2026-09-05T12:00:00Z') + seconds * 1_000).toISOString(),
    lat: 39,
    lon: 2,
    dist: seconds,
    sog,
    cog,
    hdg: null,
    heel: null,
    trim: null,
  }
}

const samples = [
  sample(0, 4, 359),
  sample(1, 8, 1),
  sample(2, 6, 3),
]

function renderChart(
  chartSamples: TrackSample[] | null = samples,
  playbackTime: number | null = Date.parse('2026-09-05T12:00:01Z'),
) {
  return renderToStaticMarkup(
    <IndividualSogCogChart
      samples={chartSamples}
      playbackTime={playbackTime}
      activityLabel="Sailor A · Boat A"
      sogColor="#168097"
    />,
  )
}

function seriesPath(markup: string, series: string) {
  const match = markup.match(
    new RegExp(`<path data-individual-signal-series="${series}" d="([^"]*)"`),
  )
  return match?.[1] ?? null
}

describe('Individual SOG + COG chart', () => {
  it('uses native SVG with separate SOG and fixed circular COG axes', () => {
    expect(INDIVIDUAL_SOG_COG_CHART_CONFIG).toEqual({
      cogDomain: [0, 360],
      cogTicks: [0, 90, 180, 270, 360],
      cogColor: '#60777e',
    })

    const markup = renderChart()

    expect(markup).toContain('<svg')
    expect(markup).toContain('SOG (kn)')
    expect(markup).toContain('COG (°)')
    expect(markup).toContain('>360°<')
    expect(markup).toContain('>0°<')
    expect(markup).toContain('SOG + COG over GPS time')
    expect(markup).not.toContain('recharts')
  })

  it('draws SOG raw, COG raw, SOG smoothed, then COG smoothed', () => {
    const markup = renderChart()
    const series = [...markup.matchAll(/data-individual-signal-series="([^"]+)"/g)]
      .map((match) => match[1])

    expect(series).toEqual([
      'sog-raw',
      'cog-raw',
      'sog-smoothed',
      'cog-smoothed',
    ])
  })

  it('uses Activity color for SOG, neutral gray for COG, and accepted role styling', () => {
    const markup = renderChart()

    expect(markup).toContain(
      `data-individual-signal-series="sog-raw" d="${seriesPath(markup, 'sog-raw')}" fill="none" stroke="#168097" stroke-opacity="${SOG_SIGNAL_TUNING.rawOpacity}" stroke-width="${SOG_SIGNAL_TUNING.rawStrokeWidth}"`,
    )
    expect(markup).toContain(
      `data-individual-signal-series="cog-raw" d="${seriesPath(markup, 'cog-raw')}" fill="none" stroke="#60777e" stroke-opacity="${COG_SIGNAL_TUNING.rawOpacity}" stroke-width="${COG_SIGNAL_TUNING.rawStrokeWidth}"`,
    )
    expect(markup).toContain(
      `data-individual-signal-series="sog-smoothed" d="${seriesPath(markup, 'sog-smoothed')}" fill="none" stroke="#168097" stroke-opacity="${SOG_SIGNAL_TUNING.smoothedOpacity}" stroke-width="${SOG_SIGNAL_TUNING.smoothedStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"`,
    )
    expect(markup).toContain(
      `data-individual-signal-series="cog-smoothed" d="${seriesPath(markup, 'cog-smoothed')}" fill="none" stroke="#60777e" stroke-opacity="${COG_SIGNAL_TUNING.smoothedOpacity}" stroke-width="${COG_SIGNAL_TUNING.smoothedStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"`,
    )
  })

  it('shows one compact role-only legend', () => {
    const markup = renderChart()

    expect(markup.match(/Signal role legend/g)).toHaveLength(1)
    expect(markup.match(/>Raw</g)).toHaveLength(1)
    expect(markup.match(/>Smoothed</g)).toHaveLength(1)
    expect(markup).not.toContain('SOG Raw')
    expect(markup).not.toContain('COG Raw')
  })

  it('uses the accepted full-sample smoothing and presentation-only raw reduction paths', () => {
    const denseSamples = Array.from({ length: 1_001 }, (_, index) =>
      sample(index / 10, 5 + (index % 9), 100 + (index % 20)),
    )
    const markup = renderChart(denseSamples)
    const range = {
      start: Date.parse(denseSamples[0].utc),
      end: Date.parse(denseSamples[denseSamples.length - 1].utc),
    }
    const sogPoints = buildSogChartPoints(denseSamples)
    const cogPoints = buildCanonicalCogChartPoints(denseSamples)
    const maximumSog = 13

    expect(seriesPath(markup, 'sog-raw')).toBe(
      buildSogSignalPath(
        reduceRawSogChartPoints(sogPoints, SOG_SIGNAL_TUNING.rawPointBudget),
        range,
        maximumSog,
      ),
    )
    expect(seriesPath(markup, 'sog-smoothed')).toBe(
      buildSogSignalPath(buildSogTrendPoints(sogPoints), range, maximumSog),
    )
    expect(seriesPath(markup, 'cog-raw')).toBe(
      buildCogSignalPath(
        reduceRawCogChartPoints(
          insertCogWrapBreaks(cogPoints),
          COG_SIGNAL_TUNING.rawPointBudget,
        ),
        range,
      ),
    )
    expect(seriesPath(markup, 'cog-smoothed')).toBe(
      buildCogSignalPath(buildSmoothedCogChartPoints(cogPoints), range),
    )
    expect(seriesPath(markup, 'sog-raw')?.match(/[ML]/g)).toHaveLength(
      SOG_SIGNAL_TUNING.rawPointBudget,
    )
    expect(seriesPath(markup, 'sog-smoothed')?.match(/[ML]/g)).toHaveLength(
      denseSamples.length,
    )
  })

  it('preserves COG wrap breaks, missing signal gaps, and partial signal availability', () => {
    const markup = renderChart([
      sample(0, 4, 359),
      sample(1, null, 1),
      sample(2, 6, null),
      sample(4, 8, 20),
    ])

    expect(seriesPath(markup, 'cog-raw')?.match(/M/g)?.length).toBeGreaterThan(1)
    expect(seriesPath(markup, 'sog-smoothed')?.match(/M/g)?.length).toBeGreaterThan(1)
    expect(renderChart([sample(0, null, 10), sample(1, null, 20)])).not.toContain(
      'data-individual-signal-series="sog-raw"',
    )
    expect(renderChart([sample(0, 4, null), sample(1, 5, null)])).not.toContain(
      'data-individual-signal-series="cog-raw"',
    )
  })

  it('retains the shared playback cursor and UTC Analysis Window labels', () => {
    const markup = renderChart()

    expect(markup).toContain(
      'data-individual-signal-playback-cursor="true" class="individual-sog-cog-signal__playback-cursor" x1="500" x2="500"',
    )
    expect(markup).toContain('12:00:00')
    expect(markup).toContain('12:00:01')
    expect(markup).toContain('12:00:02')
  })

  it('does not expose chart-local zoom, Reset, or tooltip interaction', () => {
    const markup = renderChart()

    expect(markup).not.toContain('Reset')
    expect(markup).not.toContain('tooltip')
    expect(markup).not.toContain('onPointer')
    expect(markup).not.toContain('touch-action: none')
  })
})
