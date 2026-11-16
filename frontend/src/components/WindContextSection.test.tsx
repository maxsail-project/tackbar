import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WindContextResult } from '../utils/windContext'
import type { WindProgress } from '../utils/windProgress'
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

  it('shows a P row with — when only C has tack or downwind values', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 90, source: 'modelled' }} displayDegrees={90}
      primary={{ ...downwind, classification: 'mixed', downwind: null }} comparison={upwind}
    />)
    expect(text(markup)).toContain('P 10% 10% 80% Mixed')
    expect(markup).toContain('data-wind-tack-role="comparison"')
    expect(markup).toContain('data-wind-tack-role="primary"')
    expect(text(markup)).toContain('Tack angle P — — — — — — C 55% · 42°')
    const downwindOnlyC = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 90, source: 'modelled' }} displayDegrees={90}
      primary={{ ...downwind, classification: 'mixed', downwind: null }} comparison={downwind}
    />)
    expect(text(downwindOnlyC)).toMatch(/Gybe angle P — — C 152° 42°/)
  })

  it('renders progress and downwind tables without a scroll wrapper; only the tack table keeps one', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 90, source: 'modelled' }} displayDegrees={90} primary={upwind} comparison={downwind}
      primaryProgress={{ status: 'unavailable', reason: 'mixed', distanceMeters: 1 }}
      comparisonProgress={{ status: 'unavailable', reason: 'mixed', distanceMeters: 1 }}
    />)
    expect(markup.match(/class="wind-context-table-wrap"/g)).toHaveLength(1)
    expect(markup).toMatch(/class="wind-context-table-wrap"><table class="wind-context-table wind-context-table--tack"/)
    expect(markup).toContain('<table class="wind-context-table wind-context-table--progress"')
    expect(markup).toContain('<table class="wind-context-table wind-context-table--downwind"')
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
    expect(content).toContain('Axis: estimated bisector of the upwind tacks; not applied to TWD.')
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

  const windowStartMs = Date.UTC(2025, 5, 21, 11, 37, 35)
  const axisDegrees = 105
  /** Position in the wind-axis frame (along the axis, lateral to its right) from a fixed origin. */
  const axisPosition = (along: number, lateral: number) => {
    const radians = axisDegrees * Math.PI / 180
    const north = along * Math.cos(radians) - lateral * Math.sin(radians)
    const east = along * Math.sin(radians) + lateral * Math.cos(radians)
    return {
      latitude: 40 + (north / 6_371_000) * 180 / Math.PI,
      longitude: 1 + (east / (6_371_000 * Math.cos(40 * Math.PI / 180))) * 180 / Math.PI,
    }
  }
  const progress = (
    sector: 'upwind' | 'downwind', progressMeters: number, distanceMeters: number, speed: number,
    startAlong = 0, lateral = 0,
  ): WindProgress => ({
    status: 'available', sector, progressMeters, distanceMeters, efficiency: progressMeters / distanceMeters,
    durationSeconds: 370, progressSpeedMetersPerSecond: speed, netBearingDegrees: axisDegrees, axisDegrees,
    startPosition: axisPosition(startAlong, lateral), endPosition: axisPosition(startAlong + progressMeters, lateral),
    startTimeMs: windowStartMs, endTimeMs: windowStartMs + 370_000,
  })

  it('shows P-only progress without a difference line', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
      primaryProgress={progress('upwind', 609, 893, 1.65)}
    />)
    expect(text(markup)).toContain('P 609 m to windward 893 m 68%')
    expect(markup).toContain('Progress relative to the wind')
    expect(markup).not.toContain('data-wind-progress-difference')
    expect(markup).not.toContain('data-wind-progress-gaps')
    expect(text(markup).replace('&#x27;', "'")).toContain("Progress: net distance along the wind axis; not VMG. Seconds convert the metre difference using both boats' average speed along that axis. Along the wind axis, not toward a mark; gap error grows with lateral separation.")
  })

  it('shows P/C progress with the P-perspective gain line and the gap line', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'manual' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 609, 893, 1.65)} comparisonProgress={progress('upwind', 569, 814, 1.54)}
    />)
    const content = text(markup)
    expect(content).toContain('C 569 m to windward 814 m 70%')
    expect(content).toContain('P gained 40 m to windward on C — equivalent to about 25 s of sailing.')
    expect(content).toContain('At 11:37:35 P level with C → at 11:43:45 40 m to windward of C')
    expect(content).not.toContain('wide lateral separation')
    expect(content).not.toMatch(/ahead|behind|winner/i)
  })

  it('states a loss and a wide lateral separation caution', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'manual' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 569, 814, 1.54, 0, 0)} comparisonProgress={progress('upwind', 609, 893, 1.65, -20, 200)}
    />)
    const content = text(markup)
    expect(content).toContain('P lost 40 m to windward on C — equivalent to about 25 s of sailing.')
    expect(content).toContain('At 11:37:35 P 20 m to windward of C → at 11:43:45 20 m to leeward of C · wide lateral separation')
  })

  it('shows Similar within 5 s and no line when one Activity is ineligible', () => {
    const similar = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 609, 893, 2)} comparisonProgress={progress('upwind', 600, 814, 2)}
    />)
    expect(text(similar)).toContain('P and C made similar progress to windward (within 5 s).')
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
    ['no-start-position', 'No position near window start'],
    ['no-end-position', 'No position near window end'],
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
    expect(content).toContain('P gained 53 m to leeward on C — equivalent to about 21 s of sailing.')
    expect(content).toContain('At 11:37:35 P level with C → at 11:43:45 53 m downwind of C')
    expect(content).not.toMatch(/Stbd|Port ·|gybe on/i)
    const upwindOnly = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
    />)
    expect(upwindOnly).not.toContain('Downwind readings')
  })

  it('shows a one-line header with TWD and P classification, adding Manual only for a Viewer TWD', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={downwind} comparison={upwind}
    />)
    const header = markup.slice(0, markup.indexOf('hidden=""'))
    expect(header).toContain('class="wind-section__summary" data-wind-context-summary="true">TWD 105° · Downwind</span>')
    expect(text(header)).not.toMatch(/Modelled|Upwind/)
    const manual = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 5, source: 'manual' }} displayDegrees={5} primary={unavailable}
    />)
    expect(text(manual.split('hidden=""')[0])).toContain('TWD 005° Manual · Unavailable')
    expect(text(manual.split('hidden=""')[1])).toContain('TWD 005° · Manual · Viewer')
    expect(text(renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={{ ...downwind, classification: 'mixed', downwind: null }}
    />).split('hidden=""')[0])).toContain('TWD 105° · Mixed')
  })

  it('moves explanatory notes into an accessible native info popover', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
      primaryProgress={{ status: 'unavailable', reason: 'mixed', distanceMeters: 1 }}
    />)
    const control = markup.match(/<button[^>]*aria-label="About wind analysis"[^>]*>/)![0]
    const notesId = control.match(/aria-controls="([^"]+)"/)![1]
    expect(control).toContain('class="maneuver-evidence__info"')
    expect(control).toContain('aria-expanded="false"')
    expect(control).toContain(`popoverTarget="${notesId}"`)
    expect(markup).toContain(`id="${notesId}" class="maneuver-evidence__help" popover="auto" role="note" aria-labelledby="${notesId}-title"`)
    const popover = markup.slice(markup.indexOf(`id="${notesId}"`))
    const lines = [...popover.matchAll(/<p class="maneuver-evidence__secondary"[^>]*>(.*?)<\/p>/g)].map((match) => match[1].replace(/<[^>]+>/g, '').replace('&#x27;', "'"))
    expect(text(popover)).toContain('Wind analysis notes')
    expect(lines).toEqual([
      'Sectors: COG vs effective TWD, over moving time (SOG ≥ 1.5 kn).',
      'Tacks: upwind only; HDG/HEEL only confirm them.',
      'Axis: estimated bisector of the upwind tacks; not applied to TWD.',
      "Progress: net distance along the wind axis; not VMG. Seconds convert the metre difference using both boats' average speed along that axis. Along the wind axis, not toward a mark; gap error grows with lateral separation.",
      'Depth / Gybe angle: mean downwind TWA / angle between the two downwind courses.',
      "Segments: P's track split by wind sector using the modelled TWD at each sample; tap one to set the Analysis Window.",
    ])
    expect(markup).not.toContain('class="wind-context__note"')
  })

  it('keeps a normal C row with — in the tack and downwind tables when C has no value, and no C row without Comparison', () => {
    const withComparison = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={unavailable}
    />)
    expect(text(withComparison)).toContain('C — — — — — —')
    expect(withComparison).toContain('data-wind-tack-role="comparison"')
    const downwindWithComparison = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={downwind} comparison={upwind}
    />)
    expect(downwindWithComparison).toContain('data-wind-downwind-role="comparison"')
    expect(text(downwindWithComparison)).toMatch(/Gybe angle P 152° 42° C — —/)
    const primaryOnly = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
    />)
    expect(primaryOnly).not.toMatch(/data-wind-(role|tack-role|progress-role|downwind-role)="comparison"/)
  })
})
