import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { SummaryMetrics } from '../utils/summaryMetrics'
import ComparisonTable from './ComparisonTable'

const metrics: SummaryMetrics = {
  distanceMeters: 2_796.6,
  distanceNm: 2_796.6 / 1_852,
  avgSogKnots: 5.73,
  maxSogKnots: 10,
  dominantCogDegrees: 210,
  medianPositiveHeelDegrees: 5.8,
  medianNegativeHeelDegrees: -7.4,
  medianPositiveTrimDegrees: 0.8,
  medianNegativeTrimDegrees: -1.6,
}

function bodyRows(markup: string) {
  const body = markup.match(/<tbody>(.*?)<\/tbody>/s)?.[1] ?? ''
  return body.match(/<tr>/g) ?? []
}

describe('Summary comparison table', () => {
  it('renders exactly eight rows in the required order and units', () => {
    const markup = renderToStaticMarkup(
      <ComparisonTable
        primaryLabel="Primary Activity"
        primaryMetrics={metrics}
      />,
    )
    const labels = [
      'Distance',
      'Avg SOG',
      'Max SOG',
      'Dominant COG',
      'Median HEEL +',
      'Median HEEL −',
      'Median TRIM +',
      'Median TRIM −',
    ]

    expect(bodyRows(markup)).toHaveLength(8)
    labels.reduce((previousIndex, label) => {
      const index = markup.indexOf(label)
      expect(index).toBeGreaterThan(previousIndex)
      return index
    }, -1)
    expect(markup).toContain('2797 m')
    expect(markup).not.toContain(' NM')
    expect(markup).toContain('5.73 kt')
    expect(markup).toContain('10.00 kt')
    expect(markup).toContain('210°')
    expect(markup).toContain('+5.8°')
    expect(markup).toContain('−7.4°')
    expect(markup).toContain('+0.8°')
    expect(markup).toContain('−1.6°')
  })

  it('keeps the primary-only structure, label and Activity color', () => {
    const markup = renderToStaticMarkup(
      <ComparisonTable
        primaryLabel="Primary Activity"
        primaryMetrics={metrics}
      />,
    )

    expect(markup).toContain('Primary Activity')
    expect(markup).toContain(ACTIVITY_COLORS.primary)
    expect(markup).not.toContain(ACTIVITY_COLORS.comparison)
    expect(markup.match(/<td>/g)).toHaveLength(8)
  })

  it('keeps P/C columns, labels and Activity colors', () => {
    const markup = renderToStaticMarkup(
      <ComparisonTable
        primaryLabel="Primary Activity"
        primaryMetrics={metrics}
        comparisonLabel="Comparison Activity"
        comparisonMetrics={metrics}
      />,
    )

    expect(markup).toContain('Primary Activity')
    expect(markup).toContain('Comparison Activity')
    expect(markup).toContain(ACTIVITY_COLORS.primary)
    expect(markup).toContain(ACTIVITY_COLORS.comparison)
    expect(markup.match(/<td>/g)).toHaveLength(16)
  })

  it('renders unavailable metrics as em dashes', () => {
    const unavailableMetrics: SummaryMetrics = {
      ...metrics,
      medianPositiveHeelDegrees: null,
      medianNegativeHeelDegrees: null,
      medianPositiveTrimDegrees: null,
      medianNegativeTrimDegrees: null,
    }
    const markup = renderToStaticMarkup(
      <ComparisonTable
        primaryLabel="Primary Activity"
        primaryMetrics={unavailableMetrics}
      />,
    )

    expect(markup.match(/>—<\/td>/g)).toHaveLength(4)
  })
})
