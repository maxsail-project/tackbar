import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import IndividualSogCogChart, {
  INDIVIDUAL_SOG_COG_CHART_CONFIG,
} from './IndividualSogCogChart'
import type { TrackSample } from '../types/track'

const samples: TrackSample[] = [
  {
    utc: '2026-09-05T12:00:00Z',
    lat: 39,
    lon: 2,
    dist: 0,
    sog: 5.2,
    cog: 120,
    hdg: null,
    heel: null,
    trim: null,
  },
]

describe('Individual SOG + COG chart', () => {
  it('uses separate SOG and COG axes with the fixed circular COG range', () => {
    expect(INDIVIDUAL_SOG_COG_CHART_CONFIG).toEqual({
      xAxisId: 'time',
      tooltipXAxisId: 'time',
      sogAxisId: 'sog',
      cogAxisId: 'cog',
      cogDomain: [0, 360],
      cogTicks: [0, 90, 180, 270, 360],
      cogColor: '#60777e',
    })
  })

  it('renders one chart heading for the superimposed SOG and COG series', () => {
    const markup = renderToStaticMarkup(
      <IndividualSogCogChart
        samples={samples}
        playbackTime={Date.parse(samples[0].utc)}
        activityLabel="Sailor A · Boat A"
        sogColor="#168097"
      />,
    )

    expect(markup.match(/individual-sog-cog-chart/g)).toHaveLength(1)
    expect(markup).toContain('SOG + COG over GPS time')
    expect(markup).toContain('Sailor A · Boat A SOG and COG time-series chart')
  })
})
