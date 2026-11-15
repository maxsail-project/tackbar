import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WindContextResult } from '../utils/windContext'
import type { WindProgress } from '../utils/windProgress'
import type { WindSegment } from '../utils/windSegments'
import WindContextSection from './WindContextSection'

const upwind: WindContextResult = {
  classification: 'upwind',
  movingSeconds: 100,
  sectorShares: { upwind: 0.82, reaching: 0.12, downwind: 0.06 },
  upwindTack: {
    upwindSeconds: 82,
    tackSeconds: { starboard: 45.1, port: 32.8, indeterminate: 4.1 },
    shares: { starboard: 0.55, port: 0.4, indeterminate: 0.05 },
    meanAbsTwaDegrees: { starboard: 42.4, port: 44.6 },
    check: { hdg: 'agree', heel: 'unavailable', labels: ['HDG ✓'] },
    axis: null,
  },
  downwind: null,
}
const downwind: WindContextResult = {
  classification: 'downwind',
  movingSeconds: 100,
  sectorShares: { upwind: 0.1, reaching: 0.1, downwind: 0.8 },
  upwindTack: null,
  downwind: { downwindSeconds: 80, depthDegrees: 152.4, gybeAngleDegrees: 41.6 },
}
const unavailable: WindContextResult = {
  classification: 'unavailable', movingSeconds: 0, sectorShares: null, upwindTack: null, downwind: null,
}

function text(markup: string) {
  return markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('WindContextSection', () => {
  it('is collapsed by default and shows effective TWD with modelled source', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 91.6, source: 'modelled' }} displayDegrees={90} primary={upwind}
    />)
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toMatch(/<div id="[^"]+" hidden="">/)
    expect(text(markup)).toContain('TWD 090° · Modelled')
    expect(text(markup)).toContain('Wind Analysis')
  })

  it('shows the manual Viewer source', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 5, source: 'manual' }} displayDegrees={5} primary={unavailable}
    />)
    expect(text(markup)).toContain('TWD 005° · Manual · Viewer')
  })

  it('shows P-only composition and upwind tack split with check', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 90, source: 'modelled' }} displayDegrees={90} primary={upwind}
    />)
    const content = text(markup)
    expect(content).toContain('P 82% 12% 6% Upwind')
    expect(content).toContain('P 55% · 42° 40% · 45° 5% HDG ✓ — —')
    expect(markup).not.toContain('data-wind-role="comparison"')
  })

  it('shows P/C rows and no tack label for downwind or unavailable windows', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 90, source: 'modelled' }} displayDegrees={90} primary={downwind} comparison={unavailable}
    />)
    const content = text(markup)
    expect(content).toContain('P 10% 10% 80% Downwind')
    expect(content).toContain('C — — — Unavailable')
    expect(markup).not.toContain('Upwind tack split')
    expect(content).not.toMatch(/Stbd|Port ·/)
  })

  it('lists tack rows only for upwind-dominant Activities', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 90, source: 'modelled' }} displayDegrees={90}
      primary={{ ...downwind, classification: 'mixed', downwind: null }} comparison={upwind}
    />)
    expect(text(markup)).toContain('P 10% 10% 80% Mixed')
    expect(markup).toContain('data-wind-tack-role="comparison"')
    expect(markup).not.toContain('data-wind-tack-role="primary"')
  })

  const withAxis = (degrees: number, offsetDegrees: number, tackAngleDegrees = 78): WindContextResult => ({
    ...upwind,
    upwindTack: { ...upwind.upwindTack!, axis: { degrees, offsetDegrees, tackAngleDegrees } },
  })

  it('shows Axis with signed TWD difference and Tack angle, described as an estimated bisector', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 15, source: 'modelled' }} displayDegrees={15}
      primary={withAxis(21, 6)} comparison={withAxis(354.4, -20.6, 81.6)}
    />)
    const content = text(markup)
    expect(content).toContain('Axis')
    expect(content).toContain('Tack angle')
    expect(content).toContain('P 55% · 42° 40% · 45° 5% HDG ✓ 021° (+6) 78°')
    expect(content).toContain('C 55% · 42° 40% · 45° 5% HDG ✓ 354° (−21) 82°')
    expect(markup).toMatch(/<th scope="col" aria-describedby="([^"]+)">Axis<\/th>/)
    const helpId = markup.match(/aria-describedby="([^"]+)">Axis/)![1]
    expect(markup).toContain(`id="${helpId}"`)
    expect(content).toContain('Axis is the estimated bisector of the upwind tacks')
    expect(markup).toContain('class="wind-context-table-wrap"')
    expect(content).not.toMatch(/Axis[^.]*TWD \d/)
    // P and C disagree by more than 5°: no hint.
    expect(markup).not.toContain('data-wind-axis-hint')
  })

  it('shows one bold combined hint when both axes agree and differ from effective TWD', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 15, source: 'manual' }} displayDegrees={15}
      primary={withAxis(21, 6)} comparison={withAxis(24, 9)}
    />)
    expect(markup).toContain('<strong>Both tack axes ≈ 023° (+8°) — consider adjusting TWD</strong>')
    expect(markup.match(/data-wind-axis-hint/g)).toHaveLength(1)
  })

  it('uses the P axis alone without Comparison and hides the hint within 3°', () => {
    const shown = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 15, source: 'modelled' }} displayDegrees={15} primary={withAxis(21, 6)}
    />)
    expect(text(shown)).toContain('Tack axis ≈ 021° (+6°) — consider adjusting TWD')
    const hidden = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 20, source: 'manual' }} displayDegrees={20} primary={withAxis(21, 1)}
    />)
    expect(hidden).not.toContain('data-wind-axis-hint')
    expect(text(hidden)).toContain('021° (+1)')
  })

  it('shows no hint when the Comparison axis is unavailable', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 15, source: 'modelled' }} displayDegrees={15}
      primary={withAxis(21, 6)} comparison={upwind}
    />)
    expect(markup).not.toContain('data-wind-axis-hint')
    expect(text(markup)).toContain('C 55% · 42° 40% · 45° 5% HDG ✓ — —')
  })

  const progress = (sector: 'upwind' | 'downwind', progressMeters: number, distanceMeters: number, speed: number): WindProgress => ({
    status: 'available', sector, progressMeters, distanceMeters, efficiency: progressMeters / distanceMeters,
    durationSeconds: progressMeters / speed, progressSpeedMetersPerSecond: speed, netBearingDegrees: 105,
  })

  it('shows P-only progress without a difference line', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
      primaryProgress={progress('upwind', 609, 893, 1.65)}
    />)
    expect(text(markup)).toContain('P 609 m to windward 893 m 68%')
    expect(markup).toContain('Progress relative to the wind')
    expect(markup).not.toContain('data-wind-progress-difference')
    expect(text(markup)).toContain('It is not VMG.')
  })

  it('shows P/C progress with the neutral difference line', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'manual' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 609, 893, 1.65)} comparisonProgress={progress('upwind', 569, 814, 1.54)}
    />)
    const content = text(markup)
    expect(content).toContain('C 569 m to windward 814 m 70%')
    expect(content).toContain('Δ progress P−C: +40 m (≈25 s)')
    expect(content).not.toMatch(/ahead|behind|winner/i)
  })

  it('shows Similar within 5 s and no line when one Activity is ineligible', () => {
    const similar = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 609, 893, 2)} comparisonProgress={progress('upwind', 600, 814, 2)}
    />)
    expect(text(similar)).toContain('Δ progress P−C: Similar')
    const ineligible = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 609, 893, 2)}
      comparisonProgress={{ status: 'unavailable', reason: 'course-off-axis', distanceMeters: 814 }}
    />)
    expect(text(ineligible)).toContain('C Course not along wind axis 814 m —')
    expect(ineligible).not.toContain('data-wind-progress-difference')
  })

  it.each([
    ['reaching', 'Reaching window'],
    ['mixed', 'Mixed window'],
    ['sector-unavailable', 'Sector unavailable'],
    ['wind-reference-age', 'Wind reference too far in time'],
    ['insufficient-positions', 'Insufficient position data'],
    ['course-off-axis', 'Course not along wind axis'],
  ] as const)('shows the %s reason with distance and no progress', (reason, label) => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={unavailable}
      primaryProgress={{ status: 'unavailable', reason, distanceMeters: reason === 'sector-unavailable' ? null : 412.4 }}
    />)
    expect(text(markup)).toContain(`P ${label} ${reason === 'sector-unavailable' ? '—' : '412 m'} —`)
  })

  it('shows downwind Depth and Gybe angle only for downwind-dominant Activities', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105}
      primary={downwind} comparison={{ ...downwind, downwind: { downwindSeconds: 90, depthDegrees: 171, gybeAngleDegrees: null } }}
      primaryProgress={progress('downwind', 679, 760, 2.6)} comparisonProgress={progress('downwind', 626, 700, 2.4)}
    />)
    const content = text(markup)
    expect(content).toContain('Depth')
    expect(content).toContain('P 152° 42°')
    expect(content).toContain('C 171° —')
    expect(content).toContain('P 679 m to leeward 760 m 89%')
    expect(content).toContain('Δ progress P−C: +53 m (≈21 s)')
    expect(content).not.toMatch(/Stbd|Port ·|gybe on/i)
    const upwindOnly = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
    />)
    expect(upwindOnly).not.toContain('Downwind readings')
  })

  const t0 = Date.UTC(2025, 5, 21, 11, 30)
  const segments: WindSegment[] = [
    { kind: 'pre-start', start: t0, end: t0 + 300_000 },
    { kind: 'upwind', start: t0 + 300_000, end: t0 + 670_000 },
    { kind: 'unclassified', start: t0 + 670_000, end: t0 + 715_000 },
    { kind: 'reaching', start: t0 + 715_000, end: t0 + 820_000 },
  ]

  it('lists P segments with Segment, Time and Duration, secondary Unclassified/Pre-start rows and the current window highlighted', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
      segments={segments} analysisWindow={{ start: t0 + 300_000, end: t0 + 670_000 }}
    />)
    const content = text(markup)
    expect(content).toContain('Segments (P)')
    expect(content).toContain('Segment Time (UTC) Duration')
    expect(content).toContain('Pre-start 11:30:00–11:35:00 5m00s')
    expect(content).toContain('Upwind 11:35:00–11:41:10 6m10s')
    expect(content).toContain('Unclassified 11:41:10–11:41:55 45s')
    expect(content).toContain('Reaching 11:41:55–11:43:40 1m45s')
    expect(content).not.toContain('Reach ')
    expect(markup.match(/wind-segments__row--secondary/g)).toHaveLength(2)
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(markup).toContain('aria-pressed="true" aria-label="Set Analysis Window to Upwind segment 11:35:00–11:41:10 UTC"')
    expect(markup).not.toContain('data-wind-segment-comparison')
    expect(markup.indexOf('Segments (P)')).toBeLessThan(markup.indexOf('Wind sector composition'))
  })

  it('shows the isolated C column only when classifications are provided', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={upwind}
      segments={segments} comparisonSegmentClassifications={['unavailable', 'upwind', 'mixed', 'reaching']}
    />)
    const content = text(markup)
    expect(content).toContain('Segment Time (UTC) Duration C')
    expect(content).toContain('Pre-start 11:30:00–11:35:00 5m00s Unavailable')
    expect(content).toContain('Upwind 11:35:00–11:41:10 6m10s Upwind')
    expect(content).toContain('Unclassified 11:41:10–11:41:55 45s Mixed')
    expect(markup.match(/data-wind-segment-comparison/g)).toHaveLength(4)
    expect(markup).not.toContain('aria-pressed="true"')
  })

  it('shows an empty segment state and omits the list when segments are not provided', () => {
    const empty = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={unavailable} segments={[]}
    />)
    expect(text(empty)).toContain('No segments for P in the available range.')
    const omitted = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={unavailable}
    />)
    expect(omitted).not.toContain('Segments (P)')
  })
})
