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
    heel: null,
    trim: null,
  },
]
const primaryActivity: IndividualAnalysisActivity = {
  id: 'activity-a',
  label: 'Sailor A · Boat A',
  samples,
  colorRole: 'primary',
}

function renderContent(activities: IndividualAnalysisActivity[]) {
  return renderToStaticMarkup(
    <IndividualAnalysisContent
      activities={activities}
      playbackTime={playbackTime}
    />,
  )
}

describe('Individual Analysis disclosure', () => {
  it('is collapsed by default and does not render chart content', () => {
    const markup = renderToStaticMarkup(
      <IndividualAnalysis
        primaryActivity={primaryActivity}
        playbackTime={playbackTime}
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
  it('renders one dual-axis SOG and COG chart for one Activity', () => {
    const markup = renderContent([primaryActivity])

    expect(markup.match(/individual-analysis__activity/g)).toHaveLength(1)
    expect(markup.match(/individual-sog-cog-chart/g)).toHaveLength(1)
    expect(markup).toContain('SOG + COG over GPS time')
  })

  it('renders independent dual-axis charts for two Activities', () => {
    const markup = renderContent([
      primaryActivity,
      { ...primaryActivity, id: 'activity-b', label: 'Sailor B · Boat B', colorRole: 'comparison' },
    ])

    expect(markup.match(/individual-analysis__activity/g)).toHaveLength(2)
    expect(markup.match(/individual-sog-cog-chart/g)).toHaveLength(2)
    expect(markup.match(/SOG \+ COG over GPS time/g)).toHaveLength(2)
    expect(markup).toContain('Sailor A · Boat A')
    expect(markup).toContain('Sailor B · Boat B')
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

  it('does not mutate filtered samples or shared playback time', () => {
    const originalSample = { ...samples[0] }

    renderContent([primaryActivity])

    expect(samples[0]).toEqual(originalSample)
    expect(playbackTime).toBe(Date.parse('2026-09-05T12:00:00Z'))
  })
})
