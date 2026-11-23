import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WindContextResult } from '../utils/windContext'
import type { WindSegment } from '../utils/windSegments'
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

/** Cell texts of one metric row, in P then C order; null when the row is absent. */
function metric(markup: string, key: string) {
  const row = markup.match(new RegExp(`<tr data-wind-metric="${key}">(.*?)</tr>`))
  if (row === null) return null
  return [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((cell) => cell[1].replace(/<[^>]+>/g, ''))
}

function metricKeys(markup: string) {
  return [...markup.matchAll(/<tr data-wind-metric="([^"]+)">/g)].map((match) => match[1])
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
    expect(text(markup)).toContain('TWD 090° Modelled')
    expect(text(markup)).toContain('Points of Sail 0 segments')
    expect(text(markup)).not.toContain('Wind Segments')
  })

  it('renders the map-style TWD control with a value button, no standalone Reset TWD and a closed detail', () => {
    const without = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 5, source: 'manual' }} displayDegrees={5} primary={unavailable}
    />)
    expect(without).not.toContain('aria-label="Decrease TWD by 5°"')
    expect(without).not.toContain('Reset TWD')
    const handlers = {
      onTwdStep: () => undefined,
      onTwdReset: () => undefined,
      twdReference: { status: 'unavailable' } as const,
    }
    const modelled = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 90, source: 'modelled' }} displayDegrees={90} primary={upwind}
      {...handlers} twdPresentation={{ bearing: 90, displayDegrees: 90, automaticDegrees: 90, manual: false }}
    />)
    expect(modelled).toContain('aria-label="Decrease TWD by 5°"')
    expect(modelled).toContain('aria-label="Increase TWD by 5°"')
    expect(modelled).toMatch(/<button type="button" class="map-bearing__value" data-wind-twd-value[^>]*aria-label="TWD 090°\. Show wind reference details" aria-expanded="false"/)
    expect(modelled).toContain('<span>TWD</span><strong>090°</strong>')
    expect(modelled).not.toContain('Reset TWD')
    expect(modelled).not.toContain('map-twd__detail')
    expect(modelled.indexOf('aria-label="Decrease TWD by 5°"')).toBeLessThan(modelled.indexOf('data-wind-twd-value'))
    expect(modelled.indexOf('data-wind-twd-value')).toBeLessThan(modelled.indexOf('aria-label="Increase TWD by 5°"'))
    const manual = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 95, source: 'manual' }} displayDegrees={95} primary={upwind}
      {...handlers} twdPresentation={{ bearing: 95, displayDegrees: 95, automaticDegrees: 90, manual: true }}
    />)
    expect(manual).not.toContain('Reset TWD')
    expect(text(manual)).toContain('Manual · Viewer')
    expect(manual.split('hidden=""')[0]).not.toContain('Decrease TWD')
  })

  it('shows the manual Viewer source', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 5, source: 'manual' }} displayDegrees={5} primary={unavailable}
    />)
    expect(text(markup)).toContain('TWD 005°')
    expect(text(markup)).toContain('Manual · Viewer')
  })

  it('titles the conclusion with the dominant sector in caps', () => {
    const title = (primary: WindContextResult) => text(renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 90, source: 'modelled' }} displayDegrees={90} primary={primary}
    />).match(/data-wind-conclusion-title[^>]*>(.*?)<\/p>/)![1])
    expect(title(upwind)).toBe('UPWIND')
    expect(title(downwind)).toBe('DOWNWIND')
    expect(title({ ...upwind, classification: 'reaching' })).toBe('REACHING')
    expect(title({ ...upwind, classification: 'mixed' })).toBe('MIXED')
    expect(title(unavailable)).toBe('UNAVAILABLE')
  })

  it('builds one P-only metric table with bare values for an upwind window', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={withAxis(108, 3)}
      primaryProgress={progress('upwind', 609, 893, 1.65)}
    />)
    expect(markup.match(/<table class="wind-metric-table"/g)).toHaveLength(1)
    expect(markup).not.toMatch(/aria-label="(Wind sector composition|Upwind tack split|Progress relative to the wind|Downwind readings)"/)
    expect(metricKeys(markup)).toEqual([
      'upwind-share', 'progress', 'distance', 'efficiency', 'time-starboard', 'time-port', 'time-tack-unclear',
      'twa-starboard', 'twa-port', 'axis', 'tack-angle', 'tack-check',
    ])
    expect(metric(markup, 'upwind-share')).toEqual(['82%'])
    expect(metric(markup, 'progress')).toEqual(['609 m'])
    expect(metric(markup, 'distance')).toEqual(['893 m'])
    expect(metric(markup, 'efficiency')).toEqual(['68%'])
    expect(metric(markup, 'time-starboard')).toEqual(['55%'])
    expect(metric(markup, 'time-port')).toEqual(['40%'])
    // #204: indeterminate upwind-tack share, same denominator as the two tack rows.
    expect(metric(markup, 'time-tack-unclear')).toEqual(['5%'])
    expect(text(markup)).toContain('Time tack unclear')
    expect(metric(markup, 'twa-starboard')).toEqual(['42°'])
    expect(metric(markup, 'twa-port')).toEqual(['45°'])
    expect(metric(markup, 'axis')).toEqual(['108° (+3)'])
    expect(metric(markup, 'tack-angle')).toEqual(['78°'])
    expect(metric(markup, 'tack-check')).toEqual(['HDG ✓'])
    expect(text(markup)).toContain('Progress to windward')
    expect(text(markup)).toContain('Time on starboard')
    const headers = [...markup.match(/<table class="wind-metric-table"[\s\S]*?<\/thead>/)![0].matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((match) => match[1])
    expect(headers).toEqual(['', 'P'])
    expect(markup).toMatch(/<th scope="col" style="color:[^"]+">P<\/th>/)
  })

  it('adds a C column only with Comparison and colours the headers', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={withAxis(354.4, -20.6, 81.6)}
      primaryProgress={progress('upwind', 609, 893, 1.65)} comparisonProgress={progress('upwind', 569, 814, 1.54)}
    />)
    expect(metric(markup, 'progress')).toEqual(['609 m', '569 m'])
    expect(metric(markup, 'efficiency')).toEqual(['68%', '70%'])
    expect(metric(markup, 'axis')).toEqual(['—', '354° (−21)'])
    expect(metric(markup, 'tack-angle')).toEqual(['—', '82°'])
    const headers = [...markup.match(/<table class="wind-metric-table"[\s\S]*?<\/thead>/)![0].matchAll(/<th scope="col"([^>]*)>(.*?)<\/th>/g)]
    expect(headers.map((match) => match[2])).toEqual(['', 'P', 'C'])
    expect(headers[1][1]).not.toEqual(headers[2][1])
  })

  it('shows downwind rows and hides the rows that are empty for every Activity', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105}
      primary={downwind} comparison={{ ...downwind, downwind: { downwindSeconds: 90, depthDegrees: 171, gybeAngleDegrees: null } }}
      primaryProgress={progress('downwind', 679, 760, 2.6)} comparisonProgress={progress('downwind', 626, 700, 2.4)}
    />)
    expect(metricKeys(markup)).toEqual(['downwind-share', 'progress', 'distance', 'efficiency', 'depth', 'gybe-angle'])
    expect(metric(markup, 'depth')).toEqual(['152°', '171°'])
    expect(metric(markup, 'gybe-angle')).toEqual(['42°', '—'])
    expect(metric(markup, 'progress')).toEqual(['679 m', '626 m'])
    expect(text(markup)).toContain('Progress to leeward')
    expect(text(markup)).toContain('Depth (mean TWA)')
    const bothEmpty = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105}
      primary={{ ...downwind, downwind: { downwindSeconds: 90, depthDegrees: 171, gybeAngleDegrees: null } }}
    />)
    expect(metricKeys(bothEmpty)).toEqual(['downwind-share', 'depth'])
    expect(markup).not.toMatch(/Stbd|Port ·/)
  })

  it('shows only sector shares and Distance for reaching, mixed and unavailable windows', () => {
    const reaching = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105}
      primary={{ ...upwind, classification: 'reaching', upwindTack: null }}
      primaryProgress={{ status: 'unavailable', reason: 'reaching', distanceMeters: 412.4 }}
    />)
    expect(metricKeys(reaching)).toEqual(['upwind-share', 'reaching-share', 'downwind-share', 'distance'])
    expect(metric(reaching, 'distance')).toEqual(['412 m'])
    const mixed = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105}
      primary={{ ...downwind, classification: 'mixed', downwind: null }} comparison={unavailable}
    />)
    expect(metricKeys(mixed)).toEqual(['upwind-share', 'reaching-share', 'downwind-share'])
    expect(metric(mixed, 'upwind-share')).toEqual(['10%', '—'])
    const none = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={unavailable}
    />)
    expect(none).not.toContain('<table class="wind-metric-table"')
  })

  it('keeps a — C cell in rows where only P has a value', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={unavailable}
    />)
    expect(metric(markup, 'time-starboard')).toEqual(['55%', '—'])
    expect(metric(markup, 'time-tack-unclear')).toEqual(['5%', '—'])
    expect(metric(markup, 'tack-check')).toEqual(['HDG ✓', '—'])
    const primaryOnly = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
    />)
    expect(primaryOnly).not.toMatch(/data-wind-metric-role="comparison"/)
  })

  it('drops the Time tack unclear row with the other tack rows when every shown Activity reads —', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={{ ...upwind, upwindTack: null }}
    />)
    expect(metricKeys(markup)).toEqual(['upwind-share'])
    expect(text(markup)).not.toContain('Time tack unclear')
  })

  const withAxis = (degrees: number, offsetDegrees: number, tackAngleDegrees = 78): WindContextResult => ({
    ...upwind,
    upwindTack: { ...upwind.upwindTack!, axis: { degrees, offsetDegrees, tackAngleDegrees } },
  })

  it('shows Axis with signed TWD difference and Tack angle, described by the popover as an estimated bisector', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 15, source: 'modelled' }} displayDegrees={15}
      primary={withAxis(21, 6)} comparison={withAxis(354.4, -20.6, 81.6)}
    />)
    expect(metric(markup, 'axis')).toEqual(['021° (+6)', '354° (−21)'])
    expect(metric(markup, 'tack-angle')).toEqual(['78°', '82°'])
    expect(text(markup)).toContain('Axis: estimated bisector of the upwind tacks; not applied to TWD.')
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
    expect(metric(hidden, 'axis')).toEqual(['021° (+1)'])
  })

  it('shows no hint when the Comparison axis is unavailable', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 15, source: 'modelled' }} displayDegrees={15}
      primary={withAxis(21, 6)} comparison={upwind}
    />)
    expect(markup).not.toContain('data-wind-axis-hint')
    expect(metric(markup, 'axis')).toEqual(['021° (+6)', '—'])
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

  it('concludes P-only with progress and efficiency, without a difference line', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
      primaryProgress={progress('upwind', 609, 893, 1.65)}
    />)
    expect(text(markup)).toContain('UPWIND 609 m to windward · 68% efficiency')
    expect(markup).not.toContain('data-wind-progress-difference')
    expect(markup).not.toContain('data-wind-progress-gaps')
    expect(markup).not.toContain('data-wind-lateral-caution')
    const leeward = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={downwind}
      primaryProgress={progress('downwind', 679, 760, 2.6)}
    />)
    expect(text(leeward)).toContain('DOWNWIND 679 m to leeward · 89% efficiency')
    const noEfficiency = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
      primaryProgress={{ ...progress('upwind', 609, 893, 1.65), efficiency: null } as WindProgress}
    />)
    expect(text(noEfficiency)).toContain('UPWIND 609 m to windward')
    expect(text(noEfficiency)).not.toContain('efficiency')
    expect(text(markup).replace('&#x27;', "'")).toContain("Progress: net distance along the wind axis; not VMG. Seconds convert the metre difference using both boats' average speed along that axis. Along the wind axis, not toward a mark; gap error grows with lateral separation.")
  })

  it('concludes P/C with the P-perspective gain line and a gap line without the lateral suffix', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'manual' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 609, 893, 1.65)} comparisonProgress={progress('upwind', 569, 814, 1.54)}
    />)
    const content = text(markup)
    expect(content).toContain('P gained 40 m to windward on C — equivalent to about 25s of sailing.')
    expect(content).toContain('At 11:37:35 P level with C → at 11:43:45 40 m to windward of C')
    expect(content).not.toContain('efficiency')
    expect(markup).not.toContain('data-wind-lateral-caution')
    expect(content.slice(0, content.indexOf('Wind analysis notes'))).not.toMatch(/ahead|behind|winner|lateral|far apart/i)
  })

  it('states a loss and, only for a wide lateral separation, one caution line under the conclusion', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'manual' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 569, 814, 1.54, 0, 0)} comparisonProgress={progress('upwind', 609, 893, 1.65, -20, 200)}
    />)
    const content = text(markup)
    expect(content).toContain('P lost 40 m to windward on C — equivalent to about 25s of sailing.')
    expect(content).toContain('At 11:37:35 P 20 m to windward of C → at 11:43:45 20 m to leeward of C')
    expect(markup.match(/data-wind-lateral-caution/g)).toHaveLength(1)
    expect(content).toContain('Boats far apart sideways: results sensitive to TWD')
    expect(markup.indexOf('data-wind-progress-gaps')).toBeLessThan(markup.indexOf('data-wind-lateral-caution'))
    expect(markup.indexOf('data-wind-lateral-caution')).toBeLessThan(markup.indexOf('wind-metric-table'))
  })

  it('shows Similar within 5 s and falls back to P alone when C is ineligible', () => {
    const similar = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 609, 893, 2)} comparisonProgress={progress('upwind', 600, 814, 2)}
    />)
    expect(text(similar)).toContain('P and C made similar progress to windward (within 5s).')
    const ineligible = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={upwind}
      primaryProgress={progress('upwind', 609, 893, 2)}
      comparisonProgress={{ status: 'unavailable', reason: 'course-off-axis', distanceMeters: 814 }}
    />)
    expect(ineligible).not.toContain('data-wind-progress-difference')
    expect(text(ineligible)).toContain('609 m to windward · 68% efficiency')
    expect(metric(ineligible, 'progress')).toEqual(['609 m', '—'])
    expect(metric(ineligible, 'distance')).toEqual(['893 m', '814 m'])
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
  ] as const)('shows the %s reason in the conclusion with distance only in the table', (reason, label) => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
      primaryProgress={{ status: 'unavailable', reason, distanceMeters: reason === 'sector-unavailable' ? null : 412.4 }}
    />)
    expect(text(markup)).toContain(`UPWIND ${label}`)
    expect(markup).toContain(`data-wind-progress-reason="${reason}"`)
    expect(metric(markup, 'progress')).toBeNull()
    expect(metric(markup, 'efficiency')).toBeNull()
    expect(metric(markup, 'distance')).toEqual(reason === 'sector-unavailable' ? null : ['412 m'])
    expect(markup).not.toContain('data-wind-progress-own')
  })

  const t0 = Date.UTC(2025, 5, 21, 11, 30)
  const segments: WindSegment[] = [
    { kind: 'upwind', start: t0, end: t0 + 300_000 },
    { kind: 'reaching', start: t0 + 300_000, end: t0 + 420_000 },
  ]

  it('is one Points of Sail section with the specified body order and a collapsed Sector breakdown', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'manual' }} displayDegrees={105} primary={withAxis(120, 15)}
      primaryProgress={progress('upwind', 609, 893, 1.65)}
      segments={segments} analysisWindow={{ start: t0, end: t0 + 420_000 }} availableRange={{ start: t0, end: t0 + 420_000 }}
      onSegmentSelect={() => undefined} filterResetKey="a"
    />)
    expect(markup.match(/class="section-kicker"/g)).toHaveLength(1)
    const [header, body] = markup.split('hidden=""')
    expect(text(header)).toContain('Points of Sail 2 segments · TWD 105° Manual · Upwind')
    expect(markup.match(/aria-label="About points of sail"/g)).toHaveLength(1)
    const order = [
      'wind-segments__filter', 'wind-segments__table', 'data-wind-twd-source', 'data-wind-conclusion-title',
      'class="wind-metric-table"', 'data-wind-axis-hint', 'Sector breakdown',
    ].map((marker) => body.indexOf(marker))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(text(body)).toContain('All 2 Up 1 Reach 1 Down 0 Other 0')
    expect(body).not.toContain('Reset TWD')
  })

  it('keeps the Sector breakdown collapsed with an accessible disclosure and per-Activity shares', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind} comparison={downwind}
    />)
    const toggle = markup.match(/<button type="button" class="wind-breakdown__toggle" aria-expanded="false" aria-controls="([^"]+)">Sector breakdown<\/button>/)
    expect(toggle).not.toBeNull()
    expect(markup).toContain(`<div id="${toggle![1]}" hidden="" data-wind-breakdown="true">`)
    const breakdown = text(markup.slice(markup.indexOf('data-wind-breakdown'), markup.indexOf('id="', markup.indexOf('data-wind-breakdown') + 20)))
    // #204: only the three sector shares of moving time; the tack-unclear share lives in the upwind rows.
    expect(breakdown).toContain('P/C Upwind Reaching Downwind P 82% 12% 6% C 10% 10% 80%')
    expect(breakdown).not.toContain('Indet')
    expect(breakdown).not.toContain('Window')
  })

  it('shows a one-line header with TWD and P classification, adding Manual only for a Viewer TWD', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={downwind} comparison={upwind}
    />)
    const header = markup.slice(0, markup.indexOf('hidden=""'))
    expect(header).toContain('class="wind-section__summary" data-wind-context-summary="true">0 segments · TWD 105° · Downwind</span>')
    expect(text(header)).not.toMatch(/Modelled|Upwind/)
    const manual = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 5, source: 'manual' }} displayDegrees={5} primary={unavailable}
    />)
    expect(text(manual.split('hidden=""')[0])).toContain('0 segments · TWD 005° Manual · Unavailable')
    expect(text(manual.split('hidden=""')[1])).toContain('TWD 005°')
    expect(text(manual.split('hidden=""')[1])).toContain('Manual · Viewer')
    expect(text(renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={{ ...downwind, classification: 'mixed', downwind: null }}
    />).split('hidden=""')[0])).toContain('0 segments · TWD 105° · Mixed')
  })

  it('moves explanatory notes into an accessible native info popover', () => {
    const markup = renderToStaticMarkup(<WindContextSection
      effectiveTwd={{ degrees: 105, source: 'modelled' }} displayDegrees={105} primary={upwind}
      primaryProgress={{ status: 'unavailable', reason: 'mixed', distanceMeters: 1 }}
    />)
    const control = markup.match(/<button[^>]*aria-label="About points of sail"[^>]*>/)![0]
    const notesId = control.match(/aria-controls="([^"]+)"/)![1]
    expect(control).toContain('class="maneuver-evidence__info"')
    expect(control).toContain('aria-expanded="false"')
    expect(control).toContain(`popoverTarget="${notesId}"`)
    expect(markup).toContain(`id="${notesId}" class="maneuver-evidence__help" popover="auto" role="note" aria-labelledby="${notesId}-title"`)
    const popover = markup.slice(markup.indexOf(`id="${notesId}"`))
    const lines = [...popover.matchAll(/<p class="maneuver-evidence__secondary"[^>]*>(.*?)<\/p>/g)].map((match) => match[1].replace(/<[^>]+>/g, '').replace('&#x27;', "'"))
    expect(text(popover)).toContain('Wind analysis notes')
    expect(lines).toEqual([
      'Sectors: COG vs effective TWD, over moving time (SOG ≥ 1.5 kt).',
      'Tacks: upwind only; HDG/HEEL only confirm them.',
      'Tack unclear: upwind time with TWA too close to the wind to assign a tack.',
      'Axis: estimated bisector of the upwind tacks; not applied to TWD.',
      "Progress: net distance along the wind axis; not VMG. Seconds convert the metre difference using both boats' average speed along that axis. Along the wind axis, not toward a mark; gap error grows with lateral separation.",
      'Depth / Gybe angle: mean downwind TWA / angle between the two downwind courses.',
      "Segments: P's track split by wind sector using the modelled TWD at each sample; tap one to set the Analysis Window.",
    ])
    expect(markup).not.toContain('wind-context__note">Sectors')
  })
})
