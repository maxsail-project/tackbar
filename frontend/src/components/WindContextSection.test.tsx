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
    shares: { starboard: 0.55, port: 0.4, indeterminate: 0.05 },
    meanAbsTwaDegrees: { starboard: 42.4, port: 44.6 },
    check: { hdg: 'agree', heel: 'unavailable', labels: ['HDG ✓'] },
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
    expect(content).toContain('P 55% · 42° 40% · 45° 5% HDG ✓')
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
})
