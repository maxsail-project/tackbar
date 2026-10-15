import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ACTIVITY_COLORS } from '../config/activityColors'
import type {
  ActivityHeelSogDensity,
  HeelSogDensityGeometry,
} from '../utils/heelSogDensity'
import IndividualHeelSogDensityChart, {
  densityCellOpacity,
} from './IndividualHeelSogDensityChart'

const geometry: HeelSogDensityGeometry = {
  heelMinimumDegrees: -40,
  heelMaximumDegrees: 40,
  heelBinDegrees: 2,
  heelBinCount: 40,
  sogMinimumKnots: 0,
  sogMaximumKnots: 6,
  sogBinKnots: 0.25,
  sogBinCount: 24,
}

const density: ActivityHeelSogDensity = {
  cells: [
    {
      heelBinIndex: 20,
      sogBinIndex: 16,
      representedTimeSeconds: 4,
      percentage: 40,
    },
  ],
  validRepresentedTimeSeconds: 10,
  coverage: 0.75,
  lowCoverage: true,
  maximumCellPercentage: 40,
}

function renderChart(
  chartDensity = density,
  color: string = ACTIVITY_COLORS.primary,
) {
  return renderToStaticMarkup(
    <IndividualHeelSogDensityChart
      activityLabel="Sailor A · Boat A"
      color={color}
      density={chartDensity}
      geometry={geometry}
      sharedMaximumCellPercentage={50}
    />,
  )
}

describe('Individual HEEL versus SOG density chart', () => {
  it('renders native-SVG rectangular cells with SOG and signed HEEL axes', () => {
    const markup = renderChart()

    expect(markup).toContain('<svg')
    expect(markup).toContain('data-density-cell="true"')
    expect(markup).toContain('data-sog-maximum="6"')
    expect(markup).toContain('data-sog-bin-count="24"')
    expect(markup).toContain('data-heel-bin-count="40"')
    expect(markup).toContain('SOG (kt)')
    expect(markup).toContain('HEEL (°)')
    expect(markup).toContain('>-40°<')
    expect(markup).toContain('>+40°<')
    expect(markup).toContain('data-heel-zero-reference="true"')
    expect(markup).toContain('>0°<')
  })

  it('uses the Activity color and the shared maximum for cell intensity', () => {
    const markup = renderChart()
    const expectedOpacity = densityCellOpacity(40, 50)

    expect(markup).toContain(`fill="${ACTIVITY_COLORS.primary}"`)
    expect(markup).toContain(`fill-opacity="${expectedOpacity}"`)
    expect(markup).toContain('data-shared-intensity-maximum="50"')
    expect(densityCellOpacity(20, 50)).toBeCloseTo(0.432)
    expect(densityCellOpacity(20, 40)).toBeGreaterThan(densityCellOpacity(20, 50))
  })

  it('renders an explicit low-coverage warning without suppressing cells', () => {
    const markup = renderChart()

    expect(markup).toContain('Low joint HEEL + SOG coverage (75%)')
    expect(markup).toContain('data-density-cell="true"')
  })

  it('renders Comparison independently with its own Activity color', () => {
    const markup = renderChart(
      { ...density, coverage: 1, lowCoverage: false },
      ACTIVITY_COLORS.comparison,
    )

    expect(markup).toContain(`fill="${ACTIVITY_COLORS.comparison}"`)
    expect(markup).not.toContain('Low joint HEEL + SOG coverage')
  })

  it('has no chart-local zoom, drag selection, tooltip, or playback interaction', () => {
    const markup = renderChart()

    expect(markup).not.toContain('Reset')
    expect(markup).not.toContain('tooltip')
    expect(markup).not.toContain('onPointer')
    expect(markup).not.toContain('playback')
  })
})
