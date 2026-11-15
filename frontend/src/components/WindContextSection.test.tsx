import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WindContextResult } from '../utils/windContext'
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
}
const downwind: WindContextResult = {
  classification: 'downwind',
  movingSeconds: 100,
  sectorShares: { upwind: 0.1, reaching: 0.1, downwind: 0.8 },
  upwindTack: null,
}
const unavailable: WindContextResult = {
  classification: 'unavailable', movingSeconds: 0, sectorShares: null, upwindTack: null,
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
      primary={{ ...downwind, classification: 'mixed' }} comparison={upwind}
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
})
