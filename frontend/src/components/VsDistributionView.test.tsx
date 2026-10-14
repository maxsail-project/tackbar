import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import VsDistributionView, {
  heelAngleDegrees,
  nicePercentageCeiling,
} from './VsDistributionView'

const START = Date.parse('2026-10-12T12:00:00Z')

function sample(
  seconds: number,
  sog: number | null,
  cog: number | null,
  heel: number | null = 0,
): TrackSample {
  return {
    utc: new Date(START + seconds * 1_000).toISOString(),
    lat: 39,
    lon: 2,
    dist: 0,
    sog,
    cog,
    hdg: null,
    heel,
    trim: null,
  }
}

const primary = [sample(0, 4, 1), sample(1, 4, 1)]
const comparison = [sample(0, 5, 91), sample(1, 5, 91)]
const analysisWindow = { start: START, end: START + 1_000 }

describe('VS percentage scale ceiling', () => {
  it.each([
    [38.7, 40],
    [33.1, 35],
    [21.8, 25],
    [31.2, 35],
    [40, 40],
  ])('rounds %s up to %s', (actual, expected) => {
    expect(nicePercentageCeiling(actual)).toBe(expected)
  })

  it('provides a safe minimum scale for empty or non-finite input', () => {
    expect(nicePercentageCeiling(0)).toBe(VS_CONFIG.percentageScaleStep)
    expect(nicePercentageCeiling(Number.NaN)).toBe(VS_CONFIG.percentageScaleStep)
  })
})

describe('HEEL semicircle mapping', () => {
  it('maps negative, zero, and positive HEEL across the upper semicircle', () => {
    expect(heelAngleDegrees(-40, 40)).toBe(-90)
    expect(heelAngleDegrees(0, 40)).toBe(0)
    expect(heelAngleDegrees(40, 40)).toBe(90)
  })
})

describe('VS distribution presentation', () => {
  it('renders outlined Comparison geometry before outlined Primary geometry', () => {
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={primary}
        comparisonSamples={comparison}
        analysisWindow={analysisWindow}
      />,
    )

    const histogramStart = markup.indexOf('Time-weighted SOG histogram')
    const roseStart = markup.indexOf('Time-weighted COG circular rose')
    const heelStart = markup.indexOf('Time-weighted signed HEEL semicircular distribution')
    const comparisonHistogram = markup.indexOf('data-activity-role="comparison"', histogramStart)
    const primaryHistogram = markup.indexOf('data-activity-role="primary"', histogramStart)
    const lastComparisonHistogram = markup.lastIndexOf(
      'data-activity-role="comparison"',
      roseStart,
    )
    const comparisonRose = markup.indexOf('data-activity-role="comparison"', roseStart)
    const primaryRose = markup.indexOf('data-activity-role="primary"', roseStart)
    const lastComparisonRose = markup.lastIndexOf(
      'data-activity-role="comparison"',
      heelStart,
    )
    const comparisonHeel = markup.indexOf('data-activity-role="comparison"', heelStart)
    const primaryHeel = markup.indexOf('data-activity-role="primary"', heelStart)

    expect(comparisonHistogram).toBeGreaterThan(histogramStart)
    expect(primaryHistogram).toBeGreaterThan(comparisonHistogram)
    expect(lastComparisonHistogram).toBeLessThan(primaryHistogram)
    expect(comparisonRose).toBeGreaterThan(roseStart)
    expect(primaryRose).toBeGreaterThan(comparisonRose)
    expect(lastComparisonRose).toBeLessThan(primaryRose)
    expect(comparisonHeel).toBeGreaterThan(heelStart)
    expect(primaryHeel).toBeGreaterThan(comparisonHeel)
    expect(VS_CONFIG.primaryOpacity).toBe(VS_CONFIG.comparisonOpacity)
    expect(VS_CONFIG.primaryStrokeWidth).toBe(VS_CONFIG.comparisonStrokeWidth)

    const comparisonGeometry = markup.match(
      /<(?:rect|path)[^>]*data-activity-role="comparison"[^>]*>/g,
    ) ?? []
    const primaryGeometry = markup.match(
      /<(?:rect|path)[^>]*data-activity-role="primary"[^>]*>/g,
    ) ?? []
    expect(comparisonGeometry.length).toBeGreaterThan(0)
    expect(primaryGeometry.length).toBeGreaterThan(0)
    comparisonGeometry.forEach((element) => {
      expect(element).toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
      expect(element).toContain(`stroke-width="${VS_CONFIG.comparisonStrokeWidth}"`)
    })
    primaryGeometry.forEach((element) => {
      expect(element).toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
      expect(element).toContain(`stroke-width="${VS_CONFIG.primaryStrokeWidth}"`)
    })
  })

  it('uses clean percentage ticks and sparse rose guides', () => {
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={primary}
        comparisonSamples={comparison}
        analysisWindow={analysisWindow}
      />,
    )

    expect(markup).not.toContain('% valid time')
    expect(markup.match(/vs-distribution__y-tick/g)).toHaveLength(1)
    expect(markup.match(/data-guide="sog"/g)).toHaveLength(
      VS_CONFIG.histogramGuideLineCount,
    )
    expect(markup.match(/data-guide="cog"/g)).toHaveLength(
      VS_CONFIG.roseRingCount,
    )
    expect(markup.match(/data-guide="cog-boundary"/g)).toHaveLength(1)
    expect(markup.match(/data-guide="cog-axis"/g)).toHaveLength(2)
    expect(markup.match(/data-guide="heel"/g)).toHaveLength(
      VS_CONFIG.heelRingCount,
    )
    expect(markup.match(/data-guide="heel-boundary"/g)).toHaveLength(1)
    expect(markup.match(/data-guide="heel-axis"/g)).toHaveLength(2)
    expect(markup.match(/vs-distribution__radial-label/g)).toHaveLength(1)
    for (let degrees = 0; degrees < 360; degrees += 30) {
      expect(markup).toContain(`>${degrees}°</text>`)
    }
    expect(markup).not.toMatch(/>N<\/text>|>E<\/text>|>S<\/text>|>W<\/text>/)
    expect(markup).not.toContain('vs-distribution__spoke')
    expect(markup).toContain('>-40°</text>')
    expect(markup).toContain('>0°</text>')
    expect(markup).toContain('>+40°</text>')
  })

  it('uses independent tight scales with only each chart top label', () => {
    const distributedPrimary = [
      sample(0, 4, 0),
      sample(0.361, 5, 0),
      sample(0.7, 6, 60),
      sample(1, 6, 60),
    ]
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={distributedPrimary}
        analysisWindow={analysisWindow}
      />,
    )

    const sogLabels = markup.match(
      /<text[^>]*vs-distribution__y-tick[^>]*>[^<]+<\/text>/g,
    ) ?? []
    const radialLabels = markup.match(
      /<text[^>]*vs-distribution__radial-label[^>]*>[^<]+<\/text>/g,
    ) ?? []
    expect(sogLabels).toHaveLength(1)
    expect(sogLabels[0]).toContain('>40%</text>')
    expect(radialLabels).toHaveLength(1)
    expect(radialLabels[0]).toContain('>70%</text>')
    expect(markup).not.toContain('>10%</text>')
    expect(markup).not.toContain('>20%</text>')
    expect(markup).not.toContain('>30%</text>')
  })

  it('shows Primary-only coverage and geometry when no Comparison exists', () => {
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={primary}
        analysisWindow={analysisWindow}
      />,
    )

    expect(markup).toContain('P · 100% coverage')
    expect(markup).not.toContain('C ·')
    expect(markup).not.toContain('data-activity-role="comparison"')
  })

  it('explains metric-specific low coverage without suppressing the other Activity', () => {
    const lowCoverageComparison = [sample(0, null, null, null), sample(1, 5, 90, 2)]
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={primary}
        comparisonSamples={lowCoverageComparison}
        analysisWindow={analysisWindow}
      />,
    )

    expect(markup).toContain('Speed distribution unavailable for Comparison · SOG coverage 0%')
    expect(markup).toContain('Course distribution unavailable for Comparison · COG coverage 0%')
    expect(markup).toContain('Heel distribution unavailable for Comparison · HEEL coverage 0%')
    expect(markup).toContain('data-activity-role="primary"')
  })

  it('renders signed HEEL bins with existing colors and Comparison-before-Primary layering', () => {
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={[sample(0, 4, 1, -10), sample(1, 4, 1, -10)]}
        comparisonSamples={[sample(0, 5, 91, 10), sample(1, 5, 91, 10)]}
        analysisWindow={analysisWindow}
      />,
    )
    const heelStart = markup.indexOf('Time-weighted signed HEEL semicircular distribution')
    const comparisonHeel = markup.indexOf('data-activity-role="comparison"', heelStart)
    const primaryHeel = markup.indexOf('data-activity-role="primary"', heelStart)
    const heelMarkup = markup.slice(heelStart)

    expect(comparisonHeel).toBeGreaterThan(heelStart)
    expect(primaryHeel).toBeGreaterThan(comparisonHeel)
    expect(heelMarkup).toContain('data-heel-bin="10:12"')
    expect(heelMarkup).toContain('data-heel-bin="-10:-8"')
    expect(heelMarkup).toContain(`fill="${ACTIVITY_COLORS.comparison}"`)
    expect(heelMarkup).toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
    expect(heelMarkup).toContain(`fill="${ACTIVITY_COLORS.primary}"`)
    expect(heelMarkup).toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
  })

  it('labels the expanded symmetric domain without clipping eligible HEEL', () => {
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={[sample(0, 4, 1, -41), sample(1, 4, 1, -41)]}
        comparisonSamples={[sample(0, 5, 91, 43), sample(1, 5, 91, 43)]}
        analysisWindow={analysisWindow}
      />,
    )

    expect(markup).toContain('>-44°</text>')
    expect(markup).toContain('>+44°</text>')
    expect(markup).toContain('data-heel-bin="-42:-40"')
    expect(markup).toContain('data-heel-bin="42:44"')
  })
})
