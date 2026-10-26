import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { TrackSample } from '../types/track'
import type { SelectedManeuverHighlight } from '../utils/selectedManeuverGeometry'
import TrackMap from './TrackMap'

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-map>{children}</div>,
  Source: ({ id, children }: { id: string, children: ReactNode }) => <div data-source={id}>{children}</div>,
  Layer: ({ id, paint }: { id: string, paint: Record<string, string | number> }) =>
    <div data-layer={id} data-color={paint['line-color']} data-width={paint['line-width']} />,
  Marker: ({ children }: { children: ReactNode }) => <div data-boat-marker>{children}</div>,
  NavigationControl: () => null,
  Popup: () => null,
}))
vi.mock('./HistoricalConditionsControl', () => ({ default: () => null }))

const samples: TrackSample[] = [
  { utc: '2031-01-01T10:00:00Z', lat: 0.25, lon: -30.72, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
  { utc: '2031-01-01T10:00:01Z', lat: 0.25, lon: -30.71, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
]

function highlight(selectionIndex: 1 | 2, activityRole: 'primary' | 'comparison'): SelectedManeuverHighlight {
  return {
    selectionIndex,
    activityRole,
    geoJson: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiLineString', coordinates: [[[-30.72, 0.25], [-30.71, 0.25]]] },
    },
  }
}

function renderMap(selectedManeuverHighlights: SelectedManeuverHighlight[]) {
  return renderToStaticMarkup(<TrackMap
    primaryVisibleSamples={samples}
    comparisonVisibleSamples={samples}
    fitContextKey="test"
    selectedManeuverHighlights={selectedManeuverHighlights}
    primaryActivityIdentity="Primary"
    comparisonActivityIdentity="Comparison"
    primaryBoatPosition={{ lat: 0.25, lon: -30.72 }}
    comparisonBoatPosition={{ lat: 0.25, lon: -30.71 }}
    hasComparison
    playbackTime={Date.parse(samples[0].utc)}
    primarySog={5}
    primaryCog={90}
    primaryHeel={null}
    primaryTrim={null}
    comparisonSog={5}
    comparisonCog={90}
    comparisonHeel={null}
    comparisonTrim={null}
  />)
}

describe('selected maneuver map layer order', () => {
  it('draws each halo below its P/C line and leaves replay boats above the lines', () => {
    const markup = renderMap([highlight(1, 'primary'), highlight(2, 'comparison')])
    const halo1 = markup.indexOf('data-layer="selected-maneuver-highlight-halo-1"')
    const line1 = markup.indexOf('data-layer="selected-maneuver-highlight-line-1"')
    const halo2 = markup.indexOf('data-layer="selected-maneuver-highlight-halo-2"')
    const line2 = markup.indexOf('data-layer="selected-maneuver-highlight-line-2"')
    const boat = markup.indexOf('aria-label="Primary boat position"')

    expect(halo1).toBeGreaterThan(-1)
    expect(halo1).toBeLessThan(halo2)
    expect(halo2).toBeLessThan(line1)
    expect(line1).toBeLessThan(line2)
    expect(line2).toBeLessThan(boat)
    expect(markup).toContain(`data-layer="selected-maneuver-highlight-line-1" data-color="${ACTIVITY_COLORS.primary}"`)
    expect(markup).toContain(`data-layer="selected-maneuver-highlight-line-2" data-color="${ACTIVITY_COLORS.comparison}"`)
    expect(markup).not.toContain('selected-maneuver-map-marker')
  })

  it('renders no highlight layers without selections', () => {
    expect(renderMap([])).not.toContain('selected-maneuver-highlight-')
  })
})
