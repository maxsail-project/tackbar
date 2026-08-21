import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import { buildCogChartPoints } from './metricChartData'

function samplesWithCog(values: Array<number | null>): TrackSample[] {
  return values.map((cog, index) => ({
    utc: new Date(Date.UTC(2026, 7, 15, 13, 0, index)).toISOString(),
    lat: 0.25,
    lon: -30.75,
    dist: index === 0 ? 0 : 1,
    sog: 5,
    cog,
    hdg: null,
    heel: null,
    trim: null,
  }))
}

function renderedValues(values: Array<number | null>) {
  return buildCogChartPoints(samplesWithCog(values)).map((point) => point.cog)
}

describe('COG chart data', () => {
  it('keeps an ordinary sequence continuous', () => {
    expect(renderedValues([100, 110, 120])).toEqual([100, 110, 120])
  })

  it('breaks an ascending crossing through north', () => {
    expect(renderedValues([358, 359, 1, 2])).toEqual([358, 359, null, 1, 2])
  })

  it('breaks a descending crossing through north', () => {
    expect(renderedValues([2, 1, 359, 358])).toEqual([2, 1, null, 359, 358])
  })

  it('breaks a wider north crossing', () => {
    expect(renderedValues([350, 10])).toEqual([350, null, 10])
  })

  it('uses a strict greater-than 180 degree threshold', () => {
    expect(renderedValues([0, 180])).toEqual([0, 180])
    expect(renderedValues([0, 180.1])).toEqual([0, null, 180.1])
  })

  it('turns missing and non-finite values into gaps without inventing zero', () => {
    const points = buildCogChartPoints(samplesWithCog([
      100,
      null,
      120,
      Number.NaN,
      130,
    ]))

    expect(points.map((point) => point.cog)).toEqual([100, null, 120, null, 130])
    expect(points.filter((point) => point.kind === 'wrap-gap')).toHaveLength(0)
  })

  it('preserves every real COG sample while adding rendering-only gaps', () => {
    const values = [358, 359, 1, 2]
    const points = buildCogChartPoints(samplesWithCog(values))
    const sourcePoints = points.filter((point) => point.kind === 'sample')

    expect(sourcePoints).toHaveLength(values.length)
    expect(sourcePoints.map((point) => point.cog)).toEqual(values)
    expect(points.filter((point) => point.kind === 'wrap-gap')).toHaveLength(1)
  })
})
