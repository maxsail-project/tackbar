import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import VsDistributionView, {
  heelAngleDegrees,
  nicePercentageCeiling,
  trimAxisDomain,
} from './VsDistributionView'

const START = Date.parse('2026-10-12T12:00:00Z')

function sample(
  seconds: number,
  sog: number | null,
  cog: number | null,
  heel: number | null = 0,
  trim: number | null = 0,
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
    trim,
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
    expect(heelAngleDegrees(-20, 20)).toBe(-90)
    expect(heelAngleDegrees(0, 20)).toBe(0)
    expect(heelAngleDegrees(20, 20)).toBe(90)
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
    const trimStart = markup.indexOf('Time-weighted signed TRIM boxplot')
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
    const lastHeelAngleGuide = markup.lastIndexOf('data-guide="heel-angle"', comparisonHeel)
    const lastComparisonHeel = markup.lastIndexOf('data-activity-role="comparison"', trimStart)
    const comparisonTrim = markup.indexOf('data-activity-role="comparison"', trimStart)
    const primaryTrim = markup.indexOf('data-activity-role="primary"', trimStart)

    expect(comparisonHistogram).toBeGreaterThan(histogramStart)
    expect(primaryHistogram).toBeGreaterThan(comparisonHistogram)
    expect(lastComparisonHistogram).toBeLessThan(primaryHistogram)
    expect(comparisonRose).toBeGreaterThan(roseStart)
    expect(primaryRose).toBeGreaterThan(comparisonRose)
    expect(lastComparisonRose).toBeLessThan(primaryRose)
    expect(lastHeelAngleGuide).toBeGreaterThan(heelStart)
    expect(lastHeelAngleGuide).toBeLessThan(comparisonHeel)
    expect(comparisonHeel).toBeGreaterThan(heelStart)
    expect(primaryHeel).toBeGreaterThan(comparisonHeel)
    expect(lastComparisonHeel).toBeLessThan(primaryHeel)
    expect(comparisonTrim).toBeGreaterThan(trimStart)
    expect(primaryTrim).toBeGreaterThan(comparisonTrim)
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
    expect(markup.match(/data-guide="heel-angle"/g)).toHaveLength(6)
    expect(markup.match(/vs-distribution__radial-label/g)).toHaveLength(1)
    for (let degrees = 0; degrees < 360; degrees += 30) {
      expect(markup).toContain(`>${degrees}°</text>`)
    }
    expect(markup).not.toMatch(/>N<\/text>|>E<\/text>|>S<\/text>|>W<\/text>/)
    expect(markup).not.toContain('vs-distribution__spoke')
    expect(markup).toContain('>-20°</text>')
    expect(markup).toContain('>0°</text>')
    expect(markup).toContain('>+20°</text>')
    for (const degrees of [-15, -10, -5, 5, 10, 15]) {
      const label = degrees > 0 ? `+${degrees}°` : `${degrees}°`
      expect(markup).toContain(`data-heel-guide="${degrees}"`)
      expect(markup).toContain(`data-heel-guide-label="${degrees}"`)
      expect(markup).toContain(`>${label}</text>`)
    }
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
    const trimStart = markup.indexOf('Time-weighted signed TRIM boxplot')
    expect(markup.indexOf('data-trim-geometry="box"', trimStart)).toBeGreaterThan(trimStart)
    expect(markup.indexOf('data-trim-geometry="median"', trimStart)).toBeGreaterThan(trimStart)
    expect(markup).not.toContain('vs-distribution__trim-summaries')
    expect(markup).not.toContain('vs-distribution__trim-summary')
  })

  it('explains metric-specific low coverage without suppressing the other Activity', () => {
    const lowCoverageComparison = [
      sample(0, null, null, null, null),
      sample(1, 5, 90, 2, 2),
    ]
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
    expect(markup).toContain('Trim distribution unavailable for Comparison · TRIM coverage 0%')
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

  it('keeps the fixed domain and reports out-of-domain HEEL as unavailable coverage', () => {
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={[sample(0, 4, 1, -20), sample(1, 4, 1, -20)]}
        comparisonSamples={[sample(0, 5, 91, 43), sample(1, 5, 91, 43)]}
        analysisWindow={analysisWindow}
      />,
    )

    const heelStart = markup.indexOf('Time-weighted signed HEEL semicircular distribution')
    const heelMarkup = markup.slice(heelStart)
    expect(heelMarkup).toContain('>-20°</text>')
    expect(heelMarkup).toContain('>+20°</text>')
    expect(heelMarkup).toContain('data-heel-bin="-20:-18"')
    expect(heelMarkup).not.toContain('data-heel-bin="42:44"')
    expect(markup).toContain('Heel distribution unavailable for Comparison · HEEL coverage 0%')
  })
})

describe('TRIM boxplot presentation', () => {
  const statistics = {
    minimum: -10,
    q1: -2,
    median: 0,
    q3: 2,
    maximum: 10,
    iqr: 4,
    lowerWhisker: -2,
    upperWhisker: 2,
    lowOutlierPercentage: 10,
    highOutlierPercentage: 10,
  }

  it('uses a whisker-focused padded domain without allowing outliers to expand it', () => {
    expect(trimAxisDomain([statistics])).toEqual({ minimum: -3, maximum: 3 })
  })

  it('renders shared-axis P/C boxes and accessible statistics without a visible summary', () => {
    const primaryTrim = [-10, -2, -2, 0, 0, 0, 0, 2, 2, 10, 0]
    const comparisonTrim = [-1, -1, -1, 1, 1, 1, 1, 3, 3, 3, 0]
    const markup = renderToStaticMarkup(
      <VsDistributionView
        primarySamples={primaryTrim.map((trim, seconds) => sample(seconds, 4, 1, 0, trim))}
        comparisonSamples={comparisonTrim.map(
          (trim, seconds) => sample(seconds, 5, 91, 0, trim),
        )}
        analysisWindow={{ start: START, end: START + 10_000 }}
      />,
    )
    const trimStart = markup.indexOf('Time-weighted signed TRIM boxplot')
    const trimMarkup = markup.slice(trimStart)
    const comparisonGeometry = trimMarkup.indexOf('data-activity-role="comparison"')
    const primaryGeometry = trimMarkup.indexOf('data-activity-role="primary"')

    expect(comparisonGeometry).toBeGreaterThan(0)
    expect(primaryGeometry).toBeGreaterThan(comparisonGeometry)
    expect(trimMarkup).toContain('data-guide="trim-zero"')
    expect(trimMarkup).toContain(`stroke="${ACTIVITY_COLORS.comparison}"`)
    expect(trimMarkup).toContain(`stroke="${ACTIVITY_COLORS.primary}"`)
    expect(markup).not.toContain('P · Median 0°')
    expect(markup).not.toContain('Q1–Q3 -2°–+2°')
    expect(markup).not.toContain('Low outliers 10%')
    expect(markup).not.toContain('High outliers 10%')
    expect(trimMarkup).toContain('lower whisker -2°')
    expect(trimMarkup).toContain('upper whisker +2°')
    expect(trimMarkup).toContain('low outliers 10%')
    expect(trimMarkup).toContain('high outliers 10%')
  })
})
