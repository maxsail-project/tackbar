import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import IndividualAnalysis, {
  IndividualAnalysisContent,
  individualAnalysisChartKey,
  resolveIndividualSogColor,
  toggleIndividualAnalysis,
  type IndividualAnalysisActivity,
} from './IndividualAnalysis'
import type { TrackSample } from '../types/track'
import { ACTIVITY_COLORS } from '../config/activityColors'

const playbackTime = Date.parse('2026-09-05T12:00:00Z')
const samples: TrackSample[] = [
  {
    utc: '2026-09-05T12:00:00Z',
    lat: 39,
    lon: 2,
    dist: 0,
    sog: 5.2,
    cog: 120,
    hdg: null,
    heel: 5,
    trim: null,
  },
  {
    utc: '2026-09-05T12:00:01Z',
    lat: 39,
    lon: 2,
    dist: 5.2,
    sog: 5.2,
    cog: 120,
    hdg: null,
    heel: 5,
    trim: null,
  },
]
const analysisWindow = {
  start: Date.parse(samples[0].utc),
  end: Date.parse(samples[1].utc),
}
const primaryActivity: IndividualAnalysisActivity = {
  id: 'activity-a',
  label: 'Sailor A · Boat A',
  samples,
  canonicalSamples: samples,
  colorRole: 'primary',
}

function renderContent(activities: IndividualAnalysisActivity[]) {
  return renderToStaticMarkup(
    <IndividualAnalysisContent
      activities={activities}
      playbackTime={playbackTime}
      analysisWindow={analysisWindow}
    />,
  )
}

describe('Individual Analysis disclosure', () => {
  it('is collapsed by default and does not render chart content', () => {
    const markup = renderToStaticMarkup(
      <IndividualAnalysis
        primaryActivity={primaryActivity}
        playbackTime={playbackTime}
        analysisWindow={analysisWindow}
      />,
    )

    expect(markup).toContain('Individual Analysis')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('>Show</button>')
    expect(markup).not.toContain('id="individual-analysis-content"')
    expect(markup).not.toContain('SOG over GPS time')
  })

  it('can be expanded and collapsed again', () => {
    const expanded = toggleIndividualAnalysis(false)

    expect(expanded).toBe(true)
    expect(toggleIndividualAnalysis(expanded)).toBe(false)
  })

  it('uses the existing Activity colors for primary and comparison SOG', () => {
    expect(resolveIndividualSogColor('primary')).toBe(ACTIVITY_COLORS.primary)
    expect(resolveIndividualSogColor('comparison')).toBe(ACTIVITY_COLORS.comparison)
  })
})

describe('Individual Analysis content', () => {
  it('renders the SOG and COG chart followed by one density map for one Activity', () => {
    const markup = renderContent([primaryActivity])

    expect(markup.match(/individual-analysis__activity/g)).toHaveLength(1)
    expect(markup.match(/individual-sog-cog-chart/g)).toHaveLength(1)
    expect(markup.match(/<svg/g)).toHaveLength(2)
    expect(markup.match(/data-individual-signal-playback-cursor/g)).toHaveLength(1)
    expect(markup.match(/individual-heel-sog-density"/g)).toHaveLength(1)
    expect(markup).toContain('SOG + COG over GPS time')
    expect(markup.indexOf('SOG + COG over GPS time'))
      .toBeLessThan(markup.indexOf('HEEL vs SOG density'))
  })

  it('renders independent time-series and density maps for two Activities', () => {
    const markup = renderContent([
      primaryActivity,
      { ...primaryActivity, id: 'activity-b', label: 'Sailor B · Boat B', colorRole: 'comparison' },
    ])

    expect(markup.match(/individual-analysis__activity/g)).toHaveLength(2)
    expect(markup.match(/individual-sog-cog-chart/g)).toHaveLength(2)
    expect(markup.match(/<svg/g)).toHaveLength(4)
    expect(markup.match(/data-individual-signal-playback-cursor/g)).toHaveLength(2)
    expect(markup.match(/individual-heel-sog-density"/g)).toHaveLength(2)
    expect(markup.match(/SOG \+ COG over GPS time/g)).toHaveLength(2)
    expect(markup).toContain('Sailor A · Boat A')
    expect(markup).toContain('Sailor B · Boat B')
    expect(markup).toContain(`fill="${ACTIVITY_COLORS.primary}"`)
    expect(markup).toContain(`fill="${ACTIVITY_COLORS.comparison}"`)
  })

  it('gives every Activity chart an independent React identity', () => {
    const keys = [
      individualAnalysisChartKey('activity-a'),
      individualAnalysisChartKey('activity-b'),
    ]

    expect(new Set(keys).size).toBe(2)
    expect(individualAnalysisChartKey('activity-new')).not.toBe(keys[0])
  })

  it('keeps the Activity chart when COG is unavailable without inventing values', () => {
    const markup = renderContent([{
      ...primaryActivity,
      samples: samples.map((sample) => ({ ...sample, cog: null })),
    }])

    expect(markup).toContain('SOG + COG over GPS time')
    expect(markup).not.toContain('No SOG or COG track data for this Activity')
  })

  it('uses canonical samples and the actual window for density boundary coverage', () => {
    const canonicalSamples = [
      {
        ...samples[0],
        utc: '2026-09-05T11:59:59.500Z',
      },
      {
        ...samples[0],
        utc: '2026-09-05T12:00:00.500Z',
      },
      {
        ...samples[1],
        utc: '2026-09-05T12:00:01.500Z',
      },
    ]
    const markup = renderContent([{
      ...primaryActivity,
      samples: [canonicalSamples[1]],
      canonicalSamples,
    }])

    expect(markup).toContain('100% coverage')
    expect(markup).toContain('data-density-cell="true"')
  })

  it('does not mutate filtered samples or shared playback time', () => {
    const originalSample = { ...samples[0] }

    renderContent([primaryActivity])

    expect(samples[0]).toEqual(originalSample)
    expect(playbackTime).toBe(Date.parse('2026-09-05T12:00:00Z'))
  })
})
